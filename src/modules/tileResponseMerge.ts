import type { TileWorkerResponse } from '../types/worker';

type BitmapKey =
    'elevBitmap' | 'colorBitmap' | 'overlayBitmap' | 'normalBitmap';

const BITMAP_KEYS: BitmapKey[] = [
    'elevBitmap',
    'colorBitmap',
    'overlayBitmap',
    'normalBitmap',
];

function closeBitmap(bitmap: ImageBitmap | null | undefined): void {
    if (!bitmap) return;
    const close = (bitmap as { close?: () => void }).close;
    if (typeof close === 'function') close.call(bitmap);
}

/**
 * Fusionne une réponse worker « distante » (`first`) et la réponse d'un repli
 * local (`fallback`). La couleur manquante vient du repli ; les autres
 * ressources gardent la première réponse quand elle existe.
 *
 * Les `ImageBitmap` écartés sont fermés pour ne pas retenir de mémoire GPU :
 * chaque bitmap transféré n'est utilisé qu'une fois.
 */
export function mergeWorkerResponses(
    first: TileWorkerResponse | null,
    fallback: TileWorkerResponse | null
): TileWorkerResponse | null {
    if (!first) return fallback;
    if (!fallback) return first;

    const merged: TileWorkerResponse = {
        ...first,
        cacheHits: (first.cacheHits || 0) + (fallback.cacheHits || 0),
        networkRequests:
            (first.networkRequests || 0) + (fallback.networkRequests || 0),
        forbidden: !!(first.forbidden || fallback.forbidden),
        rateLimited: !!(first.rateLimited || fallback.rateLimited),
        networkError: !!(first.networkError || fallback.networkError),
        workerDurationMs:
            (first.workerDurationMs || 0) + (fallback.workerDurationMs || 0),
        resourceTimings: {
            ...first.resourceTimings,
            ...fallback.resourceTimings,
        },
    };

    for (const key of BITMAP_KEYS) {
        const fromFirst = first[key] ?? null;
        const fromFallback = fallback[key] ?? null;
        if (key === 'colorBitmap') {
            merged[key] = fromFallback ?? fromFirst;
            if (fromFirst && fromFallback) closeBitmap(fromFirst);
        } else {
            merged[key] = fromFirst ?? fromFallback;
            if (fromFirst && fromFallback) closeBitmap(fromFallback);
        }
    }

    merged.pixelData = first.pixelData ?? fallback.pixelData;
    return merged;
}
