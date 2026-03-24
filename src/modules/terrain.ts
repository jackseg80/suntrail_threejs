import * as THREE from 'three';
import { disposeObject } from './memory';
import { state } from './state';
import { isPositionInSwitzerland, isPositionInFrance } from './utils';
import { updateElevationProfile, haversineDistance } from './profile';
import { createForestForTile } from './vegetation';
import { loadPOIsForTile } from './poi';
import { loadBuildingsForTile } from './buildings';
import { loadHydrologyForTile } from './hydrology';
import { EARTH_CIRCUMFERENCE, lngLatToWorld, worldToLngLat, lngLatToTile, getTileBounds } from './geo';
import { eventBus } from './eventBus';
import { addToCache, getFromCache, hasInCache, getTileCacheKey } from './tileCache';
import { getPlaneGeometry } from './geometryCache';
import { loadTileData } from './tileLoader';
import { materialPool } from './materialPool';


export const activeTiles = new Map<string, Tile>(); 
export const activeLabels = new Map<string, any>(); 

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
            try { 
                if (tile.status === 'idle') {
                    state.isProcessingTiles = true; // Forcer le réveil de la render loop
                    await tile.load(); 
                }
            }
            catch (e) { tile.status = 'failed'; }
        }));
    } finally {
        isProcessingQueue = false;
        if (loadQueue.size > 0) setTimeout(processLoadQueue, 32);
        else state.isProcessingTiles = false;
    }
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

export class Tile {
    tx: number; ty: number; zoom: number; key: string;
    status: 'idle' | 'loading' | 'loaded' | 'failed' | 'disposed' = 'idle';
    mesh: THREE.Mesh | null = null;
    elevationTex: THREE.Texture | null = null;
    pixelData: Uint8ClampedArray | null = null;
    colorTex: THREE.Texture | null = null;
    overlayTex: THREE.Texture | null = null;
    normalTex: THREE.Texture | null = null;
    forestMesh: THREE.Object3D | null = null;
    poiGroup: THREE.Group | null = null;
    buildingMesh: THREE.Mesh | null = null;
    hydroGroup: THREE.Group | null = null;
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

    public getBounds() {
        return getTileBounds({ zoom: this.zoom, tx: this.tx, ty: this.ty });
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
        if (this.forestMesh) this.forestMesh.position.set(this.worldX, 0, this.worldZ);
        if (this.poiGroup && !this.poiGroup.parent) this.poiGroup.position.set(this.worldX, 0, this.worldZ);
        
        this.bounds.set(
            new THREE.Vector3(this.worldX - this.tileSizeMeters/2, -1000, this.worldZ - this.tileSizeMeters/2),
            new THREE.Vector3(this.worldX + this.tileSizeMeters/2, 9000, this.worldZ + this.tileSizeMeters/2)
        );
    }

    public isVisible(): boolean {
        if (!state.camera) return true;
        projScreenMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);
        return frustum.intersectsBox(this.bounds.clone().expandByScalar(this.tileSizeMeters * 0.2));
    }

    public lngLatToLocal(lon: number, lat: number): THREE.Vector3 {
        const n = Math.pow(2, this.zoom);
        const xNorm = (lon + 180) / 360;
        const yNorm = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
        const txNorm = (this.tx + 0.5) / n;
        const tyNorm = (this.ty + 0.5) / n;
        return new THREE.Vector3((xNorm - txNorm) * EARTH_CIRCUMFERENCE, 0, (yNorm - tyNorm) * EARTH_CIRCUMFERENCE);
    }

    updateHybridSettings(): void {
        const MAX_RGB_ZOOM = 14;
        const nativeMax = (state.MAP_SOURCE === 'opentopomap') ? 15 : 18;
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
        const cacheKey = getTileCacheKey(this.key, this.zoom);
        const cached = getFromCache(cacheKey);
        if (cached) {
            this.elevationTex = cached.elev; this.pixelData = cached.pixelData;
            this.colorTex = cached.color; this.overlayTex = cached.overlay;
            this.normalTex = cached.normal;
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
            return;
        }
        this.status = 'loading';
        const is2D = (this.zoom <= 10 || state.RESOLUTION <= 2);
        try {
            const data = await loadTileData(this.tx, this.ty, this.zoom, is2D);
            if ((this.status as string) === 'disposed' || !data) return;

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

            if (data.normalBitmap) {
                this.normalTex = new THREE.Texture(data.normalBitmap);
                this.normalTex.flipY = false; this.normalTex.needsUpdate = true;
            }

            addToCache(cacheKey, this.elevationTex!, this.pixelData, this.colorTex!, this.overlayTex, this.normalTex);
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
        } catch (e) { this.status = 'failed'; }
    }

    buildMesh(resolution: number): void {
        if (!this.elevationTex || !this.colorTex || this.status as any === 'disposed') return;
        if (activeTiles.get(this.key) !== this) return;

        const is2D = (this.zoom <= 10 || resolution <= 2);
        const isLight = (state.PERFORMANCE_PRESET === 'eco');
        const oldMesh = this.mesh;
        
        const onCompile = (shader: any) => {
            material.userData.shader = shader;
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uNormalMap = { value: this.normalTex };
            shader.uniforms.uOverlayMap = { value: this.overlayTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.uniforms.uShowSlopes = terrainUniforms.uShowSlopes;
            shader.uniforms.uShowHydrology = terrainUniforms.uShowHydrology;
            shader.uniforms.uTime = terrainUniforms.uTime;
            shader.uniforms.uTileSize = { value: this.tileSizeMeters };
            shader.uniforms.uElevOffset = { value: this.elevOffset };
            shader.uniforms.uElevScale = { value: this.elevScale };
            shader.uniforms.uColorOffset = { value: this.colorOffset };
            shader.uniforms.uColorScale = { value: this.colorScale };
            shader.uniforms.uHasOverlay = { value: !!this.overlayTex };

            if (!shader.vertexShader.includes('vTrueNormal')) {
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
                `;

                shader.vertexShader = `
                    #define IS_LIGHT ${isLight ? '1' : '0'}
                    ${shader.vertexShader}
                `.replace('#include <common>', `#include <common>\nvarying vec3 vTrueNormal; varying vec2 vWorldXZ; uniform vec2 uColorOffset; uniform float uColorScale; uniform sampler2D uNormalMap; ${sharedShaderChunk}`)
                 .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = uColorOffset + (uv * uColorScale);`);

                if (isLight) {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nobjectNormal = vec3(0.0,1.0,0.0); vTrueNormal = vec3(0.0,1.0,0.0);`);
                } else {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n
                        vec2 elevUv = uElevOffset + (uv * uElevScale);
                        vec3 normalSample = texture2D(uNormalMap, elevUv).rgb * 2.0 - 1.0;
                        vTrueNormal = normalize(normalSample);
                        objectNormal = normalize(vec3(normalSample.x * uExaggeration, normalSample.y, normalSample.z * uExaggeration));
                    `);
                }
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv); vWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
                shader.fragmentShader = `
                    uniform sampler2D uOverlayMap; uniform bool uHasOverlay; uniform float uShowSlopes; uniform float uShowHydrology; uniform float uTime; varying vec3 vTrueNormal; varying vec2 vWorldXZ;
                    ${shader.fragmentShader}
                `.replace('#include <map_fragment>', `
                    #include <map_fragment>
                    if (uShowHydrology > 0.5) {
                        vec3 colorIn = diffuseColor.rgb;
                        float brightness = (colorIn.r + colorIn.g + colorIn.b) / 3.0;
                        
                        float blueDominance = colorIn.b - (colorIn.r + colorIn.g) * 0.5;
                        float isWater = smoothstep(0.01, 0.08, blueDominance) * smoothstep(0.99, 1.0, vTrueNormal.y);
                        isWater *= (1.0 - smoothstep(0.8, 0.95, brightness) * (1.0 - smoothstep(0.1, 0.2, blueDominance)));

                        if (isWater > 0.05) {
                            vec3 waterBlue = vec3(0.02, 0.18, 0.52);
                            
                            // --- VAGUES EN ROULEAUX GÉANTS (Directionnelles & Sans raccord) ---
                            // On utilise vWorldXZ pour une continuité parfaite entre les tuiles
                            float t = uTime * 0.5;
                            // Fréquence très basse : 0.002 = une vague tous les ~3km
                            float w1 = sin(vWorldXZ.x * 0.002 + vWorldXZ.y * 0.0015 + t) * 0.5 + 0.5;
                            float w2 = sin(vWorldXZ.x * 0.001 - vWorldXZ.y * 0.0025 + t * 0.6) * 0.5 + 0.5;
                            
                            float wave = mix(w1, w2, 0.4);
                            
                            diffuseColor.rgb = mix(colorIn, waterBlue, 0.65 * isWater);
                            // Reflet large et lent
                            diffuseColor.rgb += vec3(0.2, 0.4, 0.7) * (wave - 0.5) * isWater * 0.4;
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
            }
        };

        const material = materialPool.acquire(is2D, onCompile);
        if (is2D) (material as THREE.MeshBasicMaterial).map = this.colorTex;
        else (material as THREE.MeshStandardMaterial).map = this.colorTex;

        // Mise à jour directe des uniforms si le shader est déjà compilé (réutilisation)
        const shader = (material as any).userData.shader;
        if (shader) {
            shader.uniforms.uElevationMap.value = this.elevationTex;
            shader.uniforms.uNormalMap.value = this.normalTex;
            shader.uniforms.uOverlayMap.value = this.overlayTex;
            shader.uniforms.uTileSize.value = this.tileSizeMeters;
            shader.uniforms.uElevOffset.value = this.elevOffset;
            shader.uniforms.uElevScale.value = this.elevScale;
            shader.uniforms.uColorOffset.value = this.colorOffset;
            shader.uniforms.uColorScale.value = this.colorScale;
            shader.uniforms.uHasOverlay.value = !!this.overlayTex;
        }

        if (!is2D) {
            const onDepthCompile = (shader: any) => {
                (depth as any).userData.shader = shader;
                shader.uniforms.uElevationMap = { value: this.elevationTex };
                shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
                shader.uniforms.uElevOffset = { value: this.elevOffset };
                shader.uniforms.uElevScale = { value: this.elevScale };
                
                if (!shader.vertexShader.includes('decodeHeight')) {
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n
                        uniform sampler2D uElevationMap; uniform float uExaggeration; uniform vec2 uElevOffset; uniform float uElevScale;
                        float decodeHeight(vec4 rgba) { return -10000.0 + ((rgba.r * 255.0 * 65536.0 + rgba.g * 255.0 * 256.0 + rgba.b * 255.0) * 0.1); }
                        float getTerrainHeight(vec2 uv) {
                            vec2 elevUv = uElevOffset + (uv * uElevScale);
                            vec4 col = texture2D(uElevationMap, elevUv);
                            return decodeHeight(col) * uExaggeration;
                        }
                    `).replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv);`);
                }
            };

            const depth = materialPool.acquireDepth(onDepthCompile);
            const depthShader = (depth as any).userData.shader;
            if (depthShader) {
                depthShader.uniforms.uElevationMap.value = this.elevationTex;
                depthShader.uniforms.uElevOffset.value = this.elevOffset;
                depthShader.uniforms.uElevScale.value = this.elevScale;
            }

            this.mesh = new THREE.Mesh(getPlaneGeometry(resolution, this.tileSizeMeters), material);
            this.mesh.customDepthMaterial = depth;
        } else {
            this.mesh = new THREE.Mesh(getPlaneGeometry(resolution, this.tileSizeMeters), material);
        }

        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.renderOrder = this.zoom; 
        this.mesh.castShadow = !is2D; this.mesh.receiveShadow = !is2D;

        if (state.scene && activeTiles.get(this.key) === this) state.scene.add(this.mesh);
        this.currentResolution = resolution;
        this.opacity = 0; this.isFadingIn = true;

        const delay = (ms: number) => ms * state.LOAD_DELAY_FACTOR;
        if (state.SHOW_SIGNPOSTS && this.zoom >= 15) setTimeout(() => { if (this.status !== 'disposed' && activeTiles.get(this.key) === this) loadPOIsForTile(this); }, delay(600));
        if (state.SHOW_BUILDINGS && this.zoom >= 16) setTimeout(() => { if (this.status !== 'disposed' && activeTiles.get(this.key) === this) loadBuildingsForTile(this); }, delay(150));
        if (state.SHOW_HYDROLOGY && this.zoom >= 13) setTimeout(() => { if (this.status !== 'disposed' && activeTiles.get(this.key) === this) loadHydrologyForTile(this); }, delay(100));
        if (state.SHOW_VEGETATION && this.zoom >= 14) setTimeout(() => {
            if (this.status as any === 'disposed' || activeTiles.get(this.key) !== this) return;
            const forest = createForestForTile(this);
            if (forest && state.scene && this.status as any !== 'disposed' && activeTiles.get(this.key) === this) {
                if (this.forestMesh) state.scene.remove(this.forestMesh);
                this.forestMesh = forest; this.forestMesh.position.set(this.worldX, 0, this.worldZ);
                state.scene.add(this.forestMesh);
            }
        }, delay(300));

        if (oldMesh) {
            oldMesh.position.y -= 0.1;
            setTimeout(() => { 
                if (state.scene) state.scene.remove(oldMesh); 
                if (oldMesh.material instanceof THREE.Material) materialPool.release(oldMesh.material);
                if (oldMesh.customDepthMaterial instanceof THREE.Material) materialPool.release(oldMesh.customDepthMaterial);
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
        this.status = 'disposed'; loadQueue.delete(this);
        if (this.mesh) {
            if (state.scene) state.scene.remove(this.mesh);
            // Empêcher disposeObject de tuer les textures partagées (gérées par le cache)
            if (this.mesh.material instanceof THREE.Material) {
                (this.mesh.material as any).map = null;
                const shader = (this.mesh.material as any).userData.shader;
                if (shader && shader.uniforms) {
                    if (shader.uniforms.uElevationMap) shader.uniforms.uElevationMap.value = null;
                    if (shader.uniforms.uNormalMap) shader.uniforms.uNormalMap.value = null;
                    if (shader.uniforms.uOverlayMap) shader.uniforms.uOverlayMap.value = null;
                }
            }
            disposeObject(this.mesh); this.mesh = null;
        }
        if (this.forestMesh) { if (state.scene) state.scene.remove(this.forestMesh); disposeObject(this.forestMesh); this.forestMesh = null; }
        if (this.poiGroup) { if (state.scene) state.scene.remove(this.poiGroup); disposeObject(this.poiGroup); this.poiGroup = null; }
        if (this.buildingMesh) { if (state.scene) state.scene.remove(this.buildingMesh); disposeObject(this.buildingMesh); this.buildingMesh = null; }
        if (this.hydroGroup) { if (state.scene) state.scene.remove(this.hydroGroup); disposeObject(this.hydroGroup); this.hydroGroup = null; }
        // Ne PAS disposer elevationTex, colorTex, overlayTex et normalTex ici car ils sont partagés via le cache.
        // Ils seront disposés par tileCache.ts lors de l'éviction.
        this.elevationTex = null; this.colorTex = null; this.overlayTex = null; this.normalTex = null;
    }
}

export function resetTerrain(): void {
    loadQueue.clear(); clearLabels();
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
}

export function repositionAllTiles(): void { 
    const originUnit = 1.0 / Math.pow(2, state.originTile.z);
    const oxNorm = (state.originTile.x + 0.5) * originUnit;
    const oyNorm = (state.originTile.y + 0.5) * originUnit;

    for (const tile of activeTiles.values()) {
        tile.updateWorldPosition();
    } 

    // Offset labels
    const lastOrigin = (repositionAllTiles as any).lastOrigin || { x: state.originTile.x, y: state.originTile.y, z: state.originTile.z };
    if (lastOrigin.x !== state.originTile.x || lastOrigin.y !== state.originTile.y || lastOrigin.z !== state.originTile.z) {
        const oldOriginUnit = 1.0 / Math.pow(2, lastOrigin.z);
        const ooxNorm = (lastOrigin.x + 0.5) * oldOriginUnit;
        const ooyNorm = (lastOrigin.y + 0.5) * oldOriginUnit;
        const offsetX = (ooxNorm - oxNorm) * EARTH_CIRCUMFERENCE;
        const offsetZ = (ooyNorm - oyNorm) * EARTH_CIRCUMFERENCE;

        for (const obj of activeLabels.values()) {
            if (obj.sprite) {
                obj.sprite.position.x += offsetX;
                obj.sprite.position.z += offsetZ;
            }
            if (obj.line) {
                obj.line.position.x += offsetX;
                obj.line.position.z += offsetZ;
            }
        }
    }
    (repositionAllTiles as any).lastOrigin = { ...state.originTile };
}
export function animateTiles(delta: number): boolean { 
    let stillFading = false;
    for (const tile of activeTiles.values()) { if (tile.isFadingIn) { tile.updateFade(delta); stillFading = true; } }
    return stillFading;
}

export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource || isNaN(lat) || lat === 0) return;
    // Unification : On n'utilise les sources locales (Swisstopo/IGN) qu'au dessus du LOD 10 (3D)
    let newSource = (state.ZOOM > 10 && (isPositionInSwitzerland(lat, lon) || isPositionInFrance(lat, lon))) ? 'swisstopo' : 'opentopomap';
    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        document.querySelectorAll('.layer-item').forEach(i => { i.classList.remove('active'); if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active'); });
        
        // Fix: Passer les coordonnées actuelles pour éviter le reset à l'origine
        if (state.camera && state.controls) {
            updateVisibleTiles(lat, lon, state.camera.position.y, state.controls.target.x, state.controls.target.z);
        } else {
            updateVisibleTiles();
        }
    }
}

export function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number | null = null, worldZ: number | null = null): Promise<void> {
    const is2DGlobal = state.PERFORMANCE_PRESET === 'eco' || state.ZOOM <= 10;
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    terrainUniforms.uShowSlopes.value = (state.SHOW_SLOPES && !is2DGlobal) ? 1.0 : 0.0;
    terrainUniforms.uShowHydrology.value = state.SHOW_HYDROLOGY ? 1.0 : 0.0;

    if (!state.camera || Math.abs(state.camera.position.y) < 1) return Promise.resolve();

    // Fix: Fallback sur la position caméra si worldX/Z non fournis (évite le saut à l'origine)
    const wx = (worldX !== null) ? worldX : state.camera.position.x;
    const wz = (worldZ !== null) ? worldZ : state.camera.position.z;

    const currentGPS = worldToLngLat(wx, wz, state.originTile);
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
                    if (!hasInCache(getTileCacheKey(pKey, nextZoom))) loadQueue.add(new Tile(tx, ty, nextZoom, pKey));
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
