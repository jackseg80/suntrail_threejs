import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

export const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

const dataCache = new Map();
const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();

const terrainUniforms = {
    uExaggeration: { value: state.RELIEF_EXAGGERATION }
};

const terrainVertexInjection = {
    header: `
        uniform sampler2D uElevationMap;
        uniform float uExaggeration;
        uniform float uTileSize;
        float decodeHeight(vec4 rgba) {
            return -10000.0 + ((rgba.r * 255.0 * 65536.0 + rgba.g * 255.0 * 256.0 + rgba.b * 255.0) * 0.1);
        }
        float getTerrainHeight(vec2 uv) {
            vec4 col = texture2D(uElevationMap, uv);
            float h = decodeHeight(col);
            if (h < -1000.0 || h > 9000.0) return 0.0;
            return h * uExaggeration;
        }
    `,
    normal: `
        float delta = uTileSize / 256.0;
        float hL = getTerrainHeight(uv + vec2(-1.0/256.0, 0.0));
        float hR = getTerrainHeight(uv + vec2(1.0/256.0, 0.0));
        float hD = getTerrainHeight(uv + vec2(0.0, -1.0/256.0));
        float hU = getTerrainHeight(uv + vec2(0.0, 1.0/256.0));
        objectNormal = normalize(vec3(hL - hR, delta * 2.0, hD - hU));
    `,
    position: `
        transformed.y = getTerrainHeight(uv);
    `
};

export class Tile {
    constructor(tx, ty, zoom, key) {
        this.tx = tx;
        this.ty = ty;
        this.zoom = zoom;
        this.key = key;
        this.status = 'idle';
        this.mesh = null;
        this.elevationTex = null; 
        this.colorTex = null;    
        this.currentResolution = -1;
        this.tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        this.opacity = 0;
        this.isFadingIn = false;
        this.updateWorldPosition();
    }

    updateWorldPosition() {
        const unit = 1.0 / Math.pow(2, this.zoom);
        const txNorm = (this.tx + 0.5) * unit;
        const tyNorm = (this.ty + 0.5) * unit;
        const originUnit = 1.0 / Math.pow(2, state.originTile.z);
        const oxNorm = (state.originTile.x + 0.5) * originUnit;
        const oyNorm = (state.originTile.y + 0.5) * originUnit;

        this.worldX = (txNorm - oxNorm) * EARTH_CIRCUMFERENCE;
        this.worldZ = (tyNorm - oyNorm) * EARTH_CIRCUMFERENCE;

        if (this.mesh) this.mesh.position.set(this.worldX, 0, this.worldZ);
        
        this.bounds = new THREE.Box3(
            new THREE.Vector3(this.worldX - this.tileSizeMeters/2, -1000, this.worldZ - this.tileSizeMeters/2),
            new THREE.Vector3(this.worldX + this.tileSizeMeters/2, 9000, this.worldZ + this.tileSizeMeters/2)
        );
    }

    isVisible() {
        if (!state.camera) return true;
        projScreenMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);
        return frustum.intersectsBox(this.bounds.clone().expandByScalar(this.tileSizeMeters * 0.2));
    }

    async load() {
        if (this.status === 'loading' || this.status === 'loaded' || this.status === 'disposed') return;
        const cacheKey = `${state.MAP_SOURCE}_${this.key}`;
        if (dataCache.has(cacheKey)) {
            const cached = dataCache.get(cacheKey);
            this.elevationTex = cached.elev;
            this.colorTex = cached.color;
            this.status = 'loaded';
            this.buildMesh(state.RESOLUTION);
            return;
        }
        this.status = 'loading';
        try {
            const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${this.zoom}/${this.tx}/${this.ty}.png?key=${state.MK}`)
                .then(r => r.blob()).then(b => createImageBitmap(b, { colorSpaceConversion: 'none' }));
            const pColor = fetch(this.getColorUrl()).then(r => r.blob()).then(b => createImageBitmap(b));
            const [imgElev, imgColor] = await Promise.all([pElev, pColor]);
            if (this.status === 'disposed') return;
            this.elevationTex = new THREE.CanvasTexture(imgElev);
            this.elevationTex.flipY = false;
            this.colorTex = new THREE.CanvasTexture(imgColor);
            this.colorTex.colorSpace = THREE.SRGBColorSpace;
            this.colorTex.flipY = false;
            dataCache.set(cacheKey, { elev: this.elevationTex, color: this.colorTex });
            this.status = 'loaded';
            this.buildMesh(state.RESOLUTION);
        } catch (e) { this.status = 'failed'; }
    }

    getColorUrl() {
        if (!state.SHOW_TRAILS) return `https://api.maptiler.com/maps/satellite/256/${this.zoom}/${this.tx}/${this.ty}@2x.jpg?key=${state.MK}`;
        switch(state.MAP_SOURCE) {
            case 'opentopomap': return `https://a.tile.opentopomap.org/${this.zoom}/${this.tx}/${this.ty}.png`;
            case 'swisstopo': return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${this.zoom}/${this.tx}/${this.ty}.jpeg`;
            default: return `https://api.maptiler.com/maps/outdoor-v2/256/${this.zoom}/${this.tx}/${this.ty}@2x.png?key=${state.MK}`;
        }
    }

    buildMesh(resolution) {
        if (!this.elevationTex || !this.colorTex || this.status === 'disposed') return;
        const oldMesh = this.mesh;
        const geometry = new THREE.PlaneGeometry(this.tileSizeMeters, this.tileSizeMeters, resolution, resolution);
        geometry.rotateX(-Math.PI / 2);
        const uvs = geometry.attributes.uv.array;
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        const material = new THREE.MeshStandardMaterial({ map: this.colorTex, roughness: 1.0, metalness: 0.0, transparent: true, opacity: this.mesh ? 1 : 0 });
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.uniforms.uTileSize = { value: this.tileSizeMeters };
            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${terrainVertexInjection.header}`);
            shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${terrainVertexInjection.normal}`);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${terrainVertexInjection.position}`);
        };

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.renderOrder = this.zoom; 
        this.mesh.castShadow = this.mesh.receiveShadow = true;

        this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        this.mesh.customDepthMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.uniforms.uTileSize = { value: this.tileSizeMeters };
            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${terrainVertexInjection.header}`);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${terrainVertexInjection.position}`);
        };

        state.scene.add(this.mesh);
        this.currentResolution = resolution;
        if (!oldMesh) { this.opacity = 0; this.isFadingIn = true; } else { state.scene.remove(oldMesh); }
    }

    updateFade(delta) {
        if (!this.isFadingIn || !this.mesh) return;
        this.opacity += delta * 2.0;
        if (this.opacity >= 1) { this.opacity = 1; this.isFadingIn = false; this.mesh.material.transparent = false; }
        this.mesh.material.opacity = this.opacity;
    }

    dispose() {
        this.status = 'disposed';
        if (this.mesh) {
            state.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            if (this.mesh.customDepthMaterial) this.mesh.customDepthMaterial.dispose();
            this.mesh = null;
        }
    }
}

export function resetTerrain() {
    clearLabels();
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
}

export function repositionAllTiles() {
    for (const tile of activeTiles.values()) tile.updateWorldPosition();
}

export function animateTiles(delta) {
    for (const tile of activeTiles.values()) { if (tile.isFadingIn) tile.updateFade(delta); }
}

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon, lat) {
    const xNorm = (lon + 180) / 360;
    const yNorm = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
    const originUnit = 1.0 / Math.pow(2, state.originTile.z);
    const oxNorm = (state.originTile.x + 0.5) * originUnit;
    const oyNorm = (state.originTile.y + 0.5) * originUnit;
    return { x: (xNorm - oxNorm) * EARTH_CIRCUMFERENCE, z: (yNorm - oyNorm) * EARTH_CIRCUMFERENCE };
}

export function worldToLngLat(worldX, worldZ) {
    const originUnit = 1.0 / Math.pow(2, state.originTile.z);
    const oxNorm = (state.originTile.x + 0.5) * originUnit;
    const oyNorm = (state.originTile.y + 0.5) * originUnit;
    const xNorm = worldX / EARTH_CIRCUMFERENCE + oxNorm;
    const yNorm = worldZ / EARTH_CIRCUMFERENCE + oyNorm;
    const lon = xNorm * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yNorm;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lon };
}

export function clearLabels() {
    for (const [name, obj] of activeLabels.entries()) {
        state.scene.remove(obj.sprite);
        state.scene.remove(obj.line);
        obj.sprite.material.dispose();
        obj.line.geometry.dispose();
        obj.line.material.dispose();
    }
    activeLabels.clear();
}

export function updateGPXMesh() {
    if (!state.rawGpxData) return;
    if (state.gpxMesh) {
        state.scene.remove(state.gpxMesh);
        state.gpxMesh.geometry.dispose();
        state.gpxMesh.material.dispose();
    }
    const track = state.rawGpxData.tracks[0];
    const threePoints = track.points.map(p => {
        const pos = lngLatToWorld(p.lon, p.lat);
        const worldY = (p.ele || 0) * state.RELIEF_EXAGGERATION + 10; 
        return new THREE.Vector3(pos.x, worldY, pos.z);
    });
    state.gpxPoints = threePoints;
    const curve = new THREE.CatmullRomCurve3(threePoints);
    const camAlt = state.camera ? state.camera.position.y : 5000;
    const thickness = Math.max(8, camAlt / 250); 
    const geometry = new THREE.TubeGeometry(curve, threePoints.length, thickness, 8, false);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.9 });
    state.gpxMesh = new THREE.Mesh(geometry, material);
    state.gpxMesh.renderOrder = 1000;
    state.scene.add(state.gpxMesh);
}

function calculateTargetLOD(tile, camX, camZ) {
    const dx = tile.worldX - camX;
    const dz = tile.worldZ - camZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const tileSize = tile.tileSizeMeters;
    if (dist < tileSize * 3.0) return state.RESOLUTION; 
    if (dist < tileSize * 6.0) return Math.floor(state.RESOLUTION / 2); 
    return Math.floor(state.RESOLUTION / 4); 
}

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    const currentGPS = worldToLngLat(worldX || 0, worldZ || 0);
    const keptTiles = new Set();

    const zoom = state.ZOOM;
    const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
    
    // On garde une portée généreuse (6 tuiles de rayon) pour boucher l'écran
    const range = 6; 

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy, key = `${tx}_${ty}_${zoom}`;
            keptTiles.add(key);
            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, zoom, key);
                if (tile.isVisible()) { activeTiles.set(key, tile); tile.load(); }
            } else if (tile.status === 'loaded') {
                const targetRes = calculateTargetLOD(tile, state.camera.position.x, state.camera.position.z);
                if (targetRes !== tile.currentResolution) tile.buildMesh(targetRes);
            }
        }
    }

    for (const [key, tile] of activeTiles.entries()) {
        if (!keptTiles.has(key)) { tile.dispose(); activeTiles.delete(key); }
    }
}

export async function loadTerrain() { await updateVisibleTiles(); }
