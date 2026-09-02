import { describe, expect, it } from 'vitest';
import type { GPXLayer } from '../state';
import {
    createStoredTrackFromLayer,
    fingerprintTrackPoints,
    validateStoredTrack,
} from './storedTrack';

function layerWithMissingFields(): GPXLayer {
    return {
        id: 'temporary',
        name: 'Été sans horodatage 🥾',
        color: '#abcdef',
        visible: true,
        mesh: null,
        points: [],
        rawData: {
            tracks: [
                {
                    points: [
                        { lat: 46, lon: 7 },
                        {
                            lat: 46.1,
                            lon: 7.1,
                            ele: 1234,
                            time: '2026-09-02T08:00:00.000Z',
                        },
                    ],
                },
            ],
        },
        stats: {
            distance: 12,
            dPlus: 500,
            dMinus: 200,
            pointCount: 2,
        },
        source: 'import',
    };
}

describe('StoredTrackV1', () => {
    it('preserves absent elevation and timestamps instead of fabricating them', () => {
        const track = createStoredTrackFromLayer(layerWithMissingFields(), {
            origin: 'gpx-import',
            now: '2026-09-02T10:00:00.000Z',
        });
        expect(track.geometry[0]).toEqual({ lat: 46, lon: 7 });
        expect(track.geometry[1]).toEqual({
            lat: 46.1,
            lon: 7.1,
            ele: 1234,
            timestamp: 1_788_336_000_000,
        });
        expect(track.quality.elevation).toBe('partial');
        expect(track.quality.timing).toBe('partial');
        expect(track.quality.accuracy).toBe('unknown');
    });

    it('uses geometry rather than the mutable name for import identity', () => {
        const first = createStoredTrackFromLayer(layerWithMissingFields(), {
            origin: 'gpx-import',
        });
        const renamedLayer = { ...layerWithMissingFields(), name: 'Autre nom' };
        const second = createStoredTrackFromLayer(renamedLayer, {
            origin: 'gpx-import',
        });
        expect(first.id).toBe(second.id);
        expect(fingerprintTrackPoints(first.geometry)).toBe(
            fingerprintTrackPoints(second.geometry)
        );
    });

    it('rejects point-count mismatches and unknown versions', () => {
        const track = createStoredTrackFromLayer(layerWithMissingFields(), {
            origin: 'gpx-import',
        });
        expect(() =>
            validateStoredTrack({
                ...track,
                stats: { ...track.stats, pointCount: 99 },
            })
        ).toThrow(/statistics/);
        expect(() =>
            validateStoredTrack({ ...track, schemaVersion: 2 })
        ).toThrow(/unknown track schema/);
    });
});
