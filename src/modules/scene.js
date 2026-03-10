import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { state } from './state.js';
import { updateSunPosition } from './sun.js';
import { loadTerrain, updateVisibleTiles, lngLatToTile } from './terrain.js';
import { throttle } from './utils.js';

export async function initScene() {
    const container = document.getElementById('canvas-container');
    container.innerHTML = '';
    
    state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, state.ZOOM);
    
    // 1. Scène et Brouillard
    state.scene = new THREE.Scene();
    state.scene.fog = new THREE.FogExp2(0x87CEEB, 0.00004); 

    // 2. Moteur de rendu
    state.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

    state.renderer.toneMapping = THREE.AgXToneMapping;
    state.renderer.toneMappingExposure = 1.0; 

    container.appendChild(state.renderer.domElement);

    // 3. CIEL ATMOSPHÉRIQUE
    const sky = new Sky();
    sky.scale.setScalar(450000);
    state.scene.add(sky);
    state.sky = sky; // On le stocke dans le state pour la mise à jour par le soleil

    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 10;
    skyUniforms['rayleigh'].value = 3;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.7;

    // 3. Caméra et Contrôles
    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 2000000);
    state.camera.position.set(0, 8000, 12000); 

    state.controls = new MapControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    state.controls.screenSpacePanning = false; 
    state.controls.minDistance = 500; 
    state.controls.maxDistance = 60000; 

    state.initialLat = state.TARGET_LAT;
    state.initialLon = state.TARGET_LON;

    const throttledUpdate = throttle(() => {
        const dx = state.controls.target.x;
        const dz = state.controls.target.z;
        const dLon = (dx / (111320 * Math.cos(state.initialLat * Math.PI / 180)));
        const dLat = -(dz / 111320); 
        state.TARGET_LON = state.initialLon + dLon;
        state.TARGET_LAT = state.initialLat + dLat;
        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, state.controls.getDistance(), dx, dz);
    }, 200);
    
    state.controls.addEventListener('change', throttledUpdate);

    // 4. Éclairage
    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    state.scene.add(state.ambientLight);

    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    
    state.sunLight.shadow.mapSize.width = 4096;
    state.sunLight.shadow.mapSize.height = 4096;
    const d = 20000; 
    state.sunLight.shadow.camera.left = -d;
    state.sunLight.shadow.camera.right = d;
    state.sunLight.shadow.camera.top = d;
    state.sunLight.shadow.camera.bottom = -d;
    state.sunLight.shadow.camera.near = 100;
    state.sunLight.shadow.camera.far = 100000;
    state.sunLight.shadow.bias = -0.0002;
    
    state.scene.add(state.sunLight);

    await loadTerrain();
    updateSunPosition(720); 

    window.addEventListener('resize', onWindowResize);
    state.renderer.setAnimationLoop(() => {
        state.controls.update();

        // ANIMATION DU TEMPS
        if (state.isAnimating) {
            const slider = document.getElementById('time-slider');
            let currentMins = parseInt(slider.value);
            currentMins = (currentMins + state.animationSpeed) % 1440;
            slider.value = currentMins;
            updateSunPosition(currentMins);
        }

        if (state.camera) {
            const disk = document.getElementById('compass-disk');
            if (disk) {
                const angle = state.controls.getAzimuthalAngle();
                disk.style.transform = `rotate(${angle * (180 / Math.PI)}deg)`;
            }
        }
        state.renderer.render(state.scene, state.camera);
    });
}

function onWindowResize() {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
