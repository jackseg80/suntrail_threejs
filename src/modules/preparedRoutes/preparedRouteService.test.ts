import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { state } from '../state';
import { RouteRepository } from './RouteRepository';
import { PreparedRouteService } from './preparedRouteService';

function setupDraft(): void {
    state.routeWaypoints = [
        { lat: 46.5, lon: 7.5, name: 'A' },
        { lat: 46.6, lon: 7.6, name: 'B' },
    ];
    state.routeComputation = {
        name: 'A → B',
        geometry: [
            { lat: 46.5, lon: 7.5, ele: 1000 },
            { lat: 46.6, lon: 7.6, ele: 1300 },
        ],
        distance: 7,
        duration: 110,
        ascent: 350,
        descent: 50,
        routingSource: 'osrm',
        guidanceQuality: 'full',
        technicalDifficulty: {
            status: 'unknown',
            source: 'osrm',
            sacLevel: null,
            coveragePercent: 0,
            reason: 'osrm-fallback',
        },
        dataCoverage: {
            trailDifficulty: 0,
            steepness: 0,
            surface: 0,
            wayType: 0,
        },
    };
    state.routeDraftName = 'Tour locale';
    state.routePlannedStartAt = '2026-08-09T06:00:00.000Z';
    state.routePlannedPaceKmh = 4;
    state.routeDraftFavorite = false;
    state.routeDraftNotes = 'Eau au départ';
    state.routeDraftTags = ['famille'];
    state.routeDraftDirty = true;
    state.routeLoopEnabled = true;
    state.activePreparedRouteId = null;
    state.routeDraftSourceLayerId = null;
    state.preparedRoutes = [];
}

describe('PreparedRouteService integration', () => {
    beforeEach(setupDraft);

    it('saves and reopens the repository state after a service restart', async () => {
        const factory = new FakeIDBFactory();
        const firstRepository = new RouteRepository(factory, 'service-reload');
        const firstService = new PreparedRouteService(firstRepository);
        await firstService.initialize();
        const saved = await firstService.saveCurrentDraft();
        expect(saved.stats.technicalDifficulty.status).toBe('unknown');
        expect(saved.stats.effort.score).toBeGreaterThan(0);
        expect(saved.stats.light.etaAt).toBeTruthy();
        expect(saved.loopEnabled).toBe(true);
        expect(state.routeDraftDirty).toBe(false);
        await firstService.close();

        state.preparedRoutes = [];
        const secondService = new PreparedRouteService(
            new RouteRepository(factory, 'service-reload')
        );
        await secondService.initialize();
        expect(state.preparedRoutes).toHaveLength(1);
        expect(state.preparedRoutes[0].geometry).toEqual(
            state.routeComputation?.geometry
        );
        state.routeLoopEnabled = false;
        await secondService.load(saved.id);
        expect(state.routeLoopEnabled).toBe(true);
        await secondService.close();
    });

    it('turns the active imported GPX into a distinct unsaved draft', () => {
        const service = new PreparedRouteService(
            new RouteRepository(new FakeIDBFactory(), 'service-gpx-draft')
        );
        const layer = {
            id: 'gpx-active',
            name: 'Tour du lac',
            visible: true,
            isManualRoute: false,
            rawData: {
                tracks: [
                    {
                        name: 'Tour du lac',
                        points: [
                            { lat: 46.5, lon: 7.5, ele: 1000 },
                            { lat: 46.6, lon: 7.6, ele: 1100 },
                        ],
                    },
                ],
            },
            points: [],
            mesh: null,
            color: '#fff',
            stats: {
                distance: 8,
                dPlus: 300,
                dMinus: 300,
                pointCount: 2,
                estimatedTime: 150,
            },
        } as any;
        state.gpxLayers = [layer];
        state.activeGPXLayerId = layer.id;

        service.prepareGPXLayerAsDraft(layer);

        expect(state.routeDraftName).toBe('Tour du lac');
        expect(state.routeComputation?.routingSource).toBe('gpx');
        expect(state.activePreparedRouteId).toBeNull();
        expect(state.routeDraftSourceLayerId).toBe(layer.id);
        expect(state.routeLoopEnabled).toBe(false);
        expect(state.routeWaypoints[0].name).toContain('46.50000');
    });

    it('does not overwrite the last save when an interrupted draft changes', async () => {
        const repository = new RouteRepository(
            new FakeIDBFactory(),
            'service-draft'
        );
        const service = new PreparedRouteService(repository);
        await service.initialize();
        const saved = await service.saveCurrentDraft();

        state.routeDraftName = 'Brouillon interrompu';
        state.routeDraftDirty = true;
        state.routeComputation = null;
        const persisted = await repository.get(saved.id);
        expect(persisted?.name).toBe('Tour locale');
        expect(persisted?.geometry).toHaveLength(2);
    });

    it('duplicates, favorites and deletes without Pro entitlement', async () => {
        const service = new PreparedRouteService(
            new RouteRepository(new FakeIDBFactory(), 'service-actions')
        );
        await service.initialize();
        const saved = await service.saveCurrentDraft();
        const favorite = await service.toggleFavorite(saved.id);
        expect(favorite.favorite).toBe(true);
        const duplicate = await service.duplicate(saved.id);
        expect(duplicate.id).not.toBe(saved.id);
        expect(state.preparedRoutes).toHaveLength(2);
        await service.delete(saved.id);
        expect(state.preparedRoutes.map((route) => route.id)).toEqual([
            duplicate.id,
        ]);
    });
});
