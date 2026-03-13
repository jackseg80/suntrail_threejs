import * as THREE from 'three';
import { state } from './state';
import { showToast, isMobileDevice, isPositionInSwitzerland } from './utils';
import { updateElevationProfile } from './profile';
import { createForestForTile } from './vegetation';

export const EARTH_CIRCUMFERENCE = 40075016.68;

interface CachedData {
    elev: THREE.Texture;
    pixelData: Uint8ClampedArray | null;
    color: THREE.Texture;
    overlay: THREE.Texture | null;
    slopes: THREE.Texture | null;
}

export const activeTiles = new Map<string, Tile>(); 
export const activeLabels = new Map<string, any>(); 

const dataCache = new Map<string, CachedData>();
const MAX_CACHE_SIZE = isMobileDevice() ? 200 : 800; 

const geometryCache = new Map<string, THREE.PlaneGeometry>();

function getPlaneGeometry(res: number, size: number): THREE.PlaneGeometry {
    const key = `${res}_${size}`;
    if (!geometryCache.has(key)) {
        const geometry = new THREE.PlaneGeometry(size, size, res, res);
        geometry.rotateX(-Math.PI / 2);
        const uvs = geometry.attributes.uv.array as Float32Array;
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];
        geometryCache.set(key, geometry);
    }
    return geometryCache.get(key)!;
}

let loadQueue: Tile[] = [];
let isProcessingQueue = false;

async function processLoadQueue() {
    if (isProcessingQueue || loadQueue.length === 0) return;
    isProcessingQueue = true;
    try {
        if (state.camera) {
            const camX = state.camera.position.x;
            const camZ = state.camera.position.z;
            loadQueue.sort((a, b) => {
                const da = Math.pow(a.worldX - camX, 2) + Math.pow(a.worldZ - camZ, 2);
                const db = Math.pow(b.worldX - camX, 2) + Math.pow(b.worldZ - camZ, 2);
                return da - db;
            });
        }
        const batch = loadQueue.splice(0, 6);
        await Promise.all(batch.map(async (tile) => {
            try { if (tile.status === 'idle' || tile.status === 'failed') await tile.load(); }
            catch (e) { tile.status = 'failed'; }
        }));
    } finally {
        isProcessingQueue = false;
        if (loadQueue.length > 0) setTimeout(processLoadQueue, 4); 
    }
}

function addToCache(key: string, elevTex: THREE.Texture, pixelData: Uint8ClampedArray | null, colorTex: THREE.Texture, overlayTex: THREE.Texture | null, slopesTex: THREE.Texture | null): void {
    if (dataCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = dataCache.keys().next().value;
        if (oldestKey) {
            const entry = dataCache.get(oldestKey);
            if (entry) {
                entry.elev.dispose(); entry.color.dispose();
                if (entry.overlay) entry.overlay.dispose();
                if (entry.slopes) entry.slopes.dispose();
            }
            dataCache.delete(oldestKey);
        }
    }
    dataCache.set(key, { elev: elevTex, pixelData, color: colorTex, overlay: overlayTex, slopes: slopesTex });
}

function getFromCache(key: string): CachedData | null {
    const data = dataCache.get(key);
    if (!data) return null;
    dataCache.delete(key); dataCache.set(key, data);
    return data;
}

export function clearCache(): void {
    for (const entry of dataCache.values()) {
        entry.elev.dispose(); entry.color.dispose();
        if (entry.overlay) entry.overlay.dispose();
        if (entry.slopes) entry.slopes.dispose();
    }
    dataCache.clear();
}

const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();
const terrainUniforms = { uExaggeration: { value: state.RELIEF_EXAGGERATION } };

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
    position: `transformed.y = getTerrainHeight(uv);`
};

const CACHE_NAME = 'suntrail-tiles-v1';

async function fetchWithCache(url: string, usePersistentCache: boolean = false): Promise<Blob | null> {
    try {
        if (usePersistentCache) {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(url);
            if (cached) { state.cacheHits++; updateStorageUI(); return await cached.blob(); }
        }
        const r = await fetch(url, { mode: 'cors' });
        if (r.ok) {
            const blob = await r.blob();
            state.networkRequests++; updateStorageUI();
            if (usePersistentCache) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(url, new Response(blob));
            }
            return blob;
        }
        return null;
    } catch (e) { return null; }
}

function updateStorageUI() {
    const netCount = document.getElementById('net-count');
    const cacheCount = document.getElementById('cache-count');
    if (netCount) netCount.textContent = state.networkRequests.toString();
    if (cacheCount) cacheCount.textContent = state.cacheHits.toString();
}

export class Tile {
    tx: number; ty: number; zoom: number; key: string;
    status: 'idle' | 'loading' | 'loaded' | 'failed' | 'disposed' = 'idle';
    mesh: THREE.Mesh | null = null;
    elevationTex: THREE.Texture | null = null;
    pixelData: Uint8ClampedArray | null = null;
    colorTex: THREE.Texture | null = null;
    overlayTex: THREE.Texture | null = null;
    slopesTex: THREE.Texture | null = null;
    forestMesh: THREE.InstancedMesh | null = null;
    currentResolution: number = -1;
    tileSizeMeters: number;
    opacity: number = 0;
    isFadingIn: boolean = false;
    worldX: number = 0; worldZ: number = 0;
    bounds: THREE.Box3 = new THREE.Box3();

    constructor(tx: number, ty: number, zoom: number, key: string) {
        this.tx = tx; this.ty = ty; this.zoom = zoom; this.key = key;
        this.tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        this.updateWorldPosition();
    }

    updateWorldPosition(): void {
        const unit = 1.0 / Math.pow(2, this.zoom);
        const txNorm = (this.tx + 0.5) * unit;
        const tyNorm = (this.ty + 0.5) * unit;
        const originUnit = 1.0 / Math.pow(2, state.originTile.z);
        const oxNorm = (state.originTile.x + 0.5) * originUnit;
        const oyNorm = (state.originTile.y + 0.5) * originUnit;
        this.worldX = (txNorm - oxNorm) * EARTH_CIRCUMFERENCE;
        this.worldZ = (tyNorm - oyNorm) * EARTH_CIRCUMFERENCE;
        if (this.mesh) this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.bounds.set(
            new THREE.Vector3(this.worldX - this.tileSizeMeters/2, -1000, this.worldZ - this.tileSizeMeters/2),
            new THREE.Vector3(this.worldX + this.tileSizeMeters/2, 9000, this.worldZ + this.tileSizeMeters/2)
        );
    }

    isVisible(): boolean {
        if (!state.camera) return true;
        projScreenMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);
        return frustum.intersectsBox(this.bounds.clone().expandByScalar(this.tileSizeMeters * 0.2));
    }

    async load(): Promise<void> {
        if (this.status !== 'idle' && this.status !== 'failed') return;
        const cacheKey = `${state.MAP_SOURCE}_${state.SHOW_TRAILS}_${state.SHOW_SLOPES}_${this.key}`;
        const cached = getFromCache(cacheKey);
        if (cached) {
            this.elevationTex = cached.elev; this.pixelData = cached.pixelData;
            this.colorTex = cached.color; this.overlayTex = cached.overlay; this.slopesTex = cached.slopes;
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
            return;
        }
        if (this.status as any === 'disposed') return;
        this.status = 'loading';
        try {
            // 1. RELIEF (Bloquant)
            const elevBlob = await fetchWithCache(`https://api.maptiler.com/tiles/terrain-rgb-v2/${this.zoom}/${this.tx}/${this.ty}.png?key=${state.MK}`, true);
            if (this.status as any === 'disposed') return;
            if (!elevBlob) throw new Error("Elevation failed");
            const imgElev = await createImageBitmap(elevBlob, { colorSpaceConversion: 'none' });
            if (this.status as any === 'disposed') return;
            this.elevationTex = new THREE.Texture(imgElev);
            this.elevationTex.flipY = false; this.elevationTex.needsUpdate = true;
            
            const offCanvas = document.createElement('canvas'); offCanvas.width = imgElev.width; offCanvas.height = imgElev.height;
            const offCtx = offCanvas.getContext('2d');
            if (offCtx) { offCtx.drawImage(imgElev, 0, 0); this.pixelData = offCtx.getImageData(0, 0, imgElev.width, imgElev.height).data; }

            // 2. COULEUR (Non-bloquant)
            let colorBlob = await fetchWithCache(this.getColorUrl());
            if (this.status as any === 'disposed') return;
            if (!colorBlob) {
                const fallback = `https://api.maptiler.com/maps/satellite/256/${this.zoom}/${this.tx}/${this.ty}@2x.jpg?key=${state.MK}`;
                colorBlob = await fetchWithCache(fallback);
            }
            if (this.status as any === 'disposed') return;
            
            if (colorBlob) {
                const img = await createImageBitmap(colorBlob);
                if (this.status as any === 'disposed') return;
                this.colorTex = new THREE.Texture(img); this.colorTex.flipY = false; this.colorTex.needsUpdate = true; this.colorTex.colorSpace = THREE.SRGBColorSpace;
            } else {
                const dummy = document.createElement('canvas'); dummy.width = 2; dummy.height = 2;
                const dCtx = dummy.getContext('2d'); if (dCtx) { dCtx.fillStyle = '#333'; dCtx.fillRect(0,0,2,2); }
                this.colorTex = new THREE.CanvasTexture(dummy);
            }

            // 3. CALQUES
            const [tBlob, sBlob] = await Promise.all([
                state.SHOW_TRAILS ? fetchWithCache(this.getOverlayUrl()) : Promise.resolve(null),
                state.SHOW_SLOPES ? fetchWithCache(this.getSlopesUrl()) : Promise.resolve(null)
            ]);
            if (this.status as any === 'disposed') return;
            if (tBlob) { const i = await createImageBitmap(tBlob); this.overlayTex = new THREE.Texture(i); this.overlayTex.flipY = false; this.overlayTex.needsUpdate = true; this.overlayTex.colorSpace = THREE.SRGBColorSpace; }
            if (sBlob) { const i = await createImageBitmap(sBlob); this.slopesTex = new THREE.Texture(i); this.slopesTex.flipY = false; this.slopesTex.needsUpdate = true; this.slopesTex.colorSpace = THREE.SRGBColorSpace; }

            if (this.status as any === 'disposed') return;
            addToCache(cacheKey, this.elevationTex, this.pixelData, this.colorTex, this.overlayTex, this.slopesTex);
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
        } catch (e) { this.status = 'failed'; }
    }

    getColorUrl(): string {
        switch(state.MAP_SOURCE) {
            case 'satellite': 
                if (isPositionInSwitzerland(state.TARGET_LAT, state.TARGET_LON)) {
                    return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${this.zoom}/${this.tx}/${this.ty}.jpeg`;
                }
                return `https://api.maptiler.com/maps/satellite/256/${this.zoom}/${this.tx}/${this.ty}@2x.jpg?key=${state.MK}`;
            case 'swisstopo': return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${this.zoom}/${this.tx}/${this.ty}.jpeg`;
            case 'opentopomap': return `https://a.tile.opentopomap.org/${this.zoom}/${this.tx}/${this.ty}.png`;
            default: return `https://api.maptiler.com/maps/topo-v2/256/${this.zoom}/${this.tx}/${this.ty}@2x.png?key=${state.MK}`;
        }
    }
    getOverlayUrl(): string { return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${this.zoom}/${this.tx}/${this.ty}.png`; }
    getSlopesUrl(): string { return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.hangneigung-ueber_30/default/current/3857/${this.zoom}/${this.tx}/${this.ty}.png`; }

    buildMesh(resolution: number): void {
        if (!this.elevationTex || !this.colorTex || this.status as any === 'disposed') return;
        
        // --- VÉRIFICATION DE VALIDITÉ ---
        const img = this.colorTex.image as any;
        if (!img || img.width === 0) return;

        const oldMesh = this.mesh;
        const geometry = getPlaneGeometry(resolution, this.tileSizeMeters);
        const material = new THREE.MeshStandardMaterial({ map: this.colorTex, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0 });

        material.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.uniforms.uTileSize = { value: this.tileSizeMeters };
            shader.uniforms.uOverlayMap = { value: this.overlayTex || null };
            shader.uniforms.uHasOverlay = { value: !!this.overlayTex };
            shader.uniforms.uSlopesMap = { value: this.slopesTex || null };
            shader.uniforms.uHasSlopes = { value: !!this.slopesTex };

            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${terrainVertexInjection.header}`);
            shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${terrainVertexInjection.normal}`);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${terrainVertexInjection.position}`);

            shader.fragmentShader = `
                uniform sampler2D uOverlayMap;
                uniform sampler2D uSlopesMap;
                uniform bool uHasOverlay;
                uniform bool uHasSlopes;
                ${shader.fragmentShader}
            `.replace('#include <map_fragment>', `
                #include <map_fragment>
                if (uHasOverlay) {
                    vec4 oCol = texture2D(uOverlayMap, vMapUv);
                    diffuseColor.rgb = mix(diffuseColor.rgb, oCol.rgb, oCol.a);
                }
                if (uHasSlopes) {
                    vec4 sCol = texture2D(uSlopesMap, vMapUv);
                    diffuseColor.rgb = mix(diffuseColor.rgb, sCol.rgb, sCol.a * 0.6);
                }
            `);
        };

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.renderOrder = this.zoom; 
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        this.mesh.customDepthMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex }; 
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration; 
            shader.uniforms.uTileSize = { value: this.tileSizeMeters };
            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${terrainVertexInjection.header}`);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${terrainVertexInjection.position}`);
        };
if (state.scene) state.scene.add(this.mesh);
this.currentResolution = resolution;
this.opacity = 0; 
this.isFadingIn = true;

        // --- GÉNÉRATION FORÊT (v3.9.4) ---
        if (this.forestMesh && state.scene) state.scene.remove(this.forestMesh);
        this.forestMesh = createForestForTile(this);
        if (this.forestMesh && state.scene) {
            this.forestMesh.position.set(this.worldX, 0, this.worldZ);
            state.scene.add(this.forestMesh);
        }

        if (oldMesh) {
            oldMesh.position.y -= 0.1;
            setTimeout(() => {
                if (state.scene) state.scene.remove(oldMesh);
                if (oldMesh.material instanceof THREE.Material) oldMesh.material.dispose();
                if (oldMesh.customDepthMaterial) oldMesh.customDepthMaterial.dispose();
            }, 500);
        }
    }

    updateFade(delta: number): void {
        if (!this.isFadingIn || !this.mesh) return;
        this.opacity += delta * 2.0;
        if (this.opacity >= 1) { this.opacity = 1; this.isFadingIn = false; if (this.mesh.material instanceof THREE.Material) this.mesh.material.transparent = false; }
        if (this.mesh.material instanceof THREE.Material) this.mesh.material.opacity = this.opacity;
    }

    dispose(): void {
        this.status = 'disposed'; loadQueue = loadQueue.filter(t => t !== this);
        if (this.mesh) { 
            if (state.scene) state.scene.remove(this.mesh); 
            if (this.mesh.material instanceof THREE.Material) this.mesh.material.dispose(); 
            this.mesh = null; 
        }
        if (this.forestMesh) { 
            if (state.scene) state.scene.remove(this.forestMesh); 
            this.forestMesh = null; 
        }
    }
}

export function resetTerrain(): void {
    loadQueue = []; clearLabels();
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
}

export function repositionAllTiles(): void { for (const tile of activeTiles.values()) tile.updateWorldPosition(); }
export function animateTiles(delta: number): void { for (const tile of activeTiles.values()) { if (tile.isFadingIn) tile.updateFade(delta); } }

export function lngLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number; z: number } {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon: number, lat: number): { x: number; z: number } {
    const xNorm = (lon + 180) / 360;
    const yNorm = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
    const originUnit = 1.0 / Math.pow(2, state.originTile.z);
    const oxNorm = (state.originTile.x + 0.5) * originUnit;
    const oyNorm = (state.originTile.y + 0.5) * originUnit;
    return { x: (xNorm - oxNorm) * EARTH_CIRCUMFERENCE, z: (yNorm - oyNorm) * EARTH_CIRCUMFERENCE };
}

export function worldToLngLat(worldX: number, worldZ: number): { lat: number; lon: number } {
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

export function clearLabels(): void {
    for (const obj of activeLabels.values()) {
        if (state.scene) { state.scene.remove(obj.sprite); state.scene.remove(obj.line); }
        obj.sprite.material.dispose(); obj.line.geometry.dispose(); obj.line.material.dispose();
    }
    activeLabels.clear();
}

export function updateGPXMesh(): void {
    if (!state.rawGpxData) return;
    if (state.gpxMesh) {
        if (state.scene) state.scene.remove(state.gpxMesh);
        state.gpxMesh.geometry.dispose(); if (state.gpxMesh.material instanceof THREE.Material) state.gpxMesh.material.dispose();
    }
    const track = state.rawGpxData.tracks[0];
    const threePoints = track.points.map((p: any) => {
        const pos = lngLatToWorld(p.lon, p.lat);
        return new THREE.Vector3(pos.x, (p.ele || 0) * state.RELIEF_EXAGGERATION + 10, pos.z);
    });
    state.gpxPoints = threePoints;
    const curve = new THREE.CatmullRomCurve3(threePoints);
    const camAlt = state.camera ? state.camera.position.y : 5000;
    const thickness = Math.max(4, camAlt / 400); 
    const geometry = new THREE.TubeGeometry(curve, threePoints.length * 2, thickness, 8, false);
    const material = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff0000, emissiveIntensity: 2.0, roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.8 });
    state.gpxMesh = new THREE.Mesh(geometry, material);
    state.gpxMesh.renderOrder = 1000;
    if (state.scene) state.scene.add(state.gpxMesh);
    updateElevationProfile();
}

function calculateTargetLOD(tile: Tile, camX: number, camZ: number): number {
    const dx = tile.worldX - camX; const dz = tile.worldZ - camZ;
    const dist = Math.sqrt(dx * dx + dz * dz); const tileSize = tile.tileSizeMeters;
    let targetRes = Math.floor(state.RESOLUTION / 4);
    if (dist < tileSize * 3.0) targetRes = state.RESOLUTION; 
    else if (dist < tileSize * 6.0) targetRes = Math.floor(state.RESOLUTION / 2); 
    if (tile.currentResolution > 0 && Math.abs(targetRes - tile.currentResolution) < 16) return tile.currentResolution; 
    return targetRes;
}

export async function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number = 0, worldZ: number = 0): Promise<void> {
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    if (state.camera && Math.abs(state.camera.position.y) < 1) return;
    const currentGPS = worldToLngLat(worldX, worldZ);
    const zoom = state.ZOOM; const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
    const range = state.RANGE; const margin = 1; 
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy, key = `${tx}_${ty}_${zoom}`;
            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, zoom, key);
                if (tile.isVisible()) { activeTiles.set(key, tile); loadQueue.push(tile); }
            } else if (tile.status === 'loaded') {
                const targetRes = calculateTargetLOD(tile, state.camera ? state.camera.position.x : 0, state.camera ? state.camera.position.z : 0);
                if (targetRes !== tile.currentResolution) tile.buildMesh(targetRes);
            }
        }
    }
    for (const [key, tile] of activeTiles.entries()) {
        const [tx, ty, tz] = key.split('_').map(Number);
        if (tz !== zoom || Math.abs(tx - centerTile.x) > range + margin || Math.abs(ty - centerTile.y) > range + margin) {
            tile.dispose(); activeTiles.delete(key); 
        }
    }
    processLoadQueue();
}

export async function loadTerrain(): Promise<void> { await updateVisibleTiles(); }

export async function deleteTerrainCache(): Promise<void> {
    try {
        const success = await caches.delete(CACHE_NAME);
        if (success) showToast('Cache vidé avec succès');
        else showToast('Le cache était déjà vide');
    } catch (e) { showToast('Erreur lors de la purge du cache'); }
}
