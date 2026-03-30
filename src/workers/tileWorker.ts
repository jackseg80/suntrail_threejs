/**
 * SunTrail Tile Worker (v5.6.7)
 * Déportation du fetch et du décodage d'images avec support CacheStorage.
 * v5.6.7 : AbortController par task — fetch annulé dès que la tuile est disposée côté main.
 */

const CACHE_NAME = 'suntrail-tiles-v1';

/**
 * AbortControllers actifs par task ID.
 * Permet d'annuler les fetches HTTP en cours quand le main thread envoie { type:'cancel', id }.
 */
const activeControllers = new Map<number, AbortController>();

self.onmessage = async (e) => {
    const { id, type, elevUrl, colorUrl, overlayUrl, isOffline, zoom, elevSourceZoom } = e.data;

    // --- ANNULATION ---
    if (type === 'cancel') {
        const ctrl = activeControllers.get(id);
        if (ctrl) ctrl.abort();
        activeControllers.delete(id);
        return;
    }

    // Créer un AbortController pour cette task — annulable via message 'cancel'
    const controller = new AbortController();
    activeControllers.set(id, controller);
    const { signal } = controller;

    try {
        const results: any = { id, cacheHits: 0, networkRequests: 0 };
        const transferables: Transferable[] = [];

        // --- EXÉCUTION PARALLÈLE ---
        const [elevRes, colorRes, overlayRes] = await Promise.all([
            elevUrl ? fetchTile(elevUrl, isOffline, signal) : Promise.resolve(null),
            colorUrl ? fetchTile(colorUrl, isOffline, signal) : Promise.resolve(null),
            overlayUrl ? fetchTile(overlayUrl, isOffline, signal) : Promise.resolve(null)
        ]);

        // Si la task a été annulée pendant les fetches, ne pas répondre
        if (!activeControllers.has(id)) return;

        if (elevRes) {
            if (elevRes.forbidden) results.forbidden = true;
            if (elevRes.fromCache) results.cacheHits++; else results.networkRequests++;
            if (elevRes.bitmap) {
                results.elevBitmap = elevRes.bitmap;
                transferables.push(elevRes.bitmap);

                const { width, height } = elevRes.bitmap;
                const canvas = new OffscreenCanvas(width, height);
                const ctx = canvas.getContext('2d', { alpha: false });
                if (ctx) {
                    ctx.drawImage(elevRes.bitmap, 0, 0);
                    const imageData = ctx.getImageData(0, 0, width, height);
                    const data = imageData.data;
                    results.pixelData = data.buffer;
                    transferables.push(results.pixelData);

                    // --- GÉNÉRATION NORMAL MAP ---
                    // Utilise elevSourceZoom (zoom réel des données) pour calculer la taille des pixels
                    // Cela corrige le bug où les pentes devenaient fausses à LOD > 14
                    const normalData = new Uint8ClampedArray(width * height * 4);
                    const sourceZ = elevSourceZoom || zoom || 14;
                    const tileSizeMeters = 40075016.686 / Math.pow(2, sourceZ);
                    const pixelSize = tileSizeMeters / width;

                    for (let py = 0; py < height; py++) {
                        for (let px = 0; px < width; px++) {
                            const idx = (py * width + px) * 4;
                            const getH = (x: number, y: number) => {
                                const ix = Math.max(0, Math.min(width - 1, x));
                                const iy = Math.max(0, Math.min(height - 1, y));
                                const i = (iy * width + ix) * 4;
                                return -10000.0 + ((data[i] * 65536.0 + data[i+1] * 256.0 + data[i+2]) * 0.1);
                            };
                            const hL = getH(px - 1, py), hR = getH(px + 1, py), hD = getH(px, py - 1), hU = getH(px, py + 1);
                            const vx = hL - hR, vy = pixelSize * 2.0, vz = hD - hU;
                            const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
                            normalData[idx] = ((vx / len) * 0.5 + 0.5) * 255;
                            normalData[idx+1] = ((vy / len) * 0.5 + 0.5) * 255;
                            normalData[idx+2] = ((vz / len) * 0.5 + 0.5) * 255;
                            normalData[idx+3] = 255;
                        }
                    }
                    const nCanvas = new OffscreenCanvas(width, height);
                    const nCtx = nCanvas.getContext('2d');
                    if (nCtx) {
                        nCtx.putImageData(new ImageData(normalData, width, height), 0, 0);
                        const normalBitmap = nCanvas.transferToImageBitmap();
                        results.normalBitmap = normalBitmap;
                        transferables.push(normalBitmap);
                    }
                }
            }
        }

        if (colorRes) {
            if (colorRes.forbidden) results.forbidden = true;
            if (colorRes.fromCache) results.cacheHits++; else results.networkRequests++;
            if (colorRes.bitmap) {
                results.colorBitmap = colorRes.bitmap;
                transferables.push(colorRes.bitmap);
            }
        }

        if (overlayRes) {
            if (overlayRes.forbidden) results.forbidden = true;
            if (overlayRes.fromCache) results.cacheHits++; else results.networkRequests++;
            if (overlayRes.bitmap) {
                results.overlayBitmap = overlayRes.bitmap;
                transferables.push(overlayRes.bitmap);
            }
        }

        (self as any).postMessage(results, transferables);

    } catch (err: any) {
        // AbortError = annulation normale, ne pas signaler comme erreur
        if (err.name !== 'AbortError') self.postMessage({ id, error: err.message });
    } finally {
        activeControllers.delete(id);
    }
};

async function fetchTile(url: string, isOffline: boolean, signal?: AbortSignal): Promise<{ bitmap: ImageBitmap, fromCache: boolean, forbidden?: boolean } | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(url);
        if (cached) {
            const blob = await cached.blob();
            const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
            return { bitmap, fromCache: true };
        }
        if (isOffline) return null;
        const response = await fetch(url, { mode: 'cors', signal });
        if (response.status === 403) return { bitmap: null as any, fromCache: false, forbidden: true };
        if (!response.ok) return null;
        const blob = await response.blob();
        cache.put(url, new Response(blob.slice()));
        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
        return { bitmap, fromCache: false };
    } catch (e: any) {
        if (e.name === 'AbortError') throw e; // Propager pour que le handler principal sorte proprement
        return null;
    }
}
