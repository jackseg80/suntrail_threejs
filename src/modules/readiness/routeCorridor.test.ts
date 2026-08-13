import { describe, expect, it, vi } from 'vitest';
import type {
    PreparedRouteV1,
    RoutePoint,
} from '../preparedRoutes/preparedRoute';
import {
    buildRouteCorridorPlan,
    CorridorPlanningError,
    measureCorridorCoverage,
} from './routeCorridor';

function route(geometry: RoutePoint[]): PreparedRouteV1 {
    return { id: 'route-corridor-1', geometry } as PreparedRouteV1;
}

describe('buildRouteCorridorPlan', () => {
    it('construit un plan Free déterministe, borné et sans doublons', () => {
        const input = route([
            { lat: 46.8, lon: 7.1, ele: 900 },
            { lat: 46.82, lon: 7.13, ele: 1_100 },
            { lat: 46.84, lon: 7.16, ele: 1_250 },
        ]);
        const first = buildRouteCorridorPlan(input);
        const second = buildRouteCorridorPlan(input);

        expect(first).toEqual(second);
        expect(first).toMatchObject({
            schemaVersion: 1,
            routeId: 'route-corridor-1',
            radiusMeters: 1_000,
            minLod: 5,
            maxLod: 14,
        });
        expect(first.tileCount).toBeGreaterThan(0);
        expect(
            new Set(
                first.tiles.map((tile) => `${tile.zoom}/${tile.tx}/${tile.ty}`)
            ).size
        ).toBe(first.tileCount);
        expect(
            first.tiles.every((tile) => tile.zoom >= 5 && tile.zoom <= 14)
        ).toBe(true);
    });

    it('élargit réellement la sélection pour un corridor de 2 km', () => {
        const input = route([
            { lat: 46.8, lon: 7.1, ele: 900 },
            { lat: 46.86, lon: 7.18, ele: 1_200 },
        ]);
        const narrow = buildRouteCorridorPlan(input, {
            radiusMeters: 500,
            minLod: 14,
            maxLod: 14,
        });
        const wide = buildRouteCorridorPlan(input, {
            radiusMeters: 2_000,
            minLod: 14,
            maxLod: 14,
        });

        expect(wide.tileCount).toBeGreaterThan(narrow.tileCount);
    });

    it('rejette explicitement un tracé qui franchit l’antiméridien', () => {
        expect(() =>
            buildRouteCorridorPlan(
                route([
                    { lat: 10, lon: 179.8, ele: 0 },
                    { lat: 10.1, lon: -179.8, ele: 0 },
                ])
            )
        ).toThrowError(expect.objectContaining({ code: 'antimeridian' }));
    });

    it('échoue avant de dépasser la limite de volume', () => {
        expect(() =>
            buildRouteCorridorPlan(
                route([
                    { lat: 46, lon: 6, ele: 0 },
                    { lat: 48, lon: 10, ele: 0 },
                ]),
                { minLod: 14, maxLod: 14, maxTiles: 10 }
            )
        ).toThrowError(expect.objectContaining({ code: 'too-large' }));
    });

    it('rejette les options hors contrat', () => {
        expect(() =>
            buildRouteCorridorPlan(
                route([
                    { lat: 46.8, lon: 7.1, ele: 0 },
                    { lat: 46.9, lon: 7.2, ele: 0 },
                ]),
                { minLod: 15, maxLod: 14 }
            )
        ).toThrow(CorridorPlanningError);
    });
});

describe('measureCorridorCoverage', () => {
    it('mesure uniquement les tuiles intégralement disponibles', async () => {
        const plan = {
            schemaVersion: 1 as const,
            routeId: 'route-corridor-1',
            radiusMeters: 1_000 as const,
            minLod: 14,
            maxLod: 14,
            tiles: [
                { zoom: 14, tx: 8_510, ty: 5_790 },
                { zoom: 14, tx: 8_511, ty: 5_790 },
                { zoom: 14, tx: 8_512, ty: 5_790 },
            ],
            tileCount: 3,
            estimatedSizeBytes: 3 * 80 * 1024,
        };
        const inspect = vi.fn(async (tile: { tx: number }) => ({
            covered: tile.tx !== 8_511,
            sizeBytes: tile.tx === 8_511 ? 100 : 1_000,
        }));

        await expect(
            measureCorridorCoverage(plan, inspect, 2)
        ).resolves.toEqual({
            coveragePercent: 66.7,
            coveredTileCount: 2,
            requiredTileCount: 3,
            sizeBytes: 2_100,
        });
        expect(inspect).toHaveBeenCalledTimes(3);
    });
});
