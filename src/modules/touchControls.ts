/**
 * touchControls.ts — Navigation tactile style Google Earth / Google Maps (v5.11 rev3)
 *
 * ── Stratégie PointerEvents ───────────────────────────────────────────────────
 * Three.js r160 OrbitControls utilise PointerEvents (pas TouchEvents).
 * On intercepte pointerdown en phase CAPTURE, on désactive OrbitControls,
 * on gère les gestes, on réactive à la fin.
 *
 * ── Gestes ────────────────────────────────────────────────────────────────────
 *   1 doigt      → pan horizontal (avec inertie)
 *   2 doigts X   → pan horizontal
 *   2 doigts Y   → inclinaison (tilt / phi)
 *   2 doigts spread → zoom (pinch)
 *   2 doigts angle → rotation azimut (tire-bouchon)
 *
 * ── Vitesse ───────────────────────────────────────────────────────────────────
 * PAN_SPEED  : multiplicateur de vitesse du pan  (1.8 = légèrement plus rapide)
 * TILT_SPEED : sensibilité de l'inclinaison
 * INERTIA    : facteur de décélération après lâcher (0 = pas d'inertie, 1 = infini)
 */

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ── Paramètres ajustables ───────────────────────────────────────────────────────
const PAN_SPEED   = 1.8;   // >1 = plus rapide qu'OrbitControls par défaut
const TILT_SPEED  = 1.2;   // sensibilité de l'inclinaison 2-doigts
const INERTIA     = 0.88;  // coefficient de friction inertie pan (0 = off)
const ROT_DEADZONE = 0.003; // rad — ignore les micro-rotations parasites

// ── Types ───────────────────────────────────────────────────────────────────────
interface TrackedPointer { x: number; y: number; }

// ── État du module ──────────────────────────────────────────────────────────────
let _camera:   THREE.PerspectiveCamera | null = null;
let _controls: OrbitControls | null = null;
let _canvas:   HTMLElement | null   = null;
let _onStart:  (() => void) | null  = null;
let _onEnd:    (() => void) | null  = null;

const _pointers = new Map<number, TrackedPointer>();
let _lastCx = 0, _lastCy = 0;
let _lastSpread = 0;
let _lastAngle  = 0;

// Inertie pan
let _velX = 0, _velY = 0;
let _inertiaId = 0;

// ── Utilitaires ─────────────────────────────────────────────────────────────────
function twoFingerMetrics() {
    const [p1, p2] = Array.from(_pointers.values());
    return {
        cx:     (p1.x + p2.x) / 2,
        cy:     (p1.y + p2.y) / 2,
        spread: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        angle:  Math.atan2(p2.y - p1.y, p2.x - p1.x),
    };
}

function wrapAngleDelta(d: number): number {
    while (d >  Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

function cancelInertia(): void {
    cancelAnimationFrame(_inertiaId);
    _velX = 0; _velY = 0;
}

// ── Manipulations caméra ────────────────────────────────────────────────────────

/** Pan horizontal — déplace camera ET target du même vecteur (préserve le regard) */
function doPan(dx: number, dy: number): void {
    if (!_camera || !_controls || !_canvas) return;

    const dist   = _camera.position.distanceTo(_controls.target);
    const height = (_canvas as HTMLCanvasElement).clientHeight || window.innerHeight;
    const scale  = PAN_SPEED * (2 * dist * Math.tan((_camera.fov * Math.PI) / 360)) / height;

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(_camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 1e-6) right.normalize();

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(_camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-6) fwd.normalize();

    const offset = new THREE.Vector3()
        .addScaledVector(right, -dx * scale)
        .addScaledVector(fwd,    dy * scale);

    _controls.target.add(offset);
    _camera.position.add(offset);
}

/** Zoom — ratio > 1 = zoom in, < 1 = zoom out */
function doZoom(ratio: number): void {
    if (!_camera || !_controls) return;
    const dir  = new THREE.Vector3().subVectors(_camera.position, _controls.target);
    const dist = dir.length();
    const newDist = THREE.MathUtils.clamp(
        dist / ratio,
        _controls.minDistance,
        _controls.maxDistance
    );
    _camera.position.copy(_controls.target).addScaledVector(dir.normalize(), newDist);
}

/** Rotation azimut (tire-bouchon) — tourne autour de l'axe Y du target */
function doRotate(deltaAngle: number): void {
    if (!_camera || !_controls) return;
    const offset = new THREE.Vector3().subVectors(_camera.position, _controls.target);
    offset.applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaAngle)
    );
    _camera.position.copy(_controls.target).add(offset);
    _camera.lookAt(_controls.target);
}

/**
 * Tilt (inclinaison) — dy > 0 = doigts vers le bas = vue plus horizontale
 * Modifie l'angle polaire (phi) de la caméra autour du target.
 */
function doTilt(dy: number): void {
    if (!_camera || !_controls || !_canvas) return;

    const height = (_canvas as HTMLCanvasElement).clientHeight || window.innerHeight;
    const deltaPhi = TILT_SPEED * (dy * Math.PI) / height;

    const offset   = new THREE.Vector3().subVectors(_camera.position, _controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    spherical.phi = THREE.MathUtils.clamp(
        spherical.phi + deltaPhi,
        _controls.minPolarAngle + 0.01,
        _controls.maxPolarAngle - 0.01
    );
    spherical.makeSafe();

    offset.setFromSpherical(spherical);
    _camera.position.copy(_controls.target).add(offset);
    _camera.lookAt(_controls.target);
}

// ── Inertie pan ─────────────────────────────────────────────────────────────────
function tickInertia(): void {
    _velX *= INERTIA;
    _velY *= INERTIA;
    if (Math.abs(_velX) < 0.1 && Math.abs(_velY) < 0.1) { _velX = 0; _velY = 0; return; }
    doPan(_velX, _velY);
    _inertiaId = requestAnimationFrame(tickInertia);
}

// ── Gestionnaires PointerEvent ──────────────────────────────────────────────────

function onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

    cancelInertia();
    _pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (_pointers.size === 1) {
        if (_controls) _controls.enabled = false;
        if (_onStart) _onStart();
        _lastCx = e.clientX;
        _lastCy = e.clientY;
        window.addEventListener('pointermove',   onPointerMove);
        window.addEventListener('pointerup',     onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);

    } else if (_pointers.size === 2) {
        const s = twoFingerMetrics();
        _lastCx = s.cx; _lastCy = s.cy;
        _lastSpread = s.spread;
        _lastAngle  = s.angle;
    }
}

function onPointerMove(e: PointerEvent): void {
    if (!_pointers.has(e.pointerId)) return;
    _pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (_pointers.size === 1) {
        // ── Pan 1 doigt (avec tracking de vélocité) ──────────────────────────────
        const dx = e.clientX - _lastCx;
        const dy = e.clientY - _lastCy;
        _velX = dx; _velY = dy;
        doPan(dx, dy);
        _lastCx = e.clientX;
        _lastCy = e.clientY;

    } else if (_pointers.size >= 2) {
        // ── 2 doigts : zoom + rotation + tilt + pan horizontal ───────────────────
        const s = twoFingerMetrics();

        // Zoom (pinch)
        if (_lastSpread > 1) doZoom(s.spread / _lastSpread);

        // Rotation azimut (tire-bouchon)
        const dAngle = wrapAngleDelta(s.angle - _lastAngle);
        if (Math.abs(dAngle) > ROT_DEADZONE) doRotate(dAngle);

        const dx = s.cx - _lastCx;
        const dy = s.cy - _lastCy;

        // Pan horizontal (centre X)
        if (Math.abs(dx) > 0.5) doPan(dx, 0);

        // Tilt (centre Y) — remplace le pan vertical avec 2 doigts
        if (Math.abs(dy) > 0.5) doTilt(dy);

        _lastCx = s.cx; _lastCy = s.cy;
        _lastSpread = s.spread;
        _lastAngle  = s.angle;
    }
}

function onPointerUp(e: PointerEvent): void {
    _pointers.delete(e.pointerId);

    if (_pointers.size === 1) {
        const [p] = Array.from(_pointers.values());
        _lastCx = p.x; _lastCy = p.y;
    }

    if (_pointers.size === 0) {
        // Démarrer l'inertie si vélocité suffisante
        if (Math.abs(_velX) > 0.5 || Math.abs(_velY) > 0.5) {
            _inertiaId = requestAnimationFrame(tickInertia);
        }
        if (_controls) _controls.enabled = true;
        if (_onEnd) _onEnd();
        window.removeEventListener('pointermove',   onPointerMove);
        window.removeEventListener('pointerup',     onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
    }
}

// ── API publique ────────────────────────────────────────────────────────────────

export function initTouchControls(
    camera:   THREE.PerspectiveCamera,
    controls: OrbitControls,
    canvas:   HTMLElement,
    onStart?: () => void,
    onEnd?:   () => void
): void {
    _camera   = camera;
    _controls = controls;
    _canvas   = canvas;
    _onStart  = onStart ?? null;
    _onEnd    = onEnd   ?? null;
    canvas.addEventListener('pointerdown', onPointerDown as EventListener, { capture: true });
}

export function disposeTouchControls(canvas: HTMLElement): void {
    cancelInertia();
    canvas.removeEventListener('pointerdown', onPointerDown as EventListener, { capture: true });
    window.removeEventListener('pointermove',   onPointerMove);
    window.removeEventListener('pointerup',     onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    _pointers.clear();
    if (_controls) _controls.enabled = true;
    _camera = null; _controls = null; _canvas = null;
    _onStart = null; _onEnd = null;
}
