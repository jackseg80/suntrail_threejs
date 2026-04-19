import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { state, saveLastView } from './state';
import { eventBus } from './eventBus';
import { updateSunPosition } from './sun';
import { getAltitudeAt, resetAnalysisCache } from './analysis';
import { loadTerrain, updateVisibleTiles, repositionAllTiles, animateTiles, resetTerrain, autoSelectMapSource, terrainUniforms, prefetchAdjacentLODs } from './terrain';
import { sharedFrustum } from './terrain';
import { disposeAllCachedTiles } from './tileCache';
import { disposeAllGeometries } from './geometryCache';
import { EARTH_CIRCUMFERENCE, lngLatToTile, worldToLngLat, clampTargetToBounds } from './geo';
import { throttle, debounce } from './utils';
import { showToast } from './toast';
import { i18n } from '../i18n/I18nService';
import { initVegetationResources } from './vegetation';
import { initWeatherSystem, updateWeatherSystem, fetchWeather, disposeWeatherSystem } from './weather';
import { initCompass, disposeCompass, renderCompass, updateCompassAnimation, isCompassAnimating } from './compass';
import { centerOnUser } from './location';
import { initTouchControls } from './touchControls';
import { initCamera, initControls, flyTo, onWindowResize } from './cameraManager';
import { isFeatureEnabled } from './featureFlags';
import { checkPerformanceThrottle } from './performance';

export { flyTo };

// Handler de visibilité : suspend le GPU quand l'app passe en arrière-plan (v5.11)
let visibilityChangeHandler: (() => void) | null = null;

// Upsell LOD — debounce pour ne pas spammer le toast (1 fois par 30s max)
let _lastLodUpsellTime = 0;

// Ground plane — empêche le vide blanc quand la caméra voit sous le terrain au tilt max
let groundPlane: THREE.Mesh | null = null;

let lastLodChangeTime = 0;

/**
 * Force une mise à jour immédiate du LOD (v5.28.25).
 * Ignore le throttle de 800ms pour éviter la "bouillie de pixels" après un flyTo.
 */
export function forceImmediateLODUpdate(): void {
    if (!state.camera || !state.controls) return;

    const dx = state.controls.target.x;
    const dz = state.controls.target.z;
    const rawDist = state.camera.position.distanceTo(state.controls.target);
    const cameraGroundH = getAltitudeAt(state.camera.position.x, state.camera.position.z);
    const heightAboveGround = Math.max(45, state.camera.position.y - cameraGroundH);
    
    let dist: number;
    if (state.IS_2D_MODE) {
        dist = heightAboveGround;
    } else {
        const polar = state.controls.getPolarAngle();
        const tiltBlend = THREE.MathUtils.clamp(polar / 1.2, 0, 1);
        dist = THREE.MathUtils.lerp(heightAboveGround, rawDist, tiltBlend * 0.5);
    }
    
    const idealZoom = getIdealZoom(dist, state.ZOOM);
    const effectiveMaxZoom = isFeatureEnabled('lod_high')
        ? (state.MAX_ALLOWED_ZOOM || 18)
        : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);

    const targetZoom = Math.min(idealZoom, effectiveMaxZoom);
    if (targetZoom !== state.ZOOM) {
        state.ZOOM = targetZoom;
        lastLodChangeTime = performance.now();
    }
    
    const gpsCenter = worldToLngLat(dx, dz, state.originTile);
    autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);
    
    void updateVisibleTiles(gpsCenter.lat, gpsCenter.lon, dist, dx, dz, true);
}

// Références pour le nettoyage des listeners (v5.28.25)
let currentThrottledUpdate: (() => void) | null = null;
let currentThrottledSunUpdate: (() => void) | null = null;

export async function disposeScene(): Promise<void> {
    // Nettoyage des listeners sur les contrôles avant de les détruire
    if (state.controls) {
        if (currentThrottledUpdate) state.controls.removeEventListener('change', currentThrottledUpdate);
        if (currentThrottledSunUpdate) state.controls.removeEventListener('change', currentThrottledSunUpdate);
    }
    
    resetTerrain();
    disposeAllCachedTiles();
    disposeAllGeometries();
    resetAnalysisCache();
    if (state.renderer) {
        state.renderer.setAnimationLoop(null);
        state.renderer.dispose();
    }
    disposeCompass();
    disposeWeatherSystem();
    if (groundPlane) {
        groundPlane.geometry.dispose();
        (groundPlane.material as THREE.MeshBasicMaterial).dispose();
        groundPlane = null;
    }
    if (state.scene) state.scene.clear();
    if (visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', visibilityChangeHandler);
        visibilityChangeHandler = null;
    }
    window.removeEventListener('resize', onWindowResize);
    
    currentThrottledUpdate = null;
    currentThrottledSunUpdate = null;
}

/**
 * Détermine le niveau de zoom idéal en fonction de la distance caméra-sol.
 * v5.32.13 : Compromis stabilité/performance. 
 * Hystérésis réduite à 10% (plus réactif au dézoom) + prise en compte du tilt.
 */
function getIdealZoom(dist: number, currentZoom: number): number {
    const boost = state.MAP_SOURCE === 'satellite' ? 2.0
                : state.MAP_SOURCE === 'swisstopo' ? 1.0
                : 1.2;

    // v5.32.13 : Si on est très incliné (3D), on augmente artificiellement la distance 
    // pour basculer plus tôt sur un LOD inférieur (gain perf massif à l'horizon).
    let effectiveDist = dist;
    if (state.controls && !state.IS_2D_MODE) {
        const polar = state.controls.getPolarAngle(); // 0 (zénith) à ~1.5 (horizon)
        const tiltFactor = Math.max(0, (polar - 0.6) * 0.5); // Pénalité si tilt > 35°
        effectiveDist *= (1.0 + tiltFactor);
    }
                
    const getThresh = (base: number, z: number) => {
        if (currentZoom === z) {
            // Hystérésis à 10% (suffisant pour éviter le rebond sans surcharger le GPU)
            return base * 1.10;
        }
        return base;
    };

    if (effectiveDist < getThresh(800 * boost, 18)) return 18;
    if (effectiveDist < getThresh(1800 * boost, 17)) return 17;
    if (effectiveDist < getThresh(4000 * boost, 16)) return 16;
    if (effectiveDist < getThresh(9000 * boost, 15)) return 15;
    if (effectiveDist < getThresh(22000, 14)) return 14;
    if (effectiveDist < getThresh(45000, 13)) return 13;
    if (effectiveDist < getThresh(90000, 12)) return 12;
    if (effectiveDist < getThresh(180000, 11)) return 11;
    if (effectiveDist < getThresh(350000, 10)) return 10;
    if (effectiveDist < getThresh(700000, 9)) return 9;
    if (effectiveDist < getThresh(1200000, 8)) return 8;
    if (effectiveDist < getThresh(2000000, 7)) return 7;
    return 6;
}

export async function initScene(): Promise<void> {
    await disposeScene();
    const container = document.getElementById('canvas-container');
    if (!container) return;

    state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, state.ZOOM);
    state.scene = new THREE.Scene();
    state.scene.fog = new THREE.Fog(0x87CEEB, state.FOG_NEAR, state.FOG_FAR);

    const isMobile = window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
    const useAntialias = !isMobile && state.PERFORMANCE_PRESET !== 'eco';

    state.renderer = new THREE.WebGLRenderer({ antialias: useAntialias, logarithmicDepthBuffer: true, alpha: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight, false);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.AgXToneMapping;
    container.appendChild(state.renderer.domElement);

    // v5.32.11 : Gestion de la perte de contexte WebGL (Fréquent sur Android WebView en cas de pression mémoire)
    state.renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.error('[WebGL] Contexte perdu !');
        showToast(i18n.t('common.errorWebglLost'), 0); // Toast persistant
    }, false);
    
    state.renderer.domElement.setAttribute('role', 'img');
    state.renderer.domElement.setAttribute('aria-label', i18n.t('a11y.canvas3d'));
    
    state.stats = new Stats();
    container.appendChild(state.stats.dom);
    state.stats.dom.style.top = '80px';
    state.stats.dom.style.display = 'none';
    state.vramPanel?.setVisible(state.SHOW_STATS);

    initCompass();

    const sky = new Sky();
    sky.scale.setScalar(10000000); 
    state.scene.add(sky);
    state.sky = sky;

    const groundGeo = new THREE.PlaneGeometry(100_000, 100_000);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e, fog: true, depthWrite: false });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.position.y = -200;
    groundPlane.renderOrder = -1;
    groundPlane.castShadow = false;
    groundPlane.receiveShadow = false;
    groundPlane.frustumCulled = true;
    state.scene.add(groundPlane);

    initCamera();
    initControls(state.camera!, state.renderer.domElement);

    state.controls!.addEventListener('start', () => {
        state.isUserInteracting = true;
        if (isMobile && state.renderer) {
            if (dprRestoreTimer) { clearTimeout(dprRestoreTimer); dprRestoreTimer = null; }
            state.renderer.setPixelRatio(1.0);
        }
    });
    state.controls!.addEventListener('end', () => {
        state.isUserInteracting = false;
        lastInteractionTime = performance.now();

        // v5.28.47 : Rafraîchissement forcé à la fin de l'interaction (zoom fini) pour garantir le bon LOD
        if (state.camera && state.controls) {
            const dx = state.controls.target.x, dz = state.controls.target.z;
            const groundH = state.IS_2D_MODE ? 0 : getAltitudeAt(state.camera.position.x, state.camera.position.z);
            const dist = state.IS_2D_MODE ? Math.max(45, state.camera.position.y - groundH) : state.camera.position.distanceTo(state.controls.target);
            void updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, dx, dz, true);
        }

        if (isMobile && state.renderer) {
            dprRestoreTimer = setTimeout(() => {
                if (state.renderer) state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
                dprRestoreTimer = null;
            }, 200);
        }
    });

    initTouchControls(
        state.camera!,
        state.controls!,
        state.renderer.domElement,
        () => { state.isUserInteracting = true; },
        () => { state.isUserInteracting = false; lastInteractionTime = performance.now(); }
    );

    let lastRecenterTime = 0;

    // Version debouncée pour éviter de spammer l'API météo lors des mouvements rapides
const debouncedFetchWeather = debounce((lat: number, lon: number) => {
    state.lastWeatherLat = lat;
    state.lastWeatherLon = lon;
    fetchWeather(lat, lon);
}, 1000);

// v5.28.25 : Throttle réduit à 100ms pour éviter les chevauchements LOD
    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;

        const clamped = clampTargetToBounds(
            state.controls.target.x, state.controls.target.z, state.originTile
        );
        if (clamped.x !== state.controls.target.x || clamped.z !== state.controls.target.z) {
            const cdx = clamped.x - state.controls.target.x;
            const cdz = clamped.z - state.controls.target.z;
            state.controls.target.x = clamped.x;
            state.controls.target.z = clamped.z;
            state.camera.position.x += cdx;
            state.camera.position.z += cdz;
        }

        const dx = state.controls.target.x, dz = state.controls.target.z;
        const rawDist = state.camera.position.distanceTo(state.controls.target);

        // v5.28.45 : En mode 2D, le sol visuel est à 0. On ne doit pas soustraire l'altitude réelle du terrain.
        const cameraGroundH = state.IS_2D_MODE ? 0 : getAltitudeAt(state.camera.position.x, state.camera.position.z);
        const heightAboveGround = Math.max(45, state.camera.position.y - cameraGroundH);
        let dist: number;
        if (state.IS_2D_MODE) {
            dist = heightAboveGround;
        } else {
            const polar = state.controls.getPolarAngle();
            const tiltBlend = THREE.MathUtils.clamp(polar / 1.2, 0, 1);
            dist = THREE.MathUtils.lerp(heightAboveGround, rawDist, tiltBlend * 0.5);
        }

        let newZoom = state.ZOOM;
        const idealZoom = getIdealZoom(dist, state.ZOOM);
        const effectiveMaxZoom = isFeatureEnabled('lod_high')
            ? (state.MAX_ALLOWED_ZOOM || 18)
            : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);

        const targetZoom = Math.min(idealZoom, effectiveMaxZoom);

        if (!isFeatureEnabled('lod_high') && idealZoom > effectiveMaxZoom && state.ZOOM >= effectiveMaxZoom) {
            const now = Date.now();
            if (now - _lastLodUpsellTime > 30_000) {
                _lastLodUpsellTime = now;
                showToast(i18n.t('upsell.lod'), 10000);
            }
        }

        newZoom = targetZoom;

        const currentZoom = state.ZOOM;
        const now = performance.now();
        if (newZoom !== state.ZOOM) {
            // v5.32.9 : Verrou temporel augmenté à 500ms pour stabiliser le terrain après saut de LOD
            if (now - lastLodChangeTime > 500) {
                state.ZOOM = newZoom;
                lastLodChangeTime = now;
                // v5.32.0 : Prefetch adjacent LODs immediately after zoom change
                lastPrefetchTime = 0;
            } else {
                newZoom = state.ZOOM;
            }
        }

        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        const distToLastWeather = Math.sqrt(Math.pow(gpsCenter.lat - state.lastWeatherLat, 2) + Math.pow(gpsCenter.lon - state.lastWeatherLon, 2));
        if (distToLastWeather > 0.05) debouncedFetchWeather(gpsCenter.lat, gpsCenter.lon);

        const distFromOrigin = Math.sqrt(dx*dx + dz*dz);

        if (distFromOrigin > 35000) {
            const timeSinceLast = Date.now() - lastRecenterTime;
            if (state.ZOOM >= 12 && !state.isUserInteracting && !state.isFlyingTo && (newZoom === currentZoom) && (timeSinceLast > 5000)) {
                const newTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, state.originTile.z);
                if (!isNaN(newTile.x) && !isNaN(newTile.y)) {
                    const oldXN = (state.originTile.x + 0.5) / Math.pow(2, state.originTile.z);
                    const oldYN = (state.originTile.y + 0.5) / Math.pow(2, state.originTile.z);
                    const newXN = (newTile.x + 0.5) / Math.pow(2, state.originTile.z);
                    const newYN = (newTile.y + 0.5) / Math.pow(2, state.originTile.z);
                    const offsetX = (oldXN - newXN) * EARTH_CIRCUMFERENCE;
                    const offsetZ = (oldYN - newYN) * EARTH_CIRCUMFERENCE;
                    
                    if (Math.abs(offsetX) < 250000 && Math.abs(offsetZ) < 250000) {
                        state.originTile = newTile; lastRecenterTime = Date.now();
                        state.camera!.position.x += offsetX; state.camera!.position.z += offsetZ;
                        state.controls!.target.x += offsetX; state.controls!.target.z += offsetZ;
                        
                        if (state.sunLight) {
                            state.sunLight.position.x += offsetX;
                            state.sunLight.position.z += offsetZ;
                            state.sunLight.target.position.x += offsetX;
                            state.sunLight.target.position.z += offsetZ;
                            state.sunLight.target.updateMatrixWorld();
                        }
                        
                        if (groundPlane) {
                            groundPlane.position.x += offsetX;
                            groundPlane.position.z += offsetZ;
                        }

                        if (state.userMarker) {
                            state.userMarker.position.x += offsetX;
                            state.userMarker.position.z += offsetZ;
                        }
                        
                        state.gpxLayers.forEach(layer => {
                            if (layer.mesh) layer.mesh.geometry.translate(offsetX, 0, offsetZ);
                            layer.points.forEach(p => { p.x += offsetX; p.z += offsetZ; });
                        });
                        
                        if (state.recordedMesh) {
                            state.recordedMesh.geometry.translate(offsetX, 0, offsetZ);
                        }
                        
                        if (state.hasLastClicked) {
                            state.lastClickedCoords.x += offsetX;
                            state.lastClickedCoords.z += offsetZ;
                        }
                        
                        state.controls!.update(); repositionAllTiles(); 
                        state.lastWeatherLat = gpsCenter.lat; state.lastWeatherLon = gpsCenter.lon;
                        fetchWeather(gpsCenter.lat, gpsCenter.lon);
                    }
                }
            }
        }
        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, state.controls!.target.x, state.controls!.target.z);
    }, 100);
    
    currentThrottledUpdate = throttledUpdate;
    state.controls!.addEventListener('change', currentThrottledUpdate);

    const throttledSunUpdate = throttle(() => {
        const mins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
        updateSunPosition(mins);
    }, 1000);
    currentThrottledSunUpdate = throttledSunUpdate;
    state.controls!.addEventListener('change', currentThrottledSunUpdate);

    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); state.scene.add(state.ambientLight);
    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    state.sunLight.shadow.mapSize.set(state.SHADOW_RES, state.SHADOW_RES);
    // v5.31.1 : Tighter shadow frustum — dynamically adjusted in updateSunPosition()
    state.sunLight.shadow.camera.left = -2500; state.sunLight.shadow.camera.right = 2500;
    state.sunLight.shadow.camera.top = 2500; state.sunLight.shadow.camera.bottom = -2500;
    state.sunLight.shadow.camera.near = 100; state.sunLight.shadow.camera.far = 200000;
    
    // v5.28.38 : Biais ajusté pour mobile (précision Z-buffer moindre)
    if (isMobile) {
        state.sunLight.shadow.bias = -0.0002; 
        state.sunLight.shadow.normalBias = 0.15; // Augmenté de 0.05 à 0.15 pour mobile
    } else {
        state.sunLight.shadow.bias = -0.0005; 
        state.sunLight.shadow.normalBias = 0.05;
    }
    state.scene.add(state.sunLight); state.scene.add(state.sunLight.target);

    initVegetationResources();
    initWeatherSystem(state.scene);
    
    eventBus.on('flyTo', ({ worldX, worldZ, targetElevation, targetDistance }) => {
        flyTo(worldX, worldZ, targetElevation, targetDistance);
    });
    
    state.lastWeatherLat = state.TARGET_LAT;
    state.lastWeatherLon = state.TARGET_LON;
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    
    const initialMins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
    updateSunPosition(initialMins);

    const clock = new THREE.Clock();
    let lastRenderTime = 0;
    window.addEventListener('resize', onWindowResize);

    let needsInitialRender = 60; 
    let tilesFading = true;
    let lastInteractionTime = 0;

    let fpsFrameCount = 0;
    let fpsLastTime = performance.now();

    const WATER_THROTTLE_MS = 50;
    let waterTimeAccum = 0;

    const WEATHER_THROTTLE_MS = 50;
    let weatherTimeAccum = 0;
    let weatherAccumDelta = 0;

    let dprRestoreTimer: ReturnType<typeof setTimeout> | null = null;

    let lastPrefetchTime = 0;
    let lastCompassTime = 0;
    let lastInteracting = false;

/**
 * Calcule et applique l'inclinaison (tilt) automatique de la caméra.
 * v5.29.31 : Refactorisation pour alléger la boucle de rendu.
 */
function updateAutoTilt(distToTarget: number): boolean {
    if (!state.controls) return false;

    let tiltCap = 1.10;
    if (state.ZOOM <= 10) tiltCap = 0;
    else if (state.ZOOM === 11) tiltCap = 0.45;
    else if (state.ZOOM === 12) tiltCap = 0.70;
    else if (state.ZOOM === 13) tiltCap = 0.90;
    else if (state.ZOOM === 14) tiltCap = 0.95; 
    else if (state.ZOOM === 15) tiltCap = 0.85;
    else if (state.ZOOM === 16) tiltCap = 0.65;
    else if (state.ZOOM === 17) tiltCap = 0.50;
    else if (state.ZOOM >= 18)  tiltCap = 0.40;

    if (state.ZOOM >= 14 && !state.IS_2D_MODE) {
        const targetH = getAltitudeAt(state.controls.target.x, state.controls.target.z);
        const elevFactor = THREE.MathUtils.clamp(targetH / 8000, 0, 0.50);
        tiltCap *= (1.0 - elevFactor);
    }

    const interacting = state.isUserInteracting;
    const currentTilt = state.controls.getPolarAngle();
    
    if (state.IS_2D_MODE || state.ZOOM <= 10) {
        if (state.isTiltTransitioning && currentTilt > 0.005) {
            const newTilt = THREE.MathUtils.lerp(currentTilt, 0, 0.06);
            state.controls.minPolarAngle = 0;
            state.controls.maxPolarAngle = Math.max(0, newTilt);
            return true;
        } else {
            state.controls.minPolarAngle = 0; state.controls.maxPolarAngle = 0;
            if (state.isTiltTransitioning) state.isTiltTransitioning = false;
            return false;
        }
    } else if (state.isTiltTransitioning) {
        const desiredTilt = Math.max(tiltCap * 0.85, 0.5);
        if (Math.abs(currentTilt - desiredTilt) > 0.01) {
            const newTilt = THREE.MathUtils.lerp(currentTilt, desiredTilt, 0.07);
            state.controls.minPolarAngle = Math.max(0.05, newTilt - 0.01);
            state.controls.maxPolarAngle = Math.min(tiltCap, newTilt + 0.01);
            return true;
        } else {
            state.isTiltTransitioning = false;
            state.controls.minPolarAngle = 0.05; state.controls.maxPolarAngle = tiltCap;
            return false;
        }
    } else if (interacting) {
        state.controls.minPolarAngle = 0.05; state.controls.maxPolarAngle = tiltCap;
        return false;
    } else {
        const hFactor = THREE.MathUtils.clamp((distToTarget - 2000) / 100000, 0, 1);
        let desiredTilt = THREE.MathUtils.lerp(tiltCap * 0.95, 0.05, Math.pow(hFactor, 0.4));
        if (state.ZOOM <= 11) desiredTilt = Math.min(desiredTilt, tiltCap * 0.9);
        if (Math.abs(currentTilt - desiredTilt) > 0.005) {
            const newTilt = THREE.MathUtils.lerp(currentTilt, desiredTilt, 0.02);
            state.controls.minPolarAngle = Math.max(0.05, newTilt - 0.2);
            state.controls.maxPolarAngle = Math.min(tiltCap, newTilt + 0.2);
            return true;
        }
    }
    return false;
}

/**
 * Gère la physique de la caméra par rapport au terrain (suivi d'altitude et collision).
 * v5.29.31 : Isolation de la logique physique.
 */
function updateTerrainPhysics(interacting: boolean): void {
    if (!state.camera || !state.controls) return;

    // v5.28.46 : Altitude du sol sous la caméra (0 en 2D)
    const groundH = state.IS_2D_MODE ? 0 : getAltitudeAt(state.camera.position.x, state.camera.position.z);

    if (!state.isFlyingTo && !state.isFollowingUser) {
        // v5.28.46 : En mode 2D, le sol est à 0. On ne doit pas suivre l'altitude réelle.
        const targetGroundH = state.IS_2D_MODE ? 0 : getAltitudeAt(state.controls.target.x, state.controls.target.z);
        
        const diff = targetGroundH - state.controls.target.y;
        if (Math.abs(diff) > 0.1) {
            const trackLerp = interacting ? 0.08 : 0.03;
            const yDelta = diff * trackLerp;
            state.controls.target.y += yDelta;
            state.camera.position.y += yDelta;
        }
    }
    
    // v5.28.46 : Sécurité collision sol adaptée au mode 2D
    if (state.camera.position.y < groundH + 45) {
        state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, groundH + 45, 0.2);
        state.controls.update();
    }
    state.controls.minDistance = Math.max(100, groundH * 0.1);
}

    const renderLoopFn = () => {
        if (!state.renderer || !state.camera || !state.scene || !state.controls) return;

        const now = performance.now();
        const delta = clock.getDelta();

        waterTimeAccum += delta * 1000;
        const waterFrameDue = waterTimeAccum >= WATER_THROTTLE_MS;
        if (waterFrameDue) waterTimeAccum = Math.max(0, waterTimeAccum - WATER_THROTTLE_MS);

        weatherTimeAccum += delta * 1000;
        weatherAccumDelta += delta;
        const weatherFrameDue = weatherTimeAccum >= WEATHER_THROTTLE_MS;
        if (weatherFrameDue) weatherTimeAccum = Math.max(0, weatherTimeAccum - WEATHER_THROTTLE_MS);

        if (now - lastCompassTime >= 33) {
            lastCompassTime = now;
            renderCompass();
        }

        if (state.ENERGY_SAVER && (now - lastRenderTime < 33)) return;
        if (isMobile && state.PERFORMANCE_PRESET !== 'ultra' && (now - lastRenderTime < 16.0)) return;
        if (state.isFollowingUser && !state.ENERGY_SAVER && (now - lastRenderTime < 33)) return;

        const isWeatherActive = state.SHOW_WEATHER && state.currentWeather !== 'clear' && state.WEATHER_DENSITY > 0;
        const idleTime = now - lastInteractionTime;
        const isIdleMode = !state.isUserInteracting && !state.isFlyingTo && !state.isFollowingUser
            && !state.isTiltTransitioning
            && !(isWeatherActive && weatherFrameDue)
            && (idleTime >= 800);

        // v5.29.3 : Deep Sleep (1.5 FPS) si inactif depuis > 30s — idéal pour économiser la batterie en rando
        if (isIdleMode && idleTime > 30000) {
            if (now - lastRenderTime < 650) return; // ~1.5 FPS
        } else if (isIdleMode && (now - lastRenderTime < 50)) {
            return; // 20 FPS standard idle
        }
        
        lastRenderTime = now;

        updateCompassAnimation();

        if (state.sunLight) {
            state.sunLight.castShadow = state.SHADOWS;
            if (state.renderer) {
                state.renderer.shadowMap.autoUpdate = !state.isUserInteracting;
            }
        }

        const interacting = state.isUserInteracting;
        const distToTarget = state.camera.position.distanceTo(state.controls.target);
        
        // v5.29.6 : Persister la vue si on vient d'arrêter d'interagir
        if (!interacting && lastInteracting) {
            saveLastView();
            if (state.renderer && state.SHADOWS) {
                state.renderer.shadowMap.needsUpdate = true;
            }
        }
        lastInteracting = interacting;

        const tiltAnimating = updateAutoTilt(distToTarget);

        const controlsDirty = state.controls.update();
        const needsUpdate =
            (controlsDirty && (state.isUserInteracting || (now - lastInteractionTime < 800)))
            || state.isFlyingTo
            || state.isTiltTransitioning
            || tiltAnimating
            || (state.SHOW_HYDROLOGY && waterFrameDue)
            || state.isSunAnimating
            || state.isInteractingWithUI
            || state.isProcessingTiles
            || (isWeatherActive && weatherFrameDue)
            || isCompassAnimating()
            || tilesFading
            || needsInitialRender > 0
            || state.isFollowingUser;

        // v5.31 : Pre-compute frustum once per frame for tile visibility
        if (state.camera) {
            state.camera.updateMatrixWorld();
            const proj = new THREE.Matrix4().multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
            sharedFrustum.setFromProjectionMatrix(proj);
        }

        if (needsUpdate) {
            state.stats?.begin();
            if (waterFrameDue) terrainUniforms.uTime.value += WATER_THROTTLE_MS / 1000;
            tilesFading = animateTiles(delta);
            if (needsInitialRender > 0) needsInitialRender--;
            if (weatherFrameDue && isWeatherActive) {
                updateWeatherSystem(weatherAccumDelta, state.camera.position);
                weatherAccumDelta = 0;
            }
            if (state.isFollowingUser && !interacting) centerOnUser(delta);

            if (state.isSunAnimating) {
                const mins = (state.simDate.getHours() * 60 + state.simDate.getMinutes() + state.animationSpeed) % 1440;
                const newDate = new Date(state.simDate);
                newDate.setHours(Math.floor(mins / 60), Math.floor(mins % 60), 0, 0);
                state.simDate = newDate;
            }

            updateTerrainPhysics(interacting);

            // v5.31.1 : Dynamic fog — shrinks near altitude for natural fade
            if (state.scene.fog instanceof THREE.Fog) {
                const alt = state.camera.position.y;
                const fogNear = Math.max(state.FOG_NEAR * 0.3, state.FOG_NEAR - alt * 0.3);
                const fogFar = state.FOG_FAR + alt * 4.0;
                state.scene.fog.near = fogNear;
                state.scene.fog.far = fogFar;
            }

            state.renderer.render(state.scene, state.camera);
            state.stats?.end();

            if (!state.isProcessingTiles && (now - lastPrefetchTime > 2000)) {
                lastPrefetchTime = now;
                prefetchAdjacentLODs();
            }

            fpsFrameCount++;
            const fpsTick = performance.now();
            if (fpsTick - fpsLastTime >= 1000) {
                state.currentFPS = Math.round(fpsFrameCount * 1000 / (fpsTick - fpsLastTime));
                fpsFrameCount = 0;
                fpsLastTime = fpsTick;
                
                // v5.29.6 : Audit performance
                checkPerformanceThrottle(state.currentFPS);
            }
        }

    };
    state.renderer.setAnimationLoop(renderLoopFn);

    window.dispatchEvent(new Event('suntrail:sceneReady'));

    visibilityChangeHandler = () => {
        if (!state.renderer) return;
        if (document.hidden) {
            state.renderer.setAnimationLoop(null);
        } else {
            state.renderer.setAnimationLoop(renderLoopFn);
        }
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    state.controls?.update();
    state.camera?.updateMatrixWorld(true);

    // v5.28.40 : Premier chargement asynchrone pour ne pas bloquer l'affichage de l'UI
    setTimeout(() => {
        void loadTerrain();
    }, 0);

    // v5.31 : Pre-compile shaders to avoid first-frame stutter
    setTimeout(() => {
        if (state.renderer && state.scene && state.camera) {
            try { state.renderer.compile(state.scene, state.camera); } catch (_) { /* silently ignore */ }
        }
    }, 200);
}
