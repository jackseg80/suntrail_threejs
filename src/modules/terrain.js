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
    if (!state.mapCenter) state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, state.ZOOM);
    let centerTile;
    if (worldX !== undefined && worldZ !== undefined) {
        centerTile = { x: state.originTile.x + Math.round(worldX / tileSizeMeters), y: state.originTile.y + Math.round(worldZ / tileSizeMeters), z: state.ZOOM };
    } else {
        centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, state.ZOOM);
    }
    let range = state.RANGE; 
    if (camAltitude && camAltitude > 12000) range += 1; 
    const cleanRange = range + 1;
    const neededTiles = new Set();
    const keptTiles = new Set();
    for (let dy = -cleanRange; dy <= cleanRange; dy++) {
        for (let dx = -cleanRange; dx <= cleanRange; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy, key = `${tx}_${ty}_${state.ZOOM}`;
            if (Math.abs(dx) <= range && Math.abs(dy) <= range) {
                neededTiles.add(key);
                if (!activeTiles.has(key)) loadSingleTile(tx, ty, state.ZOOM, centerTile, key);
            }
            keptTiles.add(key);
        }
    }
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
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);
    try {
        // VITAL : On désactive toute conversion de couleur pour garder les données RGB pures (Anti-Brave)
        const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
        const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${zoom}/${tx}/${ty}.png?key=${state.MK}`)
            .then(r => r.blob()).then(b => createImageBitmap(b, opts));
        const pColor = fetch(`https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`)
            .then(r => r.ok ? r.blob() : fetch(`https://api.maptiler.com/maps/outdoor-v2/256/${zoom}/${tx}/${ty}.png?key=${state.MK}`).then(r2 => r2.blob()))
            .then(b => createImageBitmap(b));

        const [imgElev, imgColor] = await Promise.all([pElev, pColor]);
        if (activeTiles.get(key) !== tileObj) return;

        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(imgElev, 0, 0, 256, 256);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        
        const raw = new Float32Array(256 * 256);
        const cleaned = new Float32Array(256 * 256);

        // 1. Décodage brut
        for (let i = 0; i < data.length; i += 4) {
            const h = -10000 + ((data[i] * 65536 + data[i+1] * 256 + data[i+2]) * 0.1);
            raw[i/4] = (h < -500 || h > 9000) ? 0 : h;
        }

        // 2. FILTRE MÉDIAN 3x3 (L'arme fatale contre les pics isolés)
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const idx = y * 256 + x;
                if (x === 0 || x === 255 || y === 0 || y === 255) {
                    cleaned[idx] = raw[idx];
                    continue;
                }
                // On récupère les 9 voisins
                const neighbors = [
                    raw[idx-257], raw[idx-256], raw[idx-255],
                    raw[idx-1],   raw[idx],     raw[idx+1],
                    raw[idx+255], raw[idx+256], raw[idx+257]
                ].sort((a, b) => a - b);
                // On prend la valeur du milieu (médiane) : élimine radicalement les pics
                cleaned[idx] = neighbors[4];
            }
        }

        const colorTex = new THREE.CanvasTexture(imgColor);
        colorTex.colorSpace = THREE.SRGBColorSpace;
        colorTex.flipY = false; 
        colorTex.wrapS = colorTex.wrapT = THREE.ClampToEdgeWrapping;

        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        const dx = (tx - state.originTile.x) * tileSizeMeters;
        const dz = (ty - state.originTile.y) * tileSizeMeters;

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
            const vertexLat = tileToLat(ty + (1.0 - v), zoom);
            vertices[i * 3 + 1] = Math.max(-20, h * (1 / Math.cos(vertexLat * Math.PI / 180)));
        }
        
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: colorTex, roughness: 0.9, metalness: 0.0 }));
        mesh.position.set(dx, 0, dz);
        mesh.castShadow = mesh.receiveShadow = true;
        state.scene.add(mesh);
        tileObj.status = 'loaded'; tileObj.mesh = mesh;
        if (document.getElementById('bgo')) document.getElementById('bgo').textContent = "Recharger le relief";
    } catch (e) {
        if (activeTiles.get(key) === tileObj) tileObj.status = 'failed';
    }
}

export async function loadTerrain() { await updateVisibleTiles(); }
