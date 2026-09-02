import type { GPXHistoryEntry } from '../gpxHistoryService';
import type { StoredTrackV1 } from './storedTrack';

const CATALOG_POINT_LIMIT = 200;

function sampleGeometry(track: StoredTrackV1): StoredTrackV1['geometry'] {
    if (track.geometry.length <= CATALOG_POINT_LIMIT) return track.geometry;
    const step = (track.geometry.length - 1) / (CATALOG_POINT_LIMIT - 1);
    return Array.from(
        { length: CATALOG_POINT_LIMIT },
        (_, index) => track.geometry[Math.round(index * step)]
    );
}

/** View-only adapter for the existing compact card/minimap contract. */
export function toTrackCatalogEntry(track: StoredTrackV1): GPXHistoryEntry {
    const sampled = sampleGeometry(track);
    const centerLat = (track.bounds.minLat + track.bounds.maxLat) / 2;
    const centerLon = (track.bounds.minLon + track.bounds.maxLon) / 2;
    return {
        id: track.id,
        name: track.name,
        color: track.color,
        source: track.origin.type === 'recording' ? 'rec' : 'import',
        timestamp: Date.parse(track.createdAt),
        locationName: track.place?.locationName,
        countryName: track.place?.countryName,
        stats: {
            distance: track.stats.distanceKm,
            dPlus: track.stats.ascentMeters,
            dMinus: track.stats.descentMeters,
            pointCount:
                track.stats.originalPointCount ?? track.stats.pointCount,
            ...(track.stats.durationSeconds === null
                ? {}
                : { estimatedTime: track.stats.durationSeconds / 60 }),
        },
        simplifiedPoints: sampled.map((point) => ({
            lat: point.lat,
            lon: point.lon,
            ele: point.ele ?? 0,
        })),
        centerLat,
        centerLon,
        bounds: { ...track.bounds },
    };
}
