import { describe, expect, it, vi } from 'vitest';
import type { RouteCorridorPlanV1 } from './routeCorridor';
import { getRouteCorridorPreflight } from './routeCorridorPreflight';

const plan: RouteCorridorPlanV1 = {
    schemaVersion: 1,
    routeId: 'route-1',
    radiusMeters: 1_000,
    minLod: 5,
    maxLod: 14,
    tiles: [{ zoom: 14, tx: 8_510, ty: 5_790 }],
    tileCount: 1,
    estimatedSizeBytes: 80 * 1024,
};

describe('getRouteCorridorPreflight', () => {
    it('demande une confirmation seulement sur réseau cellulaire', async () => {
        const result = await getRouteCorridorPreflight(
            plan,
            { networkAvailable: true, connectionType: 'cellular' },
            { estimateStorage: vi.fn(async () => ({})) }
        );
        expect(result).toMatchObject({
            networkType: 'cellular',
            networkAllowed: true,
            requiresCellularConfirmation: true,
            quotaStatus: 'unknown',
        });
    });

    it('désactive le réseau mais conserve un préflight local en mode hors ligne', async () => {
        const result = await getRouteCorridorPreflight(
            plan,
            { networkAvailable: false, connectionType: 'wifi' },
            {
                estimateStorage: vi.fn(async () => ({
                    usage: 10,
                    quota: 200_000,
                })),
            }
        );
        expect(result).toMatchObject({
            networkType: 'none',
            networkAllowed: false,
            requiresCellularConfirmation: false,
            quotaStatus: 'sufficient',
        });
    });

    it('signale factuellement une marge inférieure à l’estimation', async () => {
        const result = await getRouteCorridorPreflight(
            plan,
            { networkAvailable: true, connectionType: 'wifi' },
            {
                estimateStorage: vi.fn(async () => ({
                    usage: 100_000,
                    quota: 150_000,
                })),
            }
        );
        expect(result.quotaStatus).toBe('insufficient');
        expect(result.availableBytes).toBe(50_000);
    });

    it('laisse le quota inconnu si l’API échoue', async () => {
        const result = await getRouteCorridorPreflight(
            plan,
            { networkAvailable: true, connectionType: 'unknown' },
            {
                estimateStorage: vi.fn(async () => {
                    throw new Error('unavailable');
                }),
            }
        );
        expect(result.quotaStatus).toBe('unknown');
        expect(result.availableBytes).toBeNull();
    });
});
