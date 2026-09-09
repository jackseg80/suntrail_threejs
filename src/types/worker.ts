/**
 * worker.ts — Types for Web Worker communication (v5.40.15)
 */

export interface TileWorkerRequest {
    id: number;
    type?: 'cancel';
    tileX?: number;
    tileY?: number;
    elevUrl: string | null;
    colorUrl: string | null;
    overlayUrl: string | null;
    isOffline: boolean;
    zoom: number;
    elevSourceZoom: number;
    is2D: boolean;
    elevBlob?: Blob | null;
    colorBlob?: Blob | null;
    overlayBlob?: Blob | null;
    useCompactNormalmap?: boolean;
    diagnostics?: boolean;
    blobSources?: Partial<
        Record<
            'color' | 'elevation' | 'overlay',
            | 'offline-cache'
            | 'navigation-cache'
            | 'embedded-pmtiles'
            | 'country-pack-opfs'
            | 'country-pack-cdn'
        >
    >;
}

export interface TileWorkerResourceTiming {
    source:
        | 'offline-cache'
        | 'navigation-cache'
        | 'embedded-pmtiles'
        | 'country-pack-opfs'
        | 'country-pack-cdn'
        | 'worker-cache'
        | 'network'
        | 'none'
        | 'error';
    durationMs: number;
    sizeBytes?: number;
    cacheLookupMs?: number;
    readMs?: number;
    networkMs?: number;
    decodeMs?: number;
}

export interface TileWorkerResponse {
    id: number;
    elevBitmap?: ImageBitmap | null;
    colorBitmap?: ImageBitmap | null;
    overlayBitmap?: ImageBitmap | null;
    normalBitmap?: ImageBitmap | null;
    pixelData?: ArrayBuffer;
    cacheHits: number;
    networkRequests: number;
    rateLimited?: boolean;
    networkError?: boolean;
    forbidden?: boolean;
    error?: string;
    workerDurationMs?: number;
    resourceTimings?: Partial<
        Record<'color' | 'elevation' | 'overlay', TileWorkerResourceTiming>
    >;
}
