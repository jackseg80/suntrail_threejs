/**
 * touchControls.ts — Navigation tactile style Google Earth (v6.3)
 *
 * ── Stratégie PointerEvents ───────────────────────────────────────────────────
 * Three.js r160 OrbitControls utilise PointerEvents (pas TouchEvents).
 * On intercepte pointerdown en phase CAPTURE, on désactive OrbitControls,
 * on gère les gestes, on réactive à la fin.
 *
 * ── Gestes 2 doigts ───────────────────────────────────────────────────────────
 *
 *   ZOOM      : pinch (écartement/rapprochement) — zoome vers le centre des doigts
 *               via raycasting sur le plan terrain (doZoomToPoint).
 *
 *   ROTATION  : tire-bouchon (twist) — azimut de la caméra.
 *               Détection per-frame avec 3 guards : angle > deadzone,
 *               angle > spread×0.5 (évite bruit zoom), angle×150 > |dy| (évite bruit tilt).
 *
 *   TILT      : 2 doigts posés CÔTE À CÔTE (horizontal, < 45°) puis
 *               monter/descendre ensemble → inclinaison de la caméra (phi).
 *               Détecté par le PLACEMENT initial (pas le mouvement).
 *               Verrouillage immédiat (_tiltLocked) : bloque zoom/rotation.
 *
 *   PAN       : 2 doigts déplacement horizontal — pan de la carte.
 *               1 doigt → pan dans toutes directions (avec inertie).
 *
 * ── Paramètres ajustables ─────────────────────────────────────────────────────
 * PAN_SPEED    : vitesse du pan (1.8 = légèrement plus rapide que défaut)
 * TILT_SPEED   : sensibilité de l'inclinaison 2-doigts
 * INERTIA      : décélération après lâcher 1 doigt (0 = off, 1 = infini)
 * ROT_DEADZONE : seuil minimal en rad pour détecter une rotation (0.003)
 * TILT_ANGLE   : |sin(angle)| < TILT_ANGLE pour le pré-armement tilt (0.707 = 45°)
 */

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from './state';
import { clampTargetToBounds } from './geo';

// ── Paramètres ajustables ───────────────────────────────────────────────────────
const PAN_SPEED    = 1.8;   // >1 = plus rapide qu'OrbitControls par défaut
const TILT_SPEED   = 1.2;   // sensibilité de l'inclinaison 2-doigts
const INERTIA      = 0.88;  // coefficient de friction inertie pan (0 = off)
const ROT_DEADZONE = 0.003; // rad — ignore les micro-rotations parasites
const TILT_ANGLE   = 0.707; // |sin(angle initial)| < TILT_ANGLE → pré-armement tilt (0.707 = 45°)

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

// a11y: prefers-reduced-motion — désactive l'inertie de pan
const _prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

// ── Objets pré-alloués — évite les allocations GC dans les hot paths ────────────
const _right      = new THREE.Vector3();
const _fwd        = new THREE.Vector3();
const _camUp      = new THREE.Vector3();
const _panOffset  = new THREE.Vector3();
const _zoomDir    = new THREE.Vector3();
const _zoomNear   = new THREE.Vector3();
const _zoomFar    = new THREE.Vector3();
const _zoomP      = new THREE.Vector3();
const _zoomPscr   = new THREE.Vector3();
const _rotOffset  = new THREE.Vector3();
const _rotAxis    = new THREE.Vector3(0, 1, 0);
const _rotQuat    = new THREE.Quaternion();
const _tiltOffset = new THREE.Vector3();
const _tiltSph    = new THREE.Spherical();

// ── Architecture 2 doigts (v6.3) ────────────────────────────────────────────
// ROTATION et ZOOM : per-frame avec guards mutuels (pas de zone morte).
// TILT             : détection par PLACEMENT des doigts (style Google Earth).
//
//   Google Earth détecte le tilt à partir de la POSITION INITIALE des doigts :
//   si les 2 doigts sont posés côte à côte (angle horizontal), la session est
//   pré-armée pour le tilt (_tiltPreArmed). Dès le premier mouvement vertical
//   (|dy| > |dx| et spread stable), le lock s'active immédiatement — AVANT
//   que la rotation ait eu le temps de tirer sur les premières frames.
//
//   Sans _tiltPreArmed (doigts verticaux ou diagonaux) : seuls rotation/zoom/pan.
//
// _tiltPreArmed : doigts posés à moins de 45° de l'horizontale
// _tiltLocked   : tilt confirmé, toutes autres directions bloquées
let _tiltPreArmed = false;
let _tiltLocked   = false;

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

    _right.set(1, 0, 0).applyQuaternion(_camera.quaternion);
    _right.y = 0;
    if (_right.lengthSq() > 1e-6) _right.normalize();

    _fwd.set(0, 0, -1).applyQuaternion(_camera.quaternion);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) {
        // Caméra top-down (mode 2D) : le vecteur forward est nul après projection XZ.
        // Fallback : utiliser le vecteur "up" de la caméra projeté sur XZ.
        // Cela correspond à la direction "haut écran" en vue de dessus.
        _camUp.set(0, 1, 0).applyQuaternion(_camera.quaternion);
        _fwd.set(_camUp.x, 0, _camUp.z);
    }
    if (_fwd.lengthSq() > 1e-6) _fwd.normalize();

    _panOffset.set(0, 0, 0)
        .addScaledVector(_right, -dx * scale)
        .addScaledVector(_fwd,    dy * scale);

    _controls.target.add(_panOffset);
    _camera.position.add(_panOffset);

    // Clamp aux bords du monde (évite de pan au-delà des tuiles valides)
    const clamped = clampTargetToBounds(
        _controls.target.x, _controls.target.z, state.originTile
    );
    const ddx = clamped.x - _controls.target.x;
    const ddz = clamped.z - _controls.target.z;
    if (ddx !== 0 || ddz !== 0) {
        _controls.target.x = clamped.x;
        _controls.target.z = clamped.z;
        _camera.position.x += ddx;
        _camera.position.z += ddz;
    }
}

/** Zoom pur — ratio > 1 = zoom in, < 1 = zoom out (zoom vers le target actuel) */
function doZoom(ratio: number): void {
    if (!_camera || !_controls) return;
    _zoomDir.subVectors(_camera.position, _controls.target);
    const dist = _zoomDir.length();
    const newDist = THREE.MathUtils.clamp(
        dist / ratio,
        _controls.minDistance,
        _controls.maxDistance
    );
    _camera.position.copy(_controls.target).addScaledVector(_zoomDir.normalize(), newDist);
}

/**
 * Zoom vers le point sous les doigts (cx, cy en pixels canvas).
 *
 * Méthode : raycasting vers le plan horizontal au niveau du target.
 * 1. Intersection du rayon caméra → point pincé avec le plan cible
 * 2. Zoom (change la distance caméra-target)
 * 3. Re-projection du point 3D → calcul de l'erreur en pixels
 * 4. Compensation par doPan pour ramener le point à (cx, cy)
 *
 * Correct quelle que soit l'inclinaison de la caméra. (v5.11.1)
 */
function doZoomToPoint(ratio: number, cx: number, cy: number): void {
    if (!_camera || !_controls || !_canvas) return;
    const canvas = _canvas as HTMLCanvasElement;

    // Rayon caméra → point pincé
    const ndcX = (cx / canvas.clientWidth)  *  2 - 1;
    const ndcY = -(cy / canvas.clientHeight) * 2 + 1;
    _zoomNear.set(ndcX, ndcY, -1).unproject(_camera);
    _zoomFar.set(ndcX, ndcY,  1).unproject(_camera);
    _zoomFar.sub(_zoomNear).normalize(); // _zoomFar devient la direction

    // Intersection avec le plan horizontal au niveau du target
    let hasP = false;
    if (Math.abs(_zoomFar.y) > 0.001) {
        const t = (_controls.target.y - _zoomNear.y) / _zoomFar.y;
        if (t > 0 && t < 5e6) {
            _zoomP.copy(_zoomNear).addScaledVector(_zoomFar, t);
            hasP = true;
        }
    }

    // Zoom
    doZoom(ratio);

    if (!hasP) return; // pas d'intersection valide, zoom simple

    // Re-projection du point 3D après zoom → erreur en pixels
    _zoomPscr.copy(_zoomP).project(_camera);
    const px   = (_zoomPscr.x + 1) * 0.5 * canvas.clientWidth;
    const py   = (1 - _zoomPscr.y) * 0.5 * canvas.clientHeight;
    const ex   = px - cx; // + = P trop à droite  → compenser vers gauche
    const ey   = py - cy; // + = P trop bas        → compenser vers haut

    // Compensation (signes vérifiés analytiquement) :
    // doPan(-ex/PAN_SPEED, 0)  : target → droite → P ← gauche
    // doPan(0, -ey/PAN_SPEED)  : target → sud    → P ↑ haut
    doPan(-ex / PAN_SPEED, -ey / PAN_SPEED);
}

/** Rotation azimut (tire-bouchon) — tourne autour de l'axe Y du target */
function doRotate(deltaAngle: number): void {
    if (!_camera || !_controls) return;
    _rotOffset.subVectors(_camera.position, _controls.target);
    _rotQuat.setFromAxisAngle(_rotAxis, deltaAngle);
    _rotOffset.applyQuaternion(_rotQuat);
    _camera.position.copy(_controls.target).add(_rotOffset);
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

    _tiltOffset.subVectors(_camera.position, _controls.target);
    _tiltSph.setFromVector3(_tiltOffset);

    _tiltSph.phi = THREE.MathUtils.clamp(
        _tiltSph.phi + deltaPhi,
        _controls.minPolarAngle + 0.01,
        _controls.maxPolarAngle - 0.01
    );
    _tiltSph.makeSafe();

    _tiltOffset.setFromSpherical(_tiltSph);
    _camera.position.copy(_controls.target).add(_tiltOffset);
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
        _tiltLocked = false;
        // Pré-armement : doigts posés à moins de 45° de l'horizontale
        // |sin(angle)| < sin(45°) = 0.707 → les doigts sont plus côte à côte que l'un au-dessus de l'autre
        _tiltPreArmed = Math.abs(Math.sin(s.angle)) < TILT_ANGLE;
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
        // ── 2 doigts (v6.2) ───────────────────────────────────────────────────────
        const s = twoFingerMetrics();
        const dAngle      = wrapAngleDelta(s.angle - _lastAngle);
        const spreadRatio = _lastSpread > 1 ? s.spread / _lastSpread : 1;
        const spreadDelta = Math.abs(spreadRatio - 1);
        const dx = s.cx - _lastCx;
        const dy = s.cy - _lastCy;
        const is2D = !!_controls && _controls.minPolarAngle === _controls.maxPolarAngle;
        const absDAngle = Math.abs(dAngle);
        const absDy     = Math.abs(dy);
        const absDx     = Math.abs(dx);

        // ── TILT (par placement initial des doigts) ───────────────────────────────
        // _tiltPreArmed = true si les doigts ont été posés côte à côte (< 45° horiz).
        // Dès le premier mouvement vertical clair (|dy| > |dx|, spread stable) →
        // verrouillage immédiat. Pas de "zone morte" : tire avant que isRotating puisse s'activer.
        if (_tiltPreArmed && !_tiltLocked
                && absDy > absDx          // mouvement vertical dominant
                && absDy > 0.5            // seuil minimal
                && spreadDelta < 0.010) { // les doigts ne pincent pas
            _tiltLocked = true;
        }

        if (_tiltLocked) {
            // Tilt verrouillé : SEUL le tilt s'applique, tout le reste ignoré
            if (absDy > 0.3)
                is2D ? doPan(0, -dy) : doTilt(dy);
        } else {
            // ── Rotation (per-frame, 3 guards) ────────────────────────────────────
            const isRotating = absDAngle > ROT_DEADZONE
                            && absDAngle > spreadDelta * 0.5
                            && absDAngle * 150 > absDy;
            if (isRotating) doRotate(dAngle);

            // ── Zoom (exclusif avec rotation) ─────────────────────────────────────
            const isZooming = !isRotating && spreadDelta > 0.004;
            if (isZooming) doZoomToPoint(spreadRatio, s.cx, s.cy);

            // ── Pan horizontal (fallback) ─────────────────────────────────────────
            if (!isRotating && !isZooming && absDx > absDy && absDx > 0.5) {
                doPan(dx, 0);
            }
        }

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
        _tiltLocked = false;
        _tiltPreArmed = false;
    }

    if (_pointers.size === 0) {
        // Démarrer l'inertie si vélocité suffisante (a11y: skip si reduced-motion)
        if (!_prefersReducedMotion && (Math.abs(_velX) > 0.5 || Math.abs(_velY) > 0.5)) {
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
