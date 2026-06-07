import type { BBox } from './geo';
import { decrementOfflineZoneCount } from './tileLoader';

const CACHED_ZONES_KEY = 'suntrail_cached_zones';
const OLD_CACHED_ZONES_KEY = 'suntrail-cached-zones';

let migrated = false;

function migrateLegacyKey(): void {
    if (migrated) return;
    migrated = true;
    try {
        const current = localStorage.getItem(CACHED_ZONES_KEY);
        if (current === null) {
            const old = localStorage.getItem(OLD_CACHED_ZONES_KEY);
            if (old !== null) {
                localStorage.setItem(CACHED_ZONES_KEY, old);
                localStorage.removeItem(OLD_CACHED_ZONES_KEY);
            }
        }
    } catch {
        /* ignore */
    }
}

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
    migrateLegacyKey();
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
