/// <reference lib="webworker" />

/**
 * SunTrail Tile Worker (v5.0.0)
 * Déportation du fetch et du décodage d'images avec support CacheStorage.
 */

const CACHE_NAME = 'suntrail-tiles-v1';

self.onmessage = async (e) => {
    const { id, elevUrl, colorUrl, overlayUrl, isOffline } = e.data;

    try {
        const results: any = { id };
        const transferables: Transferable[] = [];

        // --- EXÉCUTION PARALLÈLE ---
        const [elevRes, colorRes, overlayRes] = await Promise.all([
            elevUrl ? fetchTile(elevUrl, isOffline) : Promise.resolve(null),
            colorUrl ? fetchTile(colorUrl, isOffline) : Promise.resolve(null),
            overlayUrl ? fetchTile(overlayUrl, isOffline) : Promise.resolve(null)
        ]);

        // --- TRAITEMENT ÉLÉVATION (RGBA -> pixelData) ---
        if (elevRes) {
            results.elevBitmap = elevRes.bitmap;
            transferables.push(elevRes.bitmap);

            const { width, height } = elevRes.bitmap;
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(elevRes.bitmap, 0, 0);
                const imageData = ctx.getImageData(0, 0, width, height);
                results.pixelData = imageData.data.buffer;
                transferables.push(results.pixelData);
            }
        }

        if (colorRes) {
            results.colorBitmap = colorRes.bitmap;
            transferables.push(colorRes.bitmap);
        }

        if (overlayRes) {
            results.overlayBitmap = overlayRes.bitmap;
            transferables.push(overlayRes.bitmap);
        }

        self.postMessage(results, transferables);

    } catch (err: any) {
        self.postMessage({ id, error: err.message });
    }
};

async function fetchTile(url: string, isOffline: boolean): Promise<{ bitmap: ImageBitmap } | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(url);
        
        if (cached) {
            const blob = await cached.blob();
            const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
            return { bitmap };
        }

        if (isOffline) return null;

        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return null;

        const blob = await response.blob();
        
        // Mise en cache asynchrone (on n'attend pas pour renvoyer le bitmap)
        cache.put(url, new Response(blob.slice()));

        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
        return { bitmap };
    } catch (e) {
        return null;
    }
}
