import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
// @ts-ignore
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { state } from './state';
import { updateSunPosition } from './sun';
import { getAltitudeAt } from './analysis';
import { loadTerrain, updateVisibleTiles, repositionAllTiles, animateTiles, resetTerrain, clearCache, autoSelectMapSource, updateGPXMesh } from './terrain';
import { EARTH_CIRCUMFERENCE, lngLatToTile, worldToLngLat } from './geo';
import { throttle } from './utils';
import { initVegetationResources } from './vegetation';
import { initWeatherSystem, updateWeatherSystem, fetchWeather, updateWeatherUIIndicator } from './weather';
import { initCompass, disposeCompass, renderCompass, updateCompassAnimation, isCompassAnimating } from './compass';

export async function disposeScene(): Promise<void> {
    resetTerrain(); clearCache();
    if (state.renderer) { state.renderer.setAnimationLoop(null); state.renderer.dispose(); }
    disposeCompass();
    if (state.scene) state.scene.clear();
    window.removeEventListener('resize', onWindowResize);
}

export async function initScene(): Promise<void> {
    await disposeScene();
    const container = document.getElementById('canvas-container');
    if (!container) return;
    
    state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, state.ZOOM);
    state.scene = new THREE.Scene();
    state.scene.fog = new THREE.Fog(0x87CEEB, state.FOG_NEAR, state.FOG_FAR); 

    state.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, alpha: true });
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
    sky.scale.setScalar(1000000);
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 4000000);
    state.camera.position.set(0, 35000, 40000);

    const controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1; 
    controls.rotateSpeed = 1.0; 
    controls.zoomSpeed = 1.2;
    controls.minDistance = 100;
    controls.maxDistance = 1800000;
    
    // --- CONFIGURATION TACTILE PRO (v4.5.39) ---
    controls.screenSpacePanning = false; // Important : garde le panoramique parallèle au sol
    controls.enableRotate = true;
    
    // On sépare strictement les gestes :
    // 1 doigt = Déplacement (PAN)
    // 2 doigts = Zoom (DOLLY) + Rotation (ROTATE)
    controls.touches = { 
        ONE: THREE.TOUCH.PAN, 
        TWO: THREE.TOUCH.DOLLY_ROTATE 
    };

    (controls as any)._isMoving = false;
    controls.addEventListener('start', () => { (controls as any)._isMoving = true; });
    controls.addEventListener('end', () => { (controls as any)._isMoving = false; });

    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

    const updateUIZoom = (zoom: number) => {
        state.ZOOM = zoom;
        updateWeatherUIIndicator();
    };

    let lastRecenterTime = 0;
    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;
        const dx = state.controls.target.x, dz = state.controls.target.z;
        const dist = state.camera.position.distanceTo(state.controls.target);
        
        // --- SÉCURITÉ ANTI-CRASH (NaN) ---
        if (!isFinite(dx) || !isFinite(dz) || !isFinite(dist)) {
            console.error("OrbitControls Singularity detected. Emergency Reset.");
            state.camera.position.set(0, 35000, 40000);
            state.controls.target.set(0, 0, 0);
            state.controls.update();
            return;
        }

        let newZoom = state.ZOOM;
        const boost = (state.MAP_SOURCE === 'satellite') ? 2.0 : 1.2;
        if (state.ZOOM === 13) { if (dist < 22000) newZoom = 14; else if (dist > 65000) newZoom = 12; }
        else if (state.ZOOM === 14) { if (dist > 35000) newZoom = 13; else if (dist < 9000 * boost) newZoom = 15; }
        else if (state.ZOOM === 15) { if (dist > 14000 * boost) newZoom = 14; else if (dist < 4000 * boost) newZoom = 16; }
        else if (state.ZOOM === 16) { if (dist > 6000 * boost) newZoom = 15; else if (dist < 1800 * boost) newZoom = 17; }
        else if (state.ZOOM === 17) { if (dist > 2500 * boost) newZoom = 16; else if (dist < 800 * boost) newZoom = 18; }
        else if (state.ZOOM === 18) { if (dist > 1200 * boost) newZoom = 17; }
        else if (state.ZOOM === 12) { if (dist < 45000) newZoom = 13; else if (dist > 120000) newZoom = 11; }
        else if (state.ZOOM === 11) { if (dist < 90000) newZoom = 12; else if (dist > 220000) newZoom = 10; }
        else if (state.ZOOM === 10) { if (dist < 180000) newZoom = 11; else if (dist > 450000) newZoom = 9; }
        else if (state.ZOOM === 9)  { if (dist < 380000) newZoom = 10; else if (dist > 850000) newZoom = 8; }
        else if (state.ZOOM === 8)  { if (dist < 750000) newZoom = 9;  else if (dist > 1400000) newZoom = 7; }
        else if (state.ZOOM <= 7)  { if (dist < 1200000) newZoom = 8; }

        if (newZoom !== state.ZOOM) { state.ZOOM = newZoom; updateUIZoom(newZoom); }

        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        // --- MISE À JOUR MÉTÉO DYNAMIQUE (v4.5.31) ---
        const distToLastWeather = Math.sqrt(Math.pow(gpsCenter.lat - state.lastWeatherLat, 2) + Math.pow(gpsCenter.lon - state.lastWeatherLon, 2));
        if (distToLastWeather > 0.05) { // Env. 5-6km de déplacement
            fetchWeather(gpsCenter.lat, gpsCenter.lon);
        }

        // --- RECENTRAGE GÉANT SÉCURISÉ (v4.5.25) ---
        const isUserInteracting = (state.controls as any)._isMoving;
        if (state.ZOOM >= 12 && !isUserInteracting && (newZoom === state.ZOOM) && (Math.sqrt(dx*dx + dz*dz) > 35000) && (Date.now() - lastRecenterTime > 5000)) {
            const newTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, state.originTile.z);
            if (!isNaN(newTile.x) && !isNaN(newTile.y)) {
                
                const oldOriginXN = (state.originTile.x + 0.5) / Math.pow(2, state.originTile.z);
                const oldOriginYN = (state.originTile.y + 0.5) / Math.pow(2, state.originTile.z);
                const newOriginXN = (newTile.x + 0.5) / Math.pow(2, state.originTile.z);
                const newOriginYN = (newTile.y + 0.5) / Math.pow(2, state.originTile.z);
                
                const offsetX = (oldOriginXN - newOriginXN) * EARTH_CIRCUMFERENCE;
                const offsetZ = (oldOriginYN - newOriginYN) * EARTH_CIRCUMFERENCE;
                
                if (Math.abs(offsetX) < 250000 && Math.abs(offsetZ) < 250000) {
                    state.originTile = newTile;
                    lastRecenterTime = Date.now();
                    state.camera.position.x += offsetX; state.camera.position.z += offsetZ;
                    state.controls.target.x += offsetX; state.controls.target.z += offsetZ;
                    state.controls.update(); 
                    repositionAllTiles(); 
                    if (state.rawGpxData) updateGPXMesh();
                    
                    // On force la mise à jour météo ici car le monde a glissé
                    state.lastWeatherLat = gpsCenter.lat;
                    state.lastWeatherLon = gpsCenter.lon;
                    fetchWeather(gpsCenter.lat, gpsCenter.lon);
                }
            }
        }
        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, state.controls.target.x, state.controls.target.z);
    }, 200);
    
    controls.addEventListener('change', throttledUpdate);

    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); state.scene.add(state.ambientLight);
    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    state.sunLight.shadow.mapSize.set(2048, 2048);
    state.sunLight.shadow.camera.left = -50000;
    state.sunLight.shadow.camera.right = 50000;
    state.sunLight.shadow.camera.top = 50000;
    state.sunLight.shadow.camera.bottom = -50000;
    state.sunLight.shadow.camera.near = 1000;
    state.sunLight.shadow.camera.far = 500000;
    state.sunLight.shadow.bias = -0.0005;
    state.sunLight.shadow.normalBias = 0.05;
    state.scene.add(state.sunLight); state.scene.add(state.sunLight.target);

    await loadTerrain();
    initVegetationResources();
    initWeatherSystem(state.scene);
    
    state.lastWeatherLat = state.TARGET_LAT;
    state.lastWeatherLon = state.TARGET_LON;
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    
    updateSunPosition(720); updateUIZoom(state.ZOOM);

    const clock = new THREE.Clock();
    window.addEventListener('resize', onWindowResize);

    let needsInitialRender = 60; // On force 60 frames au début pour garantir l'affichage
    let tilesFading = true;

    state.renderer.setAnimationLoop(() => {
        if (!state.renderer || !state.camera || !state.scene || !state.controls) return;

        const delta = clock.getDelta();
        const hasWeather = state.currentWeather !== 'clear' && state.WEATHER_DENSITY > 0;
        
        updateCompassAnimation();

        // --- GESTION DU TILT ULTRA-STABLE (v4.5.37) ---
        // Exécuté AVANT controls.update() pour garantir que l'angle est respecté
        const interacting = (state.controls as any)._isMoving;
        const currentTilt = state.controls.getPolarAngle();
        const distToTarget = state.camera.position.distanceTo(state.controls.target);
        
        if (interacting) {
            // VERROUILLAGE PENDANT L'INTERACTION
            // Garantit que le Twist (rotation 2 doigts) se fait sans aucune variation d'altitude.
            state.controls.minPolarAngle = currentTilt;
            state.controls.maxPolarAngle = currentTilt;
        } else {
            // AUTO-TILT FLUIDE (ZOOM-BASED)
            const hFactor = THREE.MathUtils.clamp((distToTarget - 2000) / 100000, 0, 1);
            let desiredTilt = THREE.MathUtils.lerp(1.2, 0.05, Math.pow(hFactor, 0.4));
            
            // Sécurité de plafond selon le zoom
            if (state.ZOOM <= 8) desiredTilt = 0.05; 
            else if (state.ZOOM <= 11) desiredTilt = Math.min(desiredTilt, 0.3);
            else if (state.ZOOM <= 13) desiredTilt = Math.min(desiredTilt, 0.7); 
            else if (state.ZOOM === 14) desiredTilt = Math.min(desiredTilt, 0.9);
            else if (state.ZOOM >= 15) desiredTilt = Math.min(desiredTilt, 1.2);

            // Lerp fluide vers l'angle idéal
            if (Math.abs(currentTilt - desiredTilt) > 0.001) {
                const newTilt = THREE.MathUtils.lerp(currentTilt, desiredTilt, 0.05);
                state.controls.minPolarAngle = newTilt;
                state.controls.maxPolarAngle = newTilt;
            } else {
                state.controls.minPolarAngle = desiredTilt;
                state.controls.maxPolarAngle = desiredTilt;
            }
        }

        const needsUpdate = state.controls.update() || state.isSunAnimating || state.isInteractingWithUI || hasWeather || isCompassAnimating() || tilesFading || needsInitialRender > 0;

        if (needsUpdate) {
            state.stats?.begin();
            tilesFading = animateTiles(delta);
            if (needsInitialRender > 0) needsInitialRender--;
            
            updateWeatherSystem(delta, state.camera.position);

            if (state.isSunAnimating) {
                const slider = document.getElementById('time-slider') as HTMLInputElement;
                if (slider) {
                    let mins = (parseInt(slider.value) + state.animationSpeed) % 1440;
                    slider.value = Math.floor(mins).toString(); updateSunPosition(mins);
                }
            }

            // --- BUTÉE SOL ULTRA-LÉGÈRE (v4.5.25) ---
            // On utilise le cache de getAltitudeAt qui est désormais instantané (O(1))
            const groundH = getAltitudeAt(state.camera.position.x, state.camera.position.z);
            if (state.camera.position.y < groundH + 45) {
                state.camera.position.y = groundH + 45;
            }

            if (state.scene.fog instanceof THREE.Fog) {
                const alt = state.camera.position.y;
                state.scene.fog.near = alt * 2.0; state.scene.fog.far = alt * 12.0;
            }

            state.renderer.render(state.scene, state.camera);
            renderCompass();
            state.stats?.end();
        }
    });
}

function onWindowResize(): void {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
