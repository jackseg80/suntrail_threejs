import * as THREE from 'three';
import { disposeObject } from './memory';
import { state, GPX_COLORS } from './state';
import type { GPXLayer } from './state';
import { isPositionInSwitzerland, isPositionInFrance, isMobileDevice } from './utils';
import { updateElevationProfile, haversineDistance } from './profile';
import { createForestForTile } from './vegetation';
import { loadPOIsForTile } from './poi';
import { loadBuildingsForTile } from './buildings';
import { loadHydrologyForTile } from './hydrology';
import { EARTH_CIRCUMFERENCE, lngLatToWorld, worldToLngLat, lngLatToTile, getTileBounds } from './geo';
import { eventBus } from './eventBus';
import { getAltitudeAt } from './analysis'; // used for terrain-clamping in gpxDrapePoints
import { addToCache, getFromCache, hasInCache, getTileCacheKey, markCacheKeyActive, markCacheKeyInactive } from './tileCache';
import { getPlaneGeometry } from './geometryCache';
import { insertTile, removeTile, clearIndex as clearSpatialIndex } from './tileSpatialIndex';
import { loadTileData, cancelTileLoad } from './tileLoader';
import { materialPool } from './materialPool';


export const activeTiles = new Map<string, Tile>(); 
export const activeLabels = new Map<string, any>(); 

let loadQueue: Set<Tile> = new Set<Tile>();
let isProcessingQueue = false;

/**
 * Tuiles en cours de fondu sortant lors d'une transition LOD.
 * Restent visibles dans la scène le temps que les nouvelles tuiles apparaissent.
 * Évite le flash blanc : l'ancien LOD s'efface progressivement plutôt que disparaître d'un coup.
 */
const fadingOutTiles = new Set<Tile>();

/** Dernier LOD rendu — détecte les changements de niveau pour activer les ghost tiles. */
let lastRenderedZoom: number = -1;

/** Durée du fondu sortant des ghost tiles en millisecondes (couvre le chargement réseau moyen). */
const GHOST_FADE_MS = 1200;

async function processLoadQueue() {
    if (isProcessingQueue || loadQueue.size === 0) {
        state.isProcessingTiles = false;
        return;
    }
    isProcessingQueue = true;
    state.isProcessingTiles = true;
    try {
        // Cache isVisible() une fois par tuile pour éviter les frustum checks dupliqués
        const visCache = new Map<Tile, boolean>();
        const isVis = (t: Tile) => { let v = visCache.get(t); if (v === undefined) { v = t.isVisible(); visCache.set(t, v); } return v; };

        const sorted = Array.from(loadQueue).sort((a, b) => {
            if (!state.camera) return 0;
            const camPos = state.camera.position;
            const aVis = isVis(a) ? 1 : 0;
            const bVis = isVis(b) ? 1 : 0;
            if (aVis !== bVis) return bVis - aVis;
            const da = (a.worldX - camPos.x) ** 2 + (a.worldZ - camPos.z) ** 2;
            const db = (b.worldX - camPos.x) ** 2 + (b.worldZ - camPos.z) ** 2;
            return da - db;
        });

        const visiblePending = sorted.filter(t => isVis(t)).length;
        const isTransitioning = visiblePending >= 4;
        const effectiveBatch = isTransitioning
            ? Math.max(1, state.MAX_BUILDS_PER_CYCLE + 2)
            : Math.max(1, state.MAX_BUILDS_PER_CYCLE);
        const batch = sorted.slice(0, effectiveBatch);
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
    /** ID de la task worker en cours. -1 = aucune. Utilisé pour annuler le fetch si dispose() est appelé. */
    activeTaskId: number = -1;
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
    isFadingOut: boolean = false;
    ghostFadeRemaining: number = 0; // ms restantes avant dispose complet
    worldX: number = 0; worldZ: number = 0;
    bounds: THREE.Box3 = new THREE.Box3();
    /** Bounds étendu de 20% — pré-calculé pour éviter clone() dans isVisible() (hot path). */
    private extendedBounds: THREE.Box3 = new THREE.Box3();
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
        // Ghost tiles gardent un offset Y négatif (anti-z-fighting avec les nouvelles tuiles)
        const yOffset = this.isFadingOut ? -0.5 : 0;
        if (this.mesh) this.mesh.position.set(this.worldX, yOffset, this.worldZ);
        if (this.forestMesh) this.forestMesh.position.set(this.worldX, yOffset, this.worldZ);
        if (this.poiGroup) this.poiGroup.position.set(this.worldX, yOffset, this.worldZ);
        
        this.bounds.set(
            new THREE.Vector3(this.worldX - this.tileSizeMeters/2, -1000, this.worldZ - this.tileSizeMeters/2),
            new THREE.Vector3(this.worldX + this.tileSizeMeters/2, 9000, this.worldZ + this.tileSizeMeters/2)
        );
        this.extendedBounds.copy(this.bounds).expandByScalar(this.tileSizeMeters * 0.2);
    }

    public isVisible(): boolean {
        if (!state.camera) return true;
        projScreenMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);
        return frustum.intersectsBox(this.extendedBounds);
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
            markCacheKeyActive(cacheKey);
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
            return;
        }
        this.status = 'loading';
        // Fix 2D/3D toggle : ne jamais skipper l'élévation pour LOD > 10.
        // Le mode IS_2D_MODE contrôle l'affichage (buildMesh), pas les données fetchées.
        // Raison : si on skippait l'élévation en 2D, les tuiles rechargées auraient un canvas vide,
        // et le switch 2D→3D produirait un terrain à moitié plat, à moitié à la bonne altitude.
        // LOD <= 10 : pas d'élévation nécessaire (vue globale, pas de terrain détaillé).
        const fetchAs2D = (this.zoom <= 10);
        try {
            // Stocker le taskId pour pouvoir annuler le fetch si dispose() est appelé
            // pendant que la tuile charge (LOD change, scroll rapide, etc.)
            const { promise, taskId } = await loadTileData(this.tx, this.ty, this.zoom, fetchAs2D);
            this.activeTaskId = taskId;
            const data = await promise;
            this.activeTaskId = -1;
            if ((this.status as string) === 'disposed' || !data) return;

            if (data.elevBitmap) {
                this.elevationTex = new THREE.Texture(data.elevBitmap);
                this.elevationTex.flipY = false;
                // Pas de mipmaps sur l'élévation : les niveaux mip générés indépendamment par tuile
                // créent des discontinuités aux bords (seams) en vue lointaine.
                this.elevationTex.generateMipmaps = false;
                this.elevationTex.minFilter = THREE.LinearFilter;
                this.elevationTex.wrapS = this.elevationTex.wrapT = THREE.ClampToEdgeWrapping;
                this.elevationTex.needsUpdate = true;
                if (data.pixelData) this.pixelData = new Uint8ClampedArray(data.pixelData);
            } else { this.elevationTex = new THREE.CanvasTexture(document.createElement('canvas')); }

            if (data.colorBitmap) {
                this.colorTex = new THREE.Texture(data.colorBitmap);
                this.colorTex.flipY = false; this.colorTex.needsUpdate = true; this.colorTex.colorSpace = THREE.SRGBColorSpace;
            } else {
                // colorBitmap null = la source de tuile a retourné une erreur (404, réseau...).
                // On utilise un canvas opaque avec une couleur topo neutre au lieu d'un canvas transparent —
                // évite le "trou" qui laisse voir le HTML en dessous.
                // La tuile sera marquée sans pixelData et pourra être rechargée via rebuildActiveTiles().
                const fb = document.createElement('canvas'); fb.width = 256; fb.height = 256;
                const fbCtx = fb.getContext('2d');
                if (fbCtx) { fbCtx.fillStyle = '#c8dde3'; fbCtx.fillRect(0, 0, 256, 256); }
                this.colorTex = new THREE.CanvasTexture(fb);
            }

            if (data.overlayBitmap) {
                this.overlayTex = new THREE.Texture(data.overlayBitmap);
                this.overlayTex.flipY = false; this.overlayTex.needsUpdate = true; this.overlayTex.colorSpace = THREE.SRGBColorSpace;
            }

            if (data.normalBitmap) {
                this.normalTex = new THREE.Texture(data.normalBitmap);
                this.normalTex.flipY = false;
                // Idem : pas de mipmaps sur les normales pour éviter les seams d'ombrage à distance.
                this.normalTex.generateMipmaps = false;
                this.normalTex.minFilter = THREE.LinearFilter;
                this.normalTex.wrapS = this.normalTex.wrapT = THREE.ClampToEdgeWrapping;
                this.normalTex.needsUpdate = true;
            }

            addToCache(cacheKey, this.elevationTex!, this.pixelData, this.colorTex!, this.overlayTex, this.normalTex);
            markCacheKeyActive(cacheKey);
            this.status = 'loaded'; this.buildMesh(state.RESOLUTION);
        } catch (e) { this.status = 'failed'; }
    }

    buildMesh(resolution: number): void {
        if (!this.elevationTex || !this.colorTex || this.status as any === 'disposed') return;
        if (activeTiles.get(this.key) !== this) return;

        // LOD ≥ 15 : l'élévation est plafonnée à LOD 14 (sourceZoom = min(zoom,14)).
        // La géométrie au-delà de 64 segments subdivise plus finement que la source → vertices gaspillés.
        // 64 segments sur 128 pixels source = 2 pixels/segment — qualité terrain identique, ~6× moins de vertices.
        if (this.zoom >= 15) resolution = Math.min(resolution, 64);

        const is2D = (this.zoom <= 10 || state.IS_2D_MODE);
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
                        // Half-texel inset : évite que LinearFilter interpole au-delà du bord
                        // de la texture (seams entre tuiles adjacentes au LOD proche).
                        const float HT = 0.5 / 256.0;
                        vec2 elevUv = clamp(uElevOffset + (uv * uElevScale), vec2(HT), vec2(1.0 - HT));
                        vec4 col = texture2D(uElevationMap, elevUv);
                        float h = decodeHeight(col);
                        if (h < -1000.0 || h > 9000.0) return 0.0;
                        return h * uExaggeration;
                    }
                `;

                shader.vertexShader = `
                    #define IS_LIGHT ${isLight ? '1' : '0'}
                    ${shader.vertexShader}
                `.replace('#include <common>', `#include <common>\nattribute float aSkirt;\nvarying vec3 vTrueNormal; varying vec2 vWorldXZ; uniform vec2 uColorOffset; uniform float uColorScale; uniform sampler2D uNormalMap; ${sharedShaderChunk}`)
                 .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = uColorOffset + (uv * uColorScale);`);

                if (isLight) {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nobjectNormal = vec3(0.0,1.0,0.0); vTrueNormal = vec3(0.0,1.0,0.0);`);
                } else {
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n
                        const float HT_N = 0.5 / 256.0;
                        vec2 elevUv = clamp(uElevOffset + (uv * uElevScale), vec2(HT_N), vec2(1.0 - HT_N));
                        vec3 normalSample = texture2D(uNormalMap, elevUv).rgb * 2.0 - 1.0;
                        vTrueNormal = normalize(normalSample);
                        objectNormal = normalize(vec3(normalSample.x * uExaggeration, normalSample.y, normalSample.z * uExaggeration));
                    `);
                }
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv) - aSkirt * uTileSize * 0.02; vWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
                shader.fragmentShader = `
                    uniform sampler2D uOverlayMap; uniform bool uHasOverlay; uniform float uShowSlopes; uniform float uShowHydrology; uniform float uTime; varying vec3 vTrueNormal; varying vec2 vWorldXZ;
                    ${shader.fragmentShader}
                `.replace('#include <map_fragment>', `
                    #include <map_fragment>
                    if (uShowHydrology > 0.5) {
                        vec3 colorIn = diffuseColor.rgb;
                        float blueVsRed = colorIn.b - colorIn.r;

                        // Early exit : 2 tests bon marché éliminent 99%+ des fragments non-eau
                        if (blueVsRed > 0.02 && vTrueNormal.y > 0.998) {
                            float blueVsGreen = colorIn.b - colorIn.g;

                            // isWater inclut le smoothstep sur la normale pour un dégradé doux aux bords
                            float isWater = smoothstep(0.02, 0.10, blueVsRed) * smoothstep(0.0, 0.06, blueVsGreen) * smoothstep(0.998, 1.0, vTrueNormal.y);

                            // Protection prairie (vert dominant)
                            float greenDominance = colorIn.g - max(colorIn.r, colorIn.b);
                            isWater *= (1.0 - smoothstep(0.0, 0.1, greenDominance));

                            // Protection Neige/Glacier
                            float brightness = (colorIn.r + colorIn.g + colorIn.b) / 3.0;
                            isWater *= (1.0 - smoothstep(0.8, 0.98, brightness) * (1.0 - smoothstep(0.1, 0.3, blueVsRed)));

                            if (isWater > 0.05) {
                                vec3 waterBlue = vec3(0.02, 0.18, 0.52);
                                float t = uTime * 0.5;
                                float w1 = sin(vWorldXZ.x * 0.002 + vWorldXZ.y * 0.0015 + t) * 0.5 + 0.5;
                                float w2 = sin(vWorldXZ.x * 0.001 - vWorldXZ.y * 0.0025 + t * 0.6) * 0.5 + 0.5;
                                float wave = mix(w1, w2, 0.4);
                                diffuseColor.rgb = mix(colorIn, waterBlue, 0.65 * isWater);
                                diffuseColor.rgb += vec3(0.2, 0.4, 0.7) * (wave - 0.5) * isWater * 0.4;
                            }
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
                shader.uniforms.uTileSize = { value: this.tileSizeMeters };

                if (!shader.vertexShader.includes('decodeHeight')) {
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n
                        attribute float aSkirt; uniform sampler2D uElevationMap; uniform float uExaggeration; uniform float uTileSize; uniform vec2 uElevOffset; uniform float uElevScale;
                        float decodeHeight(vec4 rgba) { return -10000.0 + ((rgba.r * 255.0 * 65536.0 + rgba.g * 255.0 * 256.0 + rgba.b * 255.0) * 0.1); }
                        float getTerrainHeight(vec2 uv) {
                            vec2 elevUv = uElevOffset + (uv * uElevScale);
                            vec4 col = texture2D(uElevationMap, elevUv);
                            return decodeHeight(col) * uExaggeration;
                        }
                    `).replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv) - aSkirt * uTileSize * 0.02;`);
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

    /**
     * Démarre le fondu sortant de cette tuile (ghost tile lors d'une transition LOD).
     * La tuile reste dans la scène Three.js mais son opacité décroît vers 0.
     * Gardé dans fadingOutTiles — jamais dans activeTiles pendant ce fondu.
     */
    startFadeOut(): void {
        if (this.isFadingOut || !this.mesh) return;
        this.isFadingOut = true;
        this.ghostFadeRemaining = GHOST_FADE_MS;
        // Déplacer légèrement sous les nouvelles tuiles pour éviter le z-fighting
        this.mesh.position.y = -0.5;
        if (this.mesh.material instanceof THREE.Material) {
            this.mesh.material.transparent = true;
            this.mesh.material.opacity = 1.0;
        }
        // Maintenir la clé de cache active : la texture GPU ne doit pas être évincée
        // pendant que le mesh est encore visible dans la scène.
        markCacheKeyActive(getTileCacheKey(this.key, this.zoom));
    }

    /**
     * Mise à jour du fondu sortant. Appelé depuis animateTiles().
     * @param deltaMs delta en millisecondes
     */
    updateFadeOut(deltaMs: number): void {
        if (!this.isFadingOut || !this.mesh) return;
        this.ghostFadeRemaining -= deltaMs;
        const t = Math.max(0, this.ghostFadeRemaining / GHOST_FADE_MS);
        if (this.mesh.material instanceof THREE.Material) {
            this.mesh.material.opacity = t;
        }
        if (this.ghostFadeRemaining <= 0) {
            this.isFadingOut = false; // signal pour animateTiles() → dispose
        }
    }

    dispose(): void {
        this.status = 'disposed'; loadQueue.delete(this);
        // Annuler le fetch HTTP en cours si la tuile charge encore (économise la bande passante)
        if (this.activeTaskId >= 0) {
            cancelTileLoad(this.activeTaskId);
            this.activeTaskId = -1;
        }
        markCacheKeyInactive(getTileCacheKey(this.key, this.zoom));
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
    // Nettoyer les ghost tiles en fondu avant de tout réinitialiser
    for (const tile of fadingOutTiles) {
        markCacheKeyInactive(getTileCacheKey(tile.key, tile.zoom));
        tile.dispose();
    }
    fadingOutTiles.clear();
    lastRenderedZoom = -1;
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
    clearSpatialIndex();
}

/**
 * Reconstruit les meshes des tuiles actives en place (sans vider la scène).
 * Utilisé par le toggle 2D/3D pour éviter l'écran blanc et la corruption du materialPool.
 *
 * Pourquoi ne pas appeler resetTerrain() ?
 * - dispose() passe par disposeObject(mesh) qui DÉTRUIT les matériaux GPU au lieu de les
 *   rendre au materialPool → pool vide → nouvelles tuiles recompilent depuis zéro → damier sombre.
 * - La scène est vide pendant la recharge (écran blanc).
 *
 * Ici : les textures restent en mémoire, buildMesh() remplace le mesh via le pattern oldMesh
 * (fondu 500ms) → scène jamais vide, matériaux rendus correctement au pool.
 */
export function rebuildActiveTiles(): void {
    const toReload: string[] = [];

    for (const tile of activeTiles.values()) {
        if (!tile.elevationTex || !tile.colorTex) continue;

        // Switch 2D→3D : détecter les tuiles chargées SANS élévation (pendant le mode 2D).
        // Symptôme : pixelData null + zoom > 10 → canvas d'élévation vide → terrain plat/volant.
        // Fix : invalider leur entrée cache (pour forcer un re-fetch réseau avec élévation)
        // et les disposer. updateVisibleTiles() les recréera avec les vraies données.
        if (!state.IS_2D_MODE && !tile.pixelData && tile.zoom > 10) {
            toReload.push(tile.key);
        } else {
            tile.buildMesh(state.RESOLUTION);
        }
    }

    // Invalider et recharger les tuiles sans élévation valide
    for (const key of toReload) {
        const tile = activeTiles.get(key);
        if (!tile) continue;
        // Consommer l'entrée cache vide pour forcer un re-fetch réseau avec élévation réelle
        const cacheKey = getTileCacheKey(key, tile.zoom);
        getFromCache(cacheKey);
        removeTile(tile);
        tile.dispose();
        activeTiles.delete(key);
    }
    // updateVisibleTiles() recréera les tuiles invalidées et fetcha leur élévation
}

export function repositionAllTiles(): void { 
    const originUnit = 1.0 / Math.pow(2, state.originTile.z);
    const oxNorm = (state.originTile.x + 0.5) * originUnit;
    const oyNorm = (state.originTile.y + 0.5) * originUnit;

    for (const tile of activeTiles.values()) {
        tile.updateWorldPosition();
    }
    // Repositionner aussi les ghost tiles (origin shift peut survenir pendant un fondu)
    for (const tile of fadingOutTiles) {
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
    // Ghost tiles : fondu sortant lors des transitions LOD
    if (fadingOutTiles.size > 0) {
        const deltaMs = delta * 1000;
        for (const tile of fadingOutTiles) {
            tile.updateFadeOut(deltaMs);
            if (!tile.isFadingOut) {
                // Fondu terminé — libérer la clé de cache puis disposer le mesh
                markCacheKeyInactive(getTileCacheKey(tile.key, tile.zoom));
                fadingOutTiles.delete(tile);
                tile.dispose();
            } else {
                stillFading = true;
            }
        }
    }
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
    const is2DGlobal = state.IS_2D_MODE || state.PERFORMANCE_PRESET === 'eco' || state.ZOOM <= 10;
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    const MIN_SLOPE_LOD = 11;
    terrainUniforms.uShowSlopes.value = (state.SHOW_SLOPES && !is2DGlobal && state.ZOOM >= MIN_SLOPE_LOD) ? 1.0 : 0.0;
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
        if (!activeTiles.has(camKey)) { const t = new Tile(camTile.x, camTile.y, zoom, camKey); activeTiles.set(camKey, t); insertTile(t); loadQueue.add(t); }
    }

    // LOD ≤ 10 : vue globale, on garantit au moins RANGE=3 tiles de contexte.
    // LOD ≥ 17 (PC + mobile) : diviseur 1.2 — tuiles petites (76m), le frustum est large.
    //   performance (RANGE=6) : floor(6/1.2)=5 → 121 tuiles
    //   ultra      (RANGE=12) : floor(12/1.2)=10 → 441 tuiles (PC uniquement)
    // LOD 15-16 mobile uniquement : même diviseur 1.2 — tuile ~1.2km, 5 tiles = 6km rayon suffisant.
    //   Le bonus tilt existant (+1 si polar>0.4) remonte à 6 en vue inclinée (= RANGE complet).
    //   performance mobile (RANGE=6) : floor(6/1.2)=5 → 121 tuiles (vs 169)
    //   ultra mobile       (RANGE=8) : floor(8/1.2)=6 → 169 tuiles (vs 289)
    //   Sur PC LOD 15-16, pas de réduction — GPU et réseau le permettent.
    const mobile = isMobileDevice();
    let range = (zoom <= 10) ? Math.max(state.RANGE, 3)
        : (zoom >= 17 || (zoom >= 15 && mobile)) ? Math.max(4, Math.floor(state.RANGE/1.2))
        : state.RANGE;

    // +1 tuile de rayon quand camera inclinee a LOD 14+ (couvre le frustum etendu)
    if (!state.IS_2D_MODE && state.ZOOM >= 14 && state.controls) {
        const polar = state.controls.getPolarAngle();
        if (polar > 0.4) {
            range = Math.min(range + 1, state.RANGE + 2);
        }
    }


    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx; const ty = centerTile.y + dy;
            if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) continue;
            const key = `${tx}_${ty}_${zoom}`; currentActiveKeys.add(key);
            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, zoom, key);
                if (tile.isVisible() || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)) { activeTiles.set(key, tile); insertTile(tile); loadQueue.add(tile); }
            }
        }
    }
    // Changement de LOD détecté → ghost tiles au lieu de dispose immédiat.
    // Les anciennes tuiles restent visibles (fondu sortant 1.2s) pendant que les nouvelles chargent.
    // Même LOD mais hors-champ → dispose immédiat classique (scroll normal, pas de flash).
    const lodChanging = lastRenderedZoom !== -1 && zoom !== lastRenderedZoom;
    for (const [key, tile] of activeTiles.entries()) {
        if (!currentActiveKeys.has(key)) {
            if (lodChanging && tile.mesh && tile.status !== 'disposed') {
                removeTile(tile);
                activeTiles.delete(key);
                fadingOutTiles.add(tile);
                tile.startFadeOut();
            } else {
                removeTile(tile);
                tile.dispose();
                activeTiles.delete(key);
            }
        }
    }
    lastRenderedZoom = zoom;
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

/**
 * Précharge les tuiles des LODs adjacents (zoom±1) en arrière-plan lors des périodes d'inactivité.
 * Appelé depuis scene.ts quand isIdleMode && !isProcessingTiles (toutes les ~5s).
 *
 * Principe : les tuiles non présentes en cache sont ajoutées au loadQueue avec priorité basse
 * (isVisible()=false → traitées en dernier). La prochaine transition LOD trouvera les textures
 * déjà en VRAM → affichage quasi-instantané, plus de chargement depuis le réseau.
 *
 * Limites : MAX_PREFETCH entrées max pour ne pas saturer la queue.
 */
export function prefetchAdjacentLODs(): void {
    if (!state.camera || !state.controls) return;
    const wx = state.controls.target.x;
    const wz = state.controls.target.z;
    const center = worldToLngLat(wx, wz, state.originTile);
    const zoom = state.ZOOM;
    const MAX_PREFETCH = 20;
    let added = 0;

    // LOD+1 — tuiles que l'utilisateur verra en zoomant (même gate Pro que scene.ts)
    const _prefetchMaxZoom = state.isPro ? (state.MAX_ALLOWED_ZOOM || 18) : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);
    const nextZoom = Math.min(zoom + 1, _prefetchMaxZoom);
    if (nextZoom !== zoom) {
        const ct = lngLatToTile(center.lon, center.lat, nextZoom);
        const r = Math.max(1, Math.ceil(state.RANGE / 2));
        const maxT = Math.pow(2, nextZoom);
        for (let dy = -r; dy <= r && added < MAX_PREFETCH; dy++) {
            for (let dx = -r; dx <= r && added < MAX_PREFETCH; dx++) {
                const tx = ct.x + dx; const ty = ct.y + dy;
                if (tx < 0 || tx >= maxT || ty < 0 || ty >= maxT) continue;
                const pKey = `${tx}_${ty}_${nextZoom}`;
                if (!hasInCache(getTileCacheKey(pKey, nextZoom))) {
                    loadQueue.add(new Tile(tx, ty, nextZoom, pKey));
                    added++;
                }
            }
        }
    }

    // LOD-1 — tuiles que l'utilisateur verra en dézoomant (zone plus large, moins de tuiles)
    const prevZoom = Math.max(zoom - 1, 6);
    if (prevZoom !== zoom) {
        const ct = lngLatToTile(center.lon, center.lat, prevZoom);
        const maxT = Math.pow(2, prevZoom);
        for (let dy = -2; dy <= 2 && added < MAX_PREFETCH; dy++) {
            for (let dx = -2; dx <= 2 && added < MAX_PREFETCH; dx++) {
                const tx = ct.x + dx; const ty = ct.y + dy;
                if (tx < 0 || tx >= maxT || ty < 0 || ty >= maxT) continue;
                const pKey = `${tx}_${ty}_${prevZoom}`;
                if (!hasInCache(getTileCacheKey(pKey, prevZoom))) {
                    loadQueue.add(new Tile(tx, ty, prevZoom, pKey));
                    added++;
                }
            }
        }
    }

    if (added > 0) processLoadQueue();
}

/** Safety margin above terrain surface, in world units (≈ meters). */
const GPX_SURFACE_OFFSET = 30;

/**
 * Densify and drape GPX waypoints onto the terrain.
 *
 * Two-step process:
 * 1. Densify: add intermediate points between each pair of GPS waypoints so the
 *    curve follows local terrain variations between sparse GPS samples.
 * 2. Drape: for each point, use the HIGHER of (terrain sample, GPS altitude) + offset.
 *    Falls back gracefully to GPS altitude if terrain tiles aren't loaded yet.
 *
 * @param rawPts  Array of {lon, lat, ele} from the GPX parser
 * @param originTile  Current world-space origin tile
 * @param densifySteps  Intermediate points inserted between each pair of waypoints
 */
function gpxDrapePoints(
    rawPts: Array<{lon: number; lat: number; ele: number}>,
    originTile: {x: number; y: number; z: number},
    densifySteps = 4
): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];

    for (let i = 0; i < rawPts.length; i++) {
        const p = rawPts[i];
        const pos = lngLatToWorld(p.lon, p.lat, originTile);
        const elevGPX = (p.ele || 0) * state.RELIEF_EXAGGERATION;
        const terrainY = getAltitudeAt(pos.x, pos.z);
        const y = Math.max(terrainY, elevGPX) + GPX_SURFACE_OFFSET;
        result.push(new THREE.Vector3(pos.x, y, pos.z));

        // Insert intermediate points between this waypoint and the next
        if (i < rawPts.length - 1 && densifySteps > 0) {
            const pNext = rawPts[i + 1];
            for (let s = 1; s < densifySteps; s++) {
                const t = s / densifySteps;
                const iLon = p.lon + (pNext.lon - p.lon) * t;
                const iLat = p.lat + (pNext.lat - p.lat) * t;
                const iEle = (p.ele || 0) + ((pNext.ele || 0) - (p.ele || 0)) * t;
                const iPos = lngLatToWorld(iLon, iLat, originTile);
                const iElevGPX = iEle * state.RELIEF_EXAGGERATION;
                const iTerrainY = getAltitudeAt(iPos.x, iPos.z);
                const iY = Math.max(iTerrainY, iElevGPX) + GPX_SURFACE_OFFSET;
                result.push(new THREE.Vector3(iPos.x, iY, iPos.z));
            }
        }
    }

    return result;
}

export function addGPXLayer(rawData: Record<string, any>, name: string): GPXLayer {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const colorIndex = state.gpxLayers.length % GPX_COLORS.length;
    const color = GPX_COLORS[colorIndex];

    const track = rawData.tracks[0];
    const points = track.points;

    // Calculate stats
    let distance = 0;
    let dPlus = 0;
    let dMinus = 0;
    for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        distance += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
        const diff = (p2.ele || 0) - (p1.ele || 0);
        if (diff > 0) dPlus += diff;
        else dMinus += Math.abs(diff);
    }

    // Build 3D points: densify + drape onto terrain
    const box = new THREE.Box3();
    const camAlt = state.camera ? state.camera.position.y : 10000;
    const thickness = Math.max(1.5, camAlt / 1200);
    const threePoints = gpxDrapePoints(points, state.originTile);
    threePoints.forEach(v => box.expandByPoint(v));

    const curve = new THREE.CatmullRomCurve3(threePoints);
    const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 1500), thickness, 4, false);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,        // don't occlude other objects
        polygonOffset: true,
        polygonOffsetFactor: -4,  // pull the tube visually in front of terrain
        polygonOffsetUnits: -4
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;        // render after terrain tiles (renderOrder 0)
    if (state.scene) state.scene.add(mesh);

    const layer: GPXLayer = {
        id,
        name,
        color,
        visible: true,
        rawData,
        points: threePoints,
        mesh,
        stats: {
            distance,
            dPlus,
            dMinus,
            pointCount: points.length
        }
    };

    state.gpxLayers = [...state.gpxLayers, layer];
    if (!state.activeGPXLayerId) {
        state.activeGPXLayerId = id;
    }

    // FlyTo: compute center from raw lat/lon to stay authoritative regardless of originTile.
    // This is important: world coords depend on state.originTile at call time, but originTile
    // might have changed between import calls. Always re-derive from geographic source.
    const lats = points.map((p: any) => p.lat as number);
    const lons = points.map((p: any) => p.lon as number);
    const eles = points.map((p: any) => (p.ele as number) || 0);
    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;
    const avgEle = eles.reduce((s: number, v: number) => s + v, 0) / eles.length;

    // Compute spread in world units for camera distance
    const size = new THREE.Vector3();
    box.getSize(size);
    const trackSpread = Math.max(size.x, size.z);
    const viewDistance = Math.max(trackSpread * 1.5, 3000); // min 3km

    const flyCenter = lngLatToWorld(centerLon, centerLat, state.originTile);
    const targetElevation = avgEle * state.RELIEF_EXAGGERATION;
    eventBus.emit('flyTo', { worldX: flyCenter.x, worldZ: flyCenter.z, targetElevation, targetDistance: viewDistance });

    // Schedule two mesh rebuilds:
    // 1. Immediately (next tick) — picks up any origin shift that happened before import
    // 2. After ~3s — by then the terrain tiles for the GPX area should be loaded,
    //    so gpxDrapePoints can sample real terrain heights and drape accurately.
    //    A second rebuild at ~6s handles slow connections.
    setTimeout(() => updateAllGPXMeshes(), 0);
    setTimeout(() => { if (state.gpxLayers.length > 0) updateAllGPXMeshes(); }, 3000);
    setTimeout(() => { if (state.gpxLayers.length > 0) updateAllGPXMeshes(); }, 6000);

    updateElevationProfile();
    return layer;
}

export function removeGPXLayer(id: string): void {
    const layer = state.gpxLayers.find(l => l.id === id);
    if (!layer) return;
    if (layer.mesh) {
        if (state.scene) state.scene.remove(layer.mesh);
        disposeObject(layer.mesh);
    }
    state.gpxLayers = state.gpxLayers.filter(l => l.id !== id);
    if (state.activeGPXLayerId === id) {
        state.activeGPXLayerId = state.gpxLayers.length > 0 ? state.gpxLayers[0].id : null;
    }
    if (state.gpxLayers.length === 0) {
        const prof = document.getElementById('elevation-profile');
        if (prof) prof.style.display = 'none';
    } else {
        updateElevationProfile();
    }
}

export function toggleGPXLayer(id: string): void {
    const layers = state.gpxLayers;
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    const layer = layers[idx];
    const newVisible = !layer.visible;
    if (layer.mesh) layer.mesh.visible = newVisible;
    // Trigger reactive update by reassigning
    const updated = [...layers];
    updated[idx] = { ...layer, visible: newVisible };
    state.gpxLayers = updated;
}

export function updateAllGPXMeshes(): void {
    if (!state.camera) return;
    const camAlt = state.camera.position.y;
    const thickness = Math.max(1.5, camAlt / 1200);

    const updatedLayers: GPXLayer[] = state.gpxLayers.map(layer => {
        // Dispose old mesh
        if (layer.mesh) {
            if (state.scene) state.scene.remove(layer.mesh);
            disposeObject(layer.mesh);
        }

        const track = layer.rawData.tracks[0];
        const points = track.points;
        const threePoints = gpxDrapePoints(points, state.originTile);

        const curve = new THREE.CatmullRomCurve3(threePoints);
        const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 1500), thickness, 4, false);
        const material = new THREE.MeshStandardMaterial({
            color: layer.color,
            emissive: layer.color,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 10;
        mesh.visible = layer.visible;
        if (state.scene) state.scene.add(mesh);

        return { ...layer, points: threePoints, mesh };
    });

    state.gpxLayers = updatedLayers;
}

/**
 * Met à jour le maillage du tracé en cours d'enregistrement (v5.8.16)
 */
export function updateRecordedTrackMesh(): void {
    if (state.recordedPoints.length < 2 || !state.camera || !state.scene || !state.originTile) return;
    
    const camAlt = state.camera.position.y;
    const thickness = Math.max(2.0, camAlt / 800); 
    
    if (state.recordedMesh) {
        state.scene.remove(state.recordedMesh);
        disposeObject(state.recordedMesh);
    }

    const threePoints = state.recordedPoints.map(p => {
        const pos = lngLatToWorld(p.lon, p.lat, state.originTile);
        return new THREE.Vector3(pos.x, p.alt * state.RELIEF_EXAGGERATION + 8, pos.z);
    });

    const curve = new THREE.CatmullRomCurve3(threePoints);
    const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length * 2, 800), thickness, 4, false);
    
    // Couleur rouge pulsante pour l'enregistrement
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xef4444, 
        emissive: 0xef4444, 
        emissiveIntensity: 0.5, 
        transparent: true, 
        opacity: 0.8 
    });

    state.recordedMesh = new THREE.Mesh(geometry, material);
    state.scene.add(state.recordedMesh);
}

export function clearAllGPXLayers(): void {
    for (const layer of state.gpxLayers) {
        if (layer.mesh) {
            if (state.scene) state.scene.remove(layer.mesh);
            disposeObject(layer.mesh);
        }
    }
    state.gpxLayers = [];
    state.activeGPXLayerId = null;
    if (state.recordedMesh) { if (state.scene) state.scene.remove(state.recordedMesh); disposeObject(state.recordedMesh); state.recordedMesh = null; }
    const prof = document.getElementById('elevation-profile'); if (prof) prof.style.display = 'none';
    const tc = document.getElementById('trail-controls'); if (tc) tc.style.display = 'none';
}

export function clearLabels(): void {
    for (const obj of activeLabels.values()) { if (state.scene) { state.scene.remove(obj.sprite); state.scene.remove(obj.line); } disposeObject(obj.sprite); disposeObject(obj.line); }
    activeLabels.clear();
}
