import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
// @ts-ignore
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { state } from './state';
import { updateSunPosition } from './sun';
import { loadTerrain, updateVisibleTiles, lngLatToTile, worldToLngLat, repositionAllTiles, animateTiles, EARTH_CIRCUMFERENCE, updateGPXMesh, resetTerrain, clearCache } from './terrain';
import { autoSelectMapSource } from './ui';
import { throttle, isMobileDevice } from './utils';

// --- BOUSSOLE 3D NATIVE SECONDAIRE (v3.8.3) ---
let compassScene: THREE.Scene;
let compassCamera: THREE.PerspectiveCamera;
let compassRenderer: THREE.WebGLRenderer;
let compassObject: THREE.Group;

function initCompass() {
    const canvas = document.getElementById('compass-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    compassScene = new THREE.Scene();
    compassCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    compassCamera.position.set(0, 0, 18); // Recul augmenté de 12 à 18 (v3.8.3)

    compassRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    compassRenderer.setSize(120, 120);
    compassRenderer.setPixelRatio(window.devicePixelRatio);

    compassObject = new THREE.Group();

    // Aiguille Nord (Rouge Fluo)
    const geoNorth = new THREE.ConeGeometry(1, 2.5, 16);
    const matNorth = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const north = new THREE.Mesh(geoNorth, matNorth);
    north.position.y = 1.25;
    compassObject.add(north);

    // Aiguille Sud (Blanc)
    const geoSouth = new THREE.ConeGeometry(1, 2.5, 16);
    const matSouth = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const south = new THREE.Mesh(geoSouth, matSouth);
    south.position.y = -1.25;
    south.rotation.x = Math.PI;
    compassObject.add(south);

    // Anneau de base
    const geoRing = new THREE.TorusGeometry(3.2, 0.05, 8, 64);
    const matRing = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(geoRing, matRing);
    ring.rotation.x = Math.PI / 2;
    compassObject.add(ring);

    // --- POINTS CARDINAUX AVEC CONTOUR ---
    const createLetter = (text: string, color: string, pos: THREE.Vector3) => {
        const ctxCanvas = document.createElement('canvas');
        ctxCanvas.width = 128; ctxCanvas.height = 128;
        const ctx = ctxCanvas.getContext('2d');
        if (ctx) {
            ctx.font = 'Bold 90px DM Sans, Arial';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000000'; ctx.lineWidth = 14; ctx.strokeText(text, 64, 64);
            ctx.fillStyle = color; ctx.fillText(text, 64, 64);
        }
        const tex = new THREE.CanvasTexture(ctxCanvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        sprite.position.copy(pos);
        sprite.scale.set(3, 3, 1);
        compassObject.add(sprite);
    };

    createLetter('N', '#ff3333', new THREE.Vector3(0, 5.2, 0));
    createLetter('S', '#ffffff', new THREE.Vector3(0, -5.2, 0));
    createLetter('E', '#bbbbbb', new THREE.Vector3(5.2, 0, 0));
    createLetter('O', '#bbbbbb', new THREE.Vector3(-5.2, 0, 0));

    compassScene.add(compassObject);
    compassScene.add(new THREE.AmbientLight(0xffffff, 1.5));
}

export async function disposeScene(): Promise<void> {
    resetTerrain();
    clearCache();
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
    state.scene.fog = new THREE.FogExp2(0x87CEEB, state.FOG_DENSITY); 

    state.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, alpha: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    state.renderer.toneMapping = THREE.AgXToneMapping;
    container.appendChild(state.renderer.domElement);

    state.stats = new Stats();
    state.stats.showPanel(0);
    const vramPanel = state.stats.addPanel(new Stats.Panel('GPU', '#ff8', '#221'));
    state.vramPanel = vramPanel;
    state.stats.showPanel(3);
    
    container.appendChild(state.stats.dom);
    state.stats.dom.style.top = '20px'; state.stats.dom.style.left = '80px';
    state.stats.dom.style.bottom = 'auto'; state.stats.dom.style.right = 'auto';

    initCompass();

    const sky = new Sky();
    sky.scale.setScalar(450000);
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 150000);
    state.camera.position.set(0, 12000, 15000); 

    const mobile = isMobileDevice();
    state.controls = mobile ? new OrbitControls(state.camera, state.renderer.domElement) : new MapControls(state.camera, state.renderer.domElement);
    if (mobile) (state.controls as OrbitControls).enablePan = true;

    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.minDistance = 500; 
    state.controls.maxDistance = 150000; 
    state.controls.maxPolarAngle = 1.3; 

    const updateUIZoom = (zoom: number) => {
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) indicator.textContent = `${state.MAP_SOURCE.toUpperCase()}: Lvl ${zoom}`;
    };

    let lastRecenterTime = 0;
    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;
        const dx = state.controls.target.x, dz = state.controls.target.z, dist = state.camera.position.y;
        let newZoom = state.ZOOM;
        if (state.ZOOM === 13) { if (dist < 2500) newZoom = 14; else if (dist > 18000) newZoom = 12; }
        else if (state.ZOOM === 14) { if (dist > 3500) newZoom = 13; }
        else if (state.ZOOM === 12) { if (dist < 15000) newZoom = 13; else if (dist > 55000) newZoom = 11; }
        else if (state.ZOOM === 11) { if (dist < 45000) newZoom = 12; }

        const gpsCenter = worldToLngLat(dx, dz);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        if ((Math.sqrt(dx*dx + dz*dz) > 20000 || newZoom !== state.ZOOM) && (Date.now() - lastRecenterTime > 3000)) {
            lastRecenterTime = Date.now();
            const oldOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM), oldOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            state.ZOOM = newZoom;
            state.originTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, newZoom);
            const newOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM), newOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            const offsetX = (oldOriginX - newOriginX) * EARTH_CIRCUMFERENCE, offsetZ = (oldOriginZ - newOriginZ) * EARTH_CIRCUMFERENCE;
            state.camera.position.x += offsetX; state.camera.position.z += offsetZ;
            state.controls.target.x += offsetX; state.controls.target.z += offsetZ;
            state.controls.update(); repositionAllTiles();
            if (state.rawGpxData) updateGPXMesh();
            updateUIZoom(newZoom);
        } else {
            updateUIZoom(state.ZOOM);
        }
        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, state.controls.target.x, state.controls.target.z);
        const lat = gpsCenter.lat.toFixed(5), lon = gpsCenter.lon.toFixed(5), zoom = state.ZOOM;
        const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
        window.history.replaceState(null, '', `#lat=${lat}&lon=${lon}&z=${zoom}&t=${timeSlider?.value || 720}`);
    }, 200);
    
    state.controls.addEventListener('change', throttledUpdate);

    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); state.scene.add(state.ambientLight);
    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    state.sunLight.shadow.mapSize.set(4096, 4096);
    const d = 40000; 
    state.sunLight.shadow.camera.left = -d; state.sunLight.shadow.camera.right = d; state.sunLight.shadow.camera.top = d; state.sunLight.shadow.camera.bottom = -d;
    state.sunLight.shadow.bias = -0.0001; 
    state.scene.add(state.sunLight); state.scene.add(state.sunLight.target); 

    await loadTerrain();
    updateSunPosition(720); updateUIZoom(state.ZOOM);

    const clock = new THREE.Clock();
    window.addEventListener('resize', onWindowResize);
    state.renderer.setAnimationLoop(() => {
        if (!state.renderer || !state.scene || !state.camera) return;
        state.stats.begin();
        const delta = clock.getDelta();
        animateTiles(delta);

        if (state.isFollowingTrail && state.gpxPoints.length > 1) {
            state.trailProgress += 0.0005; if (state.trailProgress > 1) state.trailProgress = 0;
            const curve = new THREE.CatmullRomCurve3(state.gpxPoints);
            const pos = curve.getPoint(state.trailProgress), lookAt = curve.getPoint(Math.min(1, state.trailProgress + 0.01));
            state.camera.position.set(pos.x, pos.y + 100, pos.z + 200); state.camera.lookAt(lookAt.x, lookAt.y + 50, lookAt.z);
        } else if (state.controls) {
            state.controls.update();
        }

        if (state.isAnimating) {
            const slider = document.getElementById('time-slider') as HTMLInputElement;
            if (slider) {
                let currentMins = (parseInt(slider.value) + state.animationSpeed) % 1440;
                slider.value = Math.floor(currentMins).toString(); updateSunPosition(currentMins);
            }
        }

        // --- RENDU SCÈNE PRINCIPALE ---
        state.renderer.render(state.scene, state.camera);

        // --- RENDU BOUSSOLE 3D (Second Renderer) ---
        if (compassObject && state.camera && compassRenderer) {
            compassObject.quaternion.copy(state.camera.quaternion);
            compassRenderer.render(compassScene, compassCamera);
        }

        if (state.vramPanel) {
            const textures = state.renderer.info.memory.textures;
            const geometries = state.renderer.info.memory.geometries;
            state.vramPanel.update(textures + geometries, 200); 
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
