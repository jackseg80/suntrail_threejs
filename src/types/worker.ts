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
}
