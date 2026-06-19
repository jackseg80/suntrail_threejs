export interface GeoPoint {
    lat: number;
    lon: number;
    ele?: number;
    alt?: number;
    time?: string | Date;
    timestamp?: number;
}

export interface GPXRawData {
    tracks: Array<{
        name?: string;
        points: GeoPoint[];
    }>;
    routes?: Array<{
        name?: string;
        points: GeoPoint[];
    }>;
}

export function getElevation(p: { ele?: number; alt?: number }): number {
    const ele = p.ele;
    if (ele !== undefined && !isNaN(ele)) return ele;
    const alt = p.alt;
    if (alt !== undefined && !isNaN(alt)) return alt;
    return 0;
}

export function isValidGeoPoint(p: unknown): p is GeoPoint {
    if (!p || typeof p !== 'object') return false;
    const pt = p as Record<string, unknown>;
    return (
        typeof pt.lat === 'number' &&
        typeof pt.lon === 'number' &&
        !isNaN(pt.lat) &&
        !isNaN(pt.lon)
    );
}
