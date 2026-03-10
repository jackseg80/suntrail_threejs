import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { state } from './state.js';
import { updateSunPosition } from './sun.js';
import { loadTerrain, updateVisibleTiles, lngLatToTile, worldToLngLat } from './terrain.js';
import { throttle } from './utils.js';

export async function initScene() {
    const container = document.getElementById('canvas-container');
    container.innerHTML = '';
    
    state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, state.ZOOM);
    
    state.scene = new THREE.Scene();
    state.scene.fog = new THREE.FogExp2(0x87CEEB, state.FOG_DENSITY); 

    state.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    state.renderer.toneMapping = THREE.AgXToneMapping;
    state.renderer.toneMappingExposure = 1.0; 
    container.appendChild(state.renderer.domElement);

    const sky = new Sky();
    sky.scale.setScalar(450000);
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 2000000);
    state.camera.position.set(0, 8000, 12000); 

    state.controls = new MapControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    state.controls.screenSpacePanning = false; 
    state.controls.minDistance = 500; 
    state.controls.maxDistance = 60000; 

    const throttledUpdate = throttle(() => {
        const dx = state.controls.target.x;
        const dz = state.controls.target.z;

        // SYNCHRONISATION GPS 100% PRÉCISE
        const gps = worldToLngLat(dx, dz);
        state.TARGET_LON = gps.lon;
        state.TARGET_LAT = gps.lat;

        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, state.controls.getDistance(), dx, dz);
    }, 200);
    
    state.controls.addEventListener('change', throttledUpdate);

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
        if (state.isFollowingTrail && state.gpxPoints.length > 1) {
            state.trailProgress += 0.0005;
            if (state.trailProgress > 1) state.trailProgress = 0;
            const curve = new THREE.CatmullRomCurve3(state.gpxPoints);
            const pos = curve.getPoint(state.trailProgress);
            const lookAt = curve.getPoint(Math.min(1, state.trailProgress + 0.01));
            state.camera.position.set(pos.x, pos.y + 100, pos.z + 200);
            state.camera.lookAt(lookAt.x, lookAt.y + 50, lookAt.z);
        } else {
            state.controls.update();
        }

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
