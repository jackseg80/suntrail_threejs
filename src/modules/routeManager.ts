import * as THREE from 'three';
import { state } from './state';
import { computeRoute, clearRouteWaypoints } from './routingService';
import { getAltitudeAt } from './analysis';
import { lngLatToWorld } from './geo';
import { i18n } from '../i18n/I18nService';
import { getPlaceName } from './geocodingService';

const waypointGroup = new THREE.Group();
let autoComputeTimer: ReturnType<typeof setTimeout> | null = null;
let _barStats: { distance: number; ascent: number; descent: number; duration: number } | null = null;
let _lastWaypointCount = 0;
let _rebuildThrottle: ReturnType<typeof setTimeout> | null = null;
let _geocodeTimer: ReturnType<typeof setTimeout> | null = null;
const _geocodeCache = new Map<string, string>();
const GEOCODE_THROTTLE_MS = 1500;

export function initRouteManager(): void {
    state.subscribe('routeWaypoints', () => {
        rebuildMarkers();
        updateBar();
        scheduleAutoCompute();
        scheduleGeocodeNames();
    });
    state.subscribe('routeLoading', () => updateBar());
    state.subscribe('originTile', () => rebuildMarkers());
    state.subscribe('ZOOM', () => rebuildMarkers());
    state.subscribe('IS_2D_MODE', () => rebuildMarkers());
    // Quand les tuiles finissent de charger, l'altitude devient disponible
    state.subscribe('isProcessingTiles', (processing: boolean) => {
        if (!processing) rebuildMarkers();
    });
    state.subscribe('gpxLayers', () => updateBarFromLayerStats());
}

function rebuildMarkers(): void {
    if (_rebuildThrottle) return;
    _rebuildThrottle = setTimeout(() => { _rebuildThrottle = null; }, 100);

    if (!state.scene) return;

    const zoom = state.ZOOM || 14;

    // Masquer les markers en dessous du LOD 14 (inutile, trop petits)
    if (zoom < 14) {
        disposeWaypointSprites();
        state.scene.remove(waypointGroup);
        _lastWaypointCount = 0;
        return;
    }

    if (!state.scene.children.includes(waypointGroup)) state.scene.add(waypointGroup);

    // Échelle adaptative discrète
    const scale = Math.max(20, 20 * Math.pow(2, Math.max(0, 17 - zoom)));
    const spriteHeight = state.IS_2D_MODE ? 12 : Math.max(18, scale * 0.15);
    const count = state.routeWaypoints.length;

    if (count !== _lastWaypointCount) {
        disposeWaypointSprites();
        _lastWaypointCount = count;

        state.routeWaypoints.forEach((wp, i) => {
            if (!state.originTile) return;
            const world = lngLatToWorld(wp.lon, wp.lat, state.originTile);
            const h = state.IS_2D_MODE ? 0 : getAltitudeAt(world.x, world.z);
            const sprite = createWaypointSprite(i + 1);
            sprite.scale.set(scale, scale, 1);
            sprite.position.set(world.x, h + spriteHeight, world.z);
            sprite.userData = { type: 'waypoint-marker', waypointIndex: i };
            waypointGroup.add(sprite);
        });
        return;
    }

    const children = waypointGroup.children as THREE.Sprite[];
    state.routeWaypoints.forEach((wp, i) => {
        if (!state.originTile) return;
        const sprite = children[i];
        if (!sprite) return;
        const world = lngLatToWorld(wp.lon, wp.lat, state.originTile);
        const h = state.IS_2D_MODE ? 0 : getAltitudeAt(world.x, world.z);
        sprite.position.set(world.x, h + spriteHeight, world.z);
        sprite.scale.set(scale, scale, 1);
        sprite.userData.waypointIndex = i;
    });
}

function disposeWaypointSprites(): void {
    waypointGroup.children.forEach((child) => {
        const sprite = child as THREE.Sprite;
        if (sprite.material) {
            const mat = sprite.material as THREE.SpriteMaterial;
            if (mat.map) mat.map.dispose();
            mat.dispose();
        }
    });
    waypointGroup.clear();
}

function buildSharedCanvas(num: number): { canvas: HTMLCanvasElement } {
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
    return { canvas };
}

function createWaypointSprite(num: number): THREE.Sprite {
    const { canvas } = buildSharedCanvas(num);
    const mat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
        depthWrite: false,
        transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
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

export function scheduleGeocodeNames(): void {
    if (_geocodeTimer) clearTimeout(_geocodeTimer);
    _geocodeTimer = setTimeout(async () => {
        const wps = state.routeWaypoints;
        for (let i = 0; i < wps.length; i++) {
            const wp = wps[i];
            if (wp.name) continue;
            const key = `${wp.lat.toFixed(5)},${wp.lon.toFixed(5)}`;
            const cached = _geocodeCache.get(key);
            if (cached) {
                const updated = [...state.routeWaypoints];
                updated[i] = { ...updated[i], name: cached };
                state.routeWaypoints = updated;
                continue;
            }
            try {
                const name = await getPlaceName(wp.lat, wp.lon);
                if (name) {
                    _geocodeCache.set(key, name);
                    const updated = [...state.routeWaypoints];
                    updated[i] = { ...updated[i], name };
                    state.routeWaypoints = updated;
                }
            } catch { /* silencieux */ }
        }
    }, GEOCODE_THROTTLE_MS);
}

export function removeWaypointAt(index: number): void {
    const wps = [...state.routeWaypoints];
    wps.splice(index, 1);
    state.routeWaypoints = wps;
}

export function clearRoute(): void {
    clearRouteWaypoints();
    disposeWaypointSprites();
    state.scene?.remove(waypointGroup);
    _lastWaypointCount = 0;
    _barStats = null;
    document.body.classList.remove('route-planner-active');
}

function updateBar(): void {
    updateBarFromLayerStats();
    renderBar();
}

function updateBarFromLayerStats(): void {
    if (state.routeWaypoints.length < 2) return;
    const currentLayer = state.gpxLayers.find(l => l.stats.dPlus > 0);
    if (currentLayer) {
        _barStats = {
            distance: currentLayer.stats.distance,
            ascent: currentLayer.stats.dPlus,
            descent: currentLayer.stats.dMinus,
            duration: currentLayer.stats.estimatedTime ?? 0,
        };
    }
}

function renderBar(): void {
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
            infoEl.textContent = i18n.t('routeBar.computing') || 'Calcul\u2026';
        } else if (_barStats) {
            infoEl.textContent = `${_barStats.distance.toFixed(1)} km \u00b7 \u2191${Math.round(_barStats.ascent)}m \u00b7 \u2193${Math.round(_barStats.descent)}m \u00b7 ${fmt(_barStats.duration)}`;
        } else if (count === 1) {
            infoEl.textContent = i18n.t('routeBar.onePoint') || '1 point \u00b7 posez-en un 2e';
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
