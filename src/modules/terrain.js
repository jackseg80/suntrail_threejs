import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

// --- MATHÉMATIQUES MERCATOR ABSOLUES ---

// Convertit Lon/Lat en Mètres Web Mercator (EPSG:3857)
export function lngLatToMeters(lon, lat) {
    const x = lon * EARTH_CIRCUMFERENCE / 360;
    const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    const ym = y * EARTH_CIRCUMFERENCE / 360;
    return { x, y: ym };
}

// Position 3D dans Three.js par rapport à l'Ancre du Monde
export function lngLatToWorld(lon, lat) {
    const meters = lngLatToMeters(lon, lat);
    return {
        x: meters.x - state.worldOrigin.x,
        z: -(meters.y - state.worldOrigin.y) // Inversion Y car en 3D Z positif est vers le Sud
    };
}

export function worldToLngLat(worldX, worldZ) {
    const mx = worldX + state.worldOrigin.x;
    const my = -worldZ + state.worldOrigin.y;
    const lon = mx * 360 / EARTH_CIRCUMFERENCE;
    const lat = 360 / Math.PI * Math.atan(Math.exp(my * (Math.PI / 180) * 360 / EARTH_CIRCUMFERENCE)) - 90;
    return { lat, lon };
}

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
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
    
    // Initialisation de l'ancre si vide
    if (state.worldOrigin.x === 0) {
        state.worldOrigin = lngLatToMeters(state.TARGET_LON, state.TARGET_LAT);
    }

    const zoom = state.ZOOM;
    const centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, zoom);
    
    updateLabels(camLat, camLon, worldX, worldZ);

    let range = state.RANGE;
    if (zoom >= 15) range = Math.min(range, 2); 

    const neededKeys = new Set();
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy;
            const key = `tile_${zoom}_${tx}_${ty}`;
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
        const numTiles = Math.pow(2, zoom);
        const tileSizeProj = EARTH_CIRCUMFERENCE / numTiles;
        
        // Position NW de la tuile en mètres Mercator absolus
        const mxNW = (tx / numTiles) * EARTH_CIRCUMFERENCE - (EARTH_CIRCUMFERENCE / 2);
        const myNW = (EARTH_CIRCUMFERENCE / 2) - (ty / numTiles) * EARTH_CIRCUMFERENCE;

        // Position relative par rapport à l'ancre du monde
        const worldX = mxNW - state.worldOrigin.x;
        const worldZ = -(myNW - state.worldOrigin.y);

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

        const geometry = new THREE.PlaneGeometry(tileSizeProj, tileSizeProj, state.RESOLUTION, state.RESOLUTION);
        geometry.rotateX(-Math.PI / 2);
        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;

        // OFFSET POUR ZOOM 15
        const offX = (zoom === 15) ? (tx % 2) * 128 : 0;
        const offY = (zoom === 15) ? (ty % 2) * 128 : 0;
        const step = (zoom === 15) ? 0.5 : 1.0;

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1];
            // Avec flipY = true (Three.js standard), v=1 est le Nord (NW)
            const px = offX + (u * 255 * step);
            const py = offY + ((1.0 - v) * 255 * step);
            const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0+1), y1 = Math.min(255, y0+1);
            const wx = px - x0, wy = py - y0;
            const h = heights[y0*256+x0]*(1-wx)*(1-wy) + heights[y0*256+x1]*wx*(1-wy) + heights[y1*256+x0]*(1-wx)*wy + heights[y1*256+x1]*wx*wy;
            vertices[i * 3 + 1] = Math.max(-10, h * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const colorTex = new THREE.CanvasTexture(imgColor);
        colorTex.colorSpace = THREE.SRGBColorSpace;
        colorTex.flipY = true; 
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: colorTex, roughness: 0.8, metalness: 0.1 }));     
        // NW + half car PlaneGeometry est centré
        mesh.position.set(worldX + tileSizeProj/2, 0, worldZ + tileSizeProj/2);
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
            const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos.x, 5950, pos.z), new THREE.Vector3(pos.x, 0, pos.z)]);
            state.scene.add(sprite); state.scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color: 0xd4af37, transparent: true, opacity: 0.5})));
            activeLabels.set(p.name, {sprite});
        }
    });
}

export async function loadTerrain() { await updateVisibleTiles(); }
