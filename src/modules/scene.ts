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

    // --- POINTS CARDINAUX (Restauration v4.3.59) ---
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
    container.innerHTML = '';
    
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
    state.stats.showPanel(0); 
    container.appendChild(state.stats.dom);
    state.stats.dom.style.position = 'absolute';
    state.stats.dom.style.top = '80px'; // Sous le bouton réglages (20+50+10)
    state.stats.dom.style.left = '20px'; // Aligné avec le bouton
    state.stats.dom.style.zIndex = '1000'; // Toujours au-dessus mais sous les menus critiques
    state.stats.dom.style.display = state.SHOW_STATS ? 'block' : 'none';

    initCompass();

    const sky = new Sky();
    sky.scale.setScalar(1000000);
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 1000000);
    state.camera.position.set(0, 35000, 40000); // Altitude initiale à 35km pour LOD 12

    const controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 500; 
    controls.maxDistance = 600000;
    
    // --- PANORAMIQUE HORIZONTAL (v4.3.51) ---
    controls.screenSpacePanning = false; // Force le panoramique sur le plan XZ (au sol)
    
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    const updateUIZoom = (zoom: number) => {
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) indicator.textContent = `${state.MAP_SOURCE.toUpperCase()}: Lvl ${zoom}`;
    };

    let lastRecenterTime = 0;
    let isUserInteracting = false; 

    // Détection robuste de l'interaction (v4.3.53)
    const startInteracting = () => { isUserInteracting = true; };
    const stopInteracting = () => { setTimeout(() => { isUserInteracting = false; }, 500); };
    
    state.renderer.domElement.addEventListener('mousedown', startInteracting);
    state.renderer.domElement.addEventListener('touchstart', startInteracting, {passive: true});
    window.addEventListener('mouseup', stopInteracting);
    window.addEventListener('touchend', stopInteracting);

    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;
        const dx = state.controls.target.x, dz = state.controls.target.z;
        
        // --- MÉTRIQUE LOD STABLE (v4.3.53) ---
        // On utilise la distance au target au lieu de l'altitude Y
        // Cela permet d'incliner la vue sans changer de LOD
        const dist = state.camera.position.distanceTo(state.controls.target);
        let newZoom = state.ZOOM;

        const lastDist = (state.camera as any)._lastLodDist || dist;
        const distChange = Math.abs(dist - lastDist) / lastDist;

        // On ne change de zoom que si on ne manipule pas la vue OU si le zoom est massif
        if (!isUserInteracting || distChange > 0.25) {
            (state.camera as any)._lastLodDist = dist;
            const boost = (state.MAP_SOURCE === 'satellite') ? 2.0 : 1.2;
            
            // --- SEUILS LOGIQUES ET COHÉRENTS (v4.3.56) ---
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
            else if (state.ZOOM === 11) { 
                if (dist < 100000) newZoom = 12; 
                else if (dist > 280000) newZoom = 10; 
            }
            else if (state.ZOOM === 10) { 
                if (dist < 180000) newZoom = 11; 
                else if (dist > 500000) newZoom = 9; 
            }
            else if (state.ZOOM === 9) { 
                if (dist < 350000) newZoom = 10; 
                else if (dist > 900000) newZoom = 8; 
            }
            else if (state.ZOOM === 8) { 
                if (dist < 700000) newZoom = 9; 
                else if (dist > 1800000) newZoom = 7; 
            }

            if (newZoom !== state.ZOOM) { 
                state.ZOOM = newZoom; 
                updateUIZoom(newZoom); 
            }
        }

        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        // Origin Shift (v4.3.39)
        if (state.ZOOM >= 12 && (Math.sqrt(dx*dx + dz*dz) > 20000 || newZoom !== state.ZOOM) && (Date.now() - lastRecenterTime > 3000)) {
            lastRecenterTime = Date.now();
            const oldOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
            const oldOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            const newTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, state.ZOOM);
            if (!isNaN(newTile.x) && !isNaN(newTile.y)) {
                state.originTile = newTile;
                const newOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
                const newOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
                const offsetX = (oldOriginX - newOriginX) * EARTH_CIRCUMFERENCE;
                const offsetZ = (oldOriginZ - newOriginZ) * EARTH_CIRCUMFERENCE;
                if (!isNaN(offsetX) && !isNaN(offsetZ)) {
                    state.camera.position.x += offsetX; state.camera.position.z += offsetZ;
                    state.controls.target.x += offsetX; state.controls.target.z += offsetZ;
                    state.controls.update(); repositionAllTiles(); if (state.rawGpxData) updateGPXMesh();
                }
            }
        }

        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, state.controls.target.x, state.controls.target.z);
        const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
        window.history.replaceState(null, '', `#lat=${gpsCenter.lat.toFixed(5)}&lon=${gpsCenter.lon.toFixed(5)}&z=${state.ZOOM}&t=${timeSlider?.value || 720}`);
    }, 200);
    
    controls.addEventListener('change', throttledUpdate);

    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); state.scene.add(state.ambientLight);
    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    state.sunLight.shadow.mapSize.set(state.SHADOW_RES, state.SHADOW_RES);
    const d = 25000;
    state.sunLight.shadow.camera.left = -d; state.sunLight.shadow.camera.right = d;
    state.sunLight.shadow.camera.top = d; state.sunLight.shadow.camera.bottom = -d;
    state.sunLight.shadow.camera.near = 1000; state.sunLight.shadow.camera.far = 500000;
    state.sunLight.shadow.bias = -0.0001; state.sunLight.shadow.normalBias = 0.02;
    state.scene.add(state.sunLight); state.scene.add(state.sunLight.target);

    await loadTerrain();
    initVegetationResources();
    updateSunPosition(720); updateUIZoom(state.ZOOM);

    const clock = new THREE.Clock();
    window.addEventListener('resize', onWindowResize);
    let frameCount = 0;

    state.renderer.setAnimationLoop(() => {
        if (!state.renderer || !state.scene || !state.camera) return;
        state.stats.begin();
        frameCount++;
        const delta = clock.getDelta();
        animateTiles(delta);

        // --- COMPORTEMENT CAMÉRA PRO (v4.3.54) ---
        if (state.controls && state.camera) {
            const dist = state.camera.position.distanceTo(state.controls.target);
            
            // 1. DÉFINITION DE LA PARABOLE (Garde-fous dynamiques)
            // On calcule un facteur de hauteur (0 au sol, 1 dans l'espace)
            const hFactor = THREE.MathUtils.clamp((dist - 2000) / 200000, 0, 1);
            
            // La limite d'inclinaison baisse paraboliquement avec la hauteur
            // On augmente la liberté sur les LOD moyens (v4.3.57)
            let hardMaxTilt = THREE.MathUtils.lerp(1.2, 0.05, Math.pow(hFactor, 0.5));
            
            if (state.ZOOM <= 8) hardMaxTilt = 0.05; 
            else if (state.ZOOM <= 11) hardMaxTilt = Math.max(hardMaxTilt, 0.4);
            else if (state.ZOOM <= 13) hardMaxTilt = Math.max(hardMaxTilt, 0.8); // + de liberté au LOD 12-13
            else if (state.ZOOM >= 16) hardMaxTilt = Math.min(hardMaxTilt, 0.85);

            // 2. COURBE DE TILT IDÉALE (Cible de guidage)
            // On suit une courbe légèrement plus ouverte
            const targetTilt = THREE.MathUtils.lerp(1.1, 0.05, Math.pow(hFactor, 0.6));

            // 3. GUIDAGE ÉLASTIQUE ET BRIDAGE (60fps)
            const currentTilt = state.controls.getPolarAngle();
            
            // On laisse l'utilisateur pivoter librement SOUS le garde-fou,
            // mais on applique une force de rappel pendant le zoom.
            if (Math.abs(currentTilt - targetTilt) > 0.01) {
                const speed = 0.05; 
                state.controls.maxPolarAngle = THREE.MathUtils.lerp(currentTilt, hardMaxTilt, speed);
                state.controls.minPolarAngle = 0;
            } else {
                state.controls.maxPolarAngle = hardMaxTilt;
                state.controls.minPolarAngle = 0;
            }
            state.controls.update();
        }

        if (state.isAnimating) {
            const slider = document.getElementById('time-slider') as HTMLInputElement;
            if (slider) {
                let mins = (parseInt(slider.value) + state.animationSpeed) % 1440;
                slider.value = Math.floor(mins).toString(); updateSunPosition(mins);
            }
        }

        // Collision sol (v4.3.51 - Smooth)
        if (frameCount % 2 === 0 && state.camera && state.controls) {
            const groundH = getAltitudeAt(state.camera.position.x, state.camera.position.z);
            const minH = groundH + 30;
            if (state.camera.position.y < minH) {
                // Interpolation douce pour éviter les sauts brutaux
                state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, minH, 0.1);
                if (state.controls.target.y < groundH) {
                    state.controls.target.y = THREE.MathUtils.lerp(state.controls.target.y, groundH, 0.1);
                }
            }
        }

        if (state.renderer) state.renderer.shadowMap.autoUpdate = false;
        
        // Brouillard proportionnel
        if (state.scene.fog instanceof THREE.Fog) {
            const alt = state.camera.position.y;
            state.scene.fog.near = alt * (state.FOG_NEAR / 5000);
            state.scene.fog.far = alt * (state.FOG_FAR / 5000);
        }

        state.renderer.render(state.scene, state.camera);

        if (compassObject && state.camera && compassRenderer) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion);
            compassCamera.position.copy(forward).multiplyScalar(-18);
            compassCamera.quaternion.copy(state.camera.quaternion);
            compassRenderer.render(compassScene, compassCamera);
        }
        state.stats.end();
    });
}

function onWindowResize(): void {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
