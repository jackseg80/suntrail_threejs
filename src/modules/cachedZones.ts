import { tilePixelToLatLon, type BBox } from './geo';
import { decrementOfflineZoneCount } from './tileLoader';

const CACHED_ZONES_KEY = 'suntrail_cached_zones';

export interface CachedZone {
    id: string;
    label: string;
    bbox: BBox;
    minLod: number;
    maxLod: number;
    tileCount: number;
    sizeMB: string;
    timestamp: number;
}

export function getCachedZones(): CachedZone[] {
    try {
        const raw = localStorage.getItem(CACHED_ZONES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function addCachedZone(
    zone: Omit<CachedZone, 'id' | 'timestamp'>
): void {
    const zones = getCachedZones();
    zones.push({
        ...zone,
        id: `${zone.bbox.minLat.toFixed(4)}_${zone.bbox.minLon.toFixed(4)}_${zone.minLod}-${zone.maxLod}_${Date.now()}`,
        timestamp: Date.now(),
    });
    localStorage.setItem(CACHED_ZONES_KEY, JSON.stringify(zones));
}

export function removeCachedZone(id: string): void {
    const zones = getCachedZones().filter((z) => z.id !== id);
    localStorage.setItem(CACHED_ZONES_KEY, JSON.stringify(zones));
    decrementOfflineZoneCount();
}

export function isTileReferencedByCachedZone(
    zoom: number,
    tx: number,
    ty: number
): boolean {
    const n = 2 ** zoom;
    const northWest = tilePixelToLatLon(tx, ty, n);
    const southEast = tilePixelToLatLon(tx + 1, ty + 1, n);
    return getCachedZones().some(
        (zone) =>
            zoom >= zone.minLod &&
            zoom <= zone.maxLod &&
            southEast.lat <= zone.bbox.maxLat &&
            northWest.lat >= zone.bbox.minLat &&
            northWest.lon <= zone.bbox.maxLon &&
            southEast.lon >= zone.bbox.minLon
    );
}
