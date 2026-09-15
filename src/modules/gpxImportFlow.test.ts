import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockGpxService,
    mockTrackService,
    mockPreparedRouteService,
    mockRemoveGPXLayer,
    mockSetRoutePlanningMode,
} = vi.hoisted(() => ({
    mockGpxService: { handleGPXImport: vi.fn() },
    mockTrackService: { archiveImport: vi.fn() },
    mockPreparedRouteService: {
        importGPXLayer: vi.fn(),
        restoreSavedRoute: vi.fn(),
    },
    mockRemoveGPXLayer: vi.fn(),
    mockSetRoutePlanningMode: vi.fn(),
}));

vi.mock('./gpxService', () => ({ gpxService: mockGpxService }));
vi.mock('./tracks/trackService', () => ({ trackService: mockTrackService }));
vi.mock('./preparedRoutes/preparedRouteService', () => ({
    preparedRouteService: mockPreparedRouteService,
}));
vi.mock('./gpxLayers', () => ({ removeGPXLayer: mockRemoveGPXLayer }));
vi.mock('./routeManager', () => ({
    setRoutePlanningMode: mockSetRoutePlanningMode,
}));

import { importGpxTrack, setGpxDraftGuard } from './gpxImportFlow';

const layer = { id: 'layer-1', name: 'Boucle du lac', rawData: {} };
const track = { id: 'track-1' };
const route = { id: 'route-1' };

describe('gpxImportFlow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setGpxDraftGuard(null);
        mockGpxService.handleGPXImport.mockResolvedValue(layer);
        mockTrackService.archiveImport.mockResolvedValue(track);
        mockPreparedRouteService.importGPXLayer.mockResolvedValue(route);
    });

    it('archive la géométrie puis ouvre la route préparée', async () => {
        const outcome = await importGpxTrack('<gpx/>', 'Boucle du lac.gpx');

        expect(mockGpxService.handleGPXImport).toHaveBeenCalledWith(
            '<gpx/>',
            'Boucle du lac.gpx'
        );
        expect(mockTrackService.archiveImport).toHaveBeenCalledWith(layer);
        expect(mockPreparedRouteService.importGPXLayer).toHaveBeenCalledWith(
            layer
        );
        expect(mockRemoveGPXLayer).toHaveBeenCalledWith('layer-1');
        expect(mockPreparedRouteService.restoreSavedRoute).toHaveBeenCalledWith(
            route
        );
        expect(mockSetRoutePlanningMode).toHaveBeenCalledWith(true, {
            announceHint: false,
        });
        expect(outcome).toMatchObject({
            status: 'imported',
            opened: true,
            track,
            route,
        });
    });

    it('archive avant de dériver la route préparée', async () => {
        const order: string[] = [];
        mockTrackService.archiveImport.mockImplementation(async () => {
            order.push('archive');
            return track;
        });
        mockPreparedRouteService.importGPXLayer.mockImplementation(async () => {
            order.push('convert');
            return route;
        });

        await importGpxTrack('<gpx/>', 'x.gpx');

        expect(order).toEqual(['archive', 'convert']);
    });

    it('ignore un doublon sans archiver ni ouvrir', async () => {
        mockGpxService.handleGPXImport.mockResolvedValue(null);

        const outcome = await importGpxTrack('<gpx/>', 'x.gpx');

        expect(outcome.status).toBe('skipped');
        expect(mockTrackService.archiveImport).not.toHaveBeenCalled();
        expect(mockSetRoutePlanningMode).not.toHaveBeenCalled();
    });

    it("n'ouvre pas la route quand le garde refuse", async () => {
        const guard = vi.fn().mockResolvedValue(false);

        const outcome = await importGpxTrack('<gpx/>', 'x.gpx', {
            protectDraft: guard,
        });

        expect(guard).toHaveBeenCalledWith('Boucle du lac');
        expect(outcome).toMatchObject({ status: 'imported', opened: false });
        expect(
            mockPreparedRouteService.restoreSavedRoute
        ).not.toHaveBeenCalled();
        expect(mockSetRoutePlanningMode).not.toHaveBeenCalled();
        expect(mockTrackService.archiveImport).toHaveBeenCalledWith(layer);
    });

    it('utilise le garde global quand aucun garde explicite n’est fourni', async () => {
        const guard = vi.fn().mockResolvedValue(true);
        setGpxDraftGuard(guard);

        await importGpxTrack('<gpx/>', 'x.gpx');

        expect(guard).toHaveBeenCalledWith('Boucle du lac');
    });
});
