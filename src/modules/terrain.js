import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon, lat) {
    const zoom = state.ZOOM; // Toujours se baser sur le zoom de référence pour le monde 3D
    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const xfrac = (lon + 180) / 360 * Math.pow(2, zoom);
    const yfrac = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    const worldX = (xfrac - (state.originTile.x + 0.5)) * tileSizeMeters;
    const worldZ = (yfrac - (state.originTile.y + 0.5)) * tileSizeMeters;
    return { x: worldX, z: worldZ };
}

export function worldToLngLat(worldX, worldZ) {
    const zoom = state.ZOOM;
    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const xfrac = (worldX / tileSizeMeters) + (state.originTile.x + 0.5);
    const yfrac = (worldZ / tileSizeMeters) + (state.originTile.y + 0.5);
    const lon = xfrac / Math.pow(2, zoom) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yfrac / Math.pow(2, zoom);
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
    let newZoom = 13;
    if (camAltitude < 3000) newZoom = 15;
    else if (camAltitude < 8000) newZoom = 14;
    else if (camAltitude < 15000) newZoom = 13;
    else newZoom = 12;

    // Si le zoom change, on force un rafraîchissement total pour la netteté
    if (newZoom !== state.currentZoom) {
        state.currentZoom = newZoom;
        // On ne clear pas tout violemment pour éviter le clignotement, 
        // les tuiles se remplaceront au fur et à mesure.
    }

    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, state.ZOOM);
    const centerTileRef = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, state.ZOOM);
    
    fetchNearbyPeaks(camLat || state.TARGET_LAT, camLon || state.TARGET_LON).then(peaks => {
        peaks.forEach(p => {
            if (!activeLabels.has(p.name)) {
                const pos = lngLatToWorld(p.lon, p.lat);
                const sprite = createLabelSprite(p.name);
                sprite.position.set(pos.x, 6000, pos.z); 
                sprite.renderOrder = 9999;
                state.scene.add(sprite);
                const points = [new THREE.Vector3(pos.x, 5950, pos.z), new THREE.Vector3(pos.x, p.alt || 0, pos.z)];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const lineMat = new THREE.LineBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.5 });
                const line = new THREE.Line(lineGeo, lineMat);
                state.scene.add(line);
                activeLabels.set(p.name, { sprite, line });
            }
        });
    });

    let range = state.RANGE; 
    const cleanRange = range + 1;
    const keptTiles = new Set();

    // On calcule les tuiles à charger selon le zoom actuel
    // Mais on garde le repère de la grille ZOOM 13 pour le placement
    for (let dy = -cleanRange; dy <= cleanRange; dy++) {
        for (let dx = -cleanRange; dx <= cleanRange; dx++) {
            const txRef = centerTileRef.x + dx;
            const tyRef = centerTileRef.y + dy;
            const key = `${txRef}_${tyRef}_${state.currentZoom}`; // Clé unique incluant le zoom actuel
            
            if (Math.abs(dx) <= range && Math.abs(dy) <= range) {
                if (!activeTiles.has(key)) {
                    loadSingleTileMultiZoom(txRef, tyRef, state.ZOOM, state.currentZoom, key);
                }
            }
            keptTiles.add(key);
        }
    }

    for (const [key, tileObj] of activeTiles.entries()) {
        if (!keptTiles.has(key)) {
            if (tileObj && tileObj.mesh) {
                state.scene.remove(tileObj.mesh);
                tileObj.mesh.geometry.dispose();
                tileObj.mesh.material.dispose();
            }
            activeTiles.delete(key);
        }
    }
}

// Nouvelle fonction capable de charger une sous-tuile haute résolution pour une zone donnée
async function loadSingleTileMultiZoom(txRef, tyRef, zoomRef, targetZoom, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    // Calcul des coordonnées GPS du coin de la tuile de référence
    const lonMin = txRef / Math.pow(2, zoomRef) * 360 - 180;
    const nMin = Math.PI - 2 * Math.PI * tyRef / Math.pow(2, zoomRef);
    const latMax = 180 / Math.PI * Math.atan(0.5 * (Math.exp(nMin) - Math.exp(-nMin)));

    // Si on veut un zoom plus élevé, on doit trouver la tuile correspondante au targetZoom
    const targetTile = lngLatToTile(lonMin + 0.0001, latMax - 0.0001, targetZoom);
    const tx = targetTile.x;
    const ty = targetTile.y;
    const zoom = targetZoom;

    try {
        const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
        const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${zoom}/${tx}/${ty}.png?key=${state.MK}`).then(r => r.blob()).then(b => createImageBitmap(b, opts));

        let urlColor = "";
        if (!state.SHOW_TRAILS) {
            urlColor = `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.jpg?key=${state.MK}`;
        } else {
            switch(state.MAP_SOURCE) {
                case 'opentopomap':
                    const s = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
                    urlColor = `https://${s}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
                    break;
                case 'swisstopo':
                    urlColor = `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${zoom}/${tx}/${ty}.jpeg`;
                    break;
                case 'maptiler-topo':
                    urlColor = `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`;
                    break;
                default: 
                    urlColor = `https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`;
            }
        }

        const pColor = fetch(urlColor).then(r => r.ok ? r.blob() : Promise.reject('404')).then(b => createImageBitmap(b));
        const [imgElev, imgColor] = await Promise.all([pElev, pColor]);
        if (activeTiles.get(key) !== tileObj) return;

        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(imgElev, 0, 0, 256, 256);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        const raw = new Float32Array(256 * 256);
        const cleaned = new Float32Array(256 * 256);

        for (let i = 0; i < data.length; i += 4) {
            const h = -10000 + ((data[i] * 65536 + data[i+1] * 256 + data[i+2]) * 0.1);
            raw[i/4] = (h < -1000 || h > 9000) ? 0 : h;
        }

        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const idx = y * 256 + x;
                const val = raw[idx];
                if (x === 0 || x === 255 || y === 0 || y === 255) { cleaned[idx] = val; continue; }
                if (Math.abs(val - raw[idx-1]) > 80) {
                    const n = [raw[idx-257], raw[idx-256], raw[idx-255], raw[idx-1], val, raw[idx+1], raw[idx+255], raw[idx+256], raw[idx+257]].sort((a, b) => a - b);
                    cleaned[idx] = n[4];
                } else { cleaned[idx] = val; }
            }
        }

        const colorTex = new THREE.CanvasTexture(imgColor);
        colorTex.colorSpace = THREE.SRGBColorSpace;
        colorTex.flipY = false; 

        // Important : On dimensionne la tuile selon sa taille réelle au zoom actuel
        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        
        // On calcule sa position par rapport à l'origine (qui est restée au zoomRef)
        const xWorld = (tx / Math.pow(2, zoom) * 360 - 180);
        const nWorld = Math.PI - 2 * Math.PI * ty / Math.pow(2, zoom);
        const yWorld = 180 / Math.PI * Math.atan(0.5 * (Math.exp(nWorld) - Math.exp(-nWorld)));
        const posWorld = lngLatToWorld(xWorld, yWorld);

        const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, state.RESOLUTION, state.RESOLUTION);
        geometry.rotateX(-Math.PI / 2);
        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        function getH(px, py) {
            const x0 = Math.max(0, Math.min(254, Math.floor(px))), y0 = Math.max(0, Math.min(254, Math.floor(py)));
            const x1 = x0 + 1, y1 = y0 + 1, wx = px - x0, wy = py - y0;
            return cleaned[y0*256+x0]*(1-wx)*(1-wy) + cleaned[y0*256+x1]*wx*(1-wy) + cleaned[y1*256+x0]*(1-wx)*wy + cleaned[y1*256+x1]*wx*wy;
        }

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1];
            const h = getH(u * 255, v * 255);
            const vertexLat = yWorld - (v * (tileSizeMeters / 111320)); // Approximation locale pour le scale
            vertices[i * 3 + 1] = Math.max(-10, h * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: colorTex, roughness: 0.9, metalness: 0.0 }));
        
        // On décale de la moitié de la tuile car PlaneGeometry est centrée
        mesh.position.set(posWorld.x + tileSizeMeters/2, 0, posWorld.z + tileSizeMeters/2);
        
        mesh.castShadow = mesh.receiveShadow = true;
        state.scene.add(mesh);
        tileObj.status = 'loaded'; tileObj.mesh = mesh;
    } catch (e) {
        if (activeTiles.get(key) === tileObj) tileObj.status = 'failed';
    }
}

export async function loadTerrain() { await updateVisibleTiles(); }
