import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
// @ts-ignore
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { state } from './state';
import { eventBus } from './eventBus';
import { updateSunPosition } from './sun';
import { getAltitudeAt, resetAnalysisCache } from './analysis';
import { loadTerrain, updateVisibleTiles, repositionAllTiles, animateTiles, resetTerrain, autoSelectMapSource, updateGPXMesh, terrainUniforms } from './terrain';
import { disposeAllCachedTiles } from './tileCache';
import { disposeAllGeometries } from './geometryCache';
import { EARTH_CIRCUMFERENCE, lngLatToTile, worldToLngLat } from './geo';
import { throttle } from './utils';
import { initVegetationResources } from './vegetation';
import { initWeatherSystem, updateWeatherSystem, fetchWeather, updateWeatherUIIndicator } from './weather';
import { initCompass, disposeCompass, renderCompass, updateCompassAnimation, isCompassAnimating } from './compass';
import { centerOnUser } from './location';

export async function disposeScene(): Promise<void> {
    resetTerrain();
    disposeAllCachedTiles();
    disposeAllGeometries();
    resetAnalysisCache();
    if (state.renderer) { state.renderer.setAnimationLoop(null); state.renderer.dispose(); }
    disposeCompass();
    if (state.scene) state.scene.clear();
    window.removeEventListener('resize', onWindowResize);
}

// --- VOL CINÉMATIQUE (v4.6.5) ---
export function flyTo(targetWorldX: number, targetWorldZ: number, targetElevation: number = 0) {
    if (!state.camera || !state.controls) return;
    
    if (state.isFollowingUser) {
        state.isFollowingUser = false;
        const btn = document.getElementById('gps-follow-btn');
        if (btn) btn.classList.remove('active');
    }

    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const endTarget = new THREE.Vector3(targetWorldX, targetElevation, targetWorldZ);
    const offsetZ = 12000;
    const finalAlt = targetElevation + 12000; 
    const endPos = new THREE.Vector3(targetWorldX, finalAlt, targetWorldZ + offsetZ);

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
        if (progress < 1.0) requestAnimationFrame(animateFlight);
    };
    requestAnimationFrame(animateFlight);
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
    state.stats.dom.style.display = state.SHOW_STATS ? 'block' : 'none';

    initCompass();

    const sky = new Sky();
    sky.scale.setScalar(10000000); 
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 4000000);
    state.camera.position.set(0, 35000, 40000);

    const controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls = controls;
    
    controls.addEventListener('start', () => { state.isUserInteracting = true; });
    controls.addEventListener('end', () => { state.isUserInteracting = false; });

    controls.enableDamping = true;
    controls.dampingFactor = 0.1; 
    controls.rotateSpeed = 1.2;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.minDistance = 100;
    controls.maxDistance = 3500000; 
    
    controls.screenSpacePanning = false; 
    controls.enableRotate = true;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

    let lastRecenterTime = 0;
    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;
        const dx = state.controls.target.x, dz = state.controls.target.z;
        const dist = state.camera.position.distanceTo(state.controls.target);
        
        let newZoom = state.ZOOM;
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

        if (newZoom !== state.ZOOM) { state.ZOOM = newZoom; updateWeatherUIIndicator(); }

        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        const distToLastWeather = Math.sqrt(Math.pow(gpsCenter.lat - state.lastWeatherLat, 2) + Math.pow(gpsCenter.lon - state.lastWeatherLon, 2));
        if (distToLastWeather > 0.05) fetchWeather(gpsCenter.lat, gpsCenter.lon);

        if (state.ZOOM >= 12 && !state.isUserInteracting && (newZoom === state.ZOOM) && (Math.sqrt(dx*dx + dz*dz) > 35000) && (Date.now() - lastRecenterTime > 5000)) {
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
                    state.controls!.update(); repositionAllTiles(); if (state.rawGpxData) updateGPXMesh();
                    state.lastWeatherLat = gpsCenter.lat; state.lastWeatherLon = gpsCenter.lon;
                    fetchWeather(gpsCenter.lat, gpsCenter.lon);
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

    await loadTerrain();
    initVegetationResources();
    initWeatherSystem(state.scene);
    
    // --- BRANCHEMENT EVENT BUS (v5.5.0) ---
    eventBus.on('flyTo', ({ worldX, worldZ, targetElevation }) => {
        flyTo(worldX, worldZ, targetElevation);
    });
    
    state.lastWeatherLat = state.TARGET_LAT;
    state.lastWeatherLon = state.TARGET_LON;
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    
    const initialMins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
    updateSunPosition(initialMins); updateWeatherUIIndicator();

    const clock = new THREE.Clock();
    let lastRenderTime = 0;
    window.addEventListener('resize', onWindowResize);

    let needsInitialRender = 60; 
    let tilesFading = true;

    const renderLoopFn = () => {
        if (!state.renderer || !state.camera || !state.scene || !state.controls) return;
        if (document.visibilityState === 'hidden') return;

        const now = performance.now();
        const delta = clock.getDelta();
        if (state.ENERGY_SAVER && (now - lastRenderTime < 33)) return;
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
        
        if (state.RESOLUTION <= 2 || state.ZOOM <= 10) {
            state.controls.minPolarAngle = 0; state.controls.maxPolarAngle = 0;
        } else if (interacting) {
            state.controls.minPolarAngle = 0.05; state.controls.maxPolarAngle = tiltCap; 
        } else {
            const hFactor = THREE.MathUtils.clamp((distToTarget - 2000) / 100000, 0, 1);
            let desiredTilt = THREE.MathUtils.lerp(tiltCap * 0.95, 0.05, Math.pow(hFactor, 0.4));
            if (state.ZOOM <= 11) desiredTilt = Math.min(desiredTilt, tiltCap * 0.9);
            if (Math.abs(currentTilt - desiredTilt) > 0.01) {
                const newTilt = THREE.MathUtils.lerp(currentTilt, desiredTilt, 0.02);
                state.controls.minPolarAngle = Math.max(0.05, newTilt - 0.2); 
                state.controls.maxPolarAngle = Math.min(tiltCap, newTilt + 0.2);
            }
        }

        const needsUpdate = state.controls.update() || state.SHOW_HYDROLOGY || state.isSunAnimating || state.isInteractingWithUI || state.isProcessingTiles || (state.currentWeather !== 'clear' && state.WEATHER_DENSITY > 0) || isCompassAnimating() || tilesFading || needsInitialRender > 0 || state.isFollowingUser;

        if (needsUpdate) {
            state.stats?.begin();
            terrainUniforms.uTime.value += delta;
            tilesFading = animateTiles(delta);
            if (needsInitialRender > 0) needsInitialRender--;
            updateWeatherSystem(delta, state.camera.position);
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
        }
    };
    state.renderer.setAnimationLoop(renderLoopFn);
}

function onWindowResize(): void {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
