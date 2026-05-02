import * as THREE from 'three';
import { state } from './state';
import { computeRoute, clearRouteWaypoints } from './routingService';
import { getAltitudeAt } from './analysis';
import { lngLatToWorld } from './geo';

const waypointGroup = new THREE.Group();
let autoComputeTimer: ReturnType<typeof setTimeout> | null = null;
let _barStats: { distance: number; ascent: number; descent: number; duration: number } | null = null;

export function initRouteManager(): void {
    state.subscribe('routeWaypoints', () => {
        rebuildMarkers();
        updateBar();
        scheduleAutoCompute();
    });
    state.subscribe('routeLoading', () => updateBar());
    state.subscribe('originTile', () => rebuildMarkers());
    state.subscribe('ZOOM', () => rebuildMarkers());
    state.subscribe('IS_2D_MODE', () => rebuildMarkers());
    // Quand les tuiles finissent de charger, l'altitude devient disponible
    state.subscribe('isProcessingTiles', (processing: boolean) => {
        if (!processing) rebuildMarkers();
    });
}

function rebuildMarkers(): void {
    waypointGroup.clear();
    if (!state.scene) return;
    if (!state.scene.children.includes(waypointGroup)) state.scene.add(waypointGroup);

    state.routeWaypoints.forEach((wp, i) => {
        if (!state.originTile) return;
        const world = lngLatToWorld(wp.lon, wp.lat, state.originTile);
        // En 2D le terrain est à y=0 même si getAltitudeAt retourne l'altitude exagérée
        const h = state.IS_2D_MODE ? 0 : getAltitudeAt(world.x, world.z);
        const sprite = createWaypointSprite(i + 1);
        sprite.position.set(world.x, h + 18, world.z);
        sprite.userData = { type: 'waypoint-marker', waypointIndex: i };
        waypointGroup.add(sprite);
    });
}

function createWaypointSprite(num: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 32, 33);
    const mat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
        depthWrite: false,
        transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(40, 40, 1);
    sprite.renderOrder = 999;
    return sprite;
}

export function scheduleAutoCompute(): void {
    if (autoComputeTimer) clearTimeout(autoComputeTimer);
    if (state.routeWaypoints.length < 2) {
        _barStats = null;
        updateBar();
        return;
    }
    autoComputeTimer = setTimeout(async () => {
        try {
            const result = await computeRoute(state.routeWaypoints);
            _barStats = { distance: result.distance, ascent: result.ascent, descent: result.descent, duration: result.duration };
            updateBar();
        } catch { /* erreur affichée via state.routeError */ }
    }, 800);
}

export function removeWaypointAt(index: number): void {
    const wps = [...state.routeWaypoints];
    wps.splice(index, 1);
    state.routeWaypoints = wps;
}

export function clearRoute(): void {
    clearRouteWaypoints();
    waypointGroup.clear();
    _barStats = null;
    document.body.classList.remove('route-planner-active');
}

function updateBar(): void {
    const count = state.routeWaypoints.length;
    if (count === 0) {
        document.body.classList.remove('route-planner-active');
        _barStats = null;
        renderSettingsWaypoints();
        return;
    }
    document.body.classList.add('route-planner-active');

    const dotsEl = document.getElementById('rb-dots');
    const infoEl = document.getElementById('rb-info');

    if (dotsEl) {
        dotsEl.innerHTML = Array.from({ length: Math.min(count, 5) }, () =>
            '<div class="rb-dot active" aria-hidden="true"></div>'
        ).join('');
    }

    if (infoEl) {
        if (state.routeLoading) {
            infoEl.textContent = 'Calcul…';
        } else if (_barStats) {
            infoEl.textContent = `${_barStats.distance.toFixed(1)} km · ↑${Math.round(_barStats.ascent)}m · ${fmt(_barStats.duration)}`;
        } else if (count === 1) {
            infoEl.textContent = '1 point · posez-en un 2e';
        } else {
            infoEl.textContent = `${count} points`;
        }
    }

    renderSettingsWaypoints();
}

function renderSettingsWaypoints(): void {
    const container = document.getElementById('rs-waypoints-list');
    if (!container) return;
    const waypoints = state.routeWaypoints;
    if (waypoints.length === 0) { container.innerHTML = ''; return; }

    const last = waypoints.length - 1;
    container.innerHTML = waypoints.map((wp, i) => {
        const label = wp.name || `${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)}`;
        return `<div class="rs-wp-item">
            <span class="rs-wp-num">${i + 1}</span>
            <span class="rs-wp-label">${label}</span>
            <button class="rs-wp-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter le point ${i + 1}">↑</button>
            <button class="rs-wp-dn" data-idx="${i}" ${i === last ? 'disabled' : ''} aria-label="Descendre le point ${i + 1}">↓</button>
            <button class="rs-wp-del" data-idx="${i}" aria-label="Supprimer le point ${i + 1}">✕</button>
        </div>`;
    }).join('');

    container.querySelectorAll<HTMLButtonElement>('.rs-wp-up, .rs-wp-dn, .rs-wp-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx ?? '', 10);
            if (isNaN(idx)) return;
            const wps = [...state.routeWaypoints];
            if (btn.classList.contains('rs-wp-del')) {
                wps.splice(idx, 1);
            } else if (btn.classList.contains('rs-wp-up') && idx > 0) {
                [wps[idx - 1], wps[idx]] = [wps[idx], wps[idx - 1]];
            } else if (btn.classList.contains('rs-wp-dn') && idx < wps.length - 1) {
                [wps[idx], wps[idx + 1]] = [wps[idx + 1], wps[idx]];
            }
            state.routeWaypoints = wps;
        });
    });
}

function fmt(min: number): string {
    if (min <= 0) return '—';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h === 0 ? `${m} min` : `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`;
}
