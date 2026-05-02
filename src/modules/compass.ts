import * as THREE from 'three';
import { state } from './state';
import { showToast } from './toast';

let compassScene: THREE.Scene | null = null;
let compassCamera: THREE.PerspectiveCamera | null = null;
let compassRenderer: THREE.WebGLRenderer | null = null;
let compassObject: THREE.Group | null = null;

let isResettingNorth = false;
let resetStartTime = 0;
const RESET_DURATION = 800; // 800ms
let startCamPos = new THREE.Vector3();
let endCamPos = new THREE.Vector3();

export function initCompass() {
    const canvas = document.getElementById('compass-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    // a11y: boussole décorative — masquer pour les lecteurs d'écran
    canvas.setAttribute('aria-hidden', 'true');
    compassScene = new THREE.Scene();
    compassCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    compassCamera.position.set(0, 0, 18);
    compassRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    compassRenderer.setPixelRatio(window.devicePixelRatio);
    compassRenderer.setSize(120, 120);
    compassObject = new THREE.Group();
    
    const north = new THREE.Mesh(new THREE.ConeGeometry(1, 2.5, 16), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    north.rotation.x = -Math.PI / 2; north.position.z = -1.25;
    compassObject.add(north);
    
    const south = new THREE.Mesh(new THREE.ConeGeometry(1, 2.5, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    south.rotation.x = Math.PI / 2; south.position.z = 1.25;
    compassObject.add(south);

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
        if (compassObject) compassObject.add(sprite);
    };

    createLetter('N', '#ff3333', new THREE.Vector3(0, 0, -5.2));
    createLetter('S', '#ffffff', new THREE.Vector3(0, 0, 5.2));
    createLetter('E', '#ffffff', new THREE.Vector3(5.2, 0, 0));
    createLetter('O', '#ffffff', new THREE.Vector3(-5.2, 0, 0));

    compassScene.add(compassObject);
    compassScene.add(new THREE.AmbientLight(0xffffff, 1.5));
}

export function disposeCompass() {
    if (compassObject) {
        compassObject.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material?.dispose();
                }
            }
            if (child instanceof THREE.Sprite) {
                child.material?.map?.dispose();
                child.material?.dispose();
            }
        });
    }
    if (compassRenderer) compassRenderer.dispose();
    compassScene = null;
    compassCamera = null;
    compassRenderer = null;
    compassObject = null;
}

export function resetToNorth(): void {
    if (!state.controls || !state.camera || isResettingNorth) return;
    
    isResettingNorth = true;
    resetStartTime = Date.now();
    startCamPos.copy(state.camera.position);
    
    const distance = state.camera.position.distanceTo(state.controls.target);
    const tinyOffset = distance * 0.001; 
    endCamPos.set(
        state.controls.target.x,
        state.controls.target.y + distance,
        state.controls.target.z + tinyOffset
    );
    
    showToast("Réalignement cinématique...");
}

export function updateCompassAnimation(): void {
    if (!isResettingNorth || !state.camera || !state.controls) return;
    
    const elapsed = Date.now() - resetStartTime;
    const progress = Math.min(elapsed / RESET_DURATION, 1.0);
    
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    state.camera.position.lerpVectors(startCamPos, endCamPos, ease);
    state.controls.update();
    
    if (progress >= 1.0) {
        isResettingNorth = false;
        showToast("Orientation Nord rétablie");
    }
}

export function isCompassAnimating(): boolean {
    return isResettingNorth;
}

export function renderCompass() {
    if (compassRenderer && compassObject && compassScene && compassCamera && state.camera && state.controls) {
        compassObject.quaternion.copy(state.camera.quaternion).invert();
        compassRenderer.render(compassScene, compassCamera);
    }
}
