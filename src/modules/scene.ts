import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { state, saveLastView } from './state';
import { eventBus } from './eventBus';
import { updateSunPosition } from './sun';
import { getAltitudeAt, resetAnalysisCache } from './analysis';
import { loadTerrain, updateVisibleTiles, repositionAllTiles, animateTiles, resetTerrain, autoSelectMapSource, terrainUniforms, prefetchAdjacentLODs } from './terrain';
import { sharedFrustum } from './terrain';
import { disposeAllCachedTiles } from './tileCache';
import { disposeAllGeometries } from './geometryCache';
import { EARTH_CIRCUMFERENCE, lngLatToTile, worldToLngLat, clampTargetToBounds, haversineDistance, getPow2 } from './geo';
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
import { initEnvironment, updateEnvironment, createGroundPlane } from './environment';

export { flyTo };

// Handler de visibilité : suspend le GPU quand l'app passe en arrière-plan (v5.11)
let visibilityChangeHandler: (() => void) | null = null;

// v5.40.18 : Objets statiques partagés pour éviter le Garbage Collection (Zero-Allocation Pattern)
const _sharedMatrix = new THREE.Matrix4();
const _sharedDate = new Date();

// Upsell LOD — debounce pour ne pas spammer le toast (1 fois par 30s max)
let _lastLodUpsellTime = 0;

// Ground plane — empêche le vide blanc quand la caméra voit sous le terrain au tilt max
let groundPlane: THREE.Mesh | null = null;

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
    }
    
    const gpsCenter = worldToLngLat(dx, dz, state.originTile);
    autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);
    
    void updateVisibleTiles(gpsCenter.lat, gpsCenter.lon, dist, dx, dz, true);
}

// Références pour le nettoyage des listeners (v5.28.25)
let currentThrottledUpdate: (() => void) | null = null;
let currentThrottledSunUpdate: (() => void) | null = null;

export async function disposeScene(): Promise<void> {
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

function getIdealZoom(dist: number, currentZoom: number): number {
    const boost = state.MAP_SOURCE === 'satellite' ? 2.0
                : state.MAP_SOURCE === 'swisstopo' ? 1.0
                : 0.5;

    let effectiveDist = dist;
    if (state.controls && !state.IS_2D_MODE) {
        const polar = state.controls.getPolarAngle();
        const tiltFactor = Math.max(0, (polar - 0.6) * 0.5);
        effectiveDist *= (1.0 + tiltFactor);
    }
                
    const getThresh = (base: number, z: number) => {
        if (currentZoom === z) return base * 1.10;
        return base;
    };

    if (effectiveDist < getThresh(800 * boost, 18)) return 18;
    if (effectiveDist < getThresh(1800 * boost, 17)) return 17;
    if (effectiveDist < getThresh(4000 * boost, 16)) return 16;
    if (effectiveDist < getThresh(9000 * boost, 15)) return 15;
    if (effectiveDist < getThresh(22000 * boost, 14)) return 14;
    if (effectiveDist < getThresh(45000 * boost, 13)) return 13;
    if (effectiveDist < getThresh(90000 * boost, 12)) return 12;
    if (effectiveDist < getThresh(180000 * boost, 11)) return 11;
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
    
    // v5.40.19 : Isolation de l'environnement (Sky, Fog, Lights)
    initEnvironment(state.scene);

    const isMobile = window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
    const useAntialias = !isMobile && state.PERFORMANCE_PRESET !== 'eco';

    state.renderer = new THREE.WebGLRenderer({ antialias: useAntialias, logarithmicDepthBuffer: true, alpha: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight, false);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = state.SHADOWS;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.AgXToneMapping;
    container.appendChild(state.renderer.domElement);

    state.renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.error('[WebGL] Contexte perdu !');
        showToast(i18n.t('common.errorWebglLost'), 0);
    }, false);
    
    state.renderer.domElement.setAttribute('role', 'img');
    state.renderer.domElement.setAttribute('aria-label', i18n.t('a11y.canvas3d'));
    
    state.stats = new Stats();
    container.appendChild(state.stats.dom);
    state.stats.dom.style.top = '80px';
    state.stats.dom.style.display = 'none';
    state.vramPanel?.setVisible(state.SHOW_STATS);

    initCompass();

    groundPlane = createGroundPlane();
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

        if (state.camera && state.controls) {
            const dx = state.controls.target.x, dz = state.controls.target.z;
            const rawDist = state.camera.position.distanceTo(state.controls.target);
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
            
            const idealZoom = getIdealZoom(dist, state.ZOOM);
            const effectiveMaxZoom = isFeatureEnabled('lod_high') ? (state.MAX_ALLOWED_ZOOM || 18) : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);
            const targetZoom = Math.min(idealZoom, effectiveMaxZoom);
            
            if (targetZoom !== state.ZOOM) {
                state.ZOOM = targetZoom;
            }
            
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

    const debouncedFetchWeather = debounce((lat: number, lon: number) => {
        state.lastWeatherLat = lat;
        state.lastWeatherLon = lon;
        fetchWeather(lat, lon);
    }, 1000);

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
        const effectiveMaxZoom = isFeatureEnabled('lod_high') ? (state.MAX_ALLOWED_ZOOM || 18) : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);
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
        if (newZoom !== state.ZOOM) {
            state.ZOOM = newZoom;
            lastPrefetchTime = 0;
        }

        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        const distToLastWeather = haversineDistance(gpsCenter.lat, gpsCenter.lon, state.lastWeatherLat, state.lastWeatherLon);
        if (distToLastWeather > 5) debouncedFetchWeather(gpsCenter.lat, gpsCenter.lon);

        const distFromOrigin = Math.sqrt(dx*dx + dz*dz);

        if (distFromOrigin > 35000) {
            const timeSinceLast = Date.now() - lastRecenterTime;
            if (state.ZOOM >= 12 && !state.isUserInteracting && !state.isFlyingTo && (newZoom === currentZoom) && (timeSinceLast > 5000)) {
                const newTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, state.originTile.z);
                if (!isNaN(newTile.x) && !isNaN(newTile.y)) {
                    const unit = 1.0 / getPow2(state.originTile.z);
                    const oldXN = (state.originTile.x + 0.5) * unit;
                    const oldYN = (state.originTile.y + 0.5) * unit;
                    const newXN = (newTile.x + 0.5) * unit;
                    const newYN = (newTile.y + 0.5) * unit;
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
    }, 50);
    
    currentThrottledUpdate = throttledUpdate;
    state.controls!.addEventListener('change', currentThrottledUpdate);

    const throttledSunUpdate = throttle(() => {
        const mins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
        updateSunPosition(mins);
    }, 1000);
    currentThrottledSunUpdate = throttledSunUpdate;
    state.controls!.addEventListener('change', currentThrottledSunUpdate);

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

    function updateTerrainPhysics(interacting: boolean): void {
        if (!state.camera || !state.controls) return;
        const groundH = state.IS_2D_MODE ? 0 : getAltitudeAt(state.camera.position.x, state.camera.position.z);
        if (!state.isFlyingTo && !state.isFollowingUser) {
            const targetGroundH = state.IS_2D_MODE ? 0 : getAltitudeAt(state.controls.target.x, state.controls.target.z);
            const diff = targetGroundH - state.controls.target.y;
            if (Math.abs(diff) > 0.1) {
                const trackLerp = interacting ? 0.08 : 0.03;
                const yDelta = diff * trackLerp;
                state.controls.target.y += yDelta;
                state.camera.position.y += yDelta;
            }
        }
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

        if (isIdleMode && idleTime > 30000) {
            if (now - lastRenderTime < 650) return;
        } else if (isIdleMode && (now - lastRenderTime < 50)) {
            return;
        }
        
        lastRenderTime = now;

        updateCompassAnimation();

        if (state.sunLight) {
            state.sunLight.castShadow = state.SHADOWS;
            if (state.renderer) {
                if (state.renderer.shadowMap.enabled !== state.SHADOWS) {
                    state.renderer.shadowMap.enabled = state.SHADOWS;
                }
                state.renderer.shadowMap.autoUpdate = true;
            }
        }

        const interacting = state.isUserInteracting;
        const distToTarget = state.camera.position.distanceTo(state.controls.target);
        
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

        if (state.camera) {
            state.camera.updateMatrixWorld();
            _sharedMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
            sharedFrustum.setFromProjectionMatrix(_sharedMatrix);
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
                _sharedDate.setTime(state.simDate.getTime());
                _sharedDate.setHours(Math.floor(mins / 60), Math.floor(mins % 60), 0, 0);
                state.simDate = _sharedDate;
            }

            updateTerrainPhysics(interacting);
            updateEnvironment(state.camera.position.y);

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
                checkPerformanceThrottle(state.currentFPS);
            }
        }

    };
    state.renderer.setAnimationLoop(renderLoopFn);

    window.dispatchEvent(new Event('suntrail:sceneReady'));

    visibilityChangeHandler = () => {
        if (!state.renderer) return;
        if (document.hidden) state.renderer.setAnimationLoop(null);
        else state.renderer.setAnimationLoop(renderLoopFn);
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    state.controls?.update();
    state.camera?.updateMatrixWorld(true);

    setTimeout(() => { void loadTerrain(); }, 0);
    setTimeout(() => {
        if (state.renderer && state.scene && state.camera) {
            try { state.renderer.compile(state.scene, state.camera); } catch (_) {}
        }
    }, 200);
}
