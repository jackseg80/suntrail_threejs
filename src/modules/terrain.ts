import * as THREE from 'three';
import { state } from './state';
import { showToast, isMobileDevice, isPositionInSwitzerland } from './utils';
import { updateElevationProfile } from './profile';
import { createForestForTile } from './vegetation';
import { loadPOIsForTile } from './poi';
import { loadBuildingsForTile } from './buildings';
import { EARTH_CIRCUMFERENCE, lngLatToWorld, worldToLngLat, lngLatToTile } from './geo';

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
        const batch = loadQueue.splice(0, 12);
        await Promise.all(batch.map(async (tile) => {
            try { if (tile.status === 'idle' || tile.status === 'failed') await tile.load(); }
            catch (e) { tile.status = 'failed'; }
        }));
    } finally {
        isProcessingQueue = false;
        if (loadQueue.length > 0) setTimeout(processLoadQueue, 16); // Augmenté de 4ms à 16ms pour laisser respirer le CPU
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

const CACHE_NAME = 'suntrail-tiles-v1';

async function fetchWithCache(url: string, usePersistentCache: boolean = false): Promise<Blob | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); 

    try {
        if (usePersistentCache) {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(url);
            if (cached) { 
                state.cacheHits++; updateStorageUI(); 
                clearTimeout(timeoutId);
                return await cached.blob(); 
            }
        }
        const r = await fetch(url, { mode: 'cors', signal: controller.signal });
        clearTimeout(timeoutId);
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
    } catch (e) { 
        clearTimeout(timeoutId);
        return null; 
    }
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
    poiGroup: THREE.Group | null = null;
    buildingMesh: THREE.Mesh | null = null;
    currentResolution: number = -1;
    tileSizeMeters: number;
    opacity: number = 0;
    isFadingIn: boolean = false;
    worldX: number = 0; worldZ: number = 0;
    bounds: THREE.Box3 = new THREE.Box3();
    
    // Paramètres Hybrides
    elevOffset: THREE.Vector2 = new THREE.Vector2(0, 0);
    elevScale: number = 1.0;
    colorOffset: THREE.Vector2 = new THREE.Vector2(0, 0);
    colorScale: number = 1.0;

    constructor(tx: number, ty: number, zoom: number, key: string) {
        this.tx = tx; this.ty = ty; this.zoom = zoom; this.key = key;
        this.tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        this.updateWorldPosition();
        this.updateHybridSettings();
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

    getNativeColorZoom(): number {
        switch(state.MAP_SOURCE) {
            case 'satellite': return 18;
            case 'swisstopo': return 18;
            case 'opentopomap': return 15;
            default: return 18;
        }
    }

    updateHybridSettings(): void {
        const MAX_RGB_ZOOM = 14;
        const colorSourceMaxZoom = this.getNativeColorZoom();

        if (this.zoom > MAX_RGB_ZOOM) {
            const ratio = Math.pow(2, this.zoom - MAX_RGB_ZOOM);
            this.elevScale = 1.0 / ratio;
            this.elevOffset.set((this.tx % ratio) * this.elevScale, (this.ty % ratio) * this.elevScale);
        } else {
            this.elevScale = 1.0;
            this.elevOffset.set(0, 0);
        }

        if (this.zoom > colorSourceMaxZoom) {
            const ratio = Math.pow(2, this.zoom - colorSourceMaxZoom);
            this.colorScale = 1.0 / ratio;
            this.colorOffset.set((this.tx % ratio) * this.colorScale, (this.ty % ratio) * this.colorScale);
        } else {
            this.colorScale = 1.0;
            this.colorOffset.set(0, 0);
        }
    }

    async load(): Promise<void> {
        if (this.status !== 'idle' && this.status !== 'failed') return;
        const cacheKey = `${state.MAP_SOURCE}_${state.SHOW_TRAILS}_${state.SHOW_SLOPES}_${this.key}`;
        const cached = getFromCache(cacheKey);
        if (cached) {
            this.elevationTex = cached.elev; this.pixelData = cached.pixelData;
            this.colorTex = cached.color; this.overlayTex = cached.overlay; this.slopesTex = cached.slopes;
            this.updateHybridSettings();
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
            return;
        }
        if (this.status as any === 'disposed') return;
        this.status = 'loading';
        try {
            this.updateHybridSettings();
            
            let elevZoom = Math.min(this.zoom, 14);
            let elevTx = this.tx; let elevTy = this.ty;
            if (this.zoom > 14) {
                const ratio = Math.pow(2, this.zoom - 14);
                elevTx = Math.floor(this.tx / ratio); elevTy = Math.floor(this.ty / ratio);
            }

            const elevBlob = await fetchWithCache(`https://api.maptiler.com/tiles/terrain-rgb-v2/${elevZoom}/${elevTx}/${elevTy}.png?key=${state.MK}`, true);
            if (this.status as any === 'disposed') return;
            if (!elevBlob) throw new Error("Elevation failed");
            const imgElev = await createImageBitmap(elevBlob, { colorSpaceConversion: 'none' });
            if (this.status as any === 'disposed') return;
            this.elevationTex = new THREE.Texture(imgElev);
            this.elevationTex.flipY = false; this.elevationTex.needsUpdate = true;
            
            const offCanvas = document.createElement('canvas'); offCanvas.width = imgElev.width; offCanvas.height = imgElev.height;
            const offCtx = offCanvas.getContext('2d');
            if (offCtx) { offCtx.drawImage(imgElev, 0, 0); this.pixelData = offCtx.getImageData(0, 0, imgElev.width, imgElev.height).data; }

            const nativeMax = this.getNativeColorZoom();
            let colorZoom = Math.min(this.zoom, nativeMax);
            let colorTx = this.tx;
            let colorTy = this.ty;

            if (this.zoom > colorZoom) {
                const ratio = Math.pow(2, this.zoom - colorZoom);
                colorTx = Math.floor(this.tx / ratio);
                colorTy = Math.floor(this.ty / ratio);
            }

            let colorUrl = this.getColorUrl(colorZoom, colorTx, colorTy);
            if (colorUrl.includes('maptiler')) colorUrl = colorUrl.replace('/256/', '/512/'); 

            let colorBlob = await fetchWithCache(colorUrl, true);
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

            const inCH = isPositionInSwitzerland(state.TARGET_LAT, state.TARGET_LON);
            let layerZoom = Math.min(this.zoom, 18);
            let layerTx = this.tx; let layerTy = this.ty;

            const [tBlob, sBlob] = await Promise.all([
                (state.SHOW_TRAILS && inCH) ? fetchWithCache(this.getOverlayUrl(layerZoom, layerTx, layerTy), true) : Promise.resolve(null),
                (state.SHOW_SLOPES && inCH) ? fetchWithCache(this.getSlopesUrl(layerZoom, layerTx, layerTy), true) : Promise.resolve(null)
            ]);
            if (this.status as any === 'disposed') return;
            if (tBlob) { const i = await createImageBitmap(tBlob); this.overlayTex = new THREE.Texture(i); this.overlayTex.flipY = false; this.overlayTex.needsUpdate = true; this.overlayTex.colorSpace = THREE.SRGBColorSpace; }
            if (sBlob) { const i = await createImageBitmap(sBlob); this.slopesTex = new THREE.Texture(i); this.slopesTex.flipY = false; this.slopesTex.needsUpdate = true; this.slopesTex.colorSpace = THREE.SRGBColorSpace; }

            if (this.status as any === 'disposed') return;
            addToCache(cacheKey, this.elevationTex, this.pixelData, this.colorTex, this.overlayTex, this.slopesTex);
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
        } catch (e) { this.status = 'failed'; }
    }

    getColorUrl(z: number, x: number, y: number): string {
        const inCH = isPositionInSwitzerland(state.TARGET_LAT, state.TARGET_LON);
        switch(state.MAP_SOURCE) {
            case 'satellite': 
                if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${z}/${x}/${y}.jpeg`;
                return `https://api.maptiler.com/maps/satellite/256/${z}/${x}/${y}@2x.webp?key=${state.MK}`;
            case 'swisstopo': 
                if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`;
                return `https://api.maptiler.com/maps/topo-v2/256/${z}/${x}/${y}@2x.webp?key=${state.MK}`;
            case 'opentopomap': return `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`;
            default: return `https://api.maptiler.com/maps/topo-v2/256/${z}/${x}/${y}@2x.webp?key=${state.MK}`;
        }
    }
    getOverlayUrl(z: number, x: number, y: number): string { return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${z}/${x}/${y}.png`; }
    getSlopesUrl(z: number, x: number, y: number): string { return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.hangneigung-ueber_30/default/current/3857/${z}/${x}/${y}.png`; }

    buildMesh(resolution: number): void {
        if (!this.elevationTex || !this.colorTex || this.status as any === 'disposed') return;
        
        const oldMesh = this.mesh;
        const geometry = getPlaneGeometry(resolution, this.tileSizeMeters);
        const material = new THREE.MeshStandardMaterial({ map: this.colorTex, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0 });

        const sharedShaderChunk = `
            uniform sampler2D uElevationMap;
            uniform float uExaggeration;
            uniform float uTileSize;
            uniform vec2 uElevOffset;
            uniform float uElevScale;

            float decodeHeight(vec4 rgba) {
                return -10000.0 + ((rgba.r * 255.0 * 65536.0 + rgba.g * 255.0 * 256.0 + rgba.b * 255.0) * 0.1);
            }
            float getTerrainHeight(vec2 uv) {
                vec2 elevUv = uElevOffset + (uv * uElevScale);
                vec4 col = texture2D(uElevationMap, elevUv);
                float h = decodeHeight(col);
                if (h < -1000.0 || h > 9000.0) return 0.0;
                return h * uExaggeration;
            }
        `;

        material.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.uniforms.uTileSize = { value: this.tileSizeMeters };
            shader.uniforms.uElevOffset = { value: this.elevOffset };
            shader.uniforms.uElevScale = { value: this.elevScale };
            shader.uniforms.uColorOffset = { value: this.colorOffset };
            shader.uniforms.uColorScale = { value: this.colorScale };
            shader.uniforms.uOverlayMap = { value: this.overlayTex || null };
            shader.uniforms.uHasOverlay = { value: !!this.overlayTex };
            shader.uniforms.uSlopesMap = { value: this.slopesTex || null };
            shader.uniforms.uHasSlopes = { value: !!this.slopesTex };

            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n
                uniform vec2 uColorOffset;
                uniform float uColorScale;
                ${sharedShaderChunk}
            `);
            shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = uColorOffset + (uv * uColorScale);`);
            shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n
                float delta = uTileSize / 256.0;
                float hL = getTerrainHeight(uv + vec2(-1.0/256.0, 0.0));
                float hR = getTerrainHeight(uv + vec2(1.0/256.0, 0.0));
                float hD = getTerrainHeight(uv + vec2(0.0, -1.0/256.0));
                float hU = getTerrainHeight(uv + vec2(0.0, 1.0/256.0));
                objectNormal = normalize(vec3(hL - hR, delta * 2.0, hD - hU));
            `);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv);`);

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

        // --- OMBRES PORTÉES RÉELLES (v4.3.25) ---
        const customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.5
        });

        customDepthMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.uniforms.uElevOffset = { value: this.elevOffset };
            shader.uniforms.uElevScale = { value: this.elevScale };

            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${sharedShaderChunk}`);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv);`);
        };
        this.mesh.customDepthMaterial = customDepthMaterial;

        if (state.scene) state.scene.add(this.mesh);
        this.currentResolution = resolution;
        this.opacity = 0; 
        this.isFadingIn = true;

        // --- CHARGEMENT SÉQUENCÉ DES DÉTAILS (v4.3.26) ---
        // On étale la charge sur plusieurs frames pour éviter les pics de 140ms
        
        // 1. POIs (Rapide)
        if (state.SHOW_SIGNPOSTS && this.zoom >= 14) {
            setTimeout(() => {
                loadPOIsForTile(this).then(group => {
                    if (group && this.status !== 'disposed' && state.scene) {
                        if (this.poiGroup) state.scene.remove(this.poiGroup);
                        this.poiGroup = group;
                        this.poiGroup.position.set(this.worldX, 0, this.worldZ);
                        state.scene.add(this.poiGroup);
                    }
                });
            }, 50);
        }

        // 2. Bâtiments (Lourd)
        if (state.SHOW_BUILDINGS && this.zoom >= 14) {
            setTimeout(() => {
                if (this.status === 'disposed') return;
                loadBuildingsForTile(this)
                    .then(mesh => {
                        if (mesh && this.status !== 'disposed' && state.scene) {
                            if (this.buildingMesh) state.scene.remove(this.buildingMesh);
                            this.buildingMesh = mesh;
                            state.scene.add(this.buildingMesh);
                        }
                    })
                    .catch(err => console.error("[Terrain] Error loading buildings:", err));
            }, 150);
        }

        // 3. Végétation (Très Lourd)
        if (state.SHOW_VEGETATION) {
            setTimeout(() => {
                if ((this.status as string) === 'disposed') return;
                const forest = createForestForTile(this);
                if (forest && state.scene && (this.status as string) !== 'disposed') {
                    this.forestMesh = forest;
                    this.forestMesh.position.set(this.worldX, 0, this.worldZ);
                    state.scene.add(this.forestMesh);
                }
            }, 300);
        }

        if (oldMesh) {
            oldMesh.position.y -= 0.1;
            setTimeout(() => {
                if (state.scene) state.scene.remove(oldMesh);
                if (oldMesh.material instanceof THREE.Material) oldMesh.material.dispose();
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
            if (this.mesh.customDepthMaterial) this.mesh.customDepthMaterial.dispose();
            this.mesh = null; 
        }
        if (this.forestMesh) { if (state.scene) state.scene.remove(this.forestMesh); this.forestMesh = null; }
        if (this.poiGroup) { if (state.scene) state.scene.remove(this.poiGroup); this.poiGroup = null; }
        if (this.buildingMesh) { if (state.scene) state.scene.remove(this.buildingMesh); this.buildingMesh = null; }
    }
}

export function resetTerrain(): void {
    loadQueue = []; clearLabels();
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
}

export function repositionAllTiles(): void { for (const tile of activeTiles.values()) tile.updateWorldPosition(); }
export function animateTiles(delta: number): void { for (const tile of activeTiles.values()) { if (tile.isFadingIn) tile.updateFade(delta); } }

export async function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number = 0, worldZ: number = 0): Promise<void> {
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    if (!state.camera || Math.abs(state.camera.position.y) < 1) return;

    const currentGPS = worldToLngLat(worldX, worldZ, state.originTile);
    const zoom = state.ZOOM; 
    const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
    
    let range = state.RANGE;
    if (zoom >= 15) range = Math.max(3, Math.min(range, 4)); 
    if (zoom >= 17) range = 2; 
    
    const maxTile = Math.pow(2, zoom);
    const currentActiveKeys = new Set<string>();

    let buildsThisCycle = 0;
    const MAX_BUILDS_PER_CYCLE = 1; // Un seul maillage par cycle pour garder 60fps

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx;
            const ty = centerTile.y + dy;
            if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) continue;
            const key = `${tx}_${ty}_${zoom}`;
            currentActiveKeys.add(key);
            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, zoom, key);
                if (tile.isVisible() || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)) {
                    activeTiles.set(key, tile);
                    loadQueue.push(tile);
                }
            } else if (tile.status === 'loaded' && tile.zoom === zoom && buildsThisCycle < MAX_BUILDS_PER_CYCLE) {
                const dX = tile.worldX - state.camera.position.x;
                const dZ = tile.worldZ - state.camera.position.z;
                const dist = Math.sqrt(dX * dX + dZ * dZ);

                let targetRes = Math.floor(state.RESOLUTION / 4);
                if (dist < tile.tileSizeMeters * 3.0) targetRes = state.RESOLUTION;
                else if (dist < tile.tileSizeMeters * 6.0) targetRes = Math.floor(state.RESOLUTION / 2);

                if (targetRes !== tile.currentResolution) {
                    tile.buildMesh(targetRes);
                    buildsThisCycle++;
                }
            }
        }
    }
    for (const [key, tile] of activeTiles.entries()) {
        if (!currentActiveKeys.has(key)) { tile.dispose(); activeTiles.delete(key); }
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

let lastGpxThickness = 0;

export function updateGPXMesh(): void {
    if (!state.rawGpxData || !state.camera) return;
    
    const camAlt = state.camera.position.y;
    const thickness = Math.max(4, camAlt / 400); 

    // --- OPTIMISATION CRITIQUE (v4.3.26) ---
    // On ne recrée la géométrie que si l'épaisseur change de plus de 20%
    // pour éviter de bloquer le CPU lors des transitions de zoom.
    if (state.gpxMesh && Math.abs(thickness - lastGpxThickness) < lastGpxThickness * 0.2) {
        // On se contente de repositionner le mesh existant si nécessaire (origin shift)
        const track = state.rawGpxData.tracks[0];
        const p0 = track.points[0];
        lngLatToWorld(p0.lon, p0.lat, state.originTile);
        // Le repositionnement est géré par le fait que les points sont recalculés 
        // par rapport à l'originTile dans lngLatToWorld.
        // Si l'originTile a changé, il faut quand même recalculer les points.
    }

    if (state.gpxMesh) {
        if (state.scene) state.scene.remove(state.gpxMesh);
        state.gpxMesh.geometry.dispose(); 
        if (state.gpxMesh.material instanceof THREE.Material) state.gpxMesh.material.dispose();
    }

    const track = state.rawGpxData.tracks[0];
    const threePoints = track.points.map((p: any) => {
        const pos = lngLatToWorld(p.lon, p.lat, state.originTile);
        return new THREE.Vector3(pos.x, (p.ele || 0) * state.RELIEF_EXAGGERATION + 10, pos.z);
    });
    
    state.gpxPoints = threePoints;
    const curve = new THREE.CatmullRomCurve3(threePoints);
    
    // On réduit la segmentation du tube pour gagner en performance (x1 au lieu de x2)
    const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 2000), thickness, 6, false);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff3300, 
        emissive: 0xff0000, 
        emissiveIntensity: 2.0, 
        roughness: 0.2, 
        metalness: 0.8, 
        transparent: true, 
        opacity: 0.8 
    });
    
    state.gpxMesh = new THREE.Mesh(geometry, material);
    state.gpxMesh.renderOrder = 1000;
    if (state.scene) state.scene.add(state.gpxMesh);
    lastGpxThickness = thickness;
    updateElevationProfile();
}

export function clearLabels(): void {
    for (const obj of activeLabels.values()) {
        if (state.scene) { state.scene.remove(obj.sprite); state.scene.remove(obj.line); }
        obj.sprite.material.dispose(); obj.line.geometry.dispose(); obj.line.material.dispose();
    }
    activeLabels.clear();
}
