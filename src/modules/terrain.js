import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

// --- MATHÉMATIQUES DE PROJECTION ABSOLUE (EPSG:3857) ---
// La clé du LOD est d'avoir un repère 100% fixe : le Zoom 13.
const ZOOM_REF = 13;

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

function tileToLng(x, zoom) {
    return x / Math.pow(2, zoom) * 360 - 180;
}

function tileToLat(y, zoom) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function lngLatToWorld(lon, lat) {
    const tileSizeRef = EARTH_CIRCUMFERENCE / Math.pow(2, ZOOM_REF);
    const xf = (lon + 180) / 360 * Math.pow(2, ZOOM_REF);
    const yf = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, ZOOM_REF);
    
    // 0,0,0 est le centre exact de la tuile d'origine au Zoom 13
    const worldX = (xf - (state.originTile.x + 0.5)) * tileSizeRef;
    const worldZ = (yf - (state.originTile.y + 0.5)) * tileSizeRef;
    
    return { x: worldX, z: worldZ };
}

export function worldToLngLat(worldX, worldZ) {
    const tileSizeRef = EARTH_CIRCUMFERENCE / Math.pow(2, ZOOM_REF);
    const xf = (worldX / tileSizeRef) + (state.originTile.x + 0.5);
    const yf = (worldZ / tileSizeRef) + (state.originTile.y + 0.5);
    
    const lon = xf / Math.pow(2, ZOOM_REF) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yf / Math.pow(2, ZOOM_REF);
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    
    return { lat, lon };
}

export function clearLabels() {
    for (const [name, obj] of activeLabels.entries()) {
        state.scene.remove(obj.sprite);
        state.scene.remove(obj.line);
        if (obj.sprite.material.map) obj.sprite.material.map.dispose();
        obj.sprite.material.dispose();
        obj.line.geometry.dispose();
        obj.line.material.dispose();
    }
    activeLabels.clear();
}

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    if (!state.mapCenter) state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    
    // --- CALCUL DU ZOOM DYNAMIQUE (LOD) ---
    // On bascule sur des tuiles plus précises si on s'approche du sol.
    let targetZoom = 13;
    if (camAltitude < 4000) targetZoom = 15;
    else if (camAltitude < 9000) targetZoom = 14;
    
    state.currentZoom = targetZoom;

    // Calcul de la tuile centrale pour le zoom cible
    const centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, targetZoom);
    
    // Adaptation du rayon de chargement pour préserver la mémoire au zoom 15
    let range = state.RANGE;
    if (targetZoom === 15) range = Math.min(range, 2); // 5x5 max
    if (targetZoom === 14) range = Math.min(range, 3); // 7x7 max

    const neededKeys = new Set();
    
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx;
            const ty = centerTile.y + dy;
            const key = `tile_${targetZoom}_${tx}_${ty}`;
            neededKeys.add(key);

            if (!activeTiles.has(key)) {
                loadTile(tx, ty, targetZoom, key);
            }
        }
    }

    // Nettoyage intelligent : On ne supprime que ce qui n'est plus requis
    // Cela permet un "cross-fade" naturel sans trou noir
    for (const [key, tileObj] of activeTiles.entries()) {
        if (!neededKeys.has(key)) {
            if (tileObj.mesh) {
                state.scene.remove(tileObj.mesh);
                tileObj.mesh.geometry.dispose();
                if (tileObj.mesh.material.map) tileObj.mesh.material.map.dispose();
                tileObj.mesh.material.dispose();
            }
            activeTiles.delete(key);
        }
    }

    // Mise à jour des labels (gestion asynchrone)
    updateLabels(camLat, camLon, worldX, worldZ);
}

async function loadTile(tx, ty, zoom, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    try {
        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        
        // Calcul absolu de la position de la tuile dans le monde 3D
        // On récupère le Nord-Ouest de la tuile
        const lonNW = tileToLng(tx, zoom);
        const latNW = tileToLat(ty, zoom);
        const worldPosNW = lngLatToWorld(lonNW, latNW);

        // MapTiler Elevation (bloqué à Z14 max, sinon Z12 si on dezoome)
        const elevZoom = Math.min(zoom, 14);
        // On cherche la tuile d'élévation qui correspond au centre de notre tuile de texture
        const centerLon = tileToLng(tx + 0.5, zoom);
        const centerLat = tileToLat(ty + 0.5, zoom);
        const elevTile = lngLatToTile(centerLon, centerLat, elevZoom);

        const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
        const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${elevZoom}/${elevTile.x}/${elevTile.y}.png?key=${state.MK}`)
            .then(r => r.blob()).then(b => createImageBitmap(b, opts));

        let urlMap = "";
        if (!state.SHOW_TRAILS) {
            urlMap = `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.jpg?key=${state.MK}`;
        } else {
            switch(state.MAP_SOURCE) {
                case 'swisstopo': urlMap = `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${zoom}/${tx}/${ty}.jpeg`; break;
                case 'opentopomap': urlMap = `https://a.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`; break;
                case 'maptiler-topo': urlMap = `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`; break;
                default: urlMap = `https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`;
            }
        }

        const pColor = fetch(urlMap).then(r => r.ok ? r.blob() : Promise.reject('404')).then(b => createImageBitmap(b));
        const [imgElev, imgColor] = await Promise.all([pElev, pColor]);

        if (activeTiles.get(key) !== tileObj) return;

        // Traitement de l'élévation
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElev, 0, 0);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        const heights = new Float32Array(256 * 256);
        const cleaned = new Float32Array(256 * 256);

        // On compense le décalage si la tuile d'élévation est plus grande que la tuile de texture (Zoom 15 text vs Zoom 14 elev)
        const scaleElev = Math.pow(2, zoom - elevZoom); 
        const offsetX = (tx % scaleElev) * (256 / scaleElev);
        const offsetY = (ty % scaleElev) * (256 / scaleElev);

        for (let i = 0; i < data.length; i += 4) {
            const h = -10000 + ((data[i] * 65536 + data[i+1] * 256 + data[i+2]) * 0.1);
            heights[i/4] = (h < -1000 || h > 9000) ? 0 : h;
        }

        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const idx = y * 256 + x;
                const val = heights[idx];
                if (x === 0 || x === 255 || y === 0 || y === 255) { cleaned[idx] = val; continue; }
                if (Math.abs(val - heights[idx-1]) > 80) {
                    const n = [heights[idx-257], heights[idx-256], heights[idx-255], heights[idx-1], val, heights[idx+1], heights[idx+255], heights[idx+256], heights[idx+257]].sort((a,b)=>a-b);
                    cleaned[idx] = n[4];
                } else {
                    cleaned[idx] = val;
                }
            }
        }

        const res = state.RESOLUTION || 128;
        const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, res, res);
        geometry.rotateX(-Math.PI / 2);
        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;
        
        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i*2];
            const v = 1.0 - uvs[i*2+1]; // Inversion V car les images sont de haut en bas, mais la 3D est de bas en haut
            
            // On calcule le pixel de la tuile d'élévation correspondant à ce sommet
            const px = offsetX + (u * (255 / scaleElev));
            const py = offsetY + (v * (255 / scaleElev));
            
            const x0 = Math.max(0, Math.min(254, Math.floor(px)));
            const y0 = Math.max(0, Math.min(254, Math.floor(py)));
            const x1 = Math.min(255, x0+1);
            const y1 = Math.min(255, y0+1);
            const wx = px - x0;
            const wy = py - y0;
            
            const h = cleaned[y0*256+x0]*(1-wx)*(1-wy) + cleaned[y0*256+x1]*wx*(1-wy) + cleaned[y1*256+x0]*(1-wx)*wy + cleaned[y1*256+x1]*wx*wy;
            
            // Facteur d'échelle (Mercator -> Mètres réels) pour ce sommet précis
            const vLat = latNW - (v * (latNW - tileToLat(ty+1, zoom)));
            const vScale = 1 / Math.cos(vLat * Math.PI / 180);
            
            vertices[i*3+1] = Math.max(-10, h * vScale * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const texture = new THREE.CanvasTexture(imgColor);
        // Configuration correcte pour que la texture soit alignée avec le terrain
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = true; // IMPORTANT : Laisse Three.js gérer l'orientation native
        
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.1 });
        const mesh = new THREE.Mesh(geometry, material);
        
        // PlaneGeometry est créé autour de son centre (0,0). 
        // worldPosNW est le coin Nord-Ouest. Il faut donc décaler le Mesh de +moitié vers l'Est et +moitié vers le Sud.
        mesh.position.set(worldPosNW.x + tileSizeMeters/2, 0, worldPosNW.z + tileSizeMeters/2);
        mesh.castShadow = mesh.receiveShadow = true;
        
        state.scene.add(mesh);
        tileObj.mesh = mesh;
        tileObj.status = 'loaded';

    } catch (e) {
        activeTiles.delete(key);
    }
}

async function updateLabels(lat, lon, worldX, worldZ) {
    const currentX = worldX || 0;
    const currentZ = worldZ || 0;
    const peaks = await fetchNearbyPeaks(lat || state.TARGET_LAT, lon || state.TARGET_LON);
    peaks.forEach(p => {
        if (!activeLabels.has(p.name)) {
            const pos = lngLatToWorld(p.lon, p.lat);
            const sprite = createLabelSprite(p.name);
            sprite.position.set(pos.x, 6000, pos.z);
            const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos.x, 5950, pos.z), new THREE.Vector3(pos.x, p.alt || 0, pos.z)]);
            const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color: 0xd4af37, transparent: true, opacity: 0.5}));
            state.scene.add(sprite); state.scene.add(line);
            activeLabels.set(p.name, {sprite, line});
        }
    });
}

export async function loadTerrain() { await updateVisibleTiles(); }
