import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { state } from './state';
import { EARTH_CIRCUMFERENCE } from './geo';

/**
 * Initialise l'ambiance 3D : Ciel, Brouillard et Lumières.
 * v5.40.21 : Correction de l'ajout de la lumière solaire à la scène.
 */
export function initEnvironment(scene: THREE.Scene): void {
    // 1. Fog (Brouillard)
    scene.fog = new THREE.Fog(0x87CEEB, state.FOG_NEAR, state.FOG_FAR);

    // 2. Sky (Ciel)
    const sky = new Sky();
    sky.scale.setScalar(10000000);
    scene.add(sky);
    state.sky = sky;

    // 3. Lights (Lumières)
    // Lumière ambiante pour déboucher les ombres
    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); 
    scene.add(state.ambientLight);

    // Lumière directionnelle (Soleil)
    const sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    sunLight.castShadow = state.SHADOWS;
    
    // Configuration des ombres (v5.31.1)
    sunLight.shadow.mapSize.set(state.SHADOW_RES, state.SHADOW_RES);
    sunLight.shadow.camera.left = -2500;
    sunLight.shadow.camera.right = 2500;
    sunLight.shadow.camera.top = 2500;
    sunLight.shadow.camera.bottom = -2500;
    sunLight.shadow.camera.near = 100;
    sunLight.shadow.camera.far = 200000;

    // Biais pour éviter l'acné de surface (v5.32.22)
    const isMobile = window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
    if (isMobile) {
        sunLight.shadow.bias = -0.0005; 
        sunLight.shadow.normalBias = 0.02; 
    } else {
        sunLight.shadow.bias = -0.0001; 
        sunLight.shadow.normalBias = 0.01;
    }

    scene.add(sunLight);
    scene.add(sunLight.target); // IMPORTANT : La cible doit être dans la scène
    state.sunLight = sunLight;
}

/**
 * Ajuste le brouillard dynamiquement selon l'altitude pour un rendu naturel (v5.31.1)
 */
export function updateEnvironment(alt: number): void {
    if (state.scene && state.scene.fog instanceof THREE.Fog) {
        const fogNear = Math.max(state.FOG_NEAR * 0.3, state.FOG_NEAR - alt * 0.3);
        const fogFar = state.FOG_FAR + alt * 4.0;
        state.scene.fog.near = fogNear;
        state.scene.fog.far = fogFar;
    }
}

/**
 * Crée un plan de sol infini pour cacher le vide sous l'horizon.
 */
export function createGroundPlane(): THREE.Mesh {
    const groundGeo = new THREE.PlaneGeometry(EARTH_CIRCUMFERENCE * 2, EARTH_CIRCUMFERENCE * 2);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e, fog: true, depthWrite: false });
    const mesh = new THREE.Mesh(groundGeo, groundMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -200; 
    mesh.renderOrder = -5;
    mesh.frustumCulled = false;
    return mesh;
}
