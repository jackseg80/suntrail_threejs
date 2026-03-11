import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { state } from './state.js';
import { updateSunPosition } from './sun.js';
import { loadTerrain, updateVisibleTiles, lngLatToTile, worldToLngLat, resetTerrain, EARTH_CIRCUMFERENCE } from './terrain.js';
import { updateGPXMesh } from './ui.js';
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
        const dist = state.camera.position.y;

        let newZoom = state.ZOOM;
        if (dist < 10000) newZoom = 14;
        else if (dist < 25000) newZoom = 13;
        else newZoom = 12;

        if (newZoom !== state.ZOOM) {
            console.log(`Auto-Zoom: Switching to ${newZoom}`);
            
            // --- LOGIQUE DE COMPENSATION D'ORIGINE (Zéro Saut) ---
            const gpsCenter = worldToLngLat(dx, dz);
            
            // 1. Sauvegarde de l'ancienne origine normalisée
            const oldOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
            const oldOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            
            state.ZOOM = newZoom;
            state.originTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, newZoom);
            
            // 2. Nouvelle origine normalisée
            const newOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
            const newOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            
            // 3. Calcul du décalage physique en mètres
            const offsetX = (oldOriginX - newOriginX) * EARTH_CIRCUMFERENCE;
            const offsetZ = (oldOriginZ - newOriginZ) * EARTH_CIRCUMFERENCE;
            
            // 4. On déplace la caméra et sa cible de la même distance
            state.camera.position.x += offsetX;
            state.camera.position.z += offsetZ;
            state.controls.target.x += offsetX;
            state.controls.target.z += offsetZ;
            state.controls.update();

            resetTerrain();
            if (state.rawGpxData) updateGPXMesh(); 
            
            const indicator = document.getElementById('zoom-indicator');
            if (indicator) indicator.textContent = `SWISSTOPO: Lvl ${newZoom}`;
        } else {
            // Même sans changement de zoom, on rafraîchit l'épaisseur GPX si nécessaire
            if (state.rawGpxData) updateGPXMesh(); 
        }

        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, state.controls.target.x, state.controls.target.z);
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

    const indicator = document.getElementById('zoom-indicator');
    if (indicator) indicator.textContent = `SWISSTOPO: Lvl ${state.ZOOM}`;

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
