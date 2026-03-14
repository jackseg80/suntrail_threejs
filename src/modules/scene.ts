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
import { throttle, showToast } from './utils';
import { initVegetationResources } from './vegetation';
import { initWeatherSystem, updateWeatherSystem, fetchWeather, updateWeatherUIIndicator } from './weather';

let compassScene: THREE.Scene;
let compassCamera: THREE.PerspectiveCamera;
let compassRenderer: THREE.WebGLRenderer;
let compassObject: THREE.Group;

function initCompass() {
    const canvas = document.getElementById('compass-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    compassScene = new THREE.Scene();
    compassCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    compassCamera.position.set(0, 0, 18);
    compassRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    compassRenderer.setPixelRatio(window.devicePixelRatio);
    compassRenderer.setSize(120, 120);
    compassObject = new THREE.Group();
    const north = new THREE.Mesh(new THREE.ConeGeometry(1, 2.5, 16), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    north.rotation.x = -Math.PI / 2; north.position.z = -1.25;
    compassObject.add(north);
    const south = new THREE.Mesh(new THREE.ConeGeometry(1, 2.5, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    south.rotation.x = Math.PI / 2; south.position.z = 1.25;
    compassObject.add(south);

    const createLetter = (text: string, color: string, pos: THREE.Vector3) => {
        const ctxCanvas = document.createElement('canvas');
        ctxCanvas.width = 128; ctxCanvas.height = 128;
        const ctx = ctxCanvas.getContext('2d');
        if (ctx) {
            ctx.font = 'Bold 90px DM Sans, Arial';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000000'; ctx.lineWidth = 16; ctx.strokeText(text, 64, 64);
            ctx.fillStyle = color; ctx.fillText(text, 64, 64);
        }
        const tex = new THREE.CanvasTexture(ctxCanvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        sprite.position.copy(pos);
        sprite.scale.set(3, 3, 1);
        compassObject.add(sprite);
    };

    createLetter('N', '#ff3333', new THREE.Vector3(0, 0, -5.2));
    createLetter('S', '#ffffff', new THREE.Vector3(0, 0, 5.2));
    createLetter('E', '#ffffff', new THREE.Vector3(5.2, 0, 0));
    createLetter('O', '#ffffff', new THREE.Vector3(-5.2, 0, 0));

    compassScene.add(compassObject);
    compassScene.add(new THREE.AmbientLight(0xffffff, 1.5));
}

export async function disposeScene(): Promise<void> {
    resetTerrain(); clearCache();
    if (state.renderer) { state.renderer.setAnimationLoop(null); state.renderer.dispose(); }
    if (compassRenderer) compassRenderer.dispose();
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
    controls.minDistance = 100;
    controls.maxDistance = 1800000;
    (controls as any)._isMoving = false;
    controls.addEventListener('start', () => { (controls as any)._isMoving = true; });
    controls.addEventListener('end', () => { (controls as any)._isMoving = false; });

    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

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
        
        // --- LOGIQUE ANIMATION BOUSSOLE (v4.5.26) ---
        if (isResettingNorth) {
            const elapsed = Date.now() - resetStartTime;
            const progress = Math.min(elapsed / RESET_DURATION, 1.0);
            
            // On utilise une courbe easeInOut pour plus de douceur
            const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            state.camera.position.lerpVectors(startCamPos, endCamPos, ease);
            state.controls.update();
            
            if (progress >= 1.0) {
                isResettingNorth = false;
                showToast("Orientation Nord rétablie");
            }
        }

        const needsUpdate = state.controls.update() || state.isAnimating || hasWeather || isResettingNorth || tilesFading || needsInitialRender > 0;

        if (needsUpdate) {
            state.stats?.begin();
            tilesFading = animateTiles(delta);
            if (needsInitialRender > 0) needsInitialRender--;
            
            updateWeatherSystem(delta, state.camera.position);

            const dist = state.camera.position.distanceTo(state.controls.target);
            const hFactor = THREE.MathUtils.clamp((dist - 2000) / 200000, 0, 1);
            
            // Parabole de Tilt
            let hardMaxTilt = THREE.MathUtils.lerp(1.2, 0.05, Math.pow(hFactor, 0.5));
            if (state.ZOOM <= 8) hardMaxTilt = 0.05; 
            else if (state.ZOOM <= 11) hardMaxTilt = Math.min(hardMaxTilt, 0.4);
            else if (state.ZOOM <= 13) hardMaxTilt = Math.min(hardMaxTilt, 0.8); 
            else if (state.ZOOM === 14) hardMaxTilt = Math.min(hardMaxTilt, 0.9);
            else if (state.ZOOM === 15) hardMaxTilt = Math.min(hardMaxTilt, 0.8); 
            else if (state.ZOOM === 16) hardMaxTilt = Math.min(hardMaxTilt, 0.7); 
            else if (state.ZOOM >= 17) hardMaxTilt = Math.min(hardMaxTilt, 0.65);

            const targetTilt = THREE.MathUtils.lerp(1.1, 0.05, Math.pow(hFactor, 0.6));
            const currentTilt = state.controls.getPolarAngle();
            if (Math.abs(currentTilt - targetTilt) > 0.01) {
                state.controls.maxPolarAngle = THREE.MathUtils.lerp(currentTilt, hardMaxTilt, 0.05);
            } else {
                state.controls.maxPolarAngle = hardMaxTilt;
            }

            if (state.isAnimating) {
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
            if (compassRenderer && compassObject) {
                compassObject.quaternion.copy(state.camera.quaternion).invert();
                compassRenderer.render(compassScene, compassCamera);
            }
            state.stats?.end();
        }
    });
}

// --- ANIMATION BOUSSOLE (v4.5.26) ---
let isResettingNorth = false;
let resetStartTime = 0;
const RESET_DURATION = 800; // 800ms : Le juste milieu (v4.5.29)
let startCamPos = new THREE.Vector3();
let endCamPos = new THREE.Vector3();

export function resetToNorth(): void {
    if (!state.controls || !state.camera || isResettingNorth) return;
    
    isResettingNorth = true;
    resetStartTime = Date.now();
    startCamPos.copy(state.camera.position);
    
    const distance = state.camera.position.distanceTo(state.controls.target);
    
    // --- CALCUL CIBLE ARC (v4.5.27) ---
    // On place la caméra très haut (Y) mais très légèrement au SUD (Z+) 
    // pour que le Nord soit toujours "en haut" sans perte de repère.
    const tinyOffset = distance * 0.001; // 0.1% de distance
    endCamPos.set(
        state.controls.target.x,
        state.controls.target.y + distance,
        state.controls.target.z + tinyOffset
    );
    
    showToast("Réalignement cinématique...");
}

function onWindowResize(): void {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
