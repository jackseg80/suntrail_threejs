import type { BBox } from './geo';

const CACHED_ZONES_KEY = 'suntrail-cached-zones';

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

export function addCachedZone(zone: Omit<CachedZone, 'id' | 'timestamp'>): void {
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
}
