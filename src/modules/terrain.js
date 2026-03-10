import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

// --- FONCTIONS DE CONVERSION (STRICT v2.0.0) ---

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon, lat) {
    const zoom = 13; // FIXÉ À 13 POUR TOUTE LA SCÈNE
    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const xfrac = (lon + 180) / 360 * Math.pow(2, zoom);
    const yfrac = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    
    // originTile est toujours au Zoom 13
    const worldX = (xfrac - (state.originTile.x + 0.5)) * tileSizeMeters;
    const worldZ = (yfrac - (state.originTile.y + 0.5)) * tileSizeMeters;
    return { x: worldX, z: worldZ };
}

export function worldToLngLat(worldX, worldZ) {
    const zoom = 13;
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
        state.scene.remove(obj.sprite); state.scene.remove(obj.line);
        if (obj.sprite.material.map) obj.sprite.material.map.dispose();
        obj.sprite.material.dispose(); obj.line.geometry.dispose(); obj.line.material.dispose();
    }
    activeLabels.clear();
}

// --- MOTEUR DE TERRAIN ---

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    if (!state.mapCenter) state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    
    const zoom = state.ZOOM; // Zoom des données (12-15)
    const centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, zoom);
    
    updateLabels(camLat, camLon, worldX, worldZ);

    let range = state.RANGE;
    if (zoom >= 15) range = Math.min(range, 2); 

    const neededKeys = new Set();
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy;
            const key = `${tx}_${ty}_${zoom}`;
            neededKeys.add(key);
            if (!activeTiles.has(key)) loadTile(tx, ty, zoom, key);
        }
    }

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
}

async function loadTile(tx, ty, zoom, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    try {
        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        
        // --- PLACEMENT RELATIF ABSOLU (LOGIQUE v2.0.0) ---
        // On calcule la position par rapport au NW de state.originTile (toujours en Z13)
        const scale = Math.pow(2, zoom - 13);
        const dx = (tx - state.originTile.x * scale) * tileSizeMeters;
        const dz = (ty - state.originTile.y * scale) * tileSizeMeters;
        
        // Décalage pour centrer sur 0,0,0 (qui est le centre de originTile)
        const posX = dx - (tileSizeMeters * scale / 2) + tileSizeMeters / 2;
        const posZ = dz - (tileSizeMeters * scale / 2) + tileSizeMeters / 2;

        const elevZoom = Math.min(zoom, 14);
        let eTx = tx, eTy = ty;
        if (zoom === 15) { eTx = Math.floor(tx/2); eTy = Math.floor(ty/2); }
        
        const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
        const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${elevZoom}/${eTx}/${eTy}.png?key=${state.MK}`).then(r => r.blob()).then(b => createImageBitmap(b, opts));

        let urlMap = "";
        if (!state.SHOW_TRAILS) {
            urlMap = `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.jpg?key=${state.MK}`;
        } else {
            switch(state.MAP_SOURCE) {
                case 'swisstopo': urlMap = `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${zoom}/${tx}/${ty}.jpeg`; break;
                case 'opentopomap': urlMap = `https://a.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`; break;
                default: urlMap = `https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`;
            }
        }
        const pColor = fetch(urlMap).then(r => r.ok ? r.blob() : Promise.reject('404')).then(b => createImageBitmap(b));
        const [imgElev, imgColor] = await Promise.all([pElev, pColor]);

        if (activeTiles.get(key) !== tileObj) return;

        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d'); ctx.drawImage(imgElev, 0, 0);
        const heights = new Float32Array(256 * 256);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        for (let i = 0; i < data.length; i += 4) {
            heights[i/4] = -10000 + ((data[i] * 65536 + data[i+1] * 256 + data[i+2]) * 0.1);
        }

        const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, state.RESOLUTION, state.RESOLUTION);
        geometry.rotateX(-Math.PI / 2);
        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;

        // --- INVERSION UV v2.0.0 ---
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1]; 
            let px = u * 255, py = v * 255;
            if (zoom === 15) {
                px = (tx % 2 === 0 ? u * 127.5 : 128 + u * 127.5);
                py = (ty % 2 === 0 ? v * 127.5 : 128 + v * 127.5);
            }
            const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0+1), y1 = Math.min(255, y0+1);
            const wx = px - x0, wy = py - y0;
            const h = heights[y0*256+x0]*(1-wx)*(1-wy) + heights[y0*256+x1]*wx*(1-wy) + heights[y1*256+x0]*(1-wx)*wy + heights[y1*256+x1]*wx*wy;
            vertices[i * 3 + 1] = Math.max(-10, h * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const texture = new THREE.CanvasTexture(imgColor);
        texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; 
        
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.1 }));     
        mesh.position.set(posX, 0, posZ);
        mesh.castShadow = mesh.receiveShadow = true;
        state.scene.add(mesh);
        tileObj.mesh = mesh; tileObj.status = 'loaded';
    } catch (e) { activeTiles.delete(key); }
}

async function updateLabels(lat, lon, worldX, worldZ) {
    const peaks = await fetchNearbyPeaks(lat || state.TARGET_LAT, lon || state.TARGET_LON);
    peaks.forEach(p => {
        if (!activeLabels.has(p.name)) {
            const pos = lngLatToWorld(p.lon, p.lat);
            const sprite = createLabelSprite(p.name);
            sprite.position.set(pos.x, 6000, pos.z);
            const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos.x, 5950, pos.z), new THREE.Vector3(pos.x, 0, pos.z)]);
            state.scene.add(sprite); state.scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color: 0xd4af37, transparent: true, opacity: 0.5})));
            activeLabels.set(p.name, {sprite});
        }
    });
}

export async function loadTerrain() { await updateVisibleTiles(); }
