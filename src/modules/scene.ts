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
import { throttle, isMobileDevice } from './utils';

import { initVegetationResources } from './vegetation';

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
    compassCamera.position.set(0, 0, 18);

    compassRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    compassRenderer.setPixelRatio(window.devicePixelRatio);
    compassRenderer.setSize(120, 120);

    compassObject = new THREE.Group();

    // Aiguille Nord (Rouge Fluo) - Pointe vers -Z (Nord Monde)
    const geoNorth = new THREE.ConeGeometry(1, 2.5, 16);
    const matNorth = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const north = new THREE.Mesh(geoNorth, matNorth);
    north.rotation.x = -Math.PI / 2;
    north.position.z = -1.25;
    compassObject.add(north);

    // Aiguille Sud (Blanc) - Pointe vers +Z (Sud Monde)
    const geoSouth = new THREE.ConeGeometry(1, 2.5, 16);
    const matSouth = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const south = new THREE.Mesh(geoSouth, matSouth);
    south.rotation.x = Math.PI / 2;
    south.position.z = 1.25;
    compassObject.add(south);

    // Anneau de base (Horizontal XZ)
    const geoRing = new THREE.TorusGeometry(3.2, 0.1, 8, 64);
    const matRing = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
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
            ctx.strokeStyle = '#000000'; ctx.lineWidth = 16; ctx.strokeText(text, 64, 64);
            ctx.fillStyle = color; ctx.fillText(text, 64, 64);
        }
        const tex = new THREE.CanvasTexture(ctxCanvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        sprite.position.copy(pos);
        sprite.scale.set(3, 3, 1);
        compassObject.add(sprite);
    };

    // Alignement Monde: N=-Z, S=+Z, E=+X, O=-X
    createLetter('N', '#ff3333', new THREE.Vector3(0, 0, -5.2));
    createLetter('S', '#ffffff', new THREE.Vector3(0, 0, 5.2));
    createLetter('E', '#ffffff', new THREE.Vector3(5.2, 0, 0));
    createLetter('O', '#ffffff', new THREE.Vector3(-5.2, 0, 0));

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
    state.scene.fog = new THREE.Fog(0x87CEEB, state.FOG_NEAR, state.FOG_FAR); 

    state.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, alpha: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    state.renderer.toneMapping = THREE.AgXToneMapping;
    container.appendChild(state.renderer.domElement);

    const mobile = isMobileDevice();

    state.stats = new Stats();
    state.stats.showPanel(0);
    const vramPanel = state.stats.addPanel(new Stats.Panel('GPU', '#ff8', '#221'));
    state.vramPanel = vramPanel;
    state.stats.showPanel(3);
    
    container.appendChild(state.stats.dom);
    state.stats.dom.style.top = mobile ? '80px' : '20px'; 
    state.stats.dom.style.left = mobile ? '20px' : '80px';
    state.stats.dom.style.bottom = 'auto'; state.stats.dom.style.right = 'auto';
    state.stats.dom.style.display = state.SHOW_STATS ? 'block' : 'none';

    initCompass();

    const sky = new Sky();
    sky.scale.setScalar(1000000); // Augmenté pour supporter la haute altitude
    state.scene.add(sky);
    state.sky = sky;

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 1000000); // Far à 1000km
    state.camera.position.set(0, 12000, 15000); 

    // --- CONTRÔLES STYLE MAPS (v4.2.5) ---
    const controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls = controls;
    controls.target.set(0, 0, 0); 
    controls.update();

    controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
    };

    controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE
    };

    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = false;
    controls.minDistance = 500; 
    controls.maxDistance = 500000; // Augmenté à 500km selon votre demande
    controls.maxPolarAngle = 1.2; 


    // ... (rest of the UI helpers)
    const updateUIZoom = (zoom: number) => {
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) indicator.textContent = `${state.MAP_SOURCE.toUpperCase()}: Lvl ${zoom}`;
    };

    let lastRecenterTime = 0;
    const throttledUpdate = throttle(() => {
        if (!state.controls || !state.camera) return;
        const dx = state.controls.target.x, dz = state.controls.target.z, dist = state.camera.position.y;
        let newZoom = state.ZOOM;
        // --- SEUILS DE ZOOM ADAPTATIFS PAR SOURCE (v4.3.18) ---
        const isSat = (state.MAP_SOURCE === 'satellite');
        const boost = isSat ? 2.0 : 1.2; // Boost légèrement réduit car on augmente les seuils de base

        if (state.ZOOM === 13) { 
            if (dist < 20000) newZoom = 14; 
            else if (dist > 45000) newZoom = 12; 
        }
        else if (state.ZOOM === 14) { 
            if (dist > 25000) newZoom = 13; 
            else if (dist < 8000 * boost) newZoom = 15; 
        }
        else if (state.ZOOM === 15) {
            if (dist > 11000 * boost) newZoom = 14;
            else if (dist < 3500 * boost) newZoom = 16; 
        }
        else if (state.ZOOM === 16) {
            if (dist > 5000 * boost) newZoom = 15;
            else if (dist < 1500 * boost) newZoom = 17; 
        }
        else if (state.ZOOM === 17) {
            if (dist > 2200 * boost) newZoom = 16;
            else if (dist < 600 * boost) newZoom = 18; 
        }
        else if (state.ZOOM === 18) {
            if (dist > 900 * boost) newZoom = 17;
        }
        else if (state.ZOOM === 12) { 
            if (dist < 35000) newZoom = 13; 
            else if (dist > 85000) newZoom = 11; 
        }
        else if (state.ZOOM === 11) { 
            if (dist < 65000) newZoom = 12; 
            else if (dist > 150000) newZoom = 10; 
        }
        else if (state.ZOOM === 10) {
            if (dist < 120000) newZoom = 11;
            else if (dist > 280000) newZoom = 9;
        }
        else if (state.ZOOM === 9) {
            if (dist < 220000) newZoom = 10;
            else if (dist > 450000) newZoom = 8;
        }
        else if (state.ZOOM === 8) {
            if (dist < 380000) newZoom = 9;
            else if (dist > 800000) newZoom = 7;
        }
        else if (state.ZOOM === 7) {
            if (dist < 450000) newZoom = 8;
            else if (dist > 1200000) newZoom = 6;
        }
        else if (state.ZOOM <= 6) {
            if (dist < 900000) newZoom = 7;
        }
        const gpsCenter = worldToLngLat(dx, dz, state.originTile);
        autoSelectMapSource(gpsCenter.lat, gpsCenter.lon);

        // --- BRIDAGE DYNAMIQUE 2D/3D (v4.3.34) ---
        if (state.controls) {
            if (state.ZOOM <= 8) {
                // Vue 2D forcée en haute altitude (Space View)
                state.controls.maxPolarAngle = 0.05; 
            } else if (state.ZOOM >= 16) {
                // Protection détail au sol
                state.controls.maxPolarAngle = 0.8; 
            } else {
                // Transition fluide : Zoom 9 (0.1 rad) -> Zoom 14 (1.2 rad)
                const zoomFactor = THREE.MathUtils.mapLinear(state.ZOOM, 9, 14, 0.1, 1.2);
                state.controls.maxPolarAngle = THREE.MathUtils.clamp(zoomFactor, 0.05, 1.2);
            }
        }

        // --- MISE À JOUR IMMÉDIATE DU ZOOM (v4.3.32) ---
        if (newZoom !== state.ZOOM) {
            state.ZOOM = newZoom;
            updateUIZoom(newZoom);
        }

        // --- RE-CENTRAGE DU MONDE (Origin Shift) ---
        // On ne re-centre QUE à basse/moyenne altitude (v4.3.39)
        // À haute altitude (Zoom < 12), le re-centrage cause des instabilités et des écrans noirs.
        if (state.ZOOM >= 12 && (Math.sqrt(dx*dx + dz*dz) > 20000 || newZoom !== state.ZOOM) && (Date.now() - lastRecenterTime > 3000)) {
            lastRecenterTime = Date.now();
            const oldOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM), oldOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
            const newTile = lngLatToTile(gpsCenter.lon, gpsCenter.lat, state.ZOOM);
            
            // Sécurité anti-NaN/aberration
            if (!isNaN(newTile.x) && !isNaN(newTile.y)) {
                state.originTile = newTile;
                const newOriginX = (state.originTile.x + 0.5) / Math.pow(2, state.ZOOM), newOriginZ = (state.originTile.y + 0.5) / Math.pow(2, state.ZOOM);
                const offsetX = (oldOriginX - newOriginX) * EARTH_CIRCUMFERENCE, offsetZ = (oldOriginZ - newOriginZ) * EARTH_CIRCUMFERENCE;
                
                if (!isNaN(offsetX) && !isNaN(offsetZ)) {
                    state.camera.position.x += offsetX; state.camera.position.z += offsetZ;
                    state.controls.target.x += offsetX; state.controls.target.z += offsetZ;
                    state.controls.update(); repositionAllTiles();
                    if (state.rawGpxData) updateGPXMesh();
                }
            }
        }

        if (state.scene && state.scene.fog && state.scene.fog instanceof THREE.Fog) {
            state.scene.fog.near = dist * (state.FOG_NEAR / 5000); 
            state.scene.fog.far = dist * (state.FOG_FAR / 5000);
        }

        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, dist, state.controls.target.x, state.controls.target.z);
        const lat = gpsCenter.lat.toFixed(5), lon = gpsCenter.lon.toFixed(5), zoom = state.ZOOM;
        const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
        window.history.replaceState(null, '', `#lat=${lat}&lon=${lon}&z=${zoom}&t=${timeSlider?.value || 720}`);
    }, 200);
    
    if (state.controls) {
        state.controls.addEventListener('change', throttledUpdate);
    }

    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); state.scene.add(state.ambientLight);
    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    state.sunLight.castShadow = state.SHADOWS;
    state.sunLight.shadow.mapSize.set(state.SHADOW_RES, state.SHADOW_RES);
    
    // Rayon de couverture optimal (v4.3.23)
    const d = 25000; // Plus petit = plus net
    state.sunLight.shadow.camera.left = -d; 
    state.sunLight.shadow.camera.right = d; 
    state.sunLight.shadow.camera.top = d; 
    state.sunLight.shadow.camera.bottom = -d;
    
    state.sunLight.shadow.camera.near = 1000;
    state.sunLight.shadow.camera.far = 500000;
    
    // Biais équilibrés pour le relief et les bâtiments
    state.sunLight.shadow.bias = -0.0001; 
    state.sunLight.shadow.normalBias = 0.02; 
    
    state.scene.add(state.sunLight); 
    state.scene.add(state.sunLight.target); 

    // PREMIER CALCUL DE TERRAIN IMMÉDIAT
    console.log(`[Scene] Initial Terrain Load (Alt: ${state.camera.position.y})`);
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

        // --- OPTIMISATION COLLISION SOL (v4.3.26) ---
        // On ne vérifie la collision que toutes les 2 frames pour économiser du CPU
        if (frameCount % 2 === 0 && state.camera && state.controls) {
            const groundH = getAltitudeAt(state.camera.position.x, state.camera.position.z);
            const minH = groundH + 30;
            if (state.camera.position.y < minH) {
                state.camera.position.y = minH;
                if (state.controls.target.y < groundH) state.controls.target.y = groundH;
            }
        }

        // --- OPTIMISATION DES OMBRES (v4.3.26) ---
        // Les ombres ne sont plus recalculées lors du mouvement de la caméra.
        // C'est updateSunPosition qui déclenchera une mise à jour unique si nécessaire.
        if (state.renderer) state.renderer.shadowMap.autoUpdate = false;

        // --- MISE À JOUR DYNAMIQUE DU BROUILLARD (v4.3.30) ---
        // Le voile s'adapte à l'altitude de la caméra pour garder une opacité constante au zoom
        if (state.scene && state.scene.fog && state.scene.fog instanceof THREE.Fog && state.camera) {
            const dist = state.camera.position.y;
            state.scene.fog.near = dist * (state.FOG_NEAR / 5000);
            state.scene.fog.far = dist * (state.FOG_FAR / 5000);
        }

        state.renderer.render(state.scene, state.camera);

        if (compassObject && state.camera && compassRenderer) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion);
            compassCamera.position.copy(forward).multiplyScalar(-18);
            compassCamera.quaternion.copy(state.camera.quaternion);
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
