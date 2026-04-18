import * as THREE from 'three';
import { disposeObject } from '../memory';
import { state } from '../state';
import { EARTH_CIRCUMFERENCE, getTileBounds } from '../geo';
import { createForestForTile } from '../vegetation';
import { loadPOIsForTile } from '../poi';
import { loadBuildingsForTile, removeBuildingsForTile } from '../buildings';
import { loadHydrologyForTile } from '../hydrology';
import { addToCache, getFromCache, getTileCacheKey, markCacheKeyActive, markCacheKeyInactive, hasInCache } from '../tileCache';
import { getPlaneGeometry } from '../geometryCache';
import { loadTileData, cancelTileLoad } from '../tileLoader';
import { materialPool } from '../materialPool';
import { activeTiles } from '../terrain';
import { removeFromLoadQueue, queueBuildMesh } from './tileQueue';

const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();

const GHOST_FADE_MS = (window.innerWidth <= 768) ? 400 : 800; 

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
    activeTaskId: number = -1;
    mesh: THREE.Mesh | null = null;
    elevationTex: THREE.Texture | null = null;
    pixelData: Uint8ClampedArray | null = null;
    colorTex: THREE.Texture | null = null;
    overlayTex: THREE.Texture | null = null;
    normalTex: THREE.Texture | null = null;
    forestMesh: THREE.Object3D | null = null;
    poiGroup: THREE.Group | null = null;
    buildingGroup: THREE.Group | null = null;
    buildingMesh: THREE.Mesh | null = null;
    hydroGroup: THREE.Group | null = null;
    currentResolution: number = -1;
    tileSizeMeters: number;
    opacity: number = 0;
    isFadingIn: boolean = false;
    isFadingOut: boolean = false;
    ghostFadeRemaining: number = 0;
    worldX: number = 0; worldZ: number = 0;
    bounds: THREE.Box3 = new THREE.Box3();
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
        const yOffset = this.isFadingOut ? -0.5 : 0;
        if (this.mesh) this.mesh.position.set(this.worldX, yOffset, this.worldZ);
        if (this.forestMesh) this.forestMesh.position.set(this.worldX, yOffset, this.worldZ);
        if (this.poiGroup) this.poiGroup.position.set(this.worldX, yOffset, this.worldZ);
        if (this.buildingGroup) this.buildingGroup.position.set(this.worldX, yOffset, this.worldZ);
        if (this.hydroGroup) this.hydroGroup.position.set(this.worldX, yOffset, this.worldZ);
        
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
        const nativeMax = 18;
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
            this.colorTex = cached.color; this.overlayTex = cached.overlay; this.normalTex = cached.normal;
            markCacheKeyActive(cacheKey);
            this.status = 'loaded'; 
            
            // v5.30.11 : Déclenchement des objets 3D (cache path)
            this.loadHighLODFeatures();
            
            this.buildMesh(state.RESOLUTION);
            return;
        }
        this.status = 'loading';
        const fetchAs2D = (this.zoom <= 10);
        try {
            const { promise, taskId } = await loadTileData(this.tx, this.ty, this.zoom, fetchAs2D);
            this.activeTaskId = taskId;
            const data = await promise;
            this.activeTaskId = -1;
            
            if (this.status as string === 'disposed' || !data) return;

            if (data.elevBitmap) {
                this.elevationTex = new THREE.Texture(data.elevBitmap);
                this.elevationTex.flipY = false;
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
                this.normalTex.generateMipmaps = false;
                this.normalTex.minFilter = THREE.LinearFilter;
                this.normalTex.wrapS = this.normalTex.wrapT = THREE.ClampToEdgeWrapping;
                this.normalTex.needsUpdate = true;
            }

            addToCache(cacheKey, this.elevationTex!, this.pixelData, this.colorTex!, this.overlayTex, this.normalTex);
            markCacheKeyActive(cacheKey);
            this.status = 'loaded'; 

            if (this.status as string !== 'disposed') queueBuildMesh(this);
        } catch (e) { this.status = 'failed'; }
    }

    /**
     * Gère le chargement asynchrone des objets 3D additionnels (v5.30.11).
     * Centralisé pour éviter la duplication et les oublis.
     */
    private loadHighLODFeatures(): void {
        const is2D = (this.zoom <= 10 || state.IS_2D_MODE);
        const delay = (ms: number) => ms * state.LOAD_DELAY_FACTOR;

        // Signalisations
        if (state.SHOW_SIGNPOSTS && this.zoom >= state.POI_ZOOM_THRESHOLD) {
            setTimeout(() => { if (this.status !== 'disposed') loadPOIsForTile(this); }, delay(600));
        }

        // Bâtiments, Hydrologie et Végétation (3D uniquement)
        if (!is2D) {
            if (state.SHOW_BUILDINGS && this.zoom >= state.BUILDING_ZOOM_THRESHOLD) {
                setTimeout(() => { if (this.status !== 'disposed') loadBuildingsForTile(this); }, delay(150));
            }
            if (state.SHOW_HYDROLOGY && this.zoom >= 13) {
                setTimeout(() => { if (this.status !== 'disposed') loadHydrologyForTile(this); }, delay(100));
            }
            if (state.SHOW_VEGETATION && this.zoom >= 14) {
                setTimeout(() => {
                    if (this.status as any === 'disposed') return;
                    const forest = createForestForTile(this);
                    if (forest && state.scene && (this.status as any !== 'disposed')) {
                        if (this.forestMesh) state.scene.remove(this.forestMesh);
                        this.forestMesh = forest; 
                        this.forestMesh.position.set(this.worldX, 0, this.worldZ);
                        state.scene.add(this.forestMesh);
                    }
                }, delay(300));
            }
        }
    }

    buildMesh(resolution: number): void {
        if (!this.elevationTex || !this.colorTex || this.status as string === 'disposed') return;
        if (!activeTiles.has(this.key) && !this.isFadingOut) return;

        const is2D = (this.zoom <= 10 || state.IS_2D_MODE);
        const isLight = (state.PERFORMANCE_PRESET === 'eco');
        
        // v5.28.43 : En 2D, un seul quad (résolution 1) suffit et économise énormément de CPU/GPU
        if (is2D) resolution = 1;
        else if (this.zoom >= 15) resolution = Math.min(resolution, 64);

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
                    #define IS_2D ${is2D ? '1' : '0'}
                    ${shader.vertexShader}
                `.replace('#include <common>', `#include <common>\nattribute float aSkirt;\nvarying vec3 vTrueNormal; varying vec2 vWorldXZ; uniform vec2 uColorOffset; uniform float uColorScale; uniform sampler2D uNormalMap; ${sharedShaderChunk}`)
                 .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = uColorOffset + (uv * uColorScale);`);

                if (is2D || isLight) {
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

                // v5.28.43 : Bypass du calcul de hauteur en 2D (économie de texture lookup au vertex shader)
                if (is2D) {
                    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = - aSkirt * uTileSize * 0.02; vWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
                } else {
                    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y = getTerrainHeight(uv) - aSkirt * uTileSize * 0.02; vWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
                }

                shader.fragmentShader = `
                    #define IS_2D ${is2D ? '1' : '0'}
                    uniform sampler2D uOverlayMap; uniform bool uHasOverlay; uniform float uShowSlopes; uniform float uShowHydrology; uniform float uTime; varying vec3 vTrueNormal; varying vec2 vWorldXZ;
                    ${shader.fragmentShader}
                `.replace('#include <map_fragment>', `
                    #include <map_fragment>
                    #if IS_2D == 0
                    if (uShowHydrology > 0.5) {
                        vec3 colorIn = diffuseColor.rgb;
                        float blueVsRed = colorIn.b - colorIn.r;
                        float maxColor = max(colorIn.r, max(colorIn.g, colorIn.b));
                        float minColor = min(colorIn.r, min(colorIn.g, colorIn.b));
                        float saturation = (maxColor > 0.0) ? (maxColor - minColor) / maxColor : 0.0;
                        if (blueVsRed > 0.02 && vTrueNormal.y > 0.998 && saturation > 0.05) {
                            float blueVsGreen = colorIn.b - colorIn.g;
                            float isWater = smoothstep(0.02, 0.10, blueVsRed) * smoothstep(0.0, 0.06, blueVsGreen) * smoothstep(0.998, 1.0, vTrueNormal.y);
                            float greenDominance = colorIn.g - max(colorIn.r, colorIn.b);
                            isWater *= (1.0 - smoothstep(0.0, 0.1, greenDominance));
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
                    #endif
                    if (uHasOverlay) { vec4 oCol = texture2D(uOverlayMap, vMapUv); diffuseColor.rgb = mix(diffuseColor.rgb, oCol.rgb, oCol.a); }
                    if (uShowSlopes > 0.5) {
                        float ny = clamp(normalize(vTrueNormal).y, 0.0, 1.0);
                        float yellowMix = smoothstep(0.8829, 0.8480, ny);
                        float orangeMix = smoothstep(0.8387, 0.7986, ny);
                        float redMix = smoothstep(0.7880, 0.7431, ny);
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

        // v5.29.17 : Rétablissement de l'injection forcée des textures pour les matériaux recyclés
        const shader = (material as any).userData.shader;
        if (shader) {
            shader.uniforms.uElevationMap.value = this.elevationTex;
            shader.uniforms.uNormalMap.value = this.normalTex;
            shader.uniforms.uOverlayMap.value = this.overlayTex;
            shader.uniforms.uTileSize.value = this.tileSizeMeters;
            shader.uniforms.uElevOffset.value.copy(this.elevOffset);
            shader.uniforms.uElevScale.value = this.elevScale;
            shader.uniforms.uColorOffset.value.copy(this.colorOffset);
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
                depthShader.uniforms.uElevOffset.value.copy(this.elevOffset);
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
        if (state.scene && (this.status as string !== 'disposed')) state.scene.add(this.mesh);
        this.currentResolution = resolution;
        
        if (is2D) {
            this.opacity = 1; this.isFadingIn = false;
            if (this.mesh.material instanceof THREE.Material) { this.mesh.material.opacity = 1; this.mesh.material.transparent = false; }
        } else { this.opacity = 0; this.isFadingIn = true; }

        // v5.30.12 : Retour au déclenchement différé (v5.29.40 style) pour garantir l'affichage
        const delay = (ms: number) => ms * state.LOAD_DELAY_FACTOR;
        setTimeout(() => {
            if (this.status !== 'disposed') this.loadHighLODFeatures();
        }, delay(150));

        if (oldMesh) {
            if (state.scene) state.scene.remove(oldMesh); 
            if (oldMesh.material instanceof THREE.Material) materialPool.release(oldMesh.material);
            if (oldMesh.customDepthMaterial instanceof THREE.Material) materialPool.release(oldMesh.customDepthMaterial);
        }
    }

    updateFade(delta: number): void {
        if (!this.isFadingIn || !this.mesh) return;
        this.opacity += delta * 2.0;
        if (this.opacity >= 1) { this.opacity = 1; this.isFadingIn = false; if (this.mesh.material instanceof THREE.Material) this.mesh.material.transparent = false; }
        if (this.mesh.material instanceof THREE.Material) {
            const t = this.opacity;
            this.mesh.material.opacity = t * t * (3.0 - 2.0 * t);
        }
    }

    startFadeOut(): void {
        if (this.isFadingOut || !this.mesh) return;
        this.isFadingOut = true; this.ghostFadeRemaining = GHOST_FADE_MS;
        this.mesh.position.y = -0.5;
        if (this.mesh.material instanceof THREE.Material) { this.mesh.material.transparent = true; this.mesh.material.opacity = 1.0; }
        markCacheKeyActive(getTileCacheKey(this.key, this.zoom));
    }

    updateFadeOut(deltaMs: number): void {
        if (!this.isFadingOut || !this.mesh) return;
        this.ghostFadeRemaining -= deltaMs;
        const t = Math.max(0, this.ghostFadeRemaining / GHOST_FADE_MS);
        if (this.mesh.material instanceof THREE.Material) { this.mesh.material.opacity = t; }
        if (this.ghostFadeRemaining <= 0) this.isFadingOut = false;
    }

    dispose(): void {
        this.status = 'disposed'; 
        removeFromLoadQueue(this);
        if (this.activeTaskId >= 0) { cancelTileLoad(this.activeTaskId); this.activeTaskId = -1; }
        markCacheKeyInactive(getTileCacheKey(this.key, this.zoom));
        if (this.mesh) {
            if (state.scene) state.scene.remove(this.mesh);
            if (this.mesh.material instanceof THREE.Material) materialPool.release(this.mesh.material);
            if (this.mesh.customDepthMaterial instanceof THREE.Material) materialPool.release(this.mesh.customDepthMaterial);
            this.mesh.geometry = null as any;
            this.mesh.material = null as any;
            this.mesh = null;
        }

        const cacheKey = getTileCacheKey(this.key, this.zoom);
        const inCache = hasInCache(cacheKey);

        if (!inCache) {
            if (this.elevationTex) { this.elevationTex.dispose(); }
            if (this.colorTex) { this.colorTex.dispose(); }
            if (this.overlayTex) { this.overlayTex.dispose(); }
            if (this.normalTex) { this.normalTex.dispose(); }
        }

        this.elevationTex = null; this.colorTex = null; this.overlayTex = null; this.normalTex = null;
        if (this.forestMesh) { if (state.scene) state.scene.remove(this.forestMesh); disposeObject(this.forestMesh); this.forestMesh = null; }
        if (this.poiGroup) { if (state.scene) state.scene.remove(this.poiGroup); disposeObject(this.poiGroup); this.poiGroup = null; }
        
        // v5.30.13 : Suppression via le registre global obligatoire
        removeBuildingsForTile(this.key);
        this.buildingGroup = null;
        
        if (this.hydroGroup) { if (state.scene) state.scene.remove(this.hydroGroup); disposeObject(this.hydroGroup); this.hydroGroup = null; }
        this.pixelData = null;
    }
}
