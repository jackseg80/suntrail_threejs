import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

// --- MATHÉMATIQUES DE PROJECTION ABSOLUE (EPSG:3857) ---

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

// Convertit n'importe quelle coordonnée GPS en mètres dans le monde 3D
// Ancré sur state.originTile au Zoom 13 (Référence fixe)
export function lngLatToWorld(lon, lat) {
    const zoomRef = 13;
    const tileSizeRef = EARTH_CIRCUMFERENCE / Math.pow(2, zoomRef);
    
    const xf = (lon + 180) / 360 * Math.pow(2, zoomRef);
    const yf = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoomRef);
    
    const worldX = (xf - (state.originTile.x + 0.5)) * tileSizeRef;
    const worldZ = (yf - (state.originTile.y + 0.5)) * tileSizeRef;
    
    return { x: worldX, z: worldZ };
}

export function worldToLngLat(worldX, worldZ) {
    const zoomRef = 13;
    const tileSizeRef = EARTH_CIRCUMFERENCE / Math.pow(2, zoomRef);
    
    const xf = (worldX / tileSizeRef) + (state.originTile.x + 0.5);
    const yf = (worldZ / tileSizeRef) + (state.originTile.y + 0.5);
    
    const lon = xf / Math.pow(2, zoomRef) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yf / Math.pow(2, zoomRef);
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    
    return { lat, lon };
}

// --- GESTION DU TERRAIN ---

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
    // 1. Déterminer le zoom idéal (LOD)
    let targetZoom = 13;
    if (camAltitude < 4000) targetZoom = 15;
    else if (camAltitude < 10000) targetZoom = 14;
    
    state.currentZoom = targetZoom;

    // 2. Calculer la tuile centrale au zoom actuel
    const centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, targetZoom);
    
    // 3. Range adaptatif pour garder un nombre de tuiles gérable
    let range = state.RANGE;
    if (targetZoom === 15) range = Math.min(range, 2); // Zoom 15 est lourd, on limite à 5x5

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

    // 4. Nettoyage des tuiles (soit trop loin, soit mauvais zoom)
    for (const [key, tileObj] of activeTiles.entries()) {
        if (!neededKeys.has(key)) {
            if (tileObj.mesh) {
                state.scene.remove(tileObj.mesh);
                tileObj.mesh.geometry.dispose();
                tileObj.mesh.material.dispose();
            }
            activeTiles.delete(key);
        }
    }

    // 5. Mise à jour des labels (Peaks)
    updateLabels(camLat, camLon, worldX, worldZ);
}

async function loadTile(tx, ty, zoom, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    try {
        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        const lon = tileToLng(tx, zoom);
        const lat = tileToLat(ty, zoom);
        const worldPos = lngLatToWorld(lon, lat);

        // URLs de chargement
        const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
        const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${zoom}/${tx}/${ty}.png?key=${state.MK}`).then(r => r.blob()).then(b => createImageBitmap(b, opts));

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

        // Traitement élévation
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElev, 0, 0);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        const heights = new Float32Array(256 * 256);
        const cleaned = new Float32Array(256 * 256);

        for (let i = 0; i < data.length; i += 4) {
            heights[i/4] = -10000 + ((data[i] * 65536 + data[i+1] * 256 + data[i+2]) * 0.1);
        }

        // Filtre Médian sélectif pour la propreté
        for (let i = 0; i < heights.length; i++) {
            if (i > 256 && i < heights.length - 256 && Math.abs(heights[i] - heights[i-1]) > 100) {
                const n = [heights[i-257], heights[i-256], heights[i-255], heights[i-1], heights[i], heights[i+1], heights[i+255], heights[i+256], heights[i+257]].sort((a,b)=>a-b);
                cleaned[i] = n[4];
            } else {
                cleaned[i] = heights[i];
            }
        }

        // Géométrie
        const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, state.RESOLUTION, state.RESOLUTION);
        geometry.rotateX(-Math.PI / 2);
        const vertices = geometry.attributes.position.array;
        
        for (let i = 0; i < vertices.length / 3; i++) {
            const u = geometry.attributes.uv.array[i*2];
            const v = 1.0 - geometry.attributes.uv.array[i*2+1];
            const px = u * 255, py = v * 255;
            const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0+1), y1 = Math.min(255, y0+1);
            const wx = px - x0, wy = py - y0;
            const h = cleaned[y0*256+x0]*(1-wx)*(1-wy) + cleaned[y0*256+x1]*wx*(1-wy) + cleaned[y1*256+x0]*(1-wx)*wy + cleaned[y1*256+x1]*wx*wy;
            vertices[i*3+1] = Math.max(-10, h * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const texture = new THREE.CanvasTexture(imgColor);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.1 });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Positionnement précis (PlaneGeometry est centré, donc on ajoute 1/2 tuile)
        mesh.position.set(worldPos.x + tileSizeMeters/2, 0, worldPos.z + tileSizeMeters/2);
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
