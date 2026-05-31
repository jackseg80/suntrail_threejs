import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEventBusEmit, mockGetCountryCode } = vi.hoisted(() => {
    const fn = vi.fn();
    (fn as any).mockReturnValue(null as string | null);
    return {
        mockEventBusEmit: vi.fn(),
        mockGetCountryCode: fn,
    };
});

vi.mock('../modules/eventBus', () => ({
    eventBus: { emit: mockEventBusEmit, on: vi.fn(), off: vi.fn() },
}));
vi.mock('../modules/geo', () => ({
    getCountryCode: mockGetCountryCode,
    COUNTRY_NAMES: {
        CH: 'Suisse',
        FR: 'France',
        IT: 'Italie',
        DE: 'Allemagne',
        AT: 'Autriche',
        ES: 'Espagne',
    },
}));

import {
    saveToHistory,
    loadHistory,
    removeFromHistory,
    clearHistory,
    isInHistory,
    updateHistoryEntryLocation,
} from '../modules/gpxHistoryService';
import { STORAGE_KEYS } from '../constants/storage';
import type { GPXLayer } from '../modules/state';

let pointCounter = 0;
function makeLayer(overrides: Partial<GPXLayer> = {}): GPXLayer {
    pointCounter++;
    const base = pointCounter * 100;
    const points = Array.from({ length: 10 }, (_, i) => ({
        lat: 46.0 + base * 0.001 + i * 0.0001,
        lon: 7.0 + base * 0.001 + i * 0.0001,
        ele: 1000 + i * 10 + base,
        time: new Date(2026, 0, 1, 8, 0, i).toISOString(),
    }));
    return {
        id: 'test-id-' + Math.random().toString(36).slice(2, 6),
        name: 'TestTrack.gpx',
        color: '#0066ff',
        visible: true,
        rawData: { tracks: [{ name: 'TestTrack.gpx', points }] },
        points: [],
        mesh: null,
        stats: {
            distance: 10.5 + base * 0.1,
            dPlus: 500 + base,
            dMinus: 300 + base,
            pointCount: 10,
            estimatedTime: 7200,
        },
        ...overrides,
    };
}

function flushLocalStorage() {
    localStorage.clear();
}

describe('gpxHistoryService', () => {
    beforeEach(() => {
        flushLocalStorage();
        clearHistory(); // reset in-memory cache
        pointCounter = 0;
        vi.clearAllMocks();
    });

    describe('saveToHistory / loadHistory', () => {
        it('should save an entry and load it back', () => {
            const layer = makeLayer({ id: 'abc-123' });
            saveToHistory(layer, 'import');

            const history = loadHistory();
            expect(history).toHaveLength(1);
            expect(history[0].id).toBe('abc-123');
            expect(history[0].name).toBe('TestTrack.gpx');
            expect(history[0].source).toBe('import');
            expect(history[0].color).toBe('#0066ff');
            expect(history[0].stats.distance).toBeGreaterThan(0);
            expect(history[0].simplifiedPoints.length).toBeGreaterThanOrEqual(
                2
            );
        });

        it('should cap at 5 entries (FIFO)', () => {
            for (let i = 0; i < 7; i++) {
                saveToHistory(
                    makeLayer({ id: `id-${i}`, name: `Track${i}` }),
                    'import'
                );
            }
            const history = loadHistory();
            expect(history).toHaveLength(5);
            expect(history[0].id).toBe('id-6');
            expect(history[4].id).toBe('id-2');
        });

        it('should deduplicate by ID on re-import (update timestamp)', async () => {
            const layer = makeLayer({ id: 'dup-id' });
            saveToHistory(layer, 'import');
            const firstTimestamp = loadHistory()[0].timestamp;

            await new Promise((r) => setTimeout(r, 5));
            saveToHistory(layer, 'import');
            const history = loadHistory();
            expect(history).toHaveLength(1);
            expect(history[0].id).toBe('dup-id');
            expect(history[0].timestamp).toBeGreaterThan(firstTimestamp);
        });

        it('should deduplicate by content hash (same points)', () => {
            const sharedPoints = Array.from({ length: 5 }, (_, i) => ({
                lat: 46.5 + i * 0.01,
                lon: 7.5 + i * 0.01,
                ele: 2000 + i,
                time: `2026-01-01T08:00:0${i}Z`,
            }));
            const layer1 = makeLayer({
                id: 'id-a',
                rawData: { tracks: [{ name: 'A', points: [...sharedPoints] }] },
                stats: {
                    distance: 10,
                    dPlus: 500,
                    dMinus: 300,
                    pointCount: 5,
                    estimatedTime: 3600,
                },
            });
            const layer2 = makeLayer({
                id: 'id-b',
                rawData: { tracks: [{ name: 'B', points: [...sharedPoints] }] },
                stats: {
                    distance: 10,
                    dPlus: 500,
                    dMinus: 300,
                    pointCount: 5,
                    estimatedTime: 3600,
                },
            });

            saveToHistory(layer1, 'import');
            saveToHistory(layer2, 'import');
            expect(loadHistory()).toHaveLength(1);
        });

        it('should store source as rec', () => {
            saveToHistory(makeLayer({ id: 'rec-id' }), 'rec');
            expect(loadHistory()[0].source).toBe('rec');
        });

        it('should store centerLat/centerLon and bounds', () => {
            saveToHistory(makeLayer({ id: 'geo-id' }), 'import');
            const e = loadHistory()[0];
            expect(typeof e.centerLat).toBe('number');
            expect(typeof e.centerLon).toBe('number');
            expect(e.bounds.minLat).toBeLessThanOrEqual(e.bounds.maxLat);
            expect(e.bounds.minLon).toBeLessThanOrEqual(e.bounds.maxLon);
        });

        it('should store countryName when getCountryCode returns a code', () => {
            mockGetCountryCode.mockReturnValue('CH');
            saveToHistory(makeLayer({ id: 'ch-id' }), 'import');
            expect(loadHistory()[0].countryName).toBe('Suisse');
        });

        it('should not set countryName if country unknown', () => {
            mockGetCountryCode.mockReturnValue(null);
            saveToHistory(makeLayer({ id: 'xx-id' }), 'import');
            expect(loadHistory()[0].countryName).toBeUndefined();
        });

        it('should skip if rawData has fewer than 2 points', () => {
            const layer = makeLayer({ id: 'few' });
            layer.rawData.tracks[0].points = [{ lat: 46, lon: 7, ele: 1000 }];
            saveToHistory(layer, 'import');
            expect(loadHistory()).toHaveLength(0);
        });

        it('should cap simplifiedPoints at 200', () => {
            const manyPoints = Array.from({ length: 500 }, (_, i) => ({
                lat: 46.0 + i * 0.001,
                lon: 7.0 + i * 0.001,
                ele: 1000 + i,
                time: new Date(2026, 0, 1, 8, 0, i % 60).toISOString(),
            }));
            const layer = makeLayer({ id: 'many' });
            layer.rawData.tracks[0].points = manyPoints;
            saveToHistory(layer, 'import');
            expect(
                loadHistory()[0].simplifiedPoints.length
            ).toBeLessThanOrEqual(200);
        });
    });

    describe('loadHistory', () => {
        it('should return empty array when nothing saved', () => {
            expect(loadHistory()).toEqual([]);
        });

        it('should filter out malformed entries (insufficient points)', () => {
            clearHistory(); // reset cache before direct localStorage write
            localStorage.setItem(
                STORAGE_KEYS.GPX_HISTORY,
                JSON.stringify([
                    {
                        id: 'ok',
                        simplifiedPoints: [
                            { lat: 1, lon: 1 },
                            { lat: 2, lon: 2 },
                        ],
                        name: 'x',
                        color: '#000',
                        source: 'import',
                        timestamp: 1,
                        stats: {
                            distance: 1,
                            dPlus: 1,
                            dMinus: 1,
                            pointCount: 2,
                        },
                        centerLat: 1,
                        centerLon: 1,
                        bounds: { minLat: 1, maxLat: 2, minLon: 1, maxLon: 2 },
                    },
                    { notAnEntry: true },
                    { id: 'bad', simplifiedPoints: [{ lat: 1, lon: 1 }] },
                    null,
                ])
            );
            const history = loadHistory();
            expect(history).toHaveLength(1);
            expect(history[0].id).toBe('ok');
        });

        it('should return [] on corrupt JSON', () => {
            clearHistory(); // reset cache before direct localStorage write
            localStorage.setItem(STORAGE_KEYS.GPX_HISTORY, 'not-json');
            expect(loadHistory()).toEqual([]);
        });
    });

    describe('removeFromHistory', () => {
        it('should remove a specific entry', () => {
            saveToHistory(makeLayer({ id: 'keep' }), 'import');
            saveToHistory(makeLayer({ id: 'drop' }), 'import');
            expect(loadHistory()).toHaveLength(2);
            removeFromHistory('drop');
            const history = loadHistory();
            expect(history).toHaveLength(1);
            expect(history[0].id).toBe('keep');
        });

        it('should be a no-op for unknown id', () => {
            saveToHistory(makeLayer({ id: 'exists' }), 'import');
            removeFromHistory('nope');
            expect(loadHistory()).toHaveLength(1);
        });
    });

    describe('clearHistory', () => {
        it('should remove all entries', () => {
            saveToHistory(makeLayer(), 'import');
            saveToHistory(makeLayer(), 'import');
            expect(loadHistory()).toHaveLength(2);
            clearHistory();
            expect(loadHistory()).toEqual([]);
        });
    });

    describe('isInHistory', () => {
        it('should return true for existing id', () => {
            saveToHistory(makeLayer({ id: 'target' }), 'import');
            expect(isInHistory('target')).toBe(true);
        });

        it('should return false for unknown id', () => {
            expect(isInHistory('missing')).toBe(false);
        });
    });

    describe('updateHistoryEntryLocation', () => {
        it('should set locationName on an entry', () => {
            saveToHistory(makeLayer({ id: 'loc-1' }), 'import');
            updateHistoryEntryLocation('loc-1', 'Chamonix');
            const entry = loadHistory().find((e) => e.id === 'loc-1');
            expect(entry?.locationName).toBe('Chamonix');
        });

        it('should be a no-op for unknown id', () => {
            saveToHistory(makeLayer({ id: 'loc-2' }), 'import');
            updateHistoryEntryLocation('nope', 'Paris');
            expect(loadHistory()[0].locationName).toBeUndefined();
        });

        it('should emit gpxHistoryUpdated event', () => {
            saveToHistory(makeLayer({ id: 'evt' }), 'import');
            updateHistoryEntryLocation('evt', 'Zermatt');
            expect(mockEventBusEmit).toHaveBeenCalledWith('gpxHistoryUpdated');
        });
    });
});
