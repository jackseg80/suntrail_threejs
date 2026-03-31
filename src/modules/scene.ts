import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { state } from './state';
import { eventBus } from './eventBus';
import { updateSunPosition } from './sun';
import { getAltitudeAt, resetAnalysisCache } from './analysis';
import { loadTerrain, updateVisibleTiles, repositionAllTiles, animateTiles, resetTerrain, autoSelectMapSource, terrainUniforms, prefetchAdjacentLODs } from './terrain';
import { disposeAllCachedTiles } from './tileCache';
import { disposeAllGeometries } from './geometryCache';
import { EARTH_CIRCUMFERENCE, lngLatToTile, worldToLngLat, clampTargetToBounds } from './geo';
import { throttle, showToast } from './utils';
import { i18n } from '../i18n/I18nService';
import { initVegetationResources } from './vegetation';
import { initWeatherSystem, updateWeatherSystem, fetchWeather, disposeWeatherSystem } from './weather';
import { initCompass, disposeCompass, renderCompass, updateCompassAnimation, isCompassAnimating } from './compass';
import { centerOnUser } from './location';
import { initTouchControls, disposeTouchControls } from './touchControls';

// Handler de visibilité : suspend le GPU quand l'app passe en arrière-plan (v5.11)
let visibilityChangeHandler: (() => void) | null = null;

// Upsell LOD — debounce pour ne pas spammer le toast (1 fois par 30s max)
let _lastLodUpsellTime = 0;

export async function disposeScene(): Promise<void> {
    resetTerrain();
    disposeAllCachedTiles();
    disposeAllGeometries();
    resetAnalysisCache();
    if (state.renderer) {
        disposeTouchControls(state.renderer.domElement);
        state.renderer.setAnimationLoop(null);
        state.renderer.dispose();
    }
    disposeCompass();
    disposeWeatherSystem();
    if (state.scene) state.scene.clear();
    if (visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', visibilityChangeHandler);
        visibilityChangeHandler = null;
    }
    window.removeEventListener('resize', onWindowResize);
}

// --- VOL CINÉMATIQUE (v4.6.5) ---
export function flyTo(targetWorldX: number, targetWorldZ: number, targetElevation: number = 0, targetDistance: number = 12000) {
    if (!state.camera || !state.controls) return;
    
    if (state.isFollowingUser) {
        state.isFollowingUser = false;
        // Correction : l'élément s'appelle gps-main-btn (et non gps-follow-btn qui n'existe pas)
        const btn = document.getElementById('gps-main-btn');
        if (btn) btn.classList.remove('active', 'following');
    }

    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const endTarget = new THREE.Vector3(targetWorldX, targetElevation, targetWorldZ);
    
    // On calcule la position finale en gardant l'inclinaison si possible ou en utilisant un défaut
    const offsetZ = targetDistance * 0.8;
    const finalAlt = targetElevation + targetDistance; 
    const endPos = new THREE.Vector3(targetWorldX, finalAlt, targetWorldZ + offsetZ);

    // Block origin shift for the duration of the animation to prevent the closure
    // coordinates from becoming stale (origin shift would shift camera but not the
    // captured startPos/endPos/startTarget/endTarget in this closure).
    state.isFlyingTo = true;

    const duration = 2500; 
    const startTime = performance.now();

    const animateFlight = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        state.controls!.target.lerpVectors(startTarget, endTarget, ease);
        const currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, ease);
        const parabolaHeight = Math.sin(progress * Math.PI) * 5000; 
        currentPos.y += parabolaHeight;
        
        const groundH = getAltitudeAt(currentPos.x, currentPos.z);
        if (currentPos.y < groundH + 100) currentPos.y = groundH + 100;

        state.camera!.position.copy(currentPos);
        state.controls!.update();
        if (progress < 1.0) {
            requestAnimationFrame(animateFlight);
        } else {
            // Allow origin shift again after landing
            state.isFlyingTo = false;
        }
    };
    requestAnimationFrame(animateFlight);
}

function getIdealZoom(dist: number): number {
    const boost = (state.MAP_SOURCE === 'satellite') ? 2.0 : 1.2;
    if (dist < 800 * boost) return 18;
    if (dist < 1800 * boost) return 17;
    if (dist < 4000 * boost) return 16;
    if (dist < 9000 * boost) return 15;
    if (dist < 22000) return 14;
    if (dist < 45000) return 13;
    if (dist < 90000) return 12;
    if (dist < 180000) return 11;
    if (dist < 350000) return 10;
    if (dist < 700000) return 9;
    if (dist < 1200000) return 8;
    if (dist < 2000000) return 7;
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
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.AgXToneMapping;
    container.appendChild(state.renderer.domElement);
    state.stats = new Stats();
    container.appendChild(state.stats.dom);
    state.stats.dom.style.top = '80px';
    // Start hidden — VRAMDashboard.toggle() manages FPS+VRAM visibility together
    state.stats.dom.style.display = 'none';
    // Re-sync après création de Stats.js : VRAMDashboard.init() peut avoir été appelé
    // avant initScene(), donc state.stats était null → le FPS counter était skippé.
    state.vramPanel?.setVisible(state.SHOW_STATS);

    initCompass();

    const sky = new Sky();
    sky.scale.setScalar(10000000); 
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 4000000);
    // Démarrage au LOD 6 (dezoom max) — dist >= 2 000 000 déclenche LOD 6 dans adaptiveLOD()
    state.camera.position.set(0, 2000000, 2000000);

    const controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls = controls;
    
    controls.addEventListener('start', () => {
        state.isUserInteracting = true;
        // Phase 2.3 — Adaptive DPR : baisser à 1.0 pendant l'interaction (invisible, économise GPU)
        if (isMobileDevice && state.renderer) {
            if (dprRestoreTimer) { clearTimeout(dprRestoreTimer); dprRestoreTimer = null; }
            state.renderer.setPixelRatio(1.0);
        }
    });
    controls.addEventListener('end', () => {
        state.isUserInteracting = false;
        lastInteractionTime = performance.now();
        // Phase 2.3 — Restaurer le DPR complet 200ms après la fin du geste (full quality sur frame fixe)
        if (isMobileDevice && state.renderer) {
            dprRestoreTimer = setTimeout(() => {
                if (state.renderer) state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
                dprRestoreTimer = null;
            }, 200);
        }
    });

    controls.enableDamping = true;
    controls.dampingFactor = 0.1; 
    controls.rotateSpeed = 1.2;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.minDistance = 100;
    controls.maxDistance = 3500000; 
    
    controls.screenSpacePanning = false; 
    controls.enableRotate = true;
    // Touch entièrement géré par touchControls.ts (capture phase) — pas de config ici
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

    // Gestes tactiles Google Earth : 1 doigt = pan, 2 doigts = pinch/twist/pan
    initTouchControls(
        state.camera,
        controls,
        state.renderer.domElement,
        () => { state.isUserInteracting = true; },
        () => { state.isUserInteracting = false; lastInteractionTime = performance.now(); }
    );

    let lastRecenterTime = 0;
    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;

        // Clamp caméra aux bords du monde — couvre le pan souris (OrbitControls direct)
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
        const dist = state.camera.position.distanceTo(state.controls.target);
        
        let newZoom = state.ZOOM;
        const idealZoom = getIdealZoom(dist);
        
        // --- LOGIQUE DE ZOOM ADAPTATIVE (v5.8.6) ---
        // On évite de dépasser le zoom max autorisé par le preset
        // Limite effective : isPro = source de vérité — MAX_ALLOWED_ZOOM reflète la valeur
        // native du preset (16 pour balanced, 18 pour perf/ultra, 14 pour eco).
        // Les users gratuits sont plafonnés à 14 ICI, pas dans MAX_ALLOWED_ZOOM, pour que
        // le passage en Pro soit immédiatement effectif quel que soit le chemin d'activation.
        const effectiveMaxZoom = state.isPro
            ? (state.MAX_ALLOWED_ZOOM || 18)
            : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);

        const targetZoom = Math.min(idealZoom, effectiveMaxZoom);

        // Upsell contextuel LOD — informer l'utilisateur gratuit qu'il est à la limite
        // Condition : l'utilisateur veut zoomer plus loin (idealZoom dépasse la limite)
        // mais est bloqué car !isPro. Debounce 30s pour ne pas spammer.
        if (!state.isPro && idealZoom > effectiveMaxZoom && state.ZOOM >= effectiveMaxZoom) {
            const now = Date.now();
            if (now - _lastLodUpsellTime > 30_000) {
                _lastLodUpsellTime = now;
                showToast(i18n.t('upsell.lod'), 10000);
            }
        }

        // Si l'écart est important (téléportation ou mouvement rapide), on saute directement
        if (Math.abs(targetZoom - state.ZOOM) > 1) {
            newZoom = targetZoom;
        } else {
            // Sinon on garde l'hystérésis pour la fluidité (évite le clignotement aux seuils)
            const boost = (state.MAP_SOURCE === 'satellite') ? 2.0 : 1.2;
            if (state.ZOOM === 13) { if (dist < 22000) newZoom = 14; else if (dist > 65000) newZoom = 12; }
            else if (state.ZOOM === 14) { if (dist > 35000) newZoom = 13; else if (dist < 9000 * boost) newZoom = 15; }
            else if (state.ZOOM === 15) { if (dist > 14000 * boost) newZoom = 14; else if (dist < 4000 * boost) newZoom = 16; }
            else if (state.ZOOM === 16) { if (dist > 6000 * boost) newZoom = 15; else if (dist < 1800 * boost) newZoom = 17; }
            else if (state.ZOOM === 17) { if (dist > 2500 * boost) newZoom = 16; else if (dist < 800 * boost) newZoom = 18; }
            else if (state.ZOOM === 18) { if (dist > 1200 * boost) newZoom = 17; }
            else if (state.ZOOM === 12) { if (dist < 45000) newZoom = 13; else if (dist > 120000) newZoom = 11; }
            else if (state.ZOOM === 11) { if (dist < 90000) newZoom = 12; else if (dist > 250000) newZoom = 10; }
            else if (state.ZOOM === 10) { if (dist < 180000) newZoom = 11; else if (dist > 500000) newZoom = 9; }
            else if (state.ZOOM === 9)  { if (dist < 350000) newZoom = 10; else if (dist > 900000) newZoom = 8; }
            else if (state.ZOOM === 8)  { if (dist < 700000) newZoom = 9;  else if (dist > 1600000) newZoom = 7; }
            else if (state.ZOOM === 7)  { if (dist < 1200000) newZoom = 8; else if (dist > 2500000) newZoom = 6; }
            else if (state.ZOOM <= 6)  { if (dist < 2000000) newZoom = 7; }
            
            // Respecter la limite même en incrémental
            if (newZoom > effectiveMaxZoom) newZoom = effectiveMaxZoom;
        }

        const currentZoom = state.ZOOM;
        if (newZoom !== state.ZOOM) { state.ZOOM = newZoom; }

        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        const distToLastWeather = Math.sqrt(Math.pow(gpsCenter.lat - state.lastWeatherLat, 2) + Math.pow(gpsCenter.lon - state.lastWeatherLon, 2));
        if (distToLastWeather > 0.05) fetchWeather(gpsCenter.lat, gpsCenter.lon);

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
                        
                        // Reposition all relative objects
                        if (state.sunLight) {
                            state.sunLight.position.x += offsetX;
                            state.sunLight.position.z += offsetZ;
                            state.sunLight.target.position.x += offsetX;
                            state.sunLight.target.position.z += offsetZ;
                            state.sunLight.target.updateMatrixWorld();
                        }
                        
                        if (state.userMarker) {
                            state.userMarker.position.x += offsetX;
                            state.userMarker.position.z += offsetZ;
                        }
                        
                        state.gpxLayers.forEach(layer => {
                            if (layer.mesh) layer.mesh.geometry.translate(offsetX, 0, offsetZ);
                            // Sync layer.points so TrackSheet flyTo stays accurate after origin shift
                            layer.points.forEach(p => { p.x += offsetX; p.z += offsetZ; });
                        });
                        
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
    }, 200);
    
    controls.addEventListener('change', throttledUpdate);

    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); state.scene.add(state.ambientLight);
    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    state.sunLight.shadow.mapSize.set(2048, 2048);
    state.sunLight.shadow.camera.left = -50000; state.sunLight.shadow.camera.right = 50000;
    state.sunLight.shadow.camera.top = 50000; state.sunLight.shadow.camera.bottom = -50000;
    state.sunLight.shadow.camera.near = 1000; state.sunLight.shadow.camera.far = 500000;
    state.sunLight.shadow.bias = -0.0005; state.sunLight.shadow.normalBias = 0.05;
    state.scene.add(state.sunLight); state.scene.add(state.sunLight.target);

    // Initialisation des sous-systèmes indépendants (n'ont pas besoin des tuiles terrain)
    initVegetationResources();
    initWeatherSystem(state.scene);
    
    // --- BRANCHEMENT EVENT BUS (v5.5.0) ---
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
    // Fix controls.update() stuck sur WebView Android : timestamp de fin du dernier geste
    // controls.update() retourne true indéfiniment sur WebView → guard 800ms après relâchement
    let lastInteractionTime = 0;

    // Compteur FPS rolling (fenêtre 1s) — exposé dans state.currentFPS pour le PerfRecorder
    let fpsFrameCount = 0;
    let fpsLastTime = performance.now();

    // Phase 2.1 — Throttle eau à 20 FPS (accumulateur waterTimeAccum)
    const WATER_THROTTLE_MS = 50;   // 20 FPS
    let waterTimeAccum = 0;

    // Phase 2.2 — Throttle météo à 20 FPS (accumulateur indépendant)
    const WEATHER_THROTTLE_MS = 50; // 20 FPS
    let weatherTimeAccum = 0;
    let weatherAccumDelta = 0;      // delta cumulé entre deux updates météo

    // Phase 2.3 — Adaptive DPR
    let dprRestoreTimer: ReturnType<typeof setTimeout> | null = null;
    const isMobileDevice = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;

    // Prefetch LOD±1 — timestamp du dernier prefetch idle pour throttler à 1x/5s
    let lastPrefetchTime = 0;

    const renderLoopFn = () => {
        if (!state.renderer || !state.camera || !state.scene || !state.controls) return;

        const now = performance.now();
        const delta = clock.getDelta();

        // Accumulateurs incrémentés sur le temps RÉEL, AVANT tout guard de throttle.
        // Si placés après les guards, les frames skippées ne les incrémentent pas →
        // il faut N renders pour atteindre 50ms au lieu de 1 → météo/eau à ~5fps au lieu de 20fps.
        waterTimeAccum += delta * 1000;
        const waterFrameDue = waterTimeAccum >= WATER_THROTTLE_MS;
        if (waterFrameDue) waterTimeAccum = Math.max(0, waterTimeAccum - WATER_THROTTLE_MS);

        weatherTimeAccum += delta * 1000;
        weatherAccumDelta += delta;
        const weatherFrameDue = weatherTimeAccum >= WEATHER_THROTTLE_MS;
        if (weatherFrameDue) weatherTimeAccum = Math.max(0, weatherTimeAccum - WEATHER_THROTTLE_MS);

        if (state.ENERGY_SAVER && (now - lastRenderTime < 33)) return;

        // GPS follow : 30fps max suffit (GPS = 1Hz, lerp fluide à 30fps même à pieds).
        // Évite de rendre à 120fps pour une caméra qui suit une vitesse de marche. (v5.11.1)
        if (state.isFollowingUser && !state.ENERGY_SAVER && (now - lastRenderTime < 33)) return;

        // Idle throttle global — 20fps max en absence d'interaction.
        // Météo : on laisse passer les frames dues (weatherFrameDue) pour que
        // les particules s'animent à 20fps réels, sans plein régime continu.
        const isWeatherActive = state.SHOW_WEATHER && state.currentWeather !== 'clear' && state.WEATHER_DENSITY > 0;
        const isIdleMode = !state.isUserInteracting && !state.isFlyingTo && !state.isFollowingUser
            && !state.isTiltTransitioning
            && !(isWeatherActive && weatherFrameDue)
            && (now - lastInteractionTime >= 800);
        if (isIdleMode && (now - lastRenderTime < WATER_THROTTLE_MS)) return;
        lastRenderTime = now;

        updateCompassAnimation();

        let tiltCap = 1.10; 
        if (state.ZOOM <= 10) tiltCap = 0;
        else if (state.ZOOM === 11) tiltCap = 0.45;
        else if (state.ZOOM === 12) tiltCap = 0.70;
        else if (state.ZOOM === 13) tiltCap = 0.90;
        else if (state.ZOOM === 14) tiltCap = 1.10; 
        else if (state.ZOOM === 15) tiltCap = 0.95; 
        else if (state.ZOOM === 16) tiltCap = 0.80;
        else if (state.ZOOM === 17) tiltCap = 0.65;
        else if (state.ZOOM >= 18)  tiltCap = 0.50;

        const interacting = state.isUserInteracting;
        const currentTilt = state.controls.getPolarAngle();
        const distToTarget = state.camera.position.distanceTo(state.controls.target);
        
        // Tilt automatique parabolique — extrait en variable pour alimenter needsUpdate
        // sans passer par controls.update() (évite le stuck sur WebView Android)
        let tiltAnimating = false;
        if (state.IS_2D_MODE || state.ZOOM <= 10) {
            if (state.isTiltTransitioning && currentTilt > 0.005) {
                // Animation douce vers top-down (2D)
                tiltAnimating = true;
                const newTilt = THREE.MathUtils.lerp(currentTilt, 0, 0.06);
                state.controls.minPolarAngle = 0;
                state.controls.maxPolarAngle = Math.max(0, newTilt);
            } else {
                state.controls.minPolarAngle = 0; state.controls.maxPolarAngle = 0;
                if (state.isTiltTransitioning) state.isTiltTransitioning = false;
            }
        } else if (state.isTiltTransitioning) {
            // Animation douce vers tilt 3D — angle prononcé (85% du cap) pour montrer le relief.
            // On resserre min/max autour de newTilt pour FORCER OrbitControls à pousser la caméra.
            const desiredTilt = Math.max(tiltCap * 0.85, 0.5);
            if (Math.abs(currentTilt - desiredTilt) > 0.01) {
                tiltAnimating = true;
                const newTilt = THREE.MathUtils.lerp(currentTilt, desiredTilt, 0.07);
                // Bande étroite autour de newTilt — force la caméra à suivre
                state.controls.minPolarAngle = Math.max(0.05, newTilt - 0.01);
                state.controls.maxPolarAngle = Math.min(tiltCap, newTilt + 0.01);
            } else {
                state.isTiltTransitioning = false;
                state.controls.minPolarAngle = 0.05; state.controls.maxPolarAngle = tiltCap;
            }
        } else if (interacting) {
            state.controls.minPolarAngle = 0.05; state.controls.maxPolarAngle = tiltCap;
        } else {
            const hFactor = THREE.MathUtils.clamp((distToTarget - 2000) / 100000, 0, 1);
            let desiredTilt = THREE.MathUtils.lerp(tiltCap * 0.95, 0.05, Math.pow(hFactor, 0.4));
            if (state.ZOOM <= 11) desiredTilt = Math.min(desiredTilt, tiltCap * 0.9);
            if (Math.abs(currentTilt - desiredTilt) > 0.005) {
                tiltAnimating = true;
                const newTilt = THREE.MathUtils.lerp(currentTilt, desiredTilt, 0.02);
                state.controls.minPolarAngle = Math.max(0.05, newTilt - 0.2);
                state.controls.maxPolarAngle = Math.min(tiltCap, newTilt + 0.2);
            }
        }

        // Phase 2.1/2.2 — needsUpdate utilise les flags throttlés pour eau et météo :
        // - eau   : force un rendu SEULEMENT quand il est temps de mettre à jour uTime (20 FPS max)
        // - météo : idem — les particules n'ont pas besoin de 60 FPS
        // Fix controls.update() stuck (WebView Android) :
        // - controls.update() est toujours appelé (damping physique), mais son résultat
        //   n'est pris en compte que pendant 800ms après la fin du geste (couvre le damping
        //   factor=0.1 à 60fps = ~330ms) + pendant flyTo.
        // - tiltAnimating est une source propre, indépendante de controls.update().
        const controlsDirty = state.controls.update();
        const needsUpdate =
            // controls.update() est aussi appelé dans la RAF de flyTo/animateNorth, ce qui met à jour
            // lastPosition avant que renderLoopFn passe → controlsDirty=false. isFlyingTo est donc
            // standalone pour garantir un rendu à chaque frame pendant le vol (v5.11.1).
            (controlsDirty && (state.isUserInteracting || (now - lastInteractionTime < 800)))
            || state.isFlyingTo
            || state.isTiltTransitioning
            || tiltAnimating
            || (state.SHOW_HYDROLOGY && waterFrameDue)
            || state.isSunAnimating
            || state.isInteractingWithUI
            || state.isProcessingTiles
            || (isWeatherActive && weatherFrameDue)  // render seulement quand la frame météo est due (20fps)
            || isCompassAnimating()
            || tilesFading
            || needsInitialRender > 0
            || state.isFollowingUser;

        if (needsUpdate) {
            state.stats?.begin();
            // Phase 2.1 — uTime incrémenté seulement quand waterFrameDue (20 FPS max)
            if (waterFrameDue) terrainUniforms.uTime.value += WATER_THROTTLE_MS / 1000;
            tilesFading = animateTiles(delta);
            if (needsInitialRender > 0) needsInitialRender--;
            // Météo à 20fps — uTime + uniforms mis à jour ensemble quand la frame est due
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

            const groundH = getAltitudeAt(state.camera.position.x, state.camera.position.z);
            if (state.camera.position.y < groundH + 45) {
                state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, groundH + 45, 0.2);
                state.controls.update();
            }
            state.controls.minDistance = Math.max(100, groundH * 0.1); 

            if (state.scene.fog instanceof THREE.Fog) {
                const alt = state.camera.position.y;
                state.scene.fog.near = (state.FOG_NEAR * 0.5) + (alt * 1.5); 
                state.scene.fog.far = (state.FOG_FAR * 0.5) + (alt * 8.0);
            }

            state.renderer.render(state.scene, state.camera);
            renderCompass();
            state.stats?.end();

            // Prefetch LOD±1 en idle — précharge les tuiles du niveau suivant/précédent
            // en arrière-plan (priorité basse : isVisible()=false → traitées en dernier par processLoadQueue).
            // Déclenché seulement en mode idle + tuiles courantes toutes chargées + toutes les 5s.
            if (isIdleMode && !state.isProcessingTiles && (now - lastPrefetchTime > 5000)) {
                lastPrefetchTime = now;
                prefetchAdjacentLODs();
            }

            // Mise à jour FPS rolling (fenêtre 1s)
            fpsFrameCount++;
            const fpsTick = performance.now();
            if (fpsTick - fpsLastTime >= 1000) {
                state.currentFPS = Math.round(fpsFrameCount * 1000 / (fpsTick - fpsLastTime));
                fpsFrameCount = 0;
                fpsLastTime = fpsTick;
            }
        }
    };
    // Fix démarrage mobile (v5.11) : render loop démarre AVANT loadTerrain.
    // Le canvas affiche le ciel/brouillard immédiatement — les tuiles apparaissent au fur et à mesure.
    state.renderer.setAnimationLoop(renderLoopFn);

    // Signaler que le moteur 3D est opérationnel → ui.ts cache l'écran de chargement
    window.dispatchEvent(new Event('suntrail:sceneReady'));

    // Deep Sleep réel (v5.11) : arrêt total du GPU quand l'app passe en arrière-plan
    // (téléphone verrouillé, app minimisée). Relance propre au retour au premier plan.
    // Le early-return inline était insuffisant : setAnimationLoop continuait de tourner.
    visibilityChangeHandler = () => {
        if (!state.renderer) return;
        if (document.hidden) {
            state.renderer.setAnimationLoop(null);
        } else {
            state.renderer.setAnimationLoop(renderLoopFn);
        }
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    // Terrain chargé EN DERNIER : le GPU tourne déjà, les tuiles s'affichent progressivement
    await loadTerrain();
}

function onWindowResize(): void {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
