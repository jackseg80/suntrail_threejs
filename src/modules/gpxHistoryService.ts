import { STORAGE_KEYS } from '../constants/storage';
import type { GPXLayer } from './state';
import { eventBus } from './eventBus';
import { getCountryCode, COUNTRY_NAMES } from './geo';
import { getElevation } from './gpxTypes';

const MAX_HISTORY = 5;
const MAX_SIMPLIFIED_POINTS = 200;

export interface GPXHistoryEntry {
    id: string;
    name: string;
    color: string;
    source: 'import' | 'rec';
    timestamp: number;
    locationName?: string;
    countryName?: string;
    stats: {
        distance: number;
        dPlus: number;
        dMinus: number;
        pointCount: number;
        estimatedTime?: number;
    };
    simplifiedPoints: Array<{ lat: number; lon: number; ele: number }>;
    centerLat: number;
    centerLon: number;
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    /** Stable geometry fingerprint for imported-GPX deduplication. */
    contentHash?: string;
}

function computeContentHash(
    points: Array<{ lat: number; lon: number; ele: number }>,
    pointCount: number,
    distance: number
): string {
    if (points.length < 2) return '';

    // The persisted history keeps a simplified geometry. Its two endpoints,
    // original point count and distance are stable between a full import and
    // the persisted version, unlike intermediate samples.
    const sample = [points[0], points[points.length - 1]];
    const raw = sample
        .map(
            (p) =>
                `${p.lat.toFixed(4)},${p.lon.toFixed(4)},${(p.ele || 0).toFixed(0)}`
        )
        .join('|')
        .concat(`|${pointCount}|${distance.toFixed(3)}`);
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return String(hash);
}

export function saveToHistory(layer: GPXLayer, source: 'import' | 'rec'): void {
    const rawPoints = layer.rawData?.tracks?.[0]?.points || [];
    if (rawPoints.length < 2) return;

    const fullPoints: Array<{ lat: number; lon: number; ele: number }> =
        rawPoints.map((p) => ({
            lat: p.lat,
            lon: p.lon,
            ele: getElevation(p),
        }));

    const simplified =
        fullPoints.length > MAX_SIMPLIFIED_POINTS
            ? simplifyPointsUniform(fullPoints, MAX_SIMPLIFIED_POINTS)
            : fullPoints;

    const lats = simplified.map((p: { lat: number }) => p.lat);
    const lons = simplified.map((p: { lon: number }) => p.lon);
    const contentHash = computeContentHash(
        fullPoints,
        layer.stats.pointCount,
        layer.stats.distance
    );

    const entryCenter = {
        lat: (Math.max(...lats) + Math.min(...lats)) / 2,
        lon: (Math.max(...lons) + Math.min(...lons)) / 2,
    };

    const entry: GPXHistoryEntry = {
        id: layer.id,
        name: layer.name,
        color: layer.color,
        source,
        timestamp: Date.now(),
        stats: { ...layer.stats },
        simplifiedPoints: simplified,
        centerLat: entryCenter.lat,
        centerLon: entryCenter.lon,
        countryName: (() => {
            try {
                return (
                    COUNTRY_NAMES[
                        getCountryCode(entryCenter.lat, entryCenter.lon) || ''
                    ] || undefined
                );
            } catch {
                return undefined;
            }
        })(),
        bounds: {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLon: Math.min(...lons),
            maxLon: Math.max(...lons),
        },
        contentHash,
    };

    const history = loadHistory().filter(
        (existing) =>
            existing.id !== entry.id && !isSameImportedContent(existing, entry)
    );

    history.unshift(entry);

    if (history.length > MAX_HISTORY) {
        history.length = MAX_HISTORY;
    }

    persistHistory(history);
}

function getContentHash(entry: GPXHistoryEntry): string {
    return (
        entry.contentHash ||
        computeContentHash(
            entry.simplifiedPoints,
            entry.stats.pointCount,
            entry.stats.distance
        )
    );
}

function isSameImportedContent(
    first: GPXHistoryEntry,
    second: GPXHistoryEntry
): boolean {
    return (
        first.source === 'import' &&
        second.source === 'import' &&
        getContentHash(first) !== '' &&
        getContentHash(first) === getContentHash(second)
    );
}

function removeDuplicateImportedEntries(
    entries: GPXHistoryEntry[]
): GPXHistoryEntry[] {
    const seenHashes = new Set<string>();
    return entries.filter((entry) => {
        if (entry.source !== 'import') return true;
        const hash = getContentHash(entry);
        if (!hash || seenHashes.has(hash)) return !hash;
        seenHashes.add(hash);
        return true;
    });
}

function simplifyPointsUniform(
    points: Array<{ lat: number; lon: number; ele: number }>,
    targetCount: number
): Array<{ lat: number; lon: number; ele: number }> {
    if (points.length <= targetCount) return points;
    const step = (points.length - 1) / (targetCount - 1);
    const result: typeof points = [];
    for (let i = 0; i < targetCount; i++) {
        const idx = Math.round(i * step);
        result.push(points[Math.min(idx, points.length - 1)]);
    }
    return result;
}

function persistHistory(history: GPXHistoryEntry[]): void {
    try {
        localStorage.setItem(STORAGE_KEYS.GPX_HISTORY, JSON.stringify(history));
        _historyCache = history;
    } catch (e) {
        console.warn('[GPXHistory] Could not persist history:', e);
    }
}

let _historyCache: GPXHistoryEntry[] | null = null;

export function loadHistory(): GPXHistoryEntry[] {
    if (_historyCache !== null) return _historyCache;
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.GPX_HISTORY);
        if (!raw) {
            _historyCache = [];
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            _historyCache = [];
            return [];
        }
        const validEntries = parsed.filter(
            (e: any) =>
                e &&
                typeof e.id === 'string' &&
                Array.isArray(e.simplifiedPoints) &&
                e.simplifiedPoints.length >= 2
        );
        _historyCache = removeDuplicateImportedEntries(validEntries);
        if (_historyCache.length !== validEntries.length) {
            persistHistory(_historyCache);
        }
        return _historyCache;
    } catch {
        _historyCache = [];
        return [];
    }
}

export function removeFromHistory(id: string): void {
    const history = loadHistory().filter((e) => e.id !== id);
    persistHistory(history);
}

export function clearHistory(): void {
    try {
        localStorage.removeItem(STORAGE_KEYS.GPX_HISTORY);
        _historyCache = null;
    } catch {
        /* localStorage not available */
    }
}

export function isInHistory(id: string): boolean {
    return loadHistory().some((e) => e.id === id);
}

export function updateHistoryEntryLocation(
    id: string,
    locationName: string
): void {
    const history = loadHistory();
    const idx = history.findIndex((e) => e.id === id);
    if (idx < 0) return;
    history[idx].locationName = locationName;
    persistHistory(history);
    try {
        eventBus.emit('gpxHistoryUpdated');
    } catch {
        /* eventBus not available */
    }
}
