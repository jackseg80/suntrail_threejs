import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

const REF_ZOOM = 13;

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon, lat) {
    const zoom = 13; 
    const tileSize = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const xfrac = (lon + 180) / 360 * Math.pow(2, zoom);
    const yfrac = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    const originAt13 = lngLatToTile(state.initialLon || state.TARGET_LON, state.initialLat || state.TARGET_LAT, 13);
    return { x: (xfrac - (originAt13.x + 0.5)) * tileSize, z: (yfrac - (originAt13.y + 0.5)) * tileSize };
}

export function worldToLngLat(worldX, worldZ) {
    const zoom = 13;
    const tileSize = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const originAt13 = lngLatToTile(state.initialLon || state.TARGET_LON, state.initialLat || state.TARGET_LAT, 13);
    const xf = (worldX / tileSize) + (originAt13.x + 0.5);
    const yf = (worldZ / tileSize) + (originAt13.y + 0.5);
    const lon = xf / Math.pow(2, zoom) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yf / Math.pow(2, zoom);
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon };
}

export function clearLabels() {
    for (const [name, obj] of activeLabels.entries()) {
        state.scene.remove(obj.sprite); state.scene.remove(obj.line);
        if (obj.sprite.material.map) obj.sprite.material.map.dispose();
        obj.sprite.material.dispose(); obj.line.geometry.dispose(); obj.line.material.dispose();
    }
    activeLabels.clear();
}

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    if (!state.mapCenter) state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    const zoom = state.ZOOM;
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
            if (!activeTiles.has(key)) loadSingleTile(tx, ty, zoom, key);
        }
    }
    for (const [key, tileObj] of activeTiles.entries()) {
        if (!neededKeys.has(key)) {
            if (tileObj && tileObj.mesh) {
                state.scene.remove(tileObj.mesh);
                tileObj.mesh.geometry.dispose();
                tileObj.mesh.material.dispose();
            }
            activeTiles.delete(key);
        }
    }
}

async function loadSingleTile(tx, ty, zoom, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);
    try {
        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        
        // Coordonnées GPS NW et SE de la tuile pour calculer la latitude par sommet
        const lonNW = tx / Math.pow(2, zoom) * 360 - 180;
        const nNW = Math.PI - 2 * Math.PI * ty / Math.pow(2, zoom);
        const latNW = 180 / Math.PI * Math.atan(0.5 * (Math.exp(nNW) - Math.exp(-nNW)));
        
        const nSE = Math.PI - 2 * Math.PI * (ty + 1) / Math.pow(2, zoom);
        const latSE = 180 / Math.PI * Math.atan(0.5 * (Math.exp(nSE) - Math.exp(-nSE)));

        const originAtZoom = lngLatToTile(state.initialLon || state.TARGET_LON, state.initialLat || state.TARGET_LAT, zoom);
        const worldX = (tx - originAtZoom.x) * tileSizeMeters;
        const worldZ = (ty - originAtZoom.y) * tileSizeMeters;

        const elevZoom = Math.min(zoom, 14);
        let eTx = tx, eTy = ty;
        if (zoom === 15) { eTx = Math.floor(tx/2); eTy = Math.floor(ty/2); }

        const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
        const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${elevZoom}/${eTx}/${eTy}.png?key=${state.MK}`).then(r => r.blob()).then(b => createImageBitmap(b, opts));

        let urlColor = "";
        if (!state.SHOW_TRAILS) {
            urlColor = `https://api.maptiler.com/maps/satellite/256/${zoom}/${tx}/${ty}@2x.jpg?key=${state.MK}`;
        } else {
            switch(state.MAP_SOURCE) {
                case 'swisstopo': urlColor = `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${zoom}/${tx}/${ty}.jpeg`; break;
                case 'opentopomap': urlColor = `https://a.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`; break;
                default: urlColor = `https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`;
            }
        }
        const pColor = fetch(urlColor).then(r => r.ok ? r.blob() : Promise.reject('404')).then(b => createImageBitmap(b));
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
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1];
            let px = u * 255, py = v * 255;
            if (zoom === 15) {
                px = (tx % 2 === 0 ? u * 127 : 128 + u * 127);
                py = (ty % 2 === 0 ? v * 127 : 128 + v * 127);
            }
            const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0+1), y1 = Math.min(255, y0+1);
            const wx = px - x0, wy = py - y0;
            const h = heights[y0*256+x0]*(1-wx)*(1-wy) + heights[y0*256+x1]*wx*(1-wy) + heights[y1*256+x0]*(1-wx)*wy + heights[y1*256+x1]*wx*wy;
            
            // Échelle variable selon la latitude exacte du sommet (VITAL pour souder les tuiles)
            const vLat = latNW + v * (latSE - latNW);
            const vScale = 1 / Math.cos(vLat * Math.PI / 180);
            
            vertices[i * 3 + 1] = Math.max(-10, h * vScale * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const colorTex = new THREE.CanvasTexture(imgColor);
        colorTex.colorSpace = THREE.SRGBColorSpace;
        colorTex.flipY = false;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: colorTex, roughness: 0.8, metalness: 0.1 }));     
        mesh.position.set(worldX + tileSizeMeters/2, 0, worldZ + tileSizeMeters/2);
        mesh.castShadow = mesh.receiveShadow = true;
        state.scene.add(mesh);
        tileObj.status = 'loaded'; tileObj.mesh = mesh;
    } catch (e) { activeTiles.delete(key); }
}

async function updateLabels(lat, lon, worldX, worldZ) {
    const peaks = await fetchNearbyPeaks(lat || state.TARGET_LAT, lon || state.TARGET_LON);
    peaks.forEach(p => {
        if (!activeLabels.has(p.name)) {
            const pos = lngLatToWorld(p.lon, p.lat);
            const sprite = createLabelSprite(p.name);
            sprite.position.set(pos.x, 6000, pos.z);
            const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos.x, 5950, pos.z), new THREE.Vector3(pos.x, p.alt || 0, pos.z)]);
            state.scene.add(sprite); state.scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color: 0xd4af37, transparent: true, opacity: 0.5})));
            activeLabels.set(p.name, {sprite});
        }
    });
}

export async function loadTerrain() { await updateVisibleTiles(); }
