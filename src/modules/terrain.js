import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

/**
 * Représente une seule tuile du terrain.
 * Gère son cycle de vie, son rendu et son LOD (Level of Detail).
 */
export class Tile {
    constructor(tx, ty, zoom, key) {
        this.tx = tx;
        this.ty = ty;
        this.zoom = zoom;
        this.key = key;
        this.status = 'idle';
        this.mesh = null;
        this.elevationData = null; // Cache des données brutes
        this.colorImage = null;    // Cache de l'image de texture
        this.currentResolution = -1;
        this.tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        
        // Position dans le monde Three.js
        this.worldX = (tx - state.originTile.x) * this.tileSizeMeters;
        this.worldZ = (ty - state.originTile.y) * this.tileSizeMeters;
    }

    /**
     * Charge les données de la tuile (Elévation + Texture)
     */
    async load() {
        if (this.status === 'loading' || this.status === 'loaded') return;
        this.status = 'loading';

        try {
            const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
            const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${this.zoom}/${this.tx}/${this.ty}.png?key=${state.MK}`)
                .then(r => r.blob())
                .then(b => createImageBitmap(b, opts));

            let urlColor = this.getColorUrl();
            const pColor = fetch(urlColor).then(r => {
                if(!r.ok) throw new Error('404');
                return r.blob();
            }).then(b => createImageBitmap(b));

            const [imgElev, imgColor] = await Promise.all([pElev, pColor]);
            
            this.elevationData = this.processElevation(imgElev);
            this.colorImage = imgColor;
            this.status = 'loaded';
            
            // Premier rendu avec la résolution globale actuelle
            this.buildMesh(state.RESOLUTION);
        } catch (e) {
            console.error(`Erreur chargement tuile ${this.key}:`, e);
            this.status = 'failed';
        }
    }

    getColorUrl() {
        if (!state.SHOW_TRAILS) {
            return `https://api.maptiler.com/maps/satellite/256/${this.zoom}/${this.tx}/${this.ty}@2x.jpg?key=${state.MK}`;
        }
        switch(state.MAP_SOURCE) {
            case 'opentopomap':
                const s = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
                return `https://${s}.tile.opentopomap.org/${this.zoom}/${this.tx}/${this.ty}.png`;
            case 'swisstopo':
                return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${this.zoom}/${this.tx}/${this.ty}.jpeg`;
            case 'maptiler-topo':
                return `https://api.maptiler.com/maps/topo-v2/256/${this.zoom}/${this.tx}/${this.ty}@2x.png?key=${state.MK}`;
            default:
                return `https://api.maptiler.com/maps/outdoor-v2/256/${this.zoom}/${this.tx}/${this.ty}@2x.png?key=${state.MK}`;
        }
    }

    processElevation(imgElev) {
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

        // Lissage simple des bords/pics
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
        return cleaned;
    }

    /**
     * (Re)construit le maillage Three.js avec une résolution spécifique
     */
    buildMesh(resolution) {
        if (!this.elevationData || !this.colorImage) return;
        if (this.currentResolution === resolution && this.mesh) return;

        // Nettoyage de l'ancien mesh si nécessaire (transition LOD)
        const oldMesh = this.mesh;

        const colorTex = new THREE.CanvasTexture(this.colorImage);
        colorTex.colorSpace = THREE.SRGBColorSpace;
        colorTex.flipY = false;

        const geometry = new THREE.PlaneGeometry(this.tileSizeMeters, this.tileSizeMeters, resolution, resolution);
        geometry.rotateX(-Math.PI / 2);
        
        const vertices = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;
        
        // Inversion UV Y pour correspondre aux tuiles MapTiler
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        const getH = (px, py) => {
            const x0 = Math.max(0, Math.min(254, Math.floor(px))), y0 = Math.max(0, Math.min(254, Math.floor(py)));
            const x1 = x0 + 1, y1 = y0 + 1, wx = px - x0, wy = py - y0;
            return this.elevationData[y0*256+x0]*(1-wx)*(1-wy) + this.elevationData[y0*256+x1]*wx*(1-wy) + this.elevationData[y1*256+x0]*(1-wx)*wy + this.elevationData[y1*256+x1]*wx*wy;
        };

        for (let i = 0; i < vertices.length / 3; i++) {
            const u = uvs[i * 2], v = uvs[i * 2 + 1];
            const h = getH(u * 255, v * 255);
            vertices[i * 3 + 1] = Math.max(-10, h * state.RELIEF_EXAGGERATION);
        }

        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ map: colorTex, roughness: 0.9, metalness: 0.0 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.castShadow = this.mesh.receiveShadow = true;
        
        state.scene.add(this.mesh);
        this.currentResolution = resolution;

        if (oldMesh) {
            state.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
            oldMesh.material.map.dispose();
            oldMesh.material.dispose();
        }
    }

    dispose() {
        if (this.mesh) {
            state.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            if (this.mesh.material.map) this.mesh.material.map.dispose();
            this.mesh.material.dispose();
        }
        this.elevationData = null;
        this.colorImage = null;
        this.status = 'disposed';
    }
}

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon, lat) {
    const zoom = state.ZOOM;
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

/**
 * Calcule le LOD (résolution) idéal pour une tuile donnée
 */
function calculateTargetLOD(tile, camX, camZ) {
    // Distance entre le centre de la tuile et la caméra
    const dx = tile.worldX - camX;
    const dz = tile.worldZ - camZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    // Seuils de distance (à ajuster selon les performances souhaitées)
    const tileSize = tile.tileSizeMeters;
    if (dist < tileSize * 1.5) return state.RESOLUTION; // Proche : Haute résolution
    if (dist < tileSize * 3.0) return Math.floor(state.RESOLUTION / 2); // Moyen
    return Math.floor(state.RESOLUTION / 4); // Loin : Basse résolution
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

    const currentX = worldX || 0;
    const currentZ = worldZ || 0;

    // Mise à jour des labels (pics)
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

    // Gestion des tuiles avec le nouveau système de classe
    let range = state.RANGE; 
    const keptTiles = new Set();

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy, key = `${tx}_${ty}_${state.ZOOM}`;
            keptTiles.add(key);

            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, state.ZOOM, key);
                activeTiles.set(key, tile);
                tile.load(); // Charge les données et build le mesh initial
            } else if (tile.status === 'loaded') {
                // Si la tuile est déjà là, on vérifie si son LOD doit changer
                const targetRes = calculateTargetLOD(tile, state.camera.position.x, state.camera.position.z);
                if (targetRes !== tile.currentResolution) {
                    tile.buildMesh(targetRes);
                }
            }
        }
    }

    // Nettoyage des tuiles hors de portée
    for (const [key, tile] of activeTiles.entries()) {
        if (!keptTiles.has(key)) {
            tile.dispose();
            activeTiles.delete(key);
        }
    }
}

export async function loadTerrain() { await updateVisibleTiles(); }
