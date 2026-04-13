import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { state } from './state';
import { getAltitudeAt } from './analysis';

export function initCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 4000000);
    state.camera = camera;
    return camera;
}

export function initControls(camera: THREE.PerspectiveCamera, domElement: HTMLElement): MapControls {
    // v5.28.21 : Retour aux MapControls pour un feeling "Carte" (clic gauche = pan)
    const controls = new MapControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = false; // Important pour garder le pan sur le plan horizontal
    controls.minDistance = 100;
    controls.maxDistance = 4000000; // v5.28.21 : Augmenté pour permettre le dézoom LOD 6
    controls.maxPolarAngle = Math.PI / 2.1;
    
    // Position initiale : dézoom maximum (LOD 6)
    camera.position.set(0, 4000000, 3000000);
    controls.target.set(0, 0, 0);
    controls.update();
    
    state.controls = controls;
    return controls;
}

export function onWindowResize(): void {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/**
 * Zoom fluide vers un point précis (v5.28.26).
 * Utilisé principalement pour le double-tap.
 */
export function zoomToPoint(targetWorldX: number, targetWorldZ: number): void {
    if (!state.camera || !state.controls) return;
    
    const elevation = getAltitudeAt(targetWorldX, targetWorldZ);
    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    
    // Nouvelle distance : environ 1/4 de la distance actuelle (minimum 500m)
    const currentDist = startPos.distanceTo(startTarget);
    const targetDist = Math.max(500, currentDist / 4);
    
    // Direction actuelle de la caméra
    const dir = new THREE.Vector3().subVectors(startPos, startTarget).normalize();
    
    const endTarget = new THREE.Vector3(targetWorldX, elevation, targetWorldZ);
    const endPos = new THREE.Vector3().copy(endTarget).addScaledVector(dir, targetDist);

    const startTime = performance.now();
    const duration = 400; // Animation rapide pour le double-tap

    const animateZoom = (time: number) => {
        if (!state.camera || !state.controls) return;
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        const ease = 1 - Math.pow(1 - progress, 3); // Ease out cubic

        state.controls.target.lerpVectors(startTarget, endTarget, ease);
        state.camera.position.lerpVectors(startPos, endPos, ease);
        state.controls.update();

        if (progress < 1.0) requestAnimationFrame(animateZoom);
    };
    requestAnimationFrame(animateZoom);
}

/**
 * Vol cinématographique vers une destination world (v5.28.20).
 * Gère l'interruption du suivi GPS et l'animation parabolique.
 */
export function flyTo(
    targetWorldX: number, 
    targetWorldZ: number, 
    targetElevation: number = 0, 
    targetDistance: number = 12000, 
    flyDuration: number = 2500
): void {
    if (!state.camera || !state.controls) return;
    
    if (state.isFollowingUser) {
        state.isFollowingUser = false;
        const btn = document.getElementById('gps-main-btn');
        if (btn) btn.classList.remove('active', 'following');
    }

    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const endTarget = new THREE.Vector3(targetWorldX, targetElevation, targetWorldZ);

    const offsetZ = targetDistance * 0.8;
    const finalAlt = targetElevation + targetDistance;
    const endPos = new THREE.Vector3(targetWorldX, finalAlt, targetWorldZ + offsetZ);

    state.isFlyingTo = true;

    // a11y: prefers-reduced-motion — vol instantané sans animation
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        state.controls.target.copy(endTarget);
        state.camera.position.copy(endPos);
        state.controls.update();
        state.isFlyingTo = false;
        return;
    }

    const duration = flyDuration;
    const startTime = performance.now();

    const animateFlight = (time: number) => {
        if (!state.camera || !state.controls) {
            state.isFlyingTo = false;
            return;
        }

        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        state.controls.target.lerpVectors(startTarget, endTarget, ease);
        const currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, ease);
        const maxElev = Math.max(startPos.y, endPos.y, targetElevation);
        const parabolaHeight = Math.sin(progress * Math.PI) * Math.max(5000, maxElev * 0.8);
        currentPos.y += parabolaHeight;

        const groundH = getAltitudeAt(currentPos.x, currentPos.z);
        if (currentPos.y < groundH + 200) currentPos.y = groundH + 200;

        state.camera.position.copy(currentPos);
        state.controls.update();
        if (progress < 1.0) {
            requestAnimationFrame(animateFlight);
        } else {
            state.isFlyingTo = false;
        }
    };
    requestAnimationFrame(animateFlight);
}
