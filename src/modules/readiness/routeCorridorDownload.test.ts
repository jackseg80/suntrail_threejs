import { describe, expect, it, vi } from 'vitest';
import type { RouteCorridorPlanV1 } from './routeCorridor';
import {
    buildCorridorDownloadQueue,
    CorridorDownloadError,
    downloadRouteCorridor,
    type CorridorDownloadResource,
} from './routeCorridorDownload';

function plan(): RouteCorridorPlanV1 {
    return {
        schemaVersion: 1,
        routeId: 'route-download-1',
        radiusMeters: 1_000,
        minLod: 13,
        maxLod: 14,
        tiles: [
            { zoom: 13, tx: 4_255, ty: 2_895 },
            { zoom: 14, tx: 8_510, ty: 5_790 },
        ],
        tileCount: 2,
        estimatedSizeBytes: 160 * 1024,
    };
}

function resources(tile: {
    zoom: number;
    tx: number;
    ty: number;
}): CorridorDownloadResource[] {
    return [
        {
            ...tile,
            type: 'color',
            url: `https://tiles.test/color/${tile.zoom}/${tile.tx}/${tile.ty}`,
        },
        {
            ...tile,
            type: 'elevation',
            url: 'https://tiles.test/shared-elevation',
        },
    ];
}

describe('buildCorridorDownloadQueue', () => {
    it('déduplique les ressources sans dépendre du pays', () => {
        const queue = buildCorridorDownloadQueue(plan(), resources);

        expect(queue).toHaveLength(3);
        expect(queue.map((resource) => resource.type)).toEqual([
            'color',
            'elevation',
            'color',
        ]);
    });

    it('rejette un plan incohérent', () => {
        expect(() =>
            buildCorridorDownloadQueue({ ...plan(), tileCount: 3 }, resources)
        ).toThrow(CorridorDownloadError);
    });
});

describe('downloadRouteCorridor', () => {
    it('publie une progression exacte et termine seulement sur des blobs valides', async () => {
        const onProgress = vi.fn();
        const fetchResource = vi.fn(async () => new Blob(['12345']));

        await expect(
            downloadRouteCorridor(
                plan(),
                { concurrency: 2, onProgress },
                { resolveResources: resources, fetchResource }
            )
        ).resolves.toEqual({
            status: 'completed',
            processedResourceCount: 3,
            successfulResourceCount: 3,
            failedResourceCount: 0,
            totalResourceCount: 3,
            sizeBytes: 15,
        });
        expect(onProgress).toHaveBeenLastCalledWith({
            processedResourceCount: 3,
            successfulResourceCount: 3,
            failedResourceCount: 0,
            totalResourceCount: 3,
            sizeBytes: 15,
        });
    });

    it('retourne partial si une ressource manque au lieu de masquer l’échec', async () => {
        const fetchResource = vi.fn(
            async (resource: CorridorDownloadResource) =>
                resource.type === 'elevation' ? null : new Blob(['ok'])
        );

        await expect(
            downloadRouteCorridor(
                plan(),
                {},
                { resolveResources: resources, fetchResource }
            )
        ).resolves.toMatchObject({
            status: 'partial',
            processedResourceCount: 3,
            successfulResourceCount: 2,
            failedResourceCount: 1,
        });
    });

    it('conserve les ressources acquises à l’annulation pour permettre la reprise', async () => {
        const controller = new AbortController();
        const onProgress = vi.fn(
            (progress: { processedResourceCount: number }) => {
                if (progress.processedResourceCount === 1) controller.abort();
            }
        );
        const fetchResource = vi.fn(async () => new Blob(['ok']));

        await expect(
            downloadRouteCorridor(
                plan(),
                { concurrency: 1, signal: controller.signal, onProgress },
                { resolveResources: resources, fetchResource }
            )
        ).resolves.toMatchObject({
            status: 'cancelled',
            processedResourceCount: 1,
            successfulResourceCount: 1,
            failedResourceCount: 0,
            totalResourceCount: 3,
        });
        expect(fetchResource).toHaveBeenCalledTimes(1);
    });

    it('borne la concurrence pour protéger le terminal et les serveurs', async () => {
        await expect(
            downloadRouteCorridor(
                plan(),
                { concurrency: 9 },
                { resolveResources: resources }
            )
        ).rejects.toMatchObject({ code: 'invalid-options' });
    });

    it('propage le mode strictement local à chaque ressource', async () => {
        const fetchResource = vi.fn(
            async (
                _resource: CorridorDownloadResource,
                _signal?: AbortSignal,
                _networkAllowed?: boolean
            ) => new Blob(['ok'])
        );

        await downloadRouteCorridor(
            plan(),
            { networkAllowed: false },
            { resolveResources: resources, fetchResource }
        );

        expect(fetchResource).toHaveBeenCalled();
        expect(
            fetchResource.mock.calls.every((call) => call[2] === false)
        ).toBe(true);
    });
});
