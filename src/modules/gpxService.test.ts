import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockParse, mockGPXParser } = vi.hoisted(() => {
    const mockParse = vi.fn();
    const mockGPXParser = vi.fn(function (this: any) {
        this.parse = mockParse;
        this.tracks = null;
    });
    return { mockParse, mockGPXParser };
});

vi.mock('gpxparser', () => ({ default: mockGPXParser }));

vi.mock('./state', () => ({
    state: {
        gpxLayers: [] as any[],
        TARGET_LAT: 46.0,
        TARGET_LON: 7.0,
        ZOOM: 10,
        originTile: { x: 0, y: 0, z: 10 }
    },
    isProActive: vi.fn(() => false)
}));

vi.mock('./iap', () => ({ showUpgradePrompt: vi.fn() }));
vi.mock('./haptics', () => ({ haptic: vi.fn() }));
vi.mock('./gpxLayers', () => ({ addGPXLayer: vi.fn() }));
vi.mock('./terrain', () => ({ updateVisibleTiles: vi.fn() }));
vi.mock('./geo', () => ({ lngLatToTile: vi.fn(() => ({ x: 2130, y: 1445, z: 13 })) }));

import { GPXService } from './gpxService';
import { state, isProActive } from './state';
import { showUpgradePrompt } from './iap';
import { haptic } from './haptics';
import { addGPXLayer } from './gpxLayers';
import { updateVisibleTiles } from './terrain';
import { lngLatToTile } from './geo';

const mockHaptic = haptic as ReturnType<typeof vi.fn>;
const mockAddGPXLayer = addGPXLayer as ReturnType<typeof vi.fn>;
const mockUpdateVisibleTiles = updateVisibleTiles as ReturnType<typeof vi.fn>;
const mockLngLatToTile = lngLatToTile as ReturnType<typeof vi.fn>;
const mockIsProActive = isProActive as ReturnType<typeof vi.fn>;
const mockShowUpgradePrompt = showUpgradePrompt as ReturnType<typeof vi.fn>;

describe('GPXService', () => {
    let gpxService: GPXService;
    const validTrack = {
        tracks: [{
            points: [
                { lat: 46.5, lon: 7.5, ele: 1000, time: '2024-01-01T10:00:00Z' },
                { lat: 46.51, lon: 7.51, ele: 1100, time: '2024-01-01T10:30:00Z' }
            ]
        }]
    };

    beforeEach(() => {
        vi.clearAllMocks();
        state.gpxLayers = [];
        state.TARGET_LAT = 46.0;
        state.TARGET_LON = 7.0;
        state.ZOOM = 10;
        state.originTile = { x: 0, y: 0, z: 10 };
        mockIsProActive.mockReturnValue(false);
        mockLngLatToTile.mockReturnValue({ x: 2130, y: 1445, z: 13 });

        gpxService = new GPXService();
    });

    describe('handleGPXImport', () => {
        it('should import a GPX track successfully', async () => {
            mockParse.mockImplementation(function (this: any) {
                this.tracks = validTrack.tracks;
            });

            await gpxService.handleGPXImport('<gpx>...</gpx>', 'test.gpx');

            expect(mockAddGPXLayer).toHaveBeenCalledTimes(1);
            const gpxArg = mockAddGPXLayer.mock.calls[0][0];
            expect(gpxArg.tracks).toEqual(validTrack.tracks);
            expect(mockAddGPXLayer.mock.calls[0][1]).toBe('test');
            expect(mockHaptic).toHaveBeenCalledWith('success');
        });

        it('should handle GPX with no tracks (invalid file)', async () => {
            mockParse.mockImplementation(function (this: any) {
                this.tracks = [];
            });

            await gpxService.handleGPXImport('<gpx></gpx>', 'empty.gpx');

            expect(mockAddGPXLayer).not.toHaveBeenCalled();
            expect(mockHaptic).toHaveBeenCalledWith('warning');
        });

        it('should recenter map on first GPX import', async () => {
            mockParse.mockImplementation(function (this: any) {
                this.tracks = validTrack.tracks;
            });
            state.gpxLayers = [];
            state.originTile = { x: 0, y: 0, z: 10 };

            await gpxService.handleGPXImport('<gpx>...</gpx>', 'first.gpx');

            expect(state.TARGET_LAT).toBe(46.5);
            expect(state.TARGET_LON).toBe(7.5);
            expect(state.ZOOM).toBe(13);
            expect(mockLngLatToTile).toHaveBeenCalledWith(7.5, 46.5, 13);
            expect(mockUpdateVisibleTiles).toHaveBeenCalled();
        });

        it('should NOT recenter map on subsequent GPX imports', async () => {
            mockParse.mockImplementation(function (this: any) {
                this.tracks = validTrack.tracks;
            });
            state.gpxLayers = [{ id: 'existing', name: 'Existing Track' } as any];
            state.TARGET_LAT = 47.0;
            state.TARGET_LON = 8.0;
            state.ZOOM = 11;

            await gpxService.handleGPXImport('<gpx>...</gpx>', 'second.gpx');

            expect(state.TARGET_LAT).toBe(47.0);
            expect(state.TARGET_LON).toBe(8.0);
            expect(state.ZOOM).toBe(11);
            expect(mockUpdateVisibleTiles).not.toHaveBeenCalled();
        });

        it('should block free users from importing more than 1 track', async () => {
            mockParse.mockImplementation(function (this: any) {
                this.tracks = validTrack.tracks;
            });
            mockIsProActive.mockReturnValue(false);
            state.gpxLayers = [{ id: 'existing', name: 'Existing' } as any];

            await gpxService.handleGPXImport('<gpx>...</gpx>', 'blocked.gpx');

            expect(mockShowUpgradePrompt).toHaveBeenCalledWith('multi_gpx');
            expect(mockHaptic).toHaveBeenCalledWith('warning');
            expect(mockAddGPXLayer).not.toHaveBeenCalled();
        });

        it('should allow pro users to import multiple tracks', async () => {
            mockParse.mockImplementation(function (this: any) {
                this.tracks = validTrack.tracks;
            });
            mockIsProActive.mockReturnValue(true);
            state.gpxLayers = [{ id: 'existing', name: 'Existing' } as any];

            await gpxService.handleGPXImport('<gpx>...</gpx>', 'pro-track.gpx');

            expect(mockShowUpgradePrompt).not.toHaveBeenCalled();
            expect(mockAddGPXLayer).toHaveBeenCalled();
            expect(mockHaptic).toHaveBeenCalledWith('success');
        });

        it('should throw on parse error', async () => {
            mockParse.mockImplementation(() => {
                throw new Error('Invalid XML');
            });

            await expect(
                gpxService.handleGPXImport('<bad>', 'bad.gpx')
            ).rejects.toThrow('Invalid XML');

            expect(mockHaptic).toHaveBeenCalledWith('warning');
        });

        it('should use default filename if none provided', async () => {
            mockParse.mockImplementation(function (this: any) {
                this.tracks = validTrack.tracks;
            });

            await gpxService.handleGPXImport('<gpx>...</gpx>');

            expect(mockAddGPXLayer).toHaveBeenCalled();
            expect(mockAddGPXLayer.mock.calls[0][1]).toBe('track');
        });
    });

    describe('buildGPXStringFromLayer', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should generate valid GPX XML from a layer', () => {
            const layer = {
                name: 'My Track',
                rawData: {
                    tracks: [{
                        points: [
                            { lat: 46.5, lon: 7.5, ele: 1000, time: '2024-01-01T10:00:00Z' },
                            { lat: 46.51, lon: 7.51, ele: 1100, time: '2024-01-01T10:30:00Z' }
                        ]
                    }]
                }
            };

            const result = gpxService.buildGPXStringFromLayer(layer);

            expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(result).toContain('<name>My Track</name>');
            expect(result).toContain('lat="46.5" lon="7.5"');
            expect(result).toContain('<ele>1000.0</ele>');
            expect(result).toContain('lat="46.51" lon="7.51"');
            expect(result).toContain('<ele>1100.0</ele>');
        });

        it('should use alt when ele is undefined', () => {
            const layer = {
                name: 'Alt Track',
                rawData: {
                    tracks: [{
                        points: [
                            { lat: 46.5, lon: 7.5, alt: 1500 },
                            { lat: 46.51, lon: 7.51 }
                        ]
                    }]
                }
            };

            const result = gpxService.buildGPXStringFromLayer(layer);

            expect(result).toContain('<ele>1500.0</ele>');
            expect(result).toContain('<ele>0.0</ele>');
        });

        it('should use fallback name when layer has no name', () => {
            const layer = {
                rawData: {
                    tracks: [{ points: [{ lat: 46.5, lon: 7.5, ele: 500 }] }]
                }
            };

            const result = gpxService.buildGPXStringFromLayer(layer);

            expect(result).toContain(`<name>SunTrail Track - `);
        });

        it('should handle layers with no points', () => {
            const layer = {
                name: 'Empty',
                rawData: { tracks: [{ points: [] }] }
            };

            const result = gpxService.buildGPXStringFromLayer(layer);

            expect(result).toContain('<trkseg>');
            expect(result).toContain('</trkseg>');
            expect(result).not.toContain('<trkpt');
        });
    });
});
