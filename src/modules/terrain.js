import * as THREE from 'three';
import { state } from './state.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

function tileToLat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    if (!state.mapCenter) {
        state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    }

    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, state.ZOOM);
    
    // Calcul de la tuile centrale basé DIRECTEMENT sur la position 3D (évite les décalages lat/lon)
    let centerTile;
    if (worldX !== undefined && worldZ !== undefined) {
        centerTile = {
            x: state.originTile.x + Math.round(worldX / tileSizeMeters),
            y: state.originTile.y + Math.round(worldZ / tileSizeMeters),
            z: state.ZOOM
        };
    } else {
        centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, state.ZOOM);
    }
    
    // Range dynamique : Utilisation de la valeur du state (ou boostée si altitude élevée)
    let range = state.RANGE; 
    if (camAltitude && camAltitude > 12000) range += 1; 
    
    // Buffer de nettoyage : on garde les tuiles un peu plus loin pour éviter les trous lors des mouvements
    const cleanBuffer = 1;
    const cleanRange = range + cleanBuffer;
    
    const neededTiles = new Set();
    const keptTiles = new Set();

    for (let dy = -cleanRange; dy <= cleanRange; dy++) {
        for (let dx = -cleanRange; dx <= cleanRange; dx++) {
            const tx = centerTile.x + dx;
            const ty = centerTile.y + dy;
            const key = `${tx}_${ty}_${state.ZOOM}`;
            
            // Si dans le range de chargement immédiat
            if (Math.abs(dx) <= range && Math.abs(dy) <= range) {
                neededTiles.add(key);
                if (!activeTiles.has(key)) {
                    loadSingleTile(tx, ty, state.ZOOM, centerTile, key);
                }
            }
            // On marque comme "à garder" (ne pas supprimer)
            keptTiles.add(key);
        }
    }

    // Nettoyage des tuiles vraiment trop lointaines (hors du cleanRange)
    for (const [key, tileObj] of activeTiles.entries()) {
        if (!keptTiles.has(key)) {
            if (tileObj && tileObj.mesh) {
                state.scene.remove(tileObj.mesh);
                tileObj.mesh.geometry.dispose();
                if (tileObj.mesh.material.map) tileObj.mesh.material.map.dispose();
                tileObj.mesh.material.dispose();
            }
            activeTiles.delete(key);
        }
    }
}

async function loadSingleTile(tx, ty, zoom, originTile, key) {
    // Objet d'état sécurisé pour éviter les Race Conditions lors des déplacements rapides
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    try {
        const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${zoom}/${tx}/${ty}.png?key=${state.MK}`)
            .then(r => { if(!r.ok) throw new Error('404'); return r.blob(); })
            .then(b => createImageBitmap(b));
            
        const pColor = fetch(`https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`)
            .then(r => r.ok ? r.blob() : fetch(`https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}.png?key=${state.MK}`).then(r2 => { if(!r2.ok) throw new Error('404'); return r2.blob(); }))
            .then(b => createImageBitmap(b));

        const [imgElev, imgColor] = await Promise.all([pElev, pColor]);

        // Vérification de sécurité : Si l'utilisateur s'est éloigné trop vite, la tuile a été supprimée ou rechargée. On annule l'affichage.
        if (activeTiles.get(key) !== tileObj) return;

        // Décodage de l'élévation RGB
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(imgElev, 0, 0, 256, 256);
        const data = ctx.getImageData(0, 0, 256, 256).data;

        const heights = new Float32Array(256 * 256);
        let minH = 0;
        let validCount = 0;
        let sumH = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const a = data[i+3];

            // Formule MapTiler: -10000 + (R * 256 * 256 + G * 256 + B) * 0.1
            let h = -10000 + ((r * 65536 + g * 256 + b) * 0.1);
            
            // Sécurité Brave/Fingerprinting : Si l'alpha est nul ou si la valeur est trop extrême, on marque comme invalide
            if (a < 128 || h < -500 || h > 9000) {
                h = -99999; 
            } else {
                sumH += h;
                validCount++;
            }
            heights[i/4] = h;
        }

        const avgH = validCount > 0 ? sumH / validCount : 0;
        // Remplissage des trous par la moyenne pour éviter les pics
        for (let i = 0; i < heights.length; i++) {
            if (heights[i] < -1000) heights[i] = avgH;
        }

        const colorTex = new THREE.CanvasTexture(imgColor);
        colorTex.colorSpace = THREE.SRGBColorSpace;
        colorTex.flipY = false; 
        colorTex.wrapS = colorTex.wrapT = THREE.ClampToEdgeWrapping; // Évite les coutures de texture
        if (state.renderer) colorTex.anisotropy = state.renderer.capabilities.getMaxAnisotropy();

        // Calcul exact de la taille de la tuile
        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        const dx = (tx - state.originTile.x) * tileSizeMeters;
        const dz = (ty - state.originTile.y) * tileSizeMeters;

        // Utilisation de la taille EXACTE (pas d'overlap, pour une soudure parfaite)
        const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, state.RESOLUTION, state.RESOLUTION);
        geometry.rotateX(-Math.PI / 2);

        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;
        
        for (let i = 1; i < uvs.length; i += 2) {
            uvs[i] = 1.0 - uvs[i];
        }

        function getElevationBilinear(px, py) {
            const x0 = Math.max(0, Math.min(254, Math.floor(px)));
            const y0 = Math.max(0, Math.min(254, Math.floor(py)));
            const x1 = x0 + 1;
            const y1 = y0 + 1;
            const wx = px - x0;
            const wy = py - y0;
            const h00 = heights[y0 * 256 + x0];
            const h10 = heights[y0 * 256 + x1];
            const h01 = heights[y1 * 256 + x0];
            const h11 = heights[y1 * 256 + x1];
            if (h00 < -9000 || h10 < -9000 || h01 < -9000 || h11 < -9000) return h00;
            return h00 * (1 - wx) * (1 - wy) + h10 * wx * (1 - wy) + h01 * (1 - wx) * wy + h11 * wx * wy;
        }

        // On soulève les sommets
        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2];
            const v = uvs[i * 2 + 1];
            
            const canvasX = u * 255;
            const canvasY = v * 255; 
            
            let h = getElevationBilinear(canvasX, canvasY);
            if (h < -9000) h = minH;

            // VITAL : On calcule le heightScale précis pour CHAQUE sommet selon sa latitude
            // v=1 est le haut de la tuile (ty), v=0 est le bas (ty + 1)
            const vertexLat = tileToLat(ty + (1.0 - v), zoom);
            const vertexHeightScale = 1 / Math.cos(vertexLat * Math.PI / 180);

            vertices[i * 3 + 1] = h * vertexHeightScale;
        }
        
        // Lissage des ombres
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ 
            map: colorTex, 
            roughness: 0.9,
            metalness: 0.0,
            flatShading: false 
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        // On place la tuile exactement à côté de sa voisine
        mesh.position.set(dx, 0, dz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        state.scene.add(mesh);
        // On met à jour l'objet d'état sécurisé (on n'écrase pas la map avec le mesh brut !)
        tileObj.status = 'loaded';
        tileObj.mesh = mesh;

        const btn = document.getElementById('bgo');
        if (btn) btn.textContent = "Recharger le relief";

    } catch (e) {
        // En cas d'erreur (ex: 404 océan), on marque comme failed au lieu de supprimer
        // Cela évite que le système ne retente de télécharger cette zone morte 60 fois par seconde.
        if (activeTiles.get(key) === tileObj) {
            tileObj.status = 'failed';
        }
    }
}

export async function loadTerrain() {
    await updateVisibleTiles();
}
