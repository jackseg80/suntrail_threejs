import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
// @ts-ignore
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { state } from './state';
import { updateSunPosition } from './sun';
import { getAltitudeAt } from './analysis';
import { loadTerrain, updateVisibleTiles, repositionAllTiles, animateTiles, updateGPXMesh, resetTerrain, clearCache } from './terrain';
import { EARTH_CIRCUMFERENCE, lngLatToTile, worldToLngLat } from './geo';
import { autoSelectMapSource } from './ui';
import { throttle } from './utils';
import { initVegetationResources } from './vegetation';
import { initWeatherSystem, updateWeatherSystem, fetchWeather, updateWeatherUIIndicator } from './weather';

// --- BOUSSOLE 3D NATIVE ---
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
    const geoNorth = new THREE.ConeGeometry(1, 2.5, 16);
    const matNorth = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const north = new THREE.Mesh(geoNorth, matNorth);
    north.rotation.x = -Math.PI / 2; north.position.z = -1.25;
    compassObject.add(north);
    const geoSouth = new THREE.ConeGeometry(1, 2.5, 16);
    const matSouth = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const south = new THREE.Mesh(geoSouth, matSouth);
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
    if (state.scene) {
        state.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
                    else o.material.dispose();
                }
            }
        });
        state.scene.clear();
    }
    if (state.stats && state.stats.dom && state.stats.dom.parentNode) state.stats.dom.parentNode.removeChild(state.stats.dom);
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
    state.stats.dom.style.position = 'absolute';
    state.stats.dom.style.top = '80px';
    state.stats.dom.style.left = '20px';
    state.stats.dom.style.zIndex = '1000';
    state.stats.dom.style.display = state.SHOW_STATS ? 'block' : 'none';

    initCompass();

    const sky = new Sky();
    sky.scale.setScalar(1000000);
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 1000000);
    state.camera.position.set(0, 35000, 40000);

    const controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 500; 
    controls.maxDistance = 600000;
    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    const updateUIZoom = (zoom: number) => {
        state.ZOOM = zoom;
        updateWeatherUIIndicator();
    };

    let lastRecenterTime = 0;
    let isUserInteracting = false; 
    const startInteracting = () => { isUserInteracting = true; };
    const stopInteracting = () => { setTimeout(() => { isUserInteracting = false; }, 500); };
    state.renderer.domElement.addEventListener('mousedown', startInteracting);
    state.renderer.domElement.addEventListener('touchstart', startInteracting, {passive: true});
    window.addEventListener('mouseup', stopInteracting);
    window.addEventListener('touchend', stopInteracting);

    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;
        const dx = state.controls.target.x, dz = state.controls.target.z;
        const dist = state.camera.position.distanceTo(state.controls.target);
        let newZoom = state.ZOOM;

        const lastDist = (state.camera as any)._lastLodDist || dist;
        const distChange = Math.abs(dist - lastDist) / lastDist;

        if (!isUserInteracting || distChange > 0.25) {
            (state.camera as any)._lastLodDist = dist;
            const boost = (state.MAP_SOURCE === 'satellite') ? 2.0 : 1.2;
            
            if (state.ZOOM === 13) { 
                if (dist < 22000) newZoom = 14; 
                else if (dist > 65000) newZoom = 12; 
            }
            else if (state.ZOOM === 14) { 
                if (dist > 35000) newZoom = 13; 
                else if (dist < 9000 * boost) newZoom = 15; 
            }
            else if (state.ZOOM === 15) {
                if (dist > 14000 * boost) newZoom = 14;
                else if (dist < 4000 * boost) newZoom = 16; 
            }
            else if (state.ZOOM === 16) {
                if (dist > 6000 * boost) newZoom = 15;
                else if (dist < 1800 * boost) newZoom = 17; 
            }
            else if (state.ZOOM === 17) {
                if (dist > 2500 * boost) newZoom = 16;
                else if (dist < 800 * boost) newZoom = 18; 
            }
            else if (state.ZOOM === 18) {
                if (dist > 1200 * boost) newZoom = 17;
            }
            else if (state.ZOOM === 12) { 
                if (dist < 45000) newZoom = 13; 
                else if (dist > 140000) newZoom = 11; 
            }
            else if (state.ZOOM <= 11) { 
                if (dist < 100000) newZoom = 12; 
                else if (dist > 280000) newZoom = 10; 
            }

            if (newZoom !== state.ZOOM) { 
                state.ZOOM = newZoom; 
                updateUIZoom(newZoom); 
            }
        }

        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        // --- DÉTECTION DÉPLACEMENT POUR MÉTÉO (v4.4.7) ---
        // On rafraîchit si on a bougé de plus de ~5km
        const dLat = gpsCenter.lat - state.lastWeatherLat;
        const dLon = gpsCenter.lon - state.lastWeatherLon;
        if (Math.sqrt(dLat*dLat + dLon*dLon) > 0.05) {
            state.lastWeatherLat = gpsCenter.lat;
            state.lastWeatherLon = gpsCenter.lon;
            fetchWeather(gpsCenter.lat, gpsCenter.lon);
        }

        if (state.ZOOM >= 12 && (Math.sqrt(dx*dx + dz*dz) > 20000 || newZoom !== state.ZOOM) && (Date.now() - lastRecenterTime > 3000)) {
            lastRecenterTime = Date.now();
            const oldOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
            const oldOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            const newTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, state.ZOOM);
            if (!isNaN(newTile.x)) {
                state.originTile = newTile;
                const newOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
                const newOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
                const offsetX = (oldOriginX - newOriginX) * EARTH_CIRCUMFERENCE;
                const offsetZ = (oldOriginZ - newOriginZ) * EARTH_CIRCUMFERENCE;
                state.camera.position.x += offsetX; state.camera.position.z += offsetZ;
                state.controls.target.x += offsetX; state.controls.target.z += offsetZ;
                state.controls.update(); repositionAllTiles(); if (state.rawGpxData) updateGPXMesh();
                fetchWeather(gpsCenter.lat, gpsCenter.lon);
            }
        }

        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, state.controls.target.x, state.controls.target.z);
    }, 200);
    
    controls.addEventListener('change', throttledUpdate);

    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); state.scene.add(state.ambientLight);
    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    state.scene.add(state.sunLight); state.scene.add(state.sunLight.target);

    await loadTerrain();
    initVegetationResources();
    initWeatherSystem(state.scene);
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    updateSunPosition(720); updateUIZoom(state.ZOOM);

    const clock = new THREE.Clock();
    window.addEventListener('resize', onWindowResize);
    let frameCount = 0;

    state.renderer.setAnimationLoop(() => {
        if (!state.renderer || !state.camera || !state.scene || !state.controls) return;

        const delta = clock.getDelta();
        const hasWeather = state.currentWeather !== 'clear' && state.WEATHER_DENSITY > 0;
        const needsUpdate = state.controls.update() || state.isAnimating || hasWeather;

        if (needsUpdate) {
            state.stats?.begin();
            frameCount++;
            animateTiles(delta);
            updateWeatherSystem(delta, state.camera.position);

            // --- COMPORTEMENT CAMÉRA PRO (v4.3.54) ---
            const dist = state.camera.position.distanceTo(state.controls.target);
            const hFactor = THREE.MathUtils.clamp((dist - 2000) / 200000, 0, 1);
            let hardMaxTilt = THREE.MathUtils.lerp(1.2, 0.05, Math.pow(hFactor, 0.5));
            
            if (state.ZOOM <= 8) hardMaxTilt = 0.05; 
            else if (state.ZOOM <= 11) hardMaxTilt = Math.max(hardMaxTilt, 0.4);
            else if (state.ZOOM <= 13) hardMaxTilt = Math.max(hardMaxTilt, 0.8); 
            else if (state.ZOOM >= 16) hardMaxTilt = Math.min(hardMaxTilt, 0.85);

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

            // Collision sol
            if (frameCount % 2 === 0) {
                const groundH = getAltitudeAt(state.camera.position.x, state.camera.position.z);
                const minH = groundH + 30;
                if (state.camera.position.y < minH) {
                    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, minH, 0.1);
                }
            }

            // Fix Brouillard (v4.4.5)
            if (state.scene.fog instanceof THREE.Fog) {
                const alt = state.camera.position.y;
                state.scene.fog.near = alt * 2.0;
                state.scene.fog.far = alt * 12.0;
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

function onWindowResize(): void {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
