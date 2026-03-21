import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

/**
 * SunTrail Tile Worker (v5.6.5)
 * Support des sentiers vectoriels (MVT/PBF) haute définition.
 */

const CACHE_NAME = 'suntrail-tiles-v1';

self.onmessage = async (e) => {
    const { id, elevUrl, colorUrl, overlayUrl, isOffline, zoom } = e.data;

    try {
        const results: any = { id, cacheHits: 0, networkRequests: 0 };
        const transferables: Transferable[] = [];

        // --- EXÉCUTION PARALLÈLE ---
        const [elevRes, colorRes, overlayRes] = await Promise.all([
            elevUrl ? fetchTile(elevUrl, isOffline) : Promise.resolve(null),
            colorUrl ? fetchTile(colorUrl, isOffline) : Promise.resolve(null),
            overlayUrl ? fetchResource(overlayUrl, isOffline) : Promise.resolve(null)
        ]);

        if (elevRes) {
            if (elevRes.fromCache) results.cacheHits++; else results.networkRequests++;
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
                const normalData = new Uint8ClampedArray(width * height * 4);
                const tileSizeMeters = 40075016.686 / Math.pow(2, zoom || 14);
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

        if (colorRes) {
            if (colorRes.fromCache) results.cacheHits++; else results.networkRequests++;
            results.colorBitmap = colorRes.bitmap;
            transferables.push(colorRes.bitmap);
        }

        // --- TRAITEMENT DES SENTIERS VECTORIELS (v5.6.5) ---
        if (overlayRes) {
            if (overlayRes.fromCache) results.cacheHits++; else results.networkRequests++;
            
            const overlaySize = 2048; // Résolution "Pro" pour une netteté infinie
            const canvas = new OffscreenCanvas(overlaySize, overlaySize);
            const ctx = canvas.getContext('2d');
            
            if (ctx && overlayRes.data) {
                const tile = new VectorTile(new Pbf(overlayRes.data));
                
                // Dessin de toutes les couches de sentiers disponibles
                for (const layerName in tile.layers) {
                    const layer = tile.layers[layerName];
                    const scale = overlaySize / layer.extent;
                    
                    for (let i = 0; i < layer.length; i++) {
                        const feature = layer.feature(i);
                        if (feature.type === 2) { // LineString
                            const lines = feature.loadGeometry();
                            const objType = feature.properties.type || feature.properties.class || '';
                            
                            // 1. Dessin du Halo (contour blanc pour la lisibilité)
                            ctx.strokeStyle = '#ffffff';
                            ctx.lineWidth = 6.0;
                            ctx.beginPath();
                            for (const line of lines) {
                                for (let j = 0; j < line.length; j++) {
                                    const p = line[j];
                                    if (j === 0) ctx.moveTo(p.x * scale, p.y * scale);
                                    else ctx.lineTo(p.x * scale, p.y * scale);
                                }
                            }
                            ctx.stroke();

                            // 2. Dessin de la ligne principale
                            // Style par défaut (Jaune Rando)
                            ctx.strokeStyle = '#ffff00';
                            ctx.lineWidth = 3.5;
                            ctx.setLineDash([]);

                            // Spécificités SwissTopo
                            if (layerName.includes('wanderwege')) {
                                if (objType === 'mountain_hiking') ctx.strokeStyle = '#ff3300';
                                else if (objType === 'alpine_hiking') { ctx.strokeStyle = '#3366ff'; ctx.setLineDash([10, 10]); }
                            } 
                            // Spécificités MapTiler Hiking
                            else if (objType === 'hiking') {
                                const symbol = feature.properties.symbol || '';
                                if (symbol.includes('red')) ctx.strokeStyle = '#ff3300';
                                else if (symbol.includes('blue')) ctx.strokeStyle = '#3366ff';
                            }

                            ctx.beginPath();
                            for (const line of lines) {
                                for (let j = 0; j < line.length; j++) {
                                    const p = line[j];
                                    if (j === 0) ctx.moveTo(p.x * scale, p.y * scale);
                                    else ctx.lineTo(p.x * scale, p.y * scale);
                                }
                            }
                            ctx.stroke();
                        }
                    }
                }
                const overlayBitmap = canvas.transferToImageBitmap();
                results.overlayBitmap = overlayBitmap;
                transferables.push(overlayBitmap);
            }
        }

        self.postMessage(results, transferables);

    } catch (err: any) {
        self.postMessage({ id, error: err.message });
    }
};

async function fetchTile(url: string, isOffline: boolean): Promise<{ bitmap: ImageBitmap, fromCache: boolean } | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(url);
        if (cached) {
            const blob = await cached.blob();
            const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
            return { bitmap, fromCache: true };
        }
        if (isOffline) return null;
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return null;
        const blob = await response.blob();
        cache.put(url, new Response(blob.slice()));
        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
        return { bitmap, fromCache: false };
    } catch (e) { return null; }
}

async function fetchResource(url: string, isOffline: boolean): Promise<{ data: ArrayBuffer | null, fromCache: boolean }> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(url);
        if (cached) {
            return { data: await cached.arrayBuffer(), fromCache: true };
        }
        if (isOffline) return { data: null, fromCache: false };
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return { data: null, fromCache: false };
        const buffer = await response.arrayBuffer();
        cache.put(url, new Response(buffer.slice(0)));
        return { data: buffer, fromCache: false };
    } catch (e) { return { data: null, fromCache: false }; }
}
