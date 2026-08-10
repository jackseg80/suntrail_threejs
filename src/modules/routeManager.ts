import * as THREE from 'three';
import { state } from './state';
import {
    computeRoute,
    clearRouteWaypoints,
    reverseWaypoints,
} from './routingService';
import { getAltitudeAt } from './analysis';
import { lngLatToWorld } from './geo';
import { i18n } from '../i18n/I18nService';
import { getPlaceName } from './geocodingService';
import { scheduleRouteSolarAnalysis, invalidateRouteCache } from './solarRoute';
import { showToast } from './toast';
import { STORAGE_KEYS } from '../constants/storage';
import {
    getRouteDraftHistoryState,
    mutateRouteWaypoints,
    redoRouteWaypoints,
    undoRouteWaypoints,
} from './preparedRoutes/routeDraftHistory';
import type { RouteWaypoint } from './preparedRoutes/preparedRoute';

const waypointGroup = new THREE.Group();
let autoComputeTimer: ReturnType<typeof setTimeout> | null = null;
let _barStats: {
    distance: number;
    ascent: number;
    descent: number;
    duration: number;
} | null = null;
let _lastWaypointCount = 0;
let _rebuildThrottle: ReturnType<typeof setTimeout> | null = null;
let _geocodeTimer: ReturnType<typeof setTimeout> | null = null;
const _geocodeCache = new Map<string, string>();
const GEOCODE_THROTTLE_MS = 1500;
const _unsubscribers: (() => void)[] = [];

function escapeHTML(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function initRouteManager(): void {
    _unsubscribers.push(
        state.subscribe('routeWaypoints', () => {
            rebuildMarkers();
            updateBar();
            // Imported GPX geometry is already complete. Its A/B endpoints are
            // an accessible summary, not a request to route again between two
            // points (which is especially invalid for a loop: A === B).
            if (state.routeDraftSourceLayerId) return;
            scheduleAutoCompute();
            scheduleGeocodeNames();
            invalidateRouteCache();
            scheduleRouteSolarAnalysis(1200);
        }),
        state.subscribe('simDate', () => {
            scheduleRouteSolarAnalysis(200);
        }),
        state.subscribe('routeLoading', () => updateBar()),
        state.subscribe('routeError', () => updateBar()),
        state.subscribe('routeComputation', () => updateBar()),
        state.subscribe('routeDraftName', () => updateBar()),
        state.subscribe('routeDraftSourceLayerId', () => updateBar()),
        state.subscribe('activePreparedRouteId', () => updateBar()),
        state.subscribe('routeDraftDirty', () => updateBar()),
        state.subscribe('isRoutePlanningMode', () => {
            syncPlanningModeUI();
            updateBar();
        }),
        state.subscribe('originTile', () => rebuildMarkers()),
        state.subscribe('ZOOM', () => rebuildMarkers()),
        state.subscribe('IS_2D_MODE', () => rebuildMarkers()),
        state.subscribe('isProcessingTiles', (processing: boolean) => {
            if (!processing) {
                rebuildMarkers();
                void import('./gpxLayers').then(({ updateAllGPXMeshes }) =>
                    updateAllGPXMeshes()
                );
            }
        }),
        state.subscribe('gpxLayers', () => updateBar())
    );
    syncPlanningModeUI();
    updateBar();
}

export function disposeRouteManager(): void {
    for (const unsub of _unsubscribers) unsub();
    _unsubscribers.length = 0;
}

function rebuildMarkers(): void {
    if (_rebuildThrottle) return;
    _rebuildThrottle = setTimeout(() => {
        _rebuildThrottle = null;
    }, 100);

    if (!state.scene) return;

    const zoom = state.ZOOM || 14;

    // Masquer les markers en dessous du LOD 14 (inutile, trop petits)
    if (zoom < 14) {
        disposeWaypointSprites();
        state.scene.remove(waypointGroup);
        _lastWaypointCount = 0;
        return;
    }

    if (!state.scene.children.includes(waypointGroup))
        state.scene.add(waypointGroup);

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
            _barStats = {
                distance: result.distance,
                ascent: result.ascent,
                descent: result.descent,
                duration: result.duration,
            };
            updateBar();
        } catch {
            /* erreur affichée via state.routeError */
        }
    }, 800);
}

export function cancelScheduledAutoCompute(): void {
    if (!autoComputeTimer) return;
    clearTimeout(autoComputeTimer);
    autoComputeTimer = null;
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
            } catch {
                /* silencieux */
            }
        }
    }, GEOCODE_THROTTLE_MS);
}

export function removeWaypointAt(index: number): void {
    const wps = [...state.routeWaypoints];
    wps.splice(index, 1);
    mutateRouteWaypoints(wps);
}

export function moveWaypointAt(index: number, waypoint: RouteWaypoint): void {
    if (index < 0 || index >= state.routeWaypoints.length) return;
    const waypoints = [...state.routeWaypoints];
    waypoints[index] = { ...waypoint };
    mutateRouteWaypoints(waypoints);
}

export function undoRouteEdit(): boolean {
    const changed = undoRouteWaypoints();
    if (changed) scheduleAutoCompute();
    return changed;
}

export function redoRouteEdit(): boolean {
    const changed = redoRouteWaypoints();
    if (changed) scheduleAutoCompute();
    return changed;
}

export function clearRoute(): void {
    clearRouteWaypoints();
    disposeWaypointSprites();
    state.scene?.remove(waypointGroup);
    _lastWaypointCount = 0;
    _barStats = null;
    if (!state.isRoutePlanningMode) {
        document.body.classList.remove('route-planner-active');
    }
}

export function setRoutePlanningMode(
    active: boolean,
    options: { announceHint?: boolean } = {}
): void {
    // Toute entrée explicite dans Préparer rouvre ses commandes. Le masquage est
    // une préférence visuelle ponctuelle, jamais une propriété du brouillon.
    if (active && !state.isRoutePlanningMode) {
        document.body.classList.remove('route-planner-chrome-hidden');
    }
    state.isRoutePlanningMode = active;
    if (!active || options.announceHint === false) return;

    try {
        if (localStorage.getItem(STORAGE_KEYS.PLANNING_LONG_PRESS_HINT) === '1')
            return;
        localStorage.setItem(STORAGE_KEYS.PLANNING_LONG_PRESS_HINT, '1');
    } catch {
        // Storage can be unavailable in private WebViews; the hint remains non-blocking.
    }

    showToast(
        i18n.t('planning.hint.longPress') ||
            'Astuce : hors du mode Planifier, un appui long ajoute aussi un point.',
        5000
    );
}

export function toggleRoutePlanningMode(): void {
    setRoutePlanningMode(!state.isRoutePlanningMode, {
        announceHint: true,
    });
}

/**
 * Réduit temporairement l'interface Préparer pour laisser la carte libre,
 * sans désactiver la pose de points ni modifier le brouillon en cours.
 */
export function toggleRoutePlannerChrome(): void {
    if (!state.isRoutePlanningMode) return;
    const hidden = document.body.classList.toggle(
        'route-planner-chrome-hidden'
    );
    document
        .getElementById('nav-plan-tab')
        ?.setAttribute('aria-expanded', String(!hidden));
}

export function reverseRoute(): void {
    if (state.routeWaypoints.length < 2) return;
    reverseWaypoints();
}

function syncPlanningModeUI(): void {
    document.body.classList.toggle(
        'route-planning-mode',
        state.isRoutePlanningMode
    );
    const planTab = document.getElementById('nav-plan-tab');
    planTab?.setAttribute('aria-pressed', String(state.isRoutePlanningMode));
    if (!state.isRoutePlanningMode) {
        document.body.classList.remove('route-planner-chrome-hidden');
        planTab?.setAttribute('aria-expanded', 'false');
        document.getElementById('route-settings')?.classList.add('hidden');
    } else {
        planTab?.setAttribute(
            'aria-expanded',
            String(
                !document.body.classList.contains('route-planner-chrome-hidden')
            )
        );
    }
}

function updateBar(): void {
    updateBarFromLayerStats();
    renderBar();
}

function updateBarFromLayerStats(): void {
    if (state.routeWaypoints.length < 2) return;
    const computation = state.routeComputation;
    if (computation) {
        _barStats = {
            distance: computation.distance,
            ascent: computation.ascent,
            descent: computation.descent,
            duration: computation.duration,
        };
    }
}

function getRouteBarContext(): string {
    const sourceKey = state.routeDraftSourceLayerId
        ? 'preparedRoutes.source.gpxDraft'
        : state.activePreparedRouteId && !state.routeDraftDirty
          ? 'preparedRoutes.source.savedRoute'
          : 'preparedRoutes.source.manualDraft';
    const source = i18n.t(sourceKey);
    const name = (
        state.routeDraftName ||
        state.routeComputation?.name ||
        ''
    ).trim();
    return name ? `${source} · ${name}` : source;
}

function renderBar(): void {
    const count = state.routeWaypoints.length;
    if (count === 0 && !state.isRoutePlanningMode) {
        document.body.classList.remove('route-planner-active');
        _barStats = null;
        renderSettingsWaypoints();
        return;
    }
    document.body.classList.add('route-planner-active');

    const dotsEl = document.getElementById('rb-dots');
    const infoEl = document.getElementById('rb-info');
    const barStats = count >= 2 ? _barStats : null;

    if (dotsEl) {
        dotsEl.innerHTML = Array.from(
            { length: Math.min(count, 5) },
            () => '<div class="rb-dot active" aria-hidden="true"></div>'
        ).join('');
    }

    let info: string;
    let mobileContext: string;
    if (state.routeLoading) {
        info = i18n.t('routeBar.computing') || 'Calcul\u2026';
        mobileContext = info;
    } else if (state.routeError) {
        info = i18n.t('routeBar.error') || 'Itinéraire indisponible';
        mobileContext = info;
    } else if (barStats) {
        mobileContext = getRouteBarContext();
        info = `${mobileContext} · ${barStats.distance.toFixed(1)} km · ↑${Math.round(barStats.ascent)}m · ↓${Math.round(barStats.descent)}m · ${fmt(barStats.duration)}`;
    } else if (count === 1) {
        info = i18n.t('routeBar.onePoint') || '1 point \u00b7 posez-en un 2e';
        mobileContext = info;
    } else if (count > 1) {
        info = `${count} points`;
        mobileContext = info;
    } else {
        info =
            i18n.t('planning.tapToAddStart') ||
            'Touchez la carte pour placer le départ A';
        mobileContext = info;
    }

    if (infoEl) infoEl.textContent = info;
    renderMobileRouteHUD(
        mobileContext,
        state.routeLoading || state.routeError ? null : barStats
    );

    renderSettingsWaypoints();
}

function renderMobileRouteHUD(context: string, stats: typeof _barStats): void {
    const contextEl = document.getElementById('rph-context');
    const statsEl = document.getElementById('rph-stats');
    if (contextEl) contextEl.textContent = context;
    if (!statsEl) return;

    statsEl.hidden = !stats;
    if (!stats) return;

    const setStat = (id: string, value: string) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    setStat('rph-distance', `${stats.distance.toFixed(1)} km`);
    setStat('rph-ascent', `D+ ${Math.round(stats.ascent)} m`);
    setStat('rph-descent', `D− ${Math.round(stats.descent)} m`);
    setStat('rph-duration', fmt(stats.duration));
}

function renderSettingsWaypoints(): void {
    const container = document.getElementById('rs-waypoints-list');
    if (!container) return;
    const waypoints = state.routeWaypoints;
    const historyState = getRouteDraftHistoryState();
    document
        .getElementById('rs-undo-btn')
        ?.toggleAttribute('disabled', !historyState.canUndo);
    document
        .getElementById('rs-redo-btn')
        ?.toggleAttribute('disabled', !historyState.canRedo);
    if (waypoints.length === 0) {
        container.innerHTML = '';
        return;
    }

    const last = waypoints.length - 1;
    container.innerHTML = waypoints
        .map((wp, i) => {
            const label =
                wp.name || `${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)}`;
            return `<div class="rs-wp-item">
            <span class="rs-wp-num">${i + 1}</span>
            <span class="rs-wp-label">${escapeHTML(label)}</span>
            <button class="rs-wp-edit" data-idx="${i}" aria-label="${i18n.t('preparedRoutes.editor.moveWaypoint') || 'Déplacer le point'}">✎</button>
            <button class="rs-wp-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter le point ${i + 1}">↑</button>
            <button class="rs-wp-dn" data-idx="${i}" ${i === last ? 'disabled' : ''} aria-label="Descendre le point ${i + 1}">↓</button>
            <button class="rs-wp-del" data-idx="${i}" aria-label="Supprimer le point ${i + 1}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>`;
        })
        .join('');

    container
        .querySelectorAll<HTMLButtonElement>(
            '.rs-wp-edit, .rs-wp-up, .rs-wp-dn, .rs-wp-del'
        )
        .forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx ?? '', 10);
                if (isNaN(idx)) return;
                const wps = [...state.routeWaypoints];
                if (btn.classList.contains('rs-wp-edit')) {
                    const current = wps[idx];
                    const raw = window.prompt(
                        i18n.t('preparedRoutes.editor.coordinatesPrompt') ||
                            'Latitude, longitude',
                        `${current.lat.toFixed(6)}, ${current.lon.toFixed(6)}`
                    );
                    if (!raw) return;
                    const [lat, lon] = raw
                        .split(',')
                        .map((value) => Number.parseFloat(value.trim()));
                    if (
                        !Number.isFinite(lat) ||
                        !Number.isFinite(lon) ||
                        lat < -90 ||
                        lat > 90 ||
                        lon < -180 ||
                        lon > 180
                    ) {
                        showToast(
                            i18n.t(
                                'preparedRoutes.editor.invalidCoordinates'
                            ) || 'Coordonnées invalides'
                        );
                        return;
                    }
                    wps[idx] = { ...current, lat, lon };
                } else if (btn.classList.contains('rs-wp-del')) {
                    wps.splice(idx, 1);
                } else if (btn.classList.contains('rs-wp-up') && idx > 0) {
                    [wps[idx - 1], wps[idx]] = [wps[idx], wps[idx - 1]];
                } else if (
                    btn.classList.contains('rs-wp-dn') &&
                    idx < wps.length - 1
                ) {
                    [wps[idx], wps[idx + 1]] = [wps[idx + 1], wps[idx]];
                }
                mutateRouteWaypoints(wps);
            });
        });
}

function fmt(min: number): string {
    if (min <= 0) return '—';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h === 0
        ? `${m} min`
        : `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`;
}
