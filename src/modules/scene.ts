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

export async function disposeScene(): Promise<void> {
    resetTerrain(); // Supprime les tuiles et labels de la scène
    clearCache();   // Libère les textures du cache mémoire GPU

    if (state.renderer) {
        state.renderer.setAnimationLoop(null);
        state.renderer.dispose();
    }
    
    if (state.scene) {
        state.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });
        state.scene.clear();
    }
    
    if (state.stats && state.stats.dom && state.stats.dom.parentNode) {
        state.stats.dom.parentNode.removeChild(state.stats.dom);
    }
    
    window.removeEventListener('resize', onWindowResize);
}

export async function initScene(): Promise<void> {
    await disposeScene(); // Nettoyage de l'ancienne scène avant l'initialisation

    const container = document.getElementById('canvas-container');
    if (!container) return;
    container.innerHTML = '';
    
    state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, state.ZOOM);
    
    state.scene = new THREE.Scene();
    state.scene.fog = new THREE.FogExp2(0x87CEEB, state.FOG_DENSITY); 

    state.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    
    const gl = state.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "Inconnu";
    console.log("%c GPU UTILISÉ : " + gpuName, "background: #222; color: #ff00ff; font-weight: bold; padding: 5px;");

    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    state.renderer.toneMapping = THREE.AgXToneMapping;
    state.renderer.toneMappingExposure = 1.0; 
    container.appendChild(state.renderer.domElement);

    state.stats = new Stats();
    state.stats.showPanel(0);
    container.appendChild(state.stats.dom);
    state.stats.dom.style.position = 'fixed';
    state.stats.dom.style.top = 'auto';
    state.stats.dom.style.bottom = '160px'; 
    state.stats.dom.style.right = '20px';
    state.stats.dom.style.left = 'auto';
    state.stats.dom.style.zIndex = '10000';

    const vramPanel = state.stats.addPanel(new Stats.Panel('GPU', '#ff8', '#221'));
    state.vramPanel = vramPanel;

    const sky = new Sky();
    sky.scale.setScalar(450000);
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 150000);
    state.camera.position.set(0, 12000, 15000); 

    const mobile = isMobileDevice();
    if (mobile) {
        state.controls = new OrbitControls(state.camera, state.renderer.domElement);
        (state.controls as OrbitControls).enablePan = true;
    } else {
        state.controls = new MapControls(state.camera, state.renderer.domElement);
    }

    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.screenSpacePanning = false; 
    state.controls.minDistance = 500; 
    state.controls.maxDistance = 150000; 

    state.controls.maxPolarAngle = 1.3; 
    state.controls.minPolarAngle = 0; 

    const updateUIZoom = (zoom: number) => {
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) {
            const sourceName = state.MAP_SOURCE.toUpperCase();
            indicator.textContent = `${sourceName}: Lvl ${zoom}`;
        }
    };

    let lastRecenterTime = 0;
    let lastGpxPos = new THREE.Vector3();

    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;

        const dx = state.controls.target.x;
        const dz = state.controls.target.z;
        const dist = state.camera.position.y;

        let newZoom = state.ZOOM;
        if (state.ZOOM === 13) {
            if (dist < 6000) newZoom = 14;
            else if (dist > 30000) newZoom = 12;
        } else if (state.ZOOM === 14) {
            if (dist > 8000) newZoom = 13;
        } else if (state.ZOOM === 12) {
            if (dist < 25000) newZoom = 13;
        }

        const gpsCenter = worldToLngLat(dx, dz);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        const distFromCenter = Math.sqrt(dx * dx + dz * dz);
        const now = Date.now();
        const shouldRecentre = (distFromCenter > 20000 || newZoom !== state.ZOOM) && (now - lastRecenterTime > 3000);

        if (shouldRecentre) {
            lastRecenterTime = now;
            const oldOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
            const oldOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            state.ZOOM = newZoom;
            state.originTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, newZoom);
            const newOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM);
            const newOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            const offsetX = (oldOriginX - newOriginX) * EARTH_CIRCUMFERENCE;
            const offsetZ = (oldOriginZ - newOriginZ) * EARTH_CIRCUMFERENCE;
            state.camera.position.x += offsetX;
            state.camera.position.z += offsetZ;
            state.controls.target.x += offsetX;
            state.controls.target.z += offsetZ;
            state.controls.update();
            repositionAllTiles();
            if (state.rawGpxData) updateGPXMesh(); 
            updateUIZoom(newZoom);
        } else {
            const currentPos = new THREE.Vector3(dx, 0, dz);
            if (state.rawGpxData && currentPos.distanceTo(lastGpxPos) > 50) {
                updateGPXMesh(); 
                lastGpxPos.copy(currentPos);
            }
            updateUIZoom(state.ZOOM);
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
    const d = 40000; 
    state.sunLight.shadow.camera.left = -d;
    state.sunLight.shadow.camera.right = d;
    state.sunLight.shadow.camera.top = d;
    state.sunLight.shadow.camera.bottom = -d;
    state.sunLight.shadow.camera.near = 1000;
    state.sunLight.shadow.camera.far = 300000; 
    state.sunLight.shadow.bias = -0.0001; 
    state.scene.add(state.sunLight);
    state.scene.add(state.sunLight.target); 

    await loadTerrain();
    updateSunPosition(720); 
    updateUIZoom(state.ZOOM);

    const clock = new THREE.Clock();

    window.addEventListener('resize', onWindowResize);
    state.renderer.setAnimationLoop(() => {
        if (!state.renderer || !state.scene || !state.camera) return;

        state.stats.begin();
        const delta = clock.getDelta();
        animateTiles(delta);

        if (state.isFollowingTrail && state.gpxPoints.length > 1) {
            state.trailProgress += 0.0005;
            if (state.trailProgress > 1) state.trailProgress = 0;
            const curve = new THREE.CatmullRomCurve3(state.gpxPoints);
            const pos = curve.getPoint(state.trailProgress);
            const lookAt = curve.getPoint(Math.min(1, state.trailProgress + 0.01));
            state.camera.position.set(pos.x, pos.y + 100, pos.z + 200);
            state.camera.lookAt(lookAt.x, lookAt.y + 50, lookAt.z);
        } else if (state.controls) {
            state.controls.update();
        }

        if (state.isAnimating) {
            const slider = document.getElementById('time-slider') as HTMLInputElement;
            if (slider) {
                let currentMins = parseInt(slider.value);
                if (isNaN(currentMins)) currentMins = 720;
                currentMins = (currentMins + state.animationSpeed) % 1440;
                slider.value = Math.floor(currentMins).toString();
                updateSunPosition(currentMins);
            }
        }

        if (state.camera && state.controls) {
            const disk = document.getElementById('compass-disk');
            if (disk) {
                const angle = state.controls.getAzimuthalAngle();
                disk.style.transform = `rotate(${angle * (180 / Math.PI)}deg)`;
            }
        }
        state.renderer.render(state.scene, state.camera);

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
