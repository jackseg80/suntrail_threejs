import type { GPXHistoryEntry } from '../gpxHistoryService';
import type { GPXLayer } from '../state';

export const STORED_TRACK_SCHEMA_VERSION = 1 as const;

export type TrackOriginType = 'recording' | 'gpx-import' | 'legacy-migration';
export type TrackGeometryQuality = 'full' | 'approximate';
export type TrackFieldQuality = 'full' | 'partial' | 'unknown';

export interface StoredTrackPointV1 {
    lat: number;
    lon: number;
    ele?: number;
    timestamp?: number;
    accuracy?: number;
}

export interface StoredTrackV1 {
    schemaVersion: typeof STORED_TRACK_SCHEMA_VERSION;
    id: string;
    origin: {
        type: TrackOriginType;
        sourceId: string;
    };
    name: string;
    color: string;
    place?: {
        locationName?: string;
        countryName?: string;
    };
    geometry: StoredTrackPointV1[];
    stats: {
        distanceKm: number;
        ascentMeters: number;
        descentMeters: number;
        durationSeconds: number | null;
        pointCount: number;
        originalPointCount?: number;
        provenance: 'recording' | 'gpx' | 'legacy-history' | 'derived';
    };
    bounds: {
        minLat: number;
        maxLat: number;
        minLon: number;
        maxLon: number;
    };
    quality: {
        geometry: TrackGeometryQuality;
        timing: TrackFieldQuality;
        elevation: TrackFieldQuality;
        accuracy: TrackFieldQuality;
    };
    createdAt: string;
    updatedAt: string;
}

export class StoredTrackValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StoredTrackValidationError';
    }
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function validateIsoDate(value: unknown, field: string): string {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
        throw new StoredTrackValidationError(`${field} must be an ISO date`);
    }
    return value;
}

export function validateStoredTrack(value: unknown): StoredTrackV1 {
    if (!value || typeof value !== 'object') {
        throw new StoredTrackValidationError('track must be an object');
    }
    const track = value as StoredTrackV1;
    if (track.schemaVersion !== STORED_TRACK_SCHEMA_VERSION) {
        throw new StoredTrackValidationError('unknown track schema version');
    }
    if (!track.id || !track.name || !track.origin?.sourceId) {
        throw new StoredTrackValidationError('track identity is incomplete');
    }
    if (
        !['recording', 'gpx-import', 'legacy-migration'].includes(
            track.origin.type
        )
    ) {
        throw new StoredTrackValidationError('track origin is invalid');
    }
    if (!Array.isArray(track.geometry) || track.geometry.length < 2) {
        throw new StoredTrackValidationError(
            'track geometry needs at least two points'
        );
    }
    for (const point of track.geometry) {
        if (
            !isFiniteNumber(point.lat) ||
            !isFiniteNumber(point.lon) ||
            point.lat < -90 ||
            point.lat > 90 ||
            point.lon < -180 ||
            point.lon > 180
        ) {
            throw new StoredTrackValidationError('track point is invalid');
        }
        for (const optional of [point.ele, point.timestamp, point.accuracy]) {
            if (optional !== undefined && !isFiniteNumber(optional)) {
                throw new StoredTrackValidationError(
                    'optional point field is invalid'
                );
            }
        }
    }
    if (
        !track.stats ||
        !isFiniteNumber(track.stats.distanceKm) ||
        !isFiniteNumber(track.stats.ascentMeters) ||
        !isFiniteNumber(track.stats.descentMeters) ||
        track.stats.pointCount !== track.geometry.length
    ) {
        throw new StoredTrackValidationError('track statistics are invalid');
    }
    if (
        track.stats.originalPointCount !== undefined &&
        (!Number.isInteger(track.stats.originalPointCount) ||
            track.stats.originalPointCount < track.stats.pointCount)
    ) {
        throw new StoredTrackValidationError(
            'original track point count is invalid'
        );
    }
    if (
        track.stats.durationSeconds !== null &&
        !isFiniteNumber(track.stats.durationSeconds)
    ) {
        throw new StoredTrackValidationError('track duration is invalid');
    }
    const bounds = track.bounds;
    if (
        !bounds ||
        ![bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon].every(
            isFiniteNumber
        ) ||
        bounds.minLat > bounds.maxLat ||
        bounds.minLon > bounds.maxLon
    ) {
        throw new StoredTrackValidationError('track bounds are invalid');
    }
    if (
        !track.quality ||
        !['full', 'approximate'].includes(track.quality.geometry) ||
        !['full', 'partial', 'unknown'].includes(track.quality.timing) ||
        !['full', 'partial', 'unknown'].includes(track.quality.elevation) ||
        !['full', 'partial', 'unknown'].includes(track.quality.accuracy)
    ) {
        throw new StoredTrackValidationError('track quality is invalid');
    }
    validateIsoDate(track.createdAt, 'createdAt');
    validateIsoDate(track.updatedAt, 'updatedAt');
    return {
        ...track,
        origin: { ...track.origin },
        ...(track.place ? { place: { ...track.place } } : {}),
        geometry: track.geometry.map((point) => ({ ...point })),
        stats: { ...track.stats },
        bounds: { ...track.bounds },
        quality: { ...track.quality },
    };
}

export function computeTrackBounds(
    points: StoredTrackPointV1[]
): StoredTrackV1['bounds'] {
    return {
        minLat: Math.min(...points.map((point) => point.lat)),
        maxLat: Math.max(...points.map((point) => point.lat)),
        minLon: Math.min(...points.map((point) => point.lon)),
        maxLon: Math.max(...points.map((point) => point.lon)),
    };
}

function fieldQuality(
    points: StoredTrackPointV1[],
    field: 'ele' | 'timestamp' | 'accuracy'
): TrackFieldQuality {
    const count = points.filter((point) => point[field] !== undefined).length;
    if (count === 0) return 'unknown';
    return count === points.length ? 'full' : 'partial';
}

/** Stable non-cryptographic identity; names are deliberately excluded. */
export function fingerprintTrackPoints(points: StoredTrackPointV1[]): string {
    let hash = 0x811c9dc5;
    for (const point of points) {
        const value = [
            point.lat.toFixed(7),
            point.lon.toFixed(7),
            point.ele?.toFixed(2) ?? '',
            point.timestamp ?? '',
        ].join(',');
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return `${points.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createStoredTrackFromLayer(
    layer: GPXLayer,
    options: {
        origin: 'recording' | 'gpx-import';
        sourceId?: string;
        now?: string;
    }
): StoredTrackV1 {
    const rawPoints = layer.rawData?.tracks?.[0]?.points ?? [];
    const geometry: StoredTrackPointV1[] = rawPoints.map((point) => {
        const timestamp =
            typeof point.timestamp === 'number'
                ? point.timestamp
                : point.time
                  ? new Date(point.time).getTime()
                  : undefined;
        return {
            lat: point.lat,
            lon: point.lon,
            ...(point.ele !== undefined
                ? { ele: point.ele }
                : point.alt !== undefined
                  ? { ele: point.alt }
                  : {}),
            ...(Number.isFinite(timestamp) ? { timestamp } : {}),
        };
    });
    const fingerprint = fingerprintTrackPoints(geometry);
    const sourceId = options.sourceId || fingerprint;
    const timestamps = geometry
        .map((point) => point.timestamp)
        .filter(isFiniteNumber);
    const durationSeconds =
        timestamps.length >= 2
            ? Math.max(...timestamps) / 1000 - Math.min(...timestamps) / 1000
            : null;
    const now = options.now ?? new Date().toISOString();
    return validateStoredTrack({
        schemaVersion: STORED_TRACK_SCHEMA_VERSION,
        id: `${options.origin}:${sourceId}`,
        origin: { type: options.origin, sourceId },
        name: layer.name,
        color: layer.color,
        geometry,
        stats: {
            distanceKm: layer.stats.distance,
            ascentMeters: layer.stats.dPlus,
            descentMeters: layer.stats.dMinus,
            durationSeconds,
            pointCount: geometry.length,
            provenance: options.origin === 'recording' ? 'recording' : 'gpx',
        },
        bounds: computeTrackBounds(geometry),
        quality: {
            geometry: 'full',
            timing: fieldQuality(geometry, 'timestamp'),
            elevation: fieldQuality(geometry, 'ele'),
            accuracy: 'unknown',
        },
        createdAt: now,
        updatedAt: now,
    });
}

export function createStoredTrackFromLegacy(
    entry: GPXHistoryEntry
): StoredTrackV1 {
    const geometry = entry.simplifiedPoints.map((point) => ({
        lat: point.lat,
        lon: point.lon,
        ...(Number.isFinite(point.ele) ? { ele: point.ele } : {}),
    }));
    const createdAt = new Date(entry.timestamp).toISOString();
    return validateStoredTrack({
        schemaVersion: STORED_TRACK_SCHEMA_VERSION,
        id: `legacy:${entry.id}`,
        origin: { type: 'legacy-migration', sourceId: entry.id },
        name: entry.name,
        color: entry.color,
        place:
            entry.locationName || entry.countryName
                ? {
                      ...(entry.locationName
                          ? { locationName: entry.locationName }
                          : {}),
                      ...(entry.countryName
                          ? { countryName: entry.countryName }
                          : {}),
                  }
                : undefined,
        geometry,
        stats: {
            distanceKm: entry.stats.distance,
            ascentMeters: entry.stats.dPlus,
            descentMeters: entry.stats.dMinus,
            durationSeconds:
                entry.stats.estimatedTime === undefined
                    ? null
                    : entry.stats.estimatedTime * 60,
            pointCount: geometry.length,
            originalPointCount: Math.max(
                geometry.length,
                entry.stats.pointCount
            ),
            provenance: 'legacy-history',
        },
        bounds: { ...entry.bounds },
        quality: {
            geometry: 'approximate',
            timing: 'unknown',
            // Old history used 0 when GPX elevation was absent; values are
            // retained, but their semantic completeness cannot be asserted.
            elevation: 'unknown',
            accuracy: 'unknown',
        },
        createdAt,
        updatedAt: createdAt,
    });
}
