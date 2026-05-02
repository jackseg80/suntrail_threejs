import { state } from './state';
import { addGPXLayer, removeGPXLayer, recalcLayerStatsFromTerrain } from './gpxLayers';
import { showToast } from './toast';
import { i18n } from '../i18n/I18nService';
import { haversineDistance, isPositionInSwitzerland } from './geo';
import { isProActive } from './state';

let _currentRouteLayerId: string | null = null;
let _routeGeneration = 0;

export interface RouteWaypoint {
    lat: number;
    lon: number;
    alt?: number;
    name?: string;
}

export type RoutingProfile = 'foot-hiking' | 'foot-walking' | 'cycling-regular' | 'cycling-mountain';

interface ORSResponse {
    features: Array<{
        geometry: {
            coordinates: Array<[number, number, number?]>;
        };
        properties: {
            summary: {
                distance: number;
                duration: number;
            };
            ascent?: number;
            descent?: number;
        };
    }>;
}

interface OSRMResponse {
    code: string;
    routes: Array<{
        distance: number;
        duration: number;
        geometry: {
            coordinates: Array<[number, number]>;
        };
    }>;
}

function getORSKey(): string {
    return state.ORS_KEY || '';
}

function hasORSKey(): boolean {
    return getORSKey().length > 10;
}

function getOSRMEndpoint(): string {
    return 'https://router.project-osrm.org/route/v1/foot/';
}

function getORSEndpoint(profile: RoutingProfile): string {
    return `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
}

function waypointsToORSFormat(waypoints: RouteWaypoint[]): [number, number][] {
    return waypoints.map(wp => [wp.lon, wp.lat]);
}

function waypointsToOSRMFormat(waypoints: RouteWaypoint[]): string {
    return waypoints.map(wp => `${wp.lon},${wp.lat}`).join(';');
}

async function fetchFromORS(waypoints: RouteWaypoint[], profile: RoutingProfile): Promise<ORSResponse> {
    const key = getORSKey();
    const body = JSON.stringify({
        coordinates: waypointsToORSFormat(waypoints),
        elevation: true,
        instructions: false,
    });

    const response = await fetch(getORSEndpoint(profile), {
        method: 'POST',
        headers: {
            'Authorization': key,
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`ORS API error ${response.status}: ${text}`);
    }

    return response.json();
}

async function fetchFromOSRM(waypoints: RouteWaypoint[]): Promise<OSRMResponse> {
    const coords = waypointsToOSRMFormat(waypoints);
    const url = `${getOSRMEndpoint()}${coords}?geometries=geojson&overview=full`;

    const response = await fetch(url);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OSRM API error ${response.status}: ${text}`);
    }

    return response.json();
}

function orsResponseToPoints(response: ORSResponse): Array<{ lat: number; lon: number; ele: number }> {
    if (!response.features || response.features.length === 0) {
        throw new Error(i18n.t('routePlanner.error.noRoute') || 'No route found');
    }
    const coords = response.features[0].geometry.coordinates;
    return coords.map(([lon, lat]) => ({
        lat,
        lon,
        ele: 0,
    }));
}

function osrmResponseToPoints(response: OSRMResponse): Array<{ lat: number; lon: number; ele: number }> {
    if (response.code !== 'Ok' || !response.routes || response.routes.length === 0) {
        throw new Error(i18n.t('routePlanner.error.noRoute') || 'No route found');
    }
    const coords = response.routes[0].geometry.coordinates;
    return coords.map(([lon, lat]) => ({
        lat,
        lon,
        ele: 0,
    }));
}

interface GPXCompatibleData {
    tracks: Array<{
        points: Array<{
            lat: number;
            lon: number;
            ele: number;
        }>;
    }>;
}

function buildGPXCompatibleData(points: Array<{ lat: number; lon: number; ele: number }>): GPXCompatibleData {
    return {
        tracks: [{
            points: points.map(p => ({
                lat: p.lat,
                lon: p.lon,
                ele: p.ele,
                // pas de time → addGPXLayer utilise i*1000 (timestamps uniques, évite la déduplication)
            })),
        }],
    };
}

export function getActiveProfile(): RoutingProfile {
    return state.activeRouteProfile || 'foot-hiking';
}

export async function computeRoute(
    waypoints: RouteWaypoint[],
    profile?: RoutingProfile,
): Promise<{ name: string; distance: number; duration: number; ascent: number; descent: number }> {
    if (waypoints.length < 2) {
        throw new Error(i18n.t('routePlanner.error.minWaypoints') || 'At least 2 waypoints required');
    }

    const maxKm = isProActive() ? 500 : 25;
    let totalKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
        totalKm += haversineDistance(waypoints[i-1].lat, waypoints[i-1].lon, waypoints[i].lat, waypoints[i].lon);
    }
    if (totalKm > maxKm) {
        throw new Error(isProActive()
            ? i18n.t('routePlanner.error.tooLong') || 'Distance maximale de 500 km dépassée'
            : i18n.t('routePlanner.error.upgradeDistance') || 'Limite de 25 km atteinte (version gratuite)');
    }

    state.routeLoading = true;
    state.routeError = null;

    const generation = ++_routeGeneration;

    const useORS = hasORSKey();
    const activeProfile = profile || getActiveProfile();

    const loopedWaypoints = (state.routeLoopEnabled && waypoints.length >= 2)
        ? [...waypoints, waypoints[0]]
        : waypoints;

    // Suggestion ORS pour la Suisse (sentiers de randonnée non priorisés par OSRM générique)
    if (!useORS && waypoints.some(wp => isPositionInSwitzerland(wp.lat, wp.lon))) {
        void showToast(i18n.t('routePlanner.hint.orsSwiss') || 'Pour les sentiers suisses, ajoutez une clé OpenRouteService');
    }

    const _computeDrapedResult = (layer: ReturnType<typeof addGPXLayer>) => {
        return recalcLayerStatsFromTerrain(layer);
    };

    try {
        if (useORS) {
            const response = await fetchFromORS(loopedWaypoints, activeProfile);
            if (generation !== _routeGeneration) throw new Error('Route cancelled');
            const points = orsResponseToPoints(response);

            const rawData = buildGPXCompatibleData(points);
            const routeName = buildRouteName(waypoints, state.routeLoopEnabled);

            if (_currentRouteLayerId) { removeGPXLayer(_currentRouteLayerId); _currentRouteLayerId = null; }
            const layer = _computeDrapedResult(addGPXLayer(rawData, routeName, { silent: true }));
            _currentRouteLayerId = layer.id;
            void showToast(i18n.t('routePlanner.toast.computed') || 'Route computed');

            return {
                name: routeName,
                distance: layer.stats.distance,
                duration: layer.stats.estimatedTime ?? 0,
                ascent: layer.stats.dPlus,
                descent: layer.stats.dMinus,
            };
        }

        const response = await fetchFromOSRM(loopedWaypoints);
        if (generation !== _routeGeneration) throw new Error('Route cancelled');
        const points = osrmResponseToPoints(response);

        const rawData = buildGPXCompatibleData(points);
        const routeName = buildRouteName(waypoints, state.routeLoopEnabled);

        if (_currentRouteLayerId) { removeGPXLayer(_currentRouteLayerId); _currentRouteLayerId = null; }
        const layer = _computeDrapedResult(addGPXLayer(rawData, routeName, { silent: true }));
        _currentRouteLayerId = layer.id;
        void showToast(i18n.t('routePlanner.toast.computed') || 'Route computed');

        return {
            name: routeName,
            distance: layer.stats.distance,
            duration: layer.stats.estimatedTime ?? 0,
            ascent: layer.stats.dPlus,
            descent: layer.stats.dMinus,
        };
    } catch (error: any) {
        if (error?.message === 'Route cancelled') {
            state.routeLoading = false;
            throw error;
        }
        const message = error?.message || (i18n.t('routePlanner.error.generic') || 'Routing failed');
        state.routeError = message;
        void showToast(message);
        throw error;
    } finally {
        state.routeLoading = false;
    }
}

function buildRouteName(waypoints: RouteWaypoint[], isLoop: boolean): string {
    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    const firstName = first.name || `${first.lat.toFixed(3)}, ${first.lon.toFixed(3)}`;
    const lastName = last.name || `${last.lat.toFixed(3)}, ${last.lon.toFixed(3)}`;
    let base: string;
    if (firstName === lastName && waypoints.length > 2) {
        const mid = waypoints[Math.floor(waypoints.length / 2)];
        const midName = mid.name || `${mid.lat.toFixed(3)}, ${mid.lon.toFixed(3)}`;
        base = `${firstName} → ${midName} → ${lastName}`;
    } else {
        base = `${firstName} → ${lastName}`;
    }
    if (isLoop) {
        const loopSuffix = i18n.t('routePlanner.loop') || 'boucle';
        base = `${base} (${loopSuffix})`;
    }
    return base;
}

export function removeRouteWaypoint(index: number): void {
    const waypoints = state.routeWaypoints;
    if (index < 0 || index >= waypoints.length) return;
    state.routeWaypoints = waypoints.filter((_, i) => i !== index);
}

export function addRouteWaypoint(wp: RouteWaypoint): void {
    if (!wp.lat || !wp.lon) return;
    state.routeWaypoints = [...state.routeWaypoints, wp];
}

export function clearRouteWaypoints(): void {
    if (_currentRouteLayerId) { removeGPXLayer(_currentRouteLayerId); _currentRouteLayerId = null; }
    state.routeWaypoints = [];
    state.routeError = null;
}

export function reverseWaypoints(): void {
    state.routeWaypoints = [...state.routeWaypoints].reverse();
}
