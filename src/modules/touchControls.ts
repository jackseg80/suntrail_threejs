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

// ── Architecture 2 doigts (v6.2) ────────────────────────────────────────────
// ROTATION et ZOOM : per-frame avec guards mutuels (pas de zone morte).
// TILT             : verrouillage dédié style Google Earth.
//
//   Tilt lock : 2 doigts posés côte à côte descendent/montent ensemble.
//   Détection : |dy| > 2px ET |dy| > |dx|×2 ET spread stable ET pas de rotation.
//   Une fois verrouillé → SEUL le tilt s'applique jusqu'au lever des doigts.
//
// _tiltLocked = true tant qu'un tilt est en cours.
let _tiltLocked = false;

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
    if (fwd.lengthSq() < 1e-6) {
        // Caméra top-down (mode 2D) : le vecteur forward est nul après projection XZ.
        // Fallback : utiliser le vecteur "up" de la caméra projeté sur XZ.
        // Cela correspond à la direction "haut écran" en vue de dessus.
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(_camera.quaternion);
        fwd.set(camUp.x, 0, camUp.z);
    }
    if (fwd.lengthSq() > 1e-6) fwd.normalize();

    const offset = new THREE.Vector3()
        .addScaledVector(right, -dx * scale)
        .addScaledVector(fwd,    dy * scale);

    _controls.target.add(offset);
    _camera.position.add(offset);
}

/** Zoom pur — ratio > 1 = zoom in, < 1 = zoom out (zoom vers le target actuel) */
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
    const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(_camera);
    const far  = new THREE.Vector3(ndcX, ndcY,  1).unproject(_camera);
    const dir  = far.sub(near).normalize();

    // Intersection avec le plan horizontal au niveau du target
    let P: THREE.Vector3 | null = null;
    if (Math.abs(dir.y) > 0.001) {
        const t = (_controls.target.y - near.y) / dir.y;
        if (t > 0 && t < 5e6) P = near.clone().addScaledVector(dir, t);
    }

    // Zoom
    doZoom(ratio);

    if (!P) return; // pas d'intersection valide, zoom simple

    // Re-projection du point 3D après zoom → erreur en pixels
    const Pscr = P.clone().project(_camera);
    const px   = (Pscr.x + 1) * 0.5 * canvas.clientWidth;
    const py   = (1 - Pscr.y) * 0.5 * canvas.clientHeight;
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
        _tiltLocked = false; // reset à chaque nouvelle session 2 doigts
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

        // ── TILT LOCK (style Google Earth) ────────────────────────────────────────
        // Détection : les 2 doigts bougent ensemble verticalement (centre Y),
        // sans que le spread ni l'angle ne changent → geste tilt confirmé.
        // Conditions :
        //   • |dy| > 2px             : mouvement vertical minimum
        //   • |dy| > |dx| × 2        : clairement plus vertical qu'horizontal
        //   • spreadDelta < 0.008    : doigts ne s'écartent pas (pas un pinch)
        //   • |dAngle| < 0.010 rad   : doigts ne tournent pas (pas une rotation)
        // Une fois verrouillé : SEUL le tilt s'applique jusqu'au lever des doigts.
        if (!_tiltLocked
                && absDy > 2
                && absDy > absDx * 2
                && spreadDelta < 0.008
                && absDAngle < 0.010) {
            _tiltLocked = true;
        }

        if (_tiltLocked) {
            // Tilt verrouillé : tout sauf tilt est ignoré
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

            // ── Pan horizontal (fallback, ni rotation ni zoom) ────────────────────
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
        _tiltLocked = false; // un doigt levé = fin du tilt lock
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
