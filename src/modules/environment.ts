import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { state } from './state';

export function initEnvironment(scene: THREE.Scene): void {
    // 1. Fog
    scene.fog = new THREE.Fog(0x87CEEB, state.FOG_NEAR, state.FOG_FAR);

    // 2. Sky
    const sky = new Sky();
    sky.scale.setScalar(10000000);
    scene.add(sky);
    state.sky = sky;

    // 3. Lights
    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.2); 
    scene.add(state.ambientLight);

    state.sunLight = new THREE.DirectionalLight(0xffffff, 6.0);
    // Note: sun position is managed by sun.ts/updateSunPosition
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

export function createGroundPlane(): THREE.Mesh {
    const groundGeo = new THREE.PlaneGeometry(EARTH_CIRCUMFERENCE * 2, EARTH_CIRCUMFERENCE * 2);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e, fog: true, depthWrite: false });
    const mesh = new THREE.Mesh(groundGeo, groundMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -100; // Légèrement sous le niveau de la mer
    mesh.renderOrder = -5;
    return mesh;
}

// Re-export constants if needed
import { EARTH_CIRCUMFERENCE } from './geo';
