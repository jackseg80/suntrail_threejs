import * as THREE from 'three';
import { disposeObject } from './memory';
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

// --- OPTIMISATION CACHE ADAPTATIVE (Phase 4) ---
function getMaxCacheSize(): number {
    if (state.PERFORMANCE_PRESET === 'ultra') return 800;
    if (state.PERFORMANCE_PRESET === 'performance') return 400;
    if (state.PERFORMANCE_PRESET === 'balanced') return isMobileDevice() ? 100 : 250;
    return 60; // Mode Eco
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

let loadQueue: Tile[] = [];
let isProcessingQueue = false;

async function processLoadQueue() {
    if (isProcessingQueue || loadQueue.length === 0) {
        state.isProcessingTiles = false;
        return;
    }
    isProcessingQueue = true;
    state.isProcessingTiles = true;
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
        
        // --- OPTIMISATION FLUIDITÉ (v4.5.44) ---
        // On réduit le nombre de tuiles traitées simultanément (12 -> 4)
        // pour ne pas saturer le thread principal lors des déplacements.
        const batch = loadQueue.splice(0, 4);
        await Promise.all(batch.map(async (tile) => {
            try { 
                if (tile.status === 'idle') await tile.load(); 
            }
            catch (e) { tile.status = 'failed'; }
        }));
    } finally {
        isProcessingQueue = false;
        // On augmente le délai entre deux lots (16ms -> 32ms) pour laisser le temps au moteur de rendu de souffler
        if (loadQueue.length > 0) setTimeout(processLoadQueue, 32); 
    }
}

function addToCache(key: string, elevTex: THREE.Texture, pixelData: Uint8ClampedArray | null, colorTex: THREE.Texture, overlayTex: THREE.Texture | null, slopesTex: THREE.Texture | null): void {
    if (dataCache.size >= getMaxCacheSize()) {
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

    lngLatToLocal(lon: number, lat: number): THREE.Vector3 {
        const n = Math.pow(2, this.zoom);
        const xNorm = (lon + 180) / 360;
        const yNorm = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
        
        const txNorm = (this.tx + 0.5) / n;
        const tyNorm = (this.ty + 0.5) / n;
        
        return new THREE.Vector3(
            (xNorm - txNorm) * EARTH_CIRCUMFERENCE,
            0,
            (yNorm - tyNorm) * EARTH_CIRCUMFERENCE
        );
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
        
        const is2D = (state.RESOLUTION <= 2);
        const cacheKey = `${state.MAP_SOURCE}_${state.SHOW_TRAILS}_${state.SHOW_SLOPES}_${is2D ? '2D' : '3D'}_${this.key}`;
        
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
            
            // --- OPTIMISATION 2D MOBILE (v4.3.58 / v4.5.49) ---
            // On saute le relief si zoom faible OU mode 2D forcé
            if (this.zoom <= 10 || state.RESOLUTION <= 2) {
                const dummy = document.createElement('canvas'); dummy.width = 2; dummy.height = 2;
                const dCtx = dummy.getContext('2d'); if (dCtx) { dCtx.fillStyle = '#000000'; dCtx.fillRect(0,0,2,2); }
                this.elevationTex = new THREE.CanvasTexture(dummy);
                this.pixelData = new Uint8ClampedArray(16); // Vide
            } else {
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
            }

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
            
            // --- FALLBACK SWISSTOPO (v4.3.35) ---
            // Si Swisstopo échoue (400/404), on tente MapTiler Satellite en secours
            if (!colorBlob && state.MAP_SOURCE === 'swisstopo') {
                const fallbackUrl = `https://api.maptiler.com/maps/satellite/256/${colorZoom}/${colorTx}/${colorTy}@2x.webp?key=${state.MK}`;
                colorBlob = await fetchWithCache(fallbackUrl, true);
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

            // --- SÉCURITÉ GÉOGRAPHIQUE (v4.3.38) ---
            const inCH = isPositionInSwitzerland(state.TARGET_LAT, state.TARGET_LON);
            const isHighAlt = (this.zoom < 10);
            
            let layerZoom = Math.min(this.zoom, 18);
            let layerTx = this.tx; let layerTy = this.ty;

            // On ne demande les calques suisses que si on est en Suisse ET à basse/moyenne altitude
            const wantTrails = state.SHOW_TRAILS && inCH && !isHighAlt;
            const wantSlopes = state.SHOW_SLOPES && inCH && !isHighAlt;

            const [tBlob, sBlob] = await Promise.all([
                wantTrails ? fetchWithCache(this.getOverlayUrl(layerZoom, layerTx, layerTy), true) : Promise.resolve(null),
                wantSlopes ? fetchWithCache(this.getSlopesUrl(layerZoom, layerTx, layerTy), true) : Promise.resolve(null)
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
        
        // --- SÉCURITÉ ANTI-FANTÔME (v4.3.32) ---
        if (activeTiles.get(this.key) !== this) return;

        // --- OPTIMISATION 2D MOBILE (v4.3.65 / v4.5.47) ---
        // On force 2D si zoom faible ou résolution ECO (<= 2)
        const is2D = (this.zoom <= 10 || resolution <= 2);
        
        const oldMesh = this.mesh;
        const geometry = getPlaneGeometry(resolution, this.tileSizeMeters);
        
        const material = is2D 
            ? new THREE.MeshBasicMaterial({ map: this.colorTex, transparent: true, opacity: 0 })
            : new THREE.MeshStandardMaterial({ map: this.colorTex, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0 });

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

        if (!is2D) {
            const isLight = (state.PERFORMANCE_PRESET === 'eco' || state.PERFORMANCE_PRESET === 'balanced');
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

                shader.vertexShader = `
                    #define IS_LIGHT ${isLight ? '1' : '0'}
                    ${shader.vertexShader}
                `;

                shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n
                    uniform vec2 uColorOffset;
                    uniform float uColorScale;
                    ${sharedShaderChunk}
                `);
                shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = uColorOffset + (uv * uColorScale);`);
                
                // --- OPTIMISATION SHADER (v4.5.46) ---
                // En mode Light, on ne calcule pas de normales précises par échantillonnage.
                // On utilise les normales par défaut du plan (orientées vers le haut) pour gagner du FPS GPU.
                if (isLight) {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n
                        objectNormal = vec3(0.0, 1.0, 0.0);
                    `);
                } else {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n
                        float delta = uTileSize / 256.0;
                        float hL = getTerrainHeight(uv + vec2(-1.0/256.0, 0.0));
                        float hR = getTerrainHeight(uv + vec2(1.0/256.0, 0.0));
                        float hD = getTerrainHeight(uv + vec2(0.0, -1.0/256.0));
                        float hU = getTerrainHeight(uv + vec2(0.0, 1.0/256.0));
                        objectNormal = normalize(vec3(hL - hR, delta * 2.0, hD - hU));
                    `);
                }
                
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
        }

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.renderOrder = this.zoom; 
        this.mesh.castShadow = !is2D;
        this.mesh.receiveShadow = !is2D;

        // --- OMBRES PORTÉES RÉELLES (v4.3.25) ---
        if (!is2D) {
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
        }

        if (state.scene) state.scene.add(this.mesh);
        this.currentResolution = resolution;
        this.opacity = 0; 
        this.isFadingIn = true;

        // --- CHARGEMENT SÉQUENCÉ DES DÉTAILS (v4.5.41) ---
        const delay = (ms: number) => ms * state.LOAD_DELAY_FACTOR;
        
        // 1. POIs (Rapide)
        if (state.SHOW_SIGNPOSTS && this.zoom >= 14) {
            setTimeout(() => {
                if (this.status === 'disposed') return;
                loadPOIsForTile(this);
            }, delay(50));
        }

        // 2. Bâtiments (Lourd)
        if (state.SHOW_BUILDINGS && this.zoom >= 14) {
            setTimeout(() => {
                if (this.status === 'disposed') return;
                loadBuildingsForTile(this);
            }, delay(150));
        }

        // 3. Végétation (Très Lourd)
        if (state.SHOW_VEGETATION && this.zoom >= 15) {
            setTimeout(() => {
                if ((this.status as string) === 'disposed') return;
                const forest = createForestForTile(this);
                if (forest && state.scene && (this.status as string) !== 'disposed') {
                    if (this.forestMesh) state.scene.remove(this.forestMesh);
                    this.forestMesh = forest;
                    this.forestMesh.position.set(this.worldX, 0, this.worldZ);
                    state.scene.add(this.forestMesh);
                }
            }, delay(300));
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
            disposeObject(this.mesh);
            this.mesh = null; 
        }
        if (this.forestMesh) { if (state.scene) state.scene.remove(this.forestMesh); disposeObject(this.forestMesh); this.forestMesh = null; }
        if (this.poiGroup) { if (state.scene) state.scene.remove(this.poiGroup); disposeObject(this.poiGroup); this.poiGroup = null; }
        if (this.buildingMesh) { if (state.scene) state.scene.remove(this.buildingMesh); disposeObject(this.buildingMesh); this.buildingMesh = null; }
    }
}

export function resetTerrain(): void {
    loadQueue = []; clearLabels();
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
}

export function repositionAllTiles(): void { for (const tile of activeTiles.values()) tile.updateWorldPosition(); }
export function animateTiles(delta: number): boolean { 
    let stillFading = false;
    for (const tile of activeTiles.values()) { 
        if (tile.isFadingIn) {
            tile.updateFade(delta); 
            stillFading = true;
        }
    }
    return stillFading;
}

let lastSourceCheck = 0;
export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource || isNaN(lat) || lat === 0) return;
    const now = Date.now();
    if (now - lastSourceCheck < 2000) return;
    lastSourceCheck = now;

    // --- LOGIQUE DE SOURCE AUTO (v4.5.30) ---
    let newSource = 'opentopomap';
    
    // Si on est à haute altitude (Europe), on force OpenTopoMap pour la lisibilité
    if (state.ZOOM > 9) {
        const isSwiss = isPositionInSwitzerland(lat, lon);
        newSource = isSwiss ? 'swisstopo' : 'opentopomap';
    }

    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        document.querySelectorAll('.layer-item').forEach(i => {
            i.classList.remove('active');
            if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active');
        });
        updateVisibleTiles();
    }
}

export async function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number = 0, worldZ: number = 0): Promise<void> {
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    if (!state.camera || Math.abs(state.camera.position.y) < 1) return;

    const currentGPS = worldToLngLat(worldX, worldZ, state.originTile);
    const zoom = state.ZOOM; 
    const maxTile = Math.pow(2, zoom);
    const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
    
    // --- SÉCURITÉ ANTI-COLLISION SOL (v4.5.42) ---
    // On s'assure de toujours charger la tuile sous la caméra pour avoir une altitude sol précise
    const camGPS = worldToLngLat(state.camera.position.x, state.camera.position.z, state.originTile);
    const camTile = lngLatToTile(camGPS.lon, camGPS.lat, zoom);
    const currentActiveKeys = new Set<string>();
    
    // Ajout de la tuile sous caméra (prioritaire)
    const camKey = `${camTile.x}_${camTile.y}_${zoom}`;
    if (camTile.x >= 0 && camTile.x < maxTile && camTile.y >= 0 && camTile.y < maxTile) {
        currentActiveKeys.add(camKey);
        if (!activeTiles.has(camKey)) {
            const t = new Tile(camTile.x, camTile.y, zoom, camKey);
            activeTiles.set(camKey, t); loadQueue.push(t);
        }
    }

    // --- BRIDAGE DYNAMIQUE DU RAYON (v4.3.45) ---
    // On adapte la limite de sécurité selon la puissance de la machine
    let range = state.RANGE;
    let maxSafetyRange = 4; // Par défaut (Balanced)

    if (state.PERFORMANCE_PRESET === 'ultra' || state.RESOLUTION >= 256) maxSafetyRange = 8;
    else if (state.PERFORMANCE_PRESET === 'performance') maxSafetyRange = 5;
    else if (state.PERFORMANCE_PRESET === 'eco') maxSafetyRange = 3;

    if (zoom >= 15) {
        range = Math.min(range, maxSafetyRange);
    }
    
    if (zoom >= 17) {
        // Très haute résolution : limite plus stricte
        const extremeRange = Math.max(2, Math.floor(maxSafetyRange / 2));
        range = Math.min(range, extremeRange);
    }

    let buildsThisCycle = 0;
    const isUserInteracting = (state.controls as any)._isMoving;
    const MAX_BUILDS_PER_CYCLE = isUserInteracting ? state.MAX_BUILDS_PER_CYCLE : state.MAX_BUILDS_PER_CYCLE * 2; 

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

                let targetRes = Math.max(1, Math.floor(state.RESOLUTION / 4));
                if (dist < tile.tileSizeMeters * 3.0) targetRes = state.RESOLUTION;
                else if (dist < tile.tileSizeMeters * 6.0) targetRes = Math.max(1, Math.floor(state.RESOLUTION / 2));

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

    // --- PRE-CHARGEMENT PRÉDICTIF (v4.3.31) ---
    // On anticipe le prochain mouvement de l'utilisateur si la file principale est vide
    if (loadQueue.length === 0) {
        const nextZoom = zoom + 1;
        const prevZoom = zoom - 1;
        
        // 1. Anticiper le Zoom Avant (LOD +1) - Centre uniquement
        if (nextZoom <= 18) {
            const maxNext = Math.pow(2, nextZoom);
            const ct = lngLatToTile(currentGPS.lon, currentGPS.lat, nextZoom);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const tx = ct.x + dx;
                    const ty = ct.y + dy;
                    if (tx < 0 || tx >= maxNext || ty < 0 || ty >= maxNext) continue; // Sécurité bornes (v4.3.37)

                    const pKey = `${tx}_${ty}_${nextZoom}`;
                    const cacheKey = `${state.MAP_SOURCE}_${state.SHOW_TRAILS}_${state.SHOW_SLOPES}_${pKey}`;
                    if (!dataCache.has(cacheKey)) {
                        const pTile = new Tile(tx, ty, nextZoom, pKey);
                        loadQueue.push(pTile);
                    }
                }
            }
        }

        // 2. Anticiper le Zoom Arrière (LOD -1)
        if (prevZoom >= 4) {
            const maxPrev = Math.pow(2, prevZoom);
            const ct = lngLatToTile(currentGPS.lon, currentGPS.lat, prevZoom);
            if (ct.x >= 0 && ct.x < maxPrev && ct.y >= 0 && ct.y < maxPrev) {
                const pKey = `${ct.x}_${ct.y}_${prevZoom}`;
                const cacheKey = `${state.MAP_SOURCE}_${state.SHOW_TRAILS}_${state.SHOW_SLOPES}_${pKey}`;
                if (!dataCache.has(cacheKey)) {
                    const pTile = new Tile(ct.x, ct.y, prevZoom, pKey);
                    loadQueue.push(pTile);
                }
            }
        }
        
        if (loadQueue.length > 0) processLoadQueue();
    }
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
        disposeObject(state.gpxMesh);
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
        disposeObject(obj.sprite);
        disposeObject(obj.line);
    }
    activeLabels.clear();
}
