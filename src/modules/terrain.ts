import * as THREE from 'three';
import { disposeObject } from './memory';
import { state } from './state';
import { showToast, isMobileDevice, isPositionInSwitzerland, isPositionInFrance } from './utils';
import { updateElevationProfile, haversineDistance } from './profile';
import { createForestForTile } from './vegetation';
import { loadPOIsForTile } from './poi';
import { loadBuildingsForTile } from './buildings';
import { loadHydrologyForTile } from './hydrology';
import { EARTH_CIRCUMFERENCE, lngLatToWorld, worldToLngLat, lngLatToTile } from './geo';
import { tileWorkerManager } from './workerManager';
import { eventBus } from './eventBus';

interface CachedData {
    elev: THREE.Texture;
    pixelData: Uint8ClampedArray | null;
    color: THREE.Texture;
    overlay: THREE.Texture | null;
}

export const activeTiles = new Map<string, Tile>(); 
export const activeLabels = new Map<string, any>(); 

function getMaxCacheSize(): number {
    if (state.PERFORMANCE_PRESET === 'ultra') return 800;
    if (state.PERFORMANCE_PRESET === 'performance') return 400;
    if (state.PERFORMANCE_PRESET === 'balanced') return isMobileDevice() ? 100 : 250;
    return 60;
}

const dataCache = new Map<string, CachedData>();
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

let loadQueue: Set<Tile> = new Set<Tile>();
let isProcessingQueue = false;

async function processLoadQueue() {
    if (isProcessingQueue || loadQueue.size === 0) {
        state.isProcessingTiles = false;
        return;
    }
    isProcessingQueue = true;
    state.isProcessingTiles = true;
    try {
        const sorted = Array.from(loadQueue).sort((a, b) => {
            if (!state.camera) return 0;
            const camPos = state.camera.position;
            const aVis = a.isVisible() ? 1 : 0;
            const bVis = b.isVisible() ? 1 : 0;
            if (aVis !== bVis) return bVis - aVis;
            const da = (a.worldX - camPos.x) ** 2 + (a.worldZ - camPos.z) ** 2;
            const db = (b.worldX - camPos.x) ** 2 + (b.worldZ - camPos.z) ** 2;
            return da - db;
        });

        const batch = sorted.slice(0, 4);
        batch.forEach(t => loadQueue.delete(t));

        await Promise.all(batch.map(async (tile) => {
            try { if (tile.status === 'idle') await tile.load(); }
            catch (e) { tile.status = 'failed'; }
        }));
    } finally {
        isProcessingQueue = false;
        if (loadQueue.size > 0) setTimeout(processLoadQueue, 32);
        else state.isProcessingTiles = false;
    }
}

function addToCache(key: string, elevTex: THREE.Texture, pixelData: Uint8ClampedArray | null, colorTex: THREE.Texture, overlayTex: THREE.Texture | null): void {
    if (dataCache.size >= getMaxCacheSize()) {
        const oldestKey = dataCache.keys().next().value;
        if (oldestKey) {
            const entry = dataCache.get(oldestKey);
            if (entry) { entry.elev.dispose(); entry.color.dispose(); if (entry.overlay) entry.overlay.dispose(); }
            dataCache.delete(oldestKey);
        }
    }
    dataCache.set(key, { elev: elevTex, pixelData, color: colorTex, overlay: overlayTex });
}

function getFromCache(key: string): CachedData | null {
    const data = dataCache.get(key);
    if (!data) return null;
    dataCache.delete(key); dataCache.set(key, data);
    return data;
}

export function clearCache(): void {
    for (const entry of dataCache.values()) {
        entry.elev.dispose(); entry.color.dispose(); if (entry.overlay) entry.overlay.dispose();
    }
    dataCache.clear();
}

const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();
export const terrainUniforms = { 
    uExaggeration: { value: state.RELIEF_EXAGGERATION },
    uShowSlopes: { value: state.SHOW_SLOPES ? 1.0 : 0.0 },
    uShowHydrology: { value: state.SHOW_HYDROLOGY ? 1.0 : 0.0 },
    uTime: { value: 0.0 },
    uSunPos: { value: new THREE.Vector3(0, 1, 0) }
};

const CACHE_NAME = 'suntrail-tiles-v1';

async function fetchWithCache(url: string, usePersistentCache: boolean = false): Promise<Blob | null> {
    if (state.IS_OFFLINE && !usePersistentCache) return null;
    try {
        if (usePersistentCache) {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(url);
            if (cached) { state.cacheHits++; updateStorageUI(); return await cached.blob(); }
        }
        if (state.IS_OFFLINE) return null;
        const r = await fetch(url, { mode: 'cors' });
        if (r.ok) {
            const blob = await r.blob();
            state.networkRequests++; updateStorageUI();
            if (usePersistentCache) { const cache = await caches.open(CACHE_NAME); cache.put(url, new Response(blob)); }
            return blob;
        }
        return null;
    } catch (e) { return null; }
}

export async function downloadOfflineZone(lat: number, lon: number, onProgress: (done: number, total: number) => void): Promise<void> {
    const radiusKm = 6;
    const zooms = [12, 13, 14, 15];
    const latOffset = radiusKm / 111.0;
    const lonOffset = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));
    const bbox = { n: lat + latOffset, s: lat - latOffset, e: lon + lonOffset, w: lon - lonOffset };
    const urls: string[] = [];
    const inCH = isPositionInSwitzerland(lat, lon);

    for (const z of zooms) {
        const t1 = lngLatToTile(bbox.w, bbox.n, z);
        const t2 = lngLatToTile(bbox.e, bbox.s, z);
        for (let x = t1.x; x <= t2.x; x++) {
            for (let y = t1.y; y <= t2.y; y++) {
                let colorUrl = '';
                if (state.MAP_SOURCE === 'satellite') colorUrl = inCH ? `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${z}/${x}/${y}.jpeg` : `https://api.maptiler.com/maps/satellite/256/${z}/${x}/${y}@2x.webp?key=${state.MK}`;
                else colorUrl = inCH ? `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg` : `https://api.maptiler.com/maps/topo-v2/256/${z}/${x}/${y}@2x.webp?key=${state.MK}`;
                urls.push(colorUrl);
                urls.push(`https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.png?key=${state.MK}`);
            }
        }
    }
    const total = urls.length;
    let done = 0;
    for (const url of urls) {
        try { await fetchWithCache(url, true); } catch (e) {}
        done++; if (done % 5 === 0) onProgress(done, total);
    }
    onProgress(total, total);
}

export function updateStorageUI() {
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
    forestMesh: THREE.Object3D | null = null;
    poiGroup: THREE.Group | null = null;
    buildingMesh: THREE.Mesh | null = null;
    currentResolution: number = -1;
    tileSizeMeters: number;
    opacity: number = 0;
    isFadingIn: boolean = false;
    worldX: number = 0; worldZ: number = 0;
    bounds: THREE.Box3 = new THREE.Box3();
    elevOffset = new THREE.Vector2(); elevScale = 1.0;
    colorOffset = new THREE.Vector2(); colorScale = 1.0;

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

    getBounds() {
        const n = Math.pow(2, this.zoom);
        const lonWest = this.tx / n * 360 - 180;
        const lonEast = (this.tx + 1) / n * 360 - 180;
        const latRadNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * this.ty / n)));
        const latNorth = latRadNorth * 180 / Math.PI;
        const latRadSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (this.ty + 1) / n)));
        const latSouth = latRadSouth * 180 / Math.PI;
        return { north: latNorth, south: latSouth, west: lonWest, east: lonEast };
    }

    lngLatToLocal(lon: number, lat: number): THREE.Vector3 {
        const n = Math.pow(2, this.zoom);
        const xNorm = (lon + 180) / 360;
        const yNorm = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
        const txNorm = (this.tx + 0.5) / n;
        const tyNorm = (this.ty + 0.5) / n;
        return new THREE.Vector3((xNorm - txNorm) * EARTH_CIRCUMFERENCE, 0, (yNorm - tyNorm) * EARTH_CIRCUMFERENCE);
    }

    getNativeColorZoom(): number {
        if (state.MAP_SOURCE === 'opentopomap') return 15;
        return 18;
    }

    updateHybridSettings(): void {
        const MAX_RGB_ZOOM = 14;
        const nativeMax = this.getNativeColorZoom();
        if (this.zoom > MAX_RGB_ZOOM) {
            const ratio = Math.pow(2, this.zoom - MAX_RGB_ZOOM);
            this.elevScale = 1.0 / ratio;
            this.elevOffset.set((this.tx % ratio) * this.elevScale, (this.ty % ratio) * this.elevScale);
        } else { this.elevScale = 1.0; this.elevOffset.set(0, 0); }
        if (this.zoom > nativeMax) {
            const ratio = Math.pow(2, this.zoom - nativeMax);
            this.colorScale = 1.0 / ratio;
            this.colorOffset.set((this.tx % ratio) * this.colorScale, (this.ty % ratio) * this.colorScale);
        } else { this.colorScale = 1.0; this.colorOffset.set(0, 0); }
    }

    async load(): Promise<void> {
        if (this.status !== 'idle' && this.status !== 'failed') return;
        const is2D = (state.RESOLUTION <= 2);
        const cacheKey = `${state.MAP_SOURCE}_${state.SHOW_TRAILS}_${is2D ? '2D' : '3D'}_${this.key}`;
        const cached = getFromCache(cacheKey);
        if (cached) {
            this.elevationTex = cached.elev; this.pixelData = cached.pixelData;
            this.colorTex = cached.color; this.overlayTex = cached.overlay;
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
            return;
        }
        if (this.status as any === 'disposed') return;
        this.status = 'loading';
        try {
            let elevUrl = null;
            if (!(this.zoom <= 10 || is2D)) {
                let ez = Math.min(this.zoom, 14);
                let r = Math.pow(2, Math.max(0, this.zoom - 14));
                elevUrl = `https://api.maptiler.com/tiles/terrain-rgb-v2/${ez}/${Math.floor(this.tx/r)}/${Math.floor(this.ty/r)}.png?key=${state.MK}`;
            }
            let nativeMax = this.getNativeColorZoom();
            let cz = Math.min(this.zoom, nativeMax);
            let cr = Math.pow(2, Math.max(0, this.zoom - nativeMax));
            let colorUrl = this.getColorUrl(cz, Math.floor(this.tx/cr), Math.floor(this.ty/cr));
            if (colorUrl.includes('maptiler')) colorUrl = colorUrl.replace('/256/', '/512/');
            let overlayUrl = (state.SHOW_TRAILS && this.zoom >= 10) ? this.getOverlayUrl(Math.min(this.zoom, 18), this.tx, this.ty) : null;

            const data = await tileWorkerManager.loadTile(elevUrl, colorUrl, overlayUrl);
            if (this.status as any === 'disposed' || !data) return;

            if (data.elevBitmap) {
                this.elevationTex = new THREE.Texture(data.elevBitmap);
                this.elevationTex.flipY = false; this.elevationTex.needsUpdate = true;
                if (data.pixelData) this.pixelData = new Uint8ClampedArray(data.pixelData);
            } else { this.elevationTex = new THREE.CanvasTexture(document.createElement('canvas')); }

            if (data.colorBitmap) {
                this.colorTex = new THREE.Texture(data.colorBitmap);
                this.colorTex.flipY = false; this.colorTex.needsUpdate = true; this.colorTex.colorSpace = THREE.SRGBColorSpace;
            } else { this.colorTex = new THREE.CanvasTexture(document.createElement('canvas')); }

            if (data.overlayBitmap) {
                this.overlayTex = new THREE.Texture(data.overlayBitmap);
                this.overlayTex.flipY = false; this.overlayTex.needsUpdate = true; this.overlayTex.colorSpace = THREE.SRGBColorSpace;
            }

            addToCache(cacheKey, this.elevationTex!, this.pixelData, this.colorTex!, this.overlayTex);
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
        } catch (e) { this.status = 'failed'; }
    }

    getColorUrl(z: number, x: number, y: number): string {
        const inCH = isPositionInSwitzerland(state.TARGET_LAT, state.TARGET_LON);
        const inFR = isPositionInFrance(state.TARGET_LAT, state.TARGET_LON);
        if (state.MAP_SOURCE === 'satellite') {
            if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${z}/${x}/${y}.jpeg`;
            if (inFR) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
            return `https://api.maptiler.com/maps/satellite/256/${z}/${x}/${y}@2x.webp?key=${state.MK}`;
        }
        if (state.MAP_SOURCE === 'swisstopo') {
            if (inCH) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`;
            if (inFR) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
        }
        return `https://api.maptiler.com/maps/topo-v2/256/${z}/${x}/${y}@2x.webp?key=${state.MK}`;
    }

    getOverlayUrl(z: number, x: number, y: number): string { 
        if (isPositionInSwitzerland(state.TARGET_LAT, state.TARGET_LON)) return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${z}/${x}/${y}.png`; 
        if (isPositionInFrance(state.TARGET_LAT, state.TARGET_LON)) return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=TRANSPORT.WANDERWEGE&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
        return '';
    }

    buildMesh(resolution: number): void {
        if (!this.elevationTex || !this.colorTex || this.status as any === 'disposed') return;
        if (activeTiles.get(this.key) !== this) return;

        const is2D = (this.zoom <= 10 || resolution <= 2);
        const isLight = (state.PERFORMANCE_PRESET === 'eco' || state.PERFORMANCE_PRESET === 'balanced');
        const oldMesh = this.mesh;
        
        const material = is2D 
            ? new THREE.MeshBasicMaterial({ map: this.colorTex, transparent: true, opacity: 0 })
            : new THREE.MeshStandardMaterial({ map: this.colorTex, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0 });

        if (!is2D) {
            const sharedShaderChunk = `
                uniform sampler2D uElevationMap; uniform float uExaggeration; uniform float uTileSize;
                uniform vec2 uElevOffset; uniform float uElevScale;
                float decodeHeight(vec4 rgba) { return -10000.0 + ((rgba.r * 255.0 * 65536.0 + rgba.g * 255.0 * 256.0 + rgba.b * 255.0) * 0.1); }
                float getTerrainHeight(vec2 uv) {
                    vec2 elevUv = uElevOffset + (uv * uElevScale);
                    vec4 col = texture2D(uElevationMap, elevUv);
                    float h = decodeHeight(col);
                    if (h < -1000.0 || h > 9000.0) return 0.0;
                    return h * uExaggeration;
                }
                float getTrueTerrainHeight(vec2 uv) {
                    vec2 elevUv = uElevOffset + (uv * uElevScale);
                    vec4 col = texture2D(uElevationMap, elevUv);
                    float h = decodeHeight(col);
                    if (h < -1000.0 || h > 9000.0) return 0.0;
                    return h;
                }
            `;

            (material as THREE.MeshStandardMaterial).onBeforeCompile = (shader) => {
                shader.uniforms.uElevationMap = { value: this.elevationTex };
                shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
                shader.uniforms.uShowSlopes = terrainUniforms.uShowSlopes;
                shader.uniforms.uShowHydrology = terrainUniforms.uShowHydrology;
                shader.uniforms.uTime = terrainUniforms.uTime;
                shader.uniforms.uTileSize = { value: this.tileSizeMeters };
                shader.uniforms.uElevOffset = { value: this.elevOffset };
                shader.uniforms.uElevScale = { value: this.elevScale };
                shader.uniforms.uColorOffset = { value: this.colorOffset };
                shader.uniforms.uColorScale = { value: this.colorScale };
                shader.uniforms.uOverlayMap = { value: this.overlayTex };
                shader.uniforms.uHasOverlay = { value: !!this.overlayTex };

                shader.vertexShader = `
                    #define IS_LIGHT ${isLight ? '1' : '0'}
                    ${shader.vertexShader}
                `.replace('#include <common>', `#include <common>\nvarying vec3 vTrueNormal; uniform vec2 uColorOffset; uniform float uColorScale; ${sharedShaderChunk}`)
                 .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = uColorOffset + (uv * uColorScale);`);

                if (isLight) {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nobjectNormal = vec3(0.0,1.0,0.0); vTrueNormal = vec3(0.0,1.0,0.0);`);
                } else {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n
                        float delta = uTileSize / 256.0;
                        float hL = getTerrainHeight(uv + vec2(-1.0/256.0, 0.0));
                        float hR = getTerrainHeight(uv + vec2(1.0/256.0, 0.0));
                        float hD = getTerrainHeight(uv + vec2(0.0, -1.0/256.0));
                        float hU = getTerrainHeight(uv + vec2(0.0, 1.0/256.0));
                        objectNormal = normalize(vec3(hL - hR, delta * 2.0, hD - hU));
                        float thL = getTrueTerrainHeight(uv + vec2(-1.0/256.0, 0.0));
                        float thR = getTrueTerrainHeight(uv + vec2(1.0/256.0, 0.0));
                        float thD = getTrueTerrainHeight(uv + vec2(0.0, -1.0/256.0));
                        float thU = getTrueTerrainHeight(uv + vec2(0.0, 1.0/256.0));
                        vTrueNormal = normalize(vec3(thL - thR, delta * 2.0, thD - thU));
                    `);
                }
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv);`);
                shader.fragmentShader = `
                    uniform sampler2D uOverlayMap; uniform bool uHasOverlay; uniform float uShowSlopes; uniform float uShowHydrology; uniform float uTime; varying vec3 vTrueNormal;
                    ${shader.fragmentShader}
                `.replace('#include <map_fragment>', `
                    #include <map_fragment>
                    if (uShowHydrology > 0.5) {
                        vec3 colorIn = diffuseColor.rgb;
                        float brightness = (colorIn.r + colorIn.g + colorIn.b) / 3.0;
                        float isWater = smoothstep(0.05, 0.15, colorIn.b - max(colorIn.r, colorIn.g)) * smoothstep(0.998, 1.0, vTrueNormal.y) * (1.0 - smoothstep(0.7, 0.9, brightness));
                        if (isWater > 0.1) {
                            vec3 waterBlue = vec3(0.02, 0.15, 0.45);
                            float wave = sin(vMapUv.x * 40.0 + uTime * 0.8) * cos(vMapUv.y * 40.0 + uTime * 0.5) * 0.5 + 0.5;
                            diffuseColor.rgb = mix(colorIn, waterBlue, 0.7 * isWater);
                            diffuseColor.rgb += vec3(0.1, 0.3, 0.5) * wave * isWater * 0.2;
                        }
                    }
                    if (uHasOverlay) { vec4 oCol = texture2D(uOverlayMap, vMapUv); diffuseColor.rgb = mix(diffuseColor.rgb, oCol.rgb, oCol.a); }
                    if (uShowSlopes > 0.5) {
                        float slopeDeg = degrees(acos(clamp(dot(normalize(vTrueNormal), vec3(0.0, 1.0, 0.0)), 0.0, 1.0)));
                        float yellowMix = smoothstep(28.0, 32.0, slopeDeg);
                        float orangeMix = smoothstep(33.0, 37.0, slopeDeg);
                        float redMix = smoothstep(38.0, 42.0, slopeDeg);
                        vec3 slopeColor = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.5, 0.0), orangeMix);
                        slopeColor = mix(slopeColor, vec3(1.0, 0.0, 0.0), redMix);
                        diffuseColor.rgb = mix(diffuseColor.rgb, slopeColor, yellowMix * 0.55);
                    }
                `);
            };

            const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
            depth.onBeforeCompile = (shader) => {
                shader.uniforms.uElevationMap = { value: this.elevationTex };
                shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
                shader.uniforms.uElevOffset = { value: this.elevOffset };
                shader.uniforms.uElevScale = { value: this.elevScale };
                shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n
                    uniform sampler2D uElevationMap; uniform float uExaggeration; uniform vec2 uElevOffset; uniform float uElevScale;
                    float decodeHeight(vec4 rgba) { return -10000.0 + ((rgba.r * 255.0 * 65536.0 + rgba.g * 255.0 * 256.0 + rgba.b * 255.0) * 0.1); }
                    float getTerrainHeight(vec2 uv) {
                        vec2 elevUv = uElevOffset + (uv * uElevScale);
                        vec4 col = texture2D(uElevationMap, elevUv);
                        return decodeHeight(col) * uExaggeration;
                    }
                `).replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv);`);
            };
            this.mesh = new THREE.Mesh(getPlaneGeometry(resolution, this.tileSizeMeters), material);
            this.mesh.customDepthMaterial = depth;
        } else {
            this.mesh = new THREE.Mesh(getPlaneGeometry(resolution, this.tileSizeMeters), material);
        }

        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.renderOrder = this.zoom; 
        this.mesh.castShadow = !is2D; this.mesh.receiveShadow = !is2D;

        if (state.scene) state.scene.add(this.mesh);
        this.currentResolution = resolution;
        this.opacity = 0; this.isFadingIn = true;

        const delay = (ms: number) => ms * state.LOAD_DELAY_FACTOR;
        if (state.SHOW_SIGNPOSTS && this.zoom >= 15) setTimeout(() => { if (this.status !== 'disposed') loadPOIsForTile(this); }, delay(600));
        if (state.SHOW_BUILDINGS && this.zoom >= 16) setTimeout(() => { if (this.status !== 'disposed') loadBuildingsForTile(this); }, delay(150));
        if (state.SHOW_HYDROLOGY && this.zoom >= 13) setTimeout(() => { if (this.status !== 'disposed') loadHydrologyForTile(this); }, delay(100));
        if (state.SHOW_VEGETATION && this.zoom >= 14) setTimeout(() => {
            if (this.status as any === 'disposed') return;
            const forest = createForestForTile(this);
            if (forest && state.scene && this.status as any !== 'disposed') {
                if (this.forestMesh) state.scene.remove(this.forestMesh);
                this.forestMesh = forest; this.forestMesh.position.set(this.worldX, 0, this.worldZ);
                state.scene.add(this.forestMesh);
            }
        }, delay(300));

        if (oldMesh) {
            oldMesh.position.y -= 0.1;
            setTimeout(() => { if (state.scene) state.scene.remove(oldMesh); if (oldMesh.material instanceof THREE.Material) oldMesh.material.dispose(); }, 500);
        }
    }

    updateFade(delta: number): void {
        if (!this.isFadingIn || !this.mesh) return;
        this.opacity += delta * 2.0;
        if (this.opacity >= 1) { this.opacity = 1; this.isFadingIn = false; if (this.mesh.material instanceof THREE.Material) this.mesh.material.transparent = false; }
        if (this.mesh.material instanceof THREE.Material) this.mesh.material.opacity = this.opacity;
    }

    dispose(): void {
        this.status = 'disposed'; loadQueue.delete(this);
        if (this.mesh) { if (state.scene) state.scene.remove(this.mesh); disposeObject(this.mesh); this.mesh = null; }
        if (this.forestMesh) { if (state.scene) state.scene.remove(this.forestMesh); disposeObject(this.forestMesh); this.forestMesh = null; }
        if (this.poiGroup) { if (state.scene) state.scene.remove(this.poiGroup); disposeObject(this.poiGroup); this.poiGroup = null; }
        if (this.buildingMesh) { if (state.scene) state.scene.remove(this.buildingMesh); disposeObject(this.buildingMesh); this.buildingMesh = null; }
    }
}

export function resetTerrain(): void {
    loadQueue.clear(); clearLabels();
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
}

export function repositionAllTiles(): void { for (const tile of activeTiles.values()) tile.updateWorldPosition(); }
export function animateTiles(delta: number): boolean { 
    let stillFading = false;
    for (const tile of activeTiles.values()) { if (tile.isFadingIn) { tile.updateFade(delta); stillFading = true; } }
    return stillFading;
}

export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource || isNaN(lat) || lat === 0) return;
    let newSource = (state.ZOOM > 9 && (isPositionInSwitzerland(lat, lon) || isPositionInFrance(lat, lon))) ? 'swisstopo' : 'opentopomap';
    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        document.querySelectorAll('.layer-item').forEach(i => { i.classList.remove('active'); if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active'); });
        updateVisibleTiles();
    }
}

import { updateWeatherUIIndicator } from './weather';

export function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number = 0, worldZ: number = 0): Promise<void> {
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    terrainUniforms.uShowSlopes.value = state.SHOW_SLOPES ? 1.0 : 0.0;
    terrainUniforms.uShowHydrology.value = state.SHOW_HYDROLOGY ? 1.0 : 0.0;
    updateWeatherUIIndicator();

    if (!state.camera || Math.abs(state.camera.position.y) < 1) return Promise.resolve();
    const currentGPS = worldToLngLat(worldX, worldZ, state.originTile);
    const zoom = state.ZOOM; const maxTile = Math.pow(2, zoom);
    const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
    const camGPS = worldToLngLat(state.camera.position.x, state.camera.position.z, state.originTile);
    const camTile = lngLatToTile(camGPS.lon, camGPS.lat, zoom);
    const currentActiveKeys = new Set<string>();
    
    const camKey = `${camTile.x}_${camTile.y}_${zoom}`;
    if (camTile.x >= 0 && camTile.x < maxTile && camTile.y >= 0 && camTile.y < maxTile) {
        currentActiveKeys.add(camKey);
        if (!activeTiles.has(camKey)) { const t = new Tile(camTile.x, camTile.y, zoom, camKey); activeTiles.set(camKey, t); loadQueue.add(t); }
    }

    let range = (zoom <= 10) ? Math.max(state.RANGE, 3) : (zoom >= 17) ? Math.max(3, Math.floor(state.RANGE/1.5)) : state.RANGE;
    let buildsThisCycle = 0;
    const MAX_BUILDS_PER_CYCLE = state.isUserInteracting ? state.MAX_BUILDS_PER_CYCLE : state.MAX_BUILDS_PER_CYCLE * 2; 

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx; const ty = centerTile.y + dy;
            if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) continue;
            const key = `${tx}_${ty}_${zoom}`; currentActiveKeys.add(key);
            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, zoom, key);
                if (tile.isVisible() || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)) { activeTiles.set(key, tile); loadQueue.add(tile); }
            } else if (tile.status === 'loaded' && tile.zoom === zoom && buildsThisCycle < MAX_BUILDS_PER_CYCLE) {
                const dist = Math.sqrt((tile.worldX - state.camera.position.x)**2 + (tile.worldZ - state.camera.position.z)**2);
                let targetRes = (dist < tile.tileSizeMeters * 4.0) ? state.RESOLUTION : (dist < tile.tileSizeMeters * 8.0) ? Math.max(1, Math.floor(state.RESOLUTION/2)) : Math.max(1, Math.floor(state.RESOLUTION/4));
                if (targetRes !== tile.currentResolution) { tile.buildMesh(targetRes); buildsThisCycle++; }
            }
        }
    }
    for (const [key, tile] of activeTiles.entries()) { if (!currentActiveKeys.has(key)) { tile.dispose(); activeTiles.delete(key); } }
    processLoadQueue();

    if (loadQueue.size === 0) {
        const nextZoom = zoom + 1;
        if (nextZoom <= 18) {
            const ct = lngLatToTile(currentGPS.lon, currentGPS.lat, nextZoom);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const tx = ct.x + dx; const ty = ct.y + dy;
                    if (tx < 0 || tx >= Math.pow(2, nextZoom) || ty < 0 || ty >= Math.pow(2, nextZoom)) continue;
                    const pKey = `${tx}_${ty}_${nextZoom}`;
                    if (!dataCache.has(`${state.MAP_SOURCE}_${state.SHOW_TRAILS}_3D_${pKey}`)) loadQueue.add(new Tile(tx, ty, nextZoom, pKey));
                }
            }
        }
        if (loadQueue.size > 0) processLoadQueue();
    }
    return Promise.resolve();
}

export function updateHydrologyVisibility(visible: boolean): void { state.SHOW_HYDROLOGY = visible; resetTerrain(); updateVisibleTiles(); }
export function updateSlopeVisibility(visible: boolean): void { state.SHOW_SLOPES = visible; resetTerrain(); updateVisibleTiles(); }
export async function loadTerrain(): Promise<void> { await updateVisibleTiles(); }
export async function deleteTerrainCache(): Promise<void> { try { const success = await caches.delete(CACHE_NAME); showToast(success ? 'Cache vidé' : 'Cache déjà vide'); } catch (e) { showToast('Erreur cache'); } }

export function updateGPXMesh(): void {
    if (!state.rawGpxData || !state.camera) return;
    const camAlt = state.camera.position.y;
    const thickness = Math.max(1.5, camAlt / 1200); 
    if (state.gpxMesh) { if (state.scene) state.scene.remove(state.gpxMesh); disposeObject(state.gpxMesh); }
    const track = state.rawGpxData.tracks[0];
    const points = track.points;
    const box = new THREE.Box3();
    const threePoints = points.map((p: any) => {
        const pos = lngLatToWorld(p.lon, p.lat, state.originTile);
        const v = new THREE.Vector3(pos.x, (p.ele || 0) * state.RELIEF_EXAGGERATION + 5, pos.z);
        box.expandByPoint(v); return v;
    });
    state.gpxPoints = threePoints;
    const curve = new THREE.CatmullRomCurve3(threePoints);
    const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 1500), thickness, 4, false);
    const colors = []; const color = new THREE.Color();
    for (let i = 0; i <= 1500; i++) {
        const t = i / 1500; const gIdx = Math.floor(t * (points.length - 1));
        const p1 = points[Math.max(0, gIdx - 1)]; const p2 = points[gIdx];
        let slope = 0; if (gIdx > 0) { const d = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon); if (d > 0.001) slope = Math.abs(((p2.ele || 0) - (p1.ele || 0)) / (d * 1000) * 100); }
        if (slope < 5) color.set(0x22c55e); else if (slope < 12) color.set(0xeab308); else if (slope < 20) color.set(0xf97316); else color.set(0xef4444);
        for (let j = 0; j <= 4; j++) colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    state.gpxMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.2, transparent: true, opacity: 0.9 }));
    if (state.scene) state.scene.add(state.gpxMesh);
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = new THREE.Vector3(); box.getSize(size);
    eventBus.emit('flyTo', { worldX: center.x, worldZ: center.z, targetElevation: Math.max(size.x, size.z) * 1.5 });
    updateElevationProfile();
}

export function clearGPX(): void {
    if (state.gpxMesh) { if (state.scene) state.scene.remove(state.gpxMesh); disposeObject(state.gpxMesh); state.gpxMesh = null; }
    state.rawGpxData = null; state.gpxPoints = [];
    const prof = document.getElementById('elevation-profile'); if (prof) prof.style.display = 'none';
    const tc = document.getElementById('trail-controls'); if (tc) tc.style.display = 'none';
}

export function clearLabels(): void {
    for (const obj of activeLabels.values()) { if (state.scene) { state.scene.remove(obj.sprite); state.scene.remove(obj.line); } disposeObject(obj.sprite); disposeObject(obj.line); }
    activeLabels.clear();
}
