import { state } from './state';
import { addGPXLayer, removeGPXLayer } from './gpxLayers';
import { showToast } from './toast';
import { i18n } from '../i18n/I18nService';

let _currentRouteLayerId: string | null = null;

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
    return coords.map(([lon, lat, ele]) => ({
        lat,
        lon,
        ele: ele || 0,
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

function buildGPXCompatibleData(points: Array<{ lat: number; lon: number; ele: number }>): Record<string, any> {
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

    state.routeLoading = true;
    state.routeError = null;

    const useORS = hasORSKey();
    const activeProfile = profile || getActiveProfile();

    const loopedWaypoints = (state.routeLoopEnabled && waypoints.length >= 2)
        ? [...waypoints, waypoints[0]]
        : waypoints;

    try {
        if (useORS) {
            const response = await fetchFromORS(loopedWaypoints, activeProfile);
            const points = orsResponseToPoints(response);

            const rawData = buildGPXCompatibleData(points);
            const routeName = buildRouteName(waypoints, state.routeLoopEnabled);

            if (_currentRouteLayerId) { removeGPXLayer(_currentRouteLayerId); _currentRouteLayerId = null; }
            const layer = addGPXLayer(rawData, routeName);
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
        const points = osrmResponseToPoints(response);

        const rawData = buildGPXCompatibleData(points);
        const routeName = buildRouteName(waypoints, state.routeLoopEnabled);

        if (_currentRouteLayerId) { removeGPXLayer(_currentRouteLayerId); _currentRouteLayerId = null; }
        const layer = addGPXLayer(rawData, routeName);
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

export async function reverseGeocodeWaypoint(
    lat: number,
    lon: number,
): Promise<string | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16`;
        const response = await fetch(url, {
            headers: { 'Accept-Language': state.lang },
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.name || data.display_name?.split(',')[0]?.trim() || null;
    } catch {
        return null;
    }
}
