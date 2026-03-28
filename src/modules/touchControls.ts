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

// ── Gesture locking (style Google Earth / Mapbox GL JS) ──────────────────────
// Architecture inspirée de MapboxGL TouchPitchHandler + TouchRotateHandler :
//   - Tilt détecté via deltas INDIVIDUELS de chaque doigt (pas le centre)
//   - Rotation détectée via angle du vecteur doigt1→doigt2
//   - Séparation robuste : pendant une rotation, les doigts vont en sens opposé
//     → le signal tilt reste nul. Pendant un tilt, l'angle ne change pas.
type GestureType = 'undecided' | 'zoom' | 'rotate' | 'tilt' | 'pan';
let _gesture: GestureType = 'undecided';

// Tracking individuel des deux premiers doigts pour le tilt Mapbox-style
let _p1Id = -1, _p2Id = -1;
let _prevP1 = { x: 0, y: 0 }, _prevP2 = { x: 0, y: 0 };

// Signaux d'accumulation (normalisés en "px équivalents")
let _gAcA = 0;  // angle change × 100         (signal rotation)
let _gAcS = 0;  // spreadDelta × 300           (signal zoom)
let _gAcT = 0;  // avg |dy| quand les 2 doigts bougent dans le même sens Y  (signal tilt)
let _gAcP = 0;  // avg |dx| quand les 2 doigts bougent dans le même sens X  (signal pan)
const GESTURE_COMMIT = 8; // px cumulés avant verrouillage

function resetGesture(): void {
    _gesture = 'undecided';
    _gAcA = _gAcS = _gAcT = _gAcP = 0;
}

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
        // Mémoriser les IDs des deux premiers doigts et leur position initiale.
        // Ces IDs sont stables pendant toute la session (Mapbox pattern).
        const ids = Array.from(_pointers.keys());
        _p1Id = ids[0]; _p2Id = ids[1];
        const p1 = _pointers.get(_p1Id)!, p2 = _pointers.get(_p2Id)!;
        _prevP1 = { x: p1.x, y: p1.y };
        _prevP2 = { x: p2.x, y: p2.y };
        const s = twoFingerMetrics();
        _lastCx = s.cx; _lastCy = s.cy;
        _lastSpread = s.spread;
        _lastAngle  = s.angle;
        resetGesture();
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
        // ── 2 doigts — Gesture Locking (v4, Mapbox-style) ───────────────────────
        // Clé de la v4 : tilt détecté par deltas INDIVIDUELS de chaque doigt.
        // Pendant une rotation, les doigts vont en sens opposé → centre stable,
        // pas de signal tilt. Pendant un tilt, l'angle reste constant → pas de
        // signal rotation. Séparation robuste basée sur Mapbox GL TouchPitchHandler.
        const s = twoFingerMetrics();
        const dAngle      = wrapAngleDelta(s.angle - _lastAngle);
        const spreadRatio = _lastSpread > 1 ? s.spread / _lastSpread : 1;
        const spreadDelta = Math.abs(spreadRatio - 1);

        // ── Deltas individuels de chaque doigt ────────────────────────────────────
        const p1 = _pointers.get(_p1Id);
        const p2 = _pointers.get(_p2Id);
        let d1x = 0, d1y = 0, d2x = 0, d2y = 0;
        if (p1 && p2) {
            d1x = p1.x - _prevP1.x; d1y = p1.y - _prevP1.y;
            d2x = p2.x - _prevP2.x; d2y = p2.y - _prevP2.y;
        }

        // Signal TILT (Mapbox TouchPitchHandler) :
        //   les deux doigts bougent verticalement dans le MÊME sens Y.
        //   Pendant une rotation ils vont en sens opposé → sameYDir = false.
        const hasYMove  = Math.abs(d1y) > 0.3 || Math.abs(d2y) > 0.3;
        const sameYDir  = hasYMove && (d1y > 0 === d2y > 0);
        const bothVert  = Math.abs(d1y) >= Math.abs(d1x) && Math.abs(d2y) >= Math.abs(d2x);
        const tiltDy    = (d1y + d2y) / 2; // moyenne Y des deux doigts

        // Signal PAN horizontal :
        //   les deux doigts bougent dans le même sens X.
        const hasXMove  = Math.abs(d1x) > 0.3 || Math.abs(d2x) > 0.3;
        const sameXDir  = hasXMove && (d1x > 0 === d2x > 0);
        const panDx     = (d1x + d2x) / 2; // moyenne X des deux doigts

        // ── Accumulation ──────────────────────────────────────────────────────────
        _gAcA += Math.abs(dAngle) * 100;
        _gAcS += spreadDelta * 300;
        _gAcT += (sameYDir && bothVert) ? Math.abs(tiltDy) : 0;
        _gAcP += sameXDir               ? Math.abs(panDx)  : 0;

        // ── Verrouillage ──────────────────────────────────────────────────────────
        if (_gesture === 'undecided' && (_gAcA + _gAcS + _gAcT + _gAcP) > GESTURE_COMMIT) {
            if      (_gAcA > _gAcS && _gAcA > _gAcT && _gAcA > _gAcP) _gesture = 'rotate';
            else if (_gAcS > _gAcT && _gAcS > _gAcP)                   _gesture = 'zoom';
            else if (_gAcT >= _gAcP)                                    _gesture = 'tilt';
            else                                                         _gesture = 'pan';
        }

        const is2D = !!_controls && _controls.minPolarAngle === _controls.maxPolarAngle;

        switch (_gesture) {
            case 'rotate':
                if (Math.abs(dAngle) > ROT_DEADZONE) doRotate(dAngle);
                break;

            case 'zoom':
                if (spreadDelta > 0.001) doZoomToPoint(spreadRatio, s.cx, s.cy);
                break;

            case 'tilt':
                // Utilise la moyenne des deltas individuels (plus stable que le centre)
                if (Math.abs(tiltDy) > 0.5)
                    is2D ? doPan(0, -tiltDy) : doTilt(tiltDy);
                break;

            case 'pan':
                if (Math.abs(panDx) > 0.5) doPan(panDx, 0);
                break;

            case 'undecided':
                // Réponses prudemment tentatives sur les signaux les plus clairs
                if (spreadDelta > 0.02)                        doZoomToPoint(spreadRatio, s.cx, s.cy);
                else if (Math.abs(dAngle) > ROT_DEADZONE * 3) doRotate(dAngle);
                break;
        }

        // ── Mise à jour de l'état ─────────────────────────────────────────────────
        if (p1) _prevP1 = { x: p1.x, y: p1.y };
        if (p2) _prevP2 = { x: p2.x, y: p2.y };
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
        resetGesture(); // le prochain 2e doigt repart de zéro
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
