import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

const WORLD_ZOOM = 13; // Zoom de référence pour le repère (0,0,0)

// --- CONVERSIONS MERCATOR RIGOUREUSES ---

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

// Position 3D (X, Z) d'un point GPS par rapport au centre de la tuile d'origine
export function lngLatToWorld(lon, lat) {
    const zoom = WORLD_ZOOM;
    const tileSize = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    
    // Position fractionnaire en unités de "tuiles"
    const x = (lon + 180) / 360 * Math.pow(2, zoom);
    const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    
    // Centré sur state.originTile
    return {
        x: (x - (state.originTile.x + 0.5)) * tileSize,
        z: (y - (state.originTile.y + 0.5)) * tileSize
    };
}

export function worldToLngLat(worldX, worldZ) {
    const zoom = WORLD_ZOOM;
    const tileSize = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    
    const x = (worldX / tileSize) + (state.originTile.x + 0.5);
    const y = (worldZ / tileSize) + (state.originTile.y + 0.5);
    
    const lon = x / Math.pow(2, zoom) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
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
    
    const currentZoom = state.ZOOM; 
    const centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, currentZoom);
    
    let range = state.RANGE;
    if (currentZoom >= 15) range = Math.min(range, 2); 

    const neededKeys = new Set();
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy;
            const key = `tile_${currentZoom}_${tx}_${ty}`;
            neededKeys.add(key);
            if (!activeTiles.has(key)) loadTile(tx, ty, currentZoom, key);
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
    updateLabels(camLat, camLon, worldX, worldZ);
}

async function loadTile(tx, ty, zoom, key) {
    const tileObj = { status: 'loading', mesh: null };
    activeTiles.set(key, tileObj);

    try {
        const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        
        // Coordonnées du coin NW (Haut-Gauche)
        const lonNW = tx / Math.pow(2, zoom) * 360 - 180;
        const nNW = Math.PI - 2 * Math.PI * ty / Math.pow(2, zoom);
        const latNW = 180 / Math.PI * Math.atan(0.5 * (Math.exp(nNW) - Math.exp(-nNW)));
        const worldPosNW = lngLatToWorld(lonNW, latNW);

        // Élévation : MapTiler s'arrête à Z14
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
                case 'maptiler-topo': urlMap = `https://api.maptiler.com/maps/topo-v2/256/${zoom}/${tx}/${ty}@2x.png?key=${state.MK}`; break;
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

        // OFFSET POUR ZOOM 15 (Lire 1/4 de la tuile d'élévation Z14)
        const offX = (zoom === 15) ? (tx % 2) * 128 : 0;
        const offY = (zoom === 15) ? (ty % 2) * 128 : 0;
        const step = (zoom === 15) ? 0.5 : 1.0;

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1];
            // Avec flipY=false : u=0,v=1 est NW (Top-Left). u=1,v=0 est SE (Bottom-Right).
            const px = offX + (u * 255 * step);
            const py = offY + ((1.0 - v) * 255 * step);
            
            const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0+1), y1 = Math.min(255, y0+1);
            const wx = px - x0, wy = py - y0;
            const h = heights[y0*256+x0]*(1-wx)*(1-wy) + heights[y0*256+x1]*wx*(1-wy) + heights[y1*256+x0]*(1-wx)*wy + heights[y1*256+x1]*wx*wy;
            
            // Calcul de la latitude réelle de ce sommet pour l'échelle
            const vLat = latNW - ((1.0 - v) * (tileSizeMeters / 111320)); 
            const vScale = 1 / Math.cos(vLat * Math.PI / 180);
            
            vertices[i * 3 + 1] = Math.max(-5, h * vScale * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const texture = new THREE.CanvasTexture(imgColor);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false; // VITAL : Correspond à la lecture NW -> SE
        
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.1 }));
        // Position NW + moitié car PlaneGeometry est centré
        mesh.position.set(worldPosNW.x + tileSizeMeters/2, 0, worldPosNW.z + tileSizeMeters/2);
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
            const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos.x, 5950, pos.z), new THREE.Vector3(pos.x, p.alt || 0, pos.z)]);
            const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color: 0xd4af37, transparent: true, opacity: 0.5}));
            state.scene.add(sprite); state.scene.add(line);
            activeLabels.set(p.name, {sprite, line});
        }
    });
}

export async function loadTerrain() { await updateVisibleTiles(); }
