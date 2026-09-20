import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddedAssetSource } from './embeddedAssetSource';

describe('EmbeddedAssetSource', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('tronque un corps 206 Android trop long à la plage demandée', async () => {
        const bytes = new Uint8Array([20, 21, 22, 23, 24, 25]);
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(bytes, {
                status: 206,
                headers: {
                    'content-range': 'bytes 20-22/26',
                    'content-length': '3',
                },
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await new EmbeddedAssetSource('/pack.pmtiles').getBytes(
            20,
            3
        );

        expect([...new Uint8Array(result.data)]).toEqual([20, 21, 22]);
        expect(fetchMock).toHaveBeenCalledWith('/pack.pmtiles', {
            headers: { Range: 'bytes=20-22' },
            signal: undefined,
        });
    });

    it('annule le flux 206 après les octets utiles', async () => {
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([20, 21, 22]));
                controller.enqueue(new Uint8Array([23, 24, 25]));
            },
            cancel,
        });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(body, {
                    status: 206,
                    headers: { 'content-range': 'bytes 20-22/26' },
                })
            )
        );

        const result = await new EmbeddedAssetSource('/pack.pmtiles').getBytes(
            20,
            3
        );

        expect([...new Uint8Array(result.data)]).toEqual([20, 21, 22]);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('découpe une réponse 200 contenant le fichier complet', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response(new Uint8Array([0, 1, 2, 3, 4, 5]))
                )
        );

        const result = await new EmbeddedAssetSource('/pack.pmtiles').getBytes(
            2,
            3
        );

        expect([...new Uint8Array(result.data)]).toEqual([2, 3, 4]);
    });

    it('rejette une réponse tronquée', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(new Uint8Array([1, 2]), {
                    status: 206,
                    headers: { 'content-range': 'bytes 10-13/20' },
                })
            )
        );

        await expect(
            new EmbeddedAssetSource('/pack.pmtiles').getBytes(10, 4)
        ).rejects.toThrow('Asset PMTiles tronqué');
    });
});
