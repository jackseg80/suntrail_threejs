import { describe, it, expect, vi } from 'vitest';
import type { TileWorkerResponse } from '../types/worker';
import { mergeWorkerResponses } from './tileResponseMerge';

function fakeBitmap(): { close: ReturnType<typeof vi.fn> } & ImageBitmap {
    return { close: vi.fn() } as unknown as {
        close: ReturnType<typeof vi.fn>;
    } & ImageBitmap;
}

function response(
    partial: Partial<TileWorkerResponse> = {}
): TileWorkerResponse {
    return {
        id: 1,
        cacheHits: 0,
        networkRequests: 0,
        ...partial,
    };
}

describe('mergeWorkerResponses', () => {
    it('retourne le repli quand la première réponse est nulle', () => {
        const fallback = response();
        expect(mergeWorkerResponses(null, fallback)).toBe(fallback);
    });

    it('retourne la première réponse quand le repli est nul', () => {
        const first = response();
        expect(mergeWorkerResponses(first, null)).toBe(first);
    });

    it('prend la couleur du repli et garde les autres ressources du premier', () => {
        const firstElev = fakeBitmap();
        const localColor = fakeBitmap();
        const merged = mergeWorkerResponses(
            response({ elevBitmap: firstElev }),
            response({ colorBitmap: localColor })
        )!;
        expect(merged.colorBitmap).toBe(localColor);
        expect(merged.elevBitmap).toBe(firstElev);
    });

    it('préfère les ressources du premier quand les deux existent et ferme les doublons', () => {
        const firstColor = fakeBitmap();
        const localColor = fakeBitmap();
        const firstElev = fakeBitmap();
        const localElev = fakeBitmap();
        const merged = mergeWorkerResponses(
            response({ colorBitmap: firstColor, elevBitmap: firstElev }),
            response({ colorBitmap: localColor, elevBitmap: localElev })
        )!;
        // La couleur manquante vient du repli → l'ancienne couleur est fermée.
        expect(merged.colorBitmap).toBe(localColor);
        expect(firstColor.close).toHaveBeenCalledOnce();
        // L'élévation du premier est conservée → celle du repli est fermée.
        expect(merged.elevBitmap).toBe(firstElev);
        expect(localElev.close).toHaveBeenCalledOnce();
    });

    it('combine les drapeaux et additionne les compteurs', () => {
        const merged = mergeWorkerResponses(
            response({
                cacheHits: 2,
                networkRequests: 1,
                forbidden: true,
            }),
            response({
                cacheHits: 3,
                networkRequests: 4,
                rateLimited: true,
            })
        )!;
        expect(merged.cacheHits).toBe(5);
        expect(merged.networkRequests).toBe(5);
        expect(merged.forbidden).toBe(true);
        expect(merged.rateLimited).toBe(true);
    });

    it('accepte des bitmaps sans méthode close (objets de test)', () => {
        expect(() =>
            mergeWorkerResponses(
                response({ elevBitmap: {} as ImageBitmap }),
                response({ colorBitmap: {} as ImageBitmap })
            )
        ).not.toThrow();
    });
});
