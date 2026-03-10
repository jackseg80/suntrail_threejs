import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const R = 6378137.0;
const MAX_EXTENT = Math.PI * R;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

// --- MATHÉMATIQUES EPSG:3857 (GÉOMÉTRIE ABSOLUE) ---

export function lngLatToMeters(lon, lat) {
    const x = lon * MAX_EXTENT / 180.0;
    let y = Math.log(Math.tan((90.0 + lat) * Math.PI / 360.0)) * R;
    return { x, y };
}

export function metersToLngLat(x, y) {
    const lon = x * 180.0 / MAX_EXTENT;
    const lat = (2.0 * Math.atan(Math.exp(y / R)) - Math.PI / 2.0) * 180.0 / Math.PI;
    return { lat, lon };
}

export function lngLatToWorld(lon, lat) {
    const m = lngLatToMeters(lon, lat);
    if (!state.worldOriginMeters) {
        state.worldOriginMeters = lngLatToMeters(state.initialLon || state.TARGET_LON, state.initialLat || state.TARGET_LAT);
    }
    return {
        x: m.x - state.worldOriginMeters.x,
        z: -(m.y - state.worldOriginMeters.y) // Z positif vers le Sud en 3D
    };
}

export function worldToLngLat(worldX, worldZ) {
    if (!state.worldOriginMeters) return { lat: 0, lon: 0 };
    const mx = worldX + state.worldOriginMeters.x;
    const my = state.worldOriginMeters.y - worldZ;
    return metersToLngLat(mx, my);
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

// --- MOTEUR LOD SECTORISÉ ---

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    if (!state.mapCenter) state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    
    if (!state.worldOriginMeters) {
        state.worldOriginMeters = lngLatToMeters(state.initialLon || state.TARGET_LON, state.initialLat || state.TARGET_LAT);
    }

    const baseZoom = 13;
    const centerSector = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, baseZoom);
    const range = state.RANGE;
    const neededTiles = new Set();

    const curX = worldX || 0;
    const curZ = worldZ || 0;

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const sx = centerSector.x + dx;
            const sy = centerSector.y + dy;
            
            // Calcul NW du secteur Z13
            const tileSizeZ13 = (2 * MAX_EXTENT) / Math.pow(2, baseZoom);
            const mxNW = -MAX_EXTENT + sx * tileSizeZ13;
            const myNW = MAX_EXTENT - sy * tileSizeZ13;
            
            // Position 3D du centre du secteur
            const secCenterX = (mxNW + tileSizeZ13/2) - state.worldOriginMeters.x;
            const secCenterZ = -( (myNW - tileSizeZ13/2) - state.worldOriginMeters.y );
            
            const dist = Math.sqrt(Math.pow(secCenterX - curX, 2) + Math.pow(secCenterZ - curZ, 2));
            const trueDist = Math.sqrt(dist*dist + camAltitude*camAltitude);

            if (trueDist < 5000) {
                for (let i = 0; i < 4; i++) {
                    for (let j = 0; j < 4; j++) {
                        const tx = sx * 4 + i, ty = sy * 4 + j;
                        const key = `tile_15_${tx}_${ty}`;
                        neededTiles.add(key);
                        if (!activeTiles.has(key)) loadTile(tx, ty, 15, key);
                    }
                }
            } else if (trueDist < 10000) {
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        const tx = sx * 2 + i, ty = sy * 2 + j;
                        const key = `tile_14_${tx}_${ty}`;
                        neededTiles.add(key);
                        if (!activeTiles.has(key)) loadTile(tx, ty, 14, key);
                    }
                }
            } else {
                const key = `tile_13_${sx}_${sy}`;
                neededTiles.add(key);
                if (!activeTiles.has(key)) loadTile(sx, sy, 13, key);
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

async function loadTile(tx, ty, zoom, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    try {
        const numTiles = Math.pow(2, zoom);
        const tileSizeMeters = (2 * MAX_EXTENT) / numTiles;
        
        // --- POSITION NW ABSOLUE ---
        const mxNW = -MAX_EXTENT + tx * tileSizeMeters;
        const myNW = MAX_EXTENT - ty * tileSizeMeters;
        
        // Position relative NW
        const worldX_NW = mxNW - state.worldOriginMeters.x;
        const worldZ_NW = -(myNW - state.worldOriginMeters.y);

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
        const data = ctx.getImageData(0, 0, 256, 256).data;
        const heights = new Float32Array(256 * 256);
        for (let i = 0; i < data.length; i += 4) {
            heights[i/4] = -10000 + ((data[i] * 65536 + data[i+1] * 256 + data[i+2]) * 0.1);
        }

        const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, state.RESOLUTION, state.RESOLUTION);
        geometry.rotateX(-Math.PI / 2);
        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;

        // --- STABLE v2.0.0 UV LOGIC ---
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        const offX = (zoom === 15) ? (tx % 2) * 127.5 : 0;
        const offY = (zoom === 15) ? (ty % 2) * 127.5 : 0;
        const step = (zoom === 15) ? 0.5 : 1.0;

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1]; // v=0 est le haut
            const px = offX + u * 255 * step;
            const py = offY + v * 255 * step;
            const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0+1), y1 = Math.min(255, y0+1);
            const wx = px - x0, wy = py - y0;
            const h = heights[y0*256+x0]*(1-wx)*(1-wy) + heights[y0*256+x1]*wx*(1-wy) + heights[y1*256+x0]*(1-wx)*wy + heights[y1*256+x1]*wx*wy;
            
            // Correction distorsion Mercator
            const my_vertex = myNW - v * tileSizeMeters;
            const vScale = Math.cosh(my_vertex / R);
            vertices[i * 3 + 1] = Math.max(-10, h * vScale * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const texture = new THREE.CanvasTexture(imgColor);
        texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; 
        
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.1 }));     
        // NW Corner placement (v2.0.0 style shift)
        mesh.position.set(worldX_NW + tileSizeMeters/2, 0, worldZ_NW + tileSizeMeters/2);
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
