import { describe, expect, it, vi } from 'vitest';
import type { PreparedRouteV1 } from '../preparedRoutes/preparedRoute';
import { CorridorPlanningError } from './routeCorridor';
import { RouteCorridorReadinessService } from './routeCorridorReadiness';

function route(): PreparedRouteV1 {
    return {
        id: 'route-1',
        updatedAt: '2026-08-13T10:00:00.000Z',
        geometry: [
            { lat: 46.8, lon: 7.1, ele: 900 },
            { lat: 46.9, lon: 7.2, ele: 1_100 },
        ],
    } as PreparedRouteV1;
}

describe('RouteCorridorReadinessService', () => {
    it('publie une couverture mesurée et bornée dans le rapport', async () => {
        const inspectTile = vi
            .fn()
            .mockResolvedValueOnce({ covered: true, sizeBytes: 1_000 })
            .mockResolvedValueOnce({ covered: false, sizeBytes: 100 });
        const service = new RouteCorridorReadinessService({
            now: () => Date.parse('2026-08-13T12:00:00.000Z'),
            contextKey: () => 'topo',
            buildPlan: () => ({
                schemaVersion: 1,
                routeId: 'route-1',
                radiusMeters: 1_000,
                minLod: 5,
                maxLod: 14,
                tiles: [
                    { zoom: 14, tx: 8_510, ty: 5_790 },
                    { zoom: 14, tx: 8_511, ty: 5_790 },
                ],
                tileCount: 2,
                estimatedSizeBytes: 160 * 1024,
            }),
            inspectTile,
        });

        expect(service.shouldMeasure(route())).toBe(true);
        await expect(service.measure(route())).resolves.toBe(true);
        expect(service.getInput(route())).toMatchObject({
            kind: 'evidence',
            evidence: {
                source: 'corridor-local-index-v1',
                data: {
                    coveragePercent: 50,
                    coveredTileCount: 1,
                    requiredTileCount: 2,
                    sizeBytes: 1_100,
                    corridorId: null,
                },
            },
        });
        expect(service.shouldMeasure(route())).toBe(false);

        service.invalidate('route-1');
        expect(service.getInput(route())).toBeUndefined();
        expect(service.shouldMeasure(route())).toBe(true);
    });

    it('invalide la mesure lorsque la configuration cartographique change', async () => {
        let context = 'topo';
        const service = new RouteCorridorReadinessService({
            contextKey: () => context,
            buildPlan: () => ({
                schemaVersion: 1,
                routeId: 'route-1',
                radiusMeters: 1_000,
                minLod: 14,
                maxLod: 14,
                tiles: [],
                tileCount: 0,
                estimatedSizeBytes: 0,
            }),
            inspectTile: vi.fn(),
        });
        await service.measure(route());
        context = 'satellite';

        expect(service.getInput(route())).toBeUndefined();
        expect(service.shouldMeasure(route())).toBe(true);
    });

    it('isole un rejet antiméridien comme erreur de section offline', async () => {
        const service = new RouteCorridorReadinessService({
            contextKey: () => 'topo',
            buildPlan: () => {
                throw new CorridorPlanningError('antimeridian');
            },
            inspectTile: vi.fn(),
        });

        await service.measure(route());
        expect(service.getInput(route())).toMatchObject({
            kind: 'error',
            failure: {
                errorCode: 'readiness.offline.antimeridian',
            },
        });
    });
});
