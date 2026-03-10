import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

const BASE_ZOOM = 13;
const TILE_SIZE_BASE = EARTH_CIRCUMFERENCE / Math.pow(2, BASE_ZOOM);

// --- MATHÉMATIQUES v2.0.0 (GRILLE PLATE LOCALE) ---

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon, lat) {
    const xf = (lon + 180) / 360 * Math.pow(2, BASE_ZOOM);
    const yf = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, BASE_ZOOM);
    return {
        x: (xf - (state.originTile.x + 0.5)) * TILE_SIZE_BASE,
        z: (yf - (state.originTile.y + 0.5)) * TILE_SIZE_BASE
    };
}

export function worldToLngLat(worldX, worldZ) {
    const xf = (worldX / TILE_SIZE_BASE) + (state.originTile.x + 0.5);
    const yf = (worldZ / TILE_SIZE_BASE) + (state.originTile.y + 0.5);
    const lon = xf / Math.pow(2, BASE_ZOOM) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yf / Math.pow(2, BASE_ZOOM);
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

// --- MOTEUR DE TERRAIN (SUBDIVISION v2.0.0) ---

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    if (!state.mapCenter) state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    
    const centerSector = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, BASE_ZOOM);
    const range = state.RANGE;
    const neededTiles = new Set();

    const curX = worldX || 0;
    const curZ = worldZ || 0;

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const sx = centerSector.x + dx;
            const sy = centerSector.y + dy;
            
            // Position NW du secteur Z13 (v2.0.0)
            const secX = (sx - state.originTile.x) * TILE_SIZE_BASE;
            const secZ = (sy - state.originTile.y) * TILE_SIZE_BASE;
            
            // Distance au NW du secteur
            const dist = Math.sqrt(Math.pow(secX - curX, 2) + Math.pow(secZ - curZ, 2));
            const trueDist = Math.sqrt(dist*dist + camAltitude*camAltitude);

            if (trueDist < 6000) {
                for (let i = 0; i < 4; i++) {
                    for (let j = 0; j < 4; j++) {
                        const tx = sx * 4 + i, ty = sy * 4 + j;
                        const key = `tile_15_${tx}_${ty}`;
                        neededTiles.add(key);
                        if (!activeTiles.has(key)) loadTile(tx, ty, 15, sx, sy, i, j, key);
                    }
                }
            } else if (trueDist < 12000) {
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        const tx = sx * 2 + i, ty = sy * 2 + j;
                        const key = `tile_14_${tx}_${ty}`;
                        neededTiles.add(key);
                        if (!activeTiles.has(key)) loadTile(tx, ty, 14, sx, sy, i, j, key);
                    }
                }
            } else {
                const key = `tile_13_${sx}_${sy}`;
                neededTiles.add(key);
                if (!activeTiles.has(key)) loadTile(sx, sy, 13, sx, sy, 0, 0, key);
            }
        }
    }

    for (const [key, tileObj] of activeTiles.entries()) {
        if (!neededTiles.has(key)) {
            if (tileObj.mesh) {
                state.scene.remove(tileObj.mesh);
                tileObj.mesh.geometry.dispose();
                if (tileObj.mesh.material.map) tileObj.mesh.material.map.dispose();
                tileObj.mesh.material.dispose();
            }
            activeTiles.delete(key);
        }
    }
    updateLabels(camLat, camLon, worldX, worldZ);
}

async function loadTile(tx, ty, zoom, sx, sy, subX, subY, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    try {
        const scale = Math.pow(2, zoom - BASE_ZOOM);
        const tileSize = TILE_SIZE_BASE / scale;
        
        // --- PLACEMENT RELATIF v2.0.0 (NW ORIGIN) ---
        // Le NW de la scène (0,0,0) est le CENTRE de state.originTile au Zoom 13
        const worldX = (sx - (state.originTile.x + 0.5)) * TILE_SIZE_BASE + (subX * tileSize);
        const worldZ = (sy - (state.originTile.y + 0.5)) * TILE_SIZE_BASE + (subY * tileSize);

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

        const geometry = new THREE.PlaneGeometry(tileSize, tileSize, state.RESOLUTION, state.RESOLUTION);
        geometry.rotateX(-Math.PI / 2);
        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;

        // INVERSION UV v2.0.0
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1]; 
            let pu = u, pv = v;
            if (zoom === 15) {
                pu = (tx % 2) * 0.5 + u * 0.5;
                pv = (ty % 2) * 0.5 + v * 0.5;
            }
            const px = pu * 255, py = pv * 255;
            const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0+1), y1 = Math.min(255, y0+1);
            const wx = px - x0, wy = py - y0;
            const h = heights[y0*256+x0]*(1-wx)*(1-wy) + heights[y0*256+x1]*wx*(1-wy) + heights[y1*256+x0]*(1-wx)*wy + heights[y1*256+x1]*wx*wy;
            
            // HAUTEUR v2.0.0 (PURE)
            vertices[i * 3 + 1] = Math.max(-10, h * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const texture = new THREE.CanvasTexture(imgColor);
        texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; 
        
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.1 }));     
        // Alignement NW : position NW + demi-taille car PlaneGeometry est centré
        mesh.position.set(worldX + tileSize/2, 0, worldZ + tileSize/2);
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
