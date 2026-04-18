
/**
 * SunTrail Tile Worker Manager (v5.0.2)
 * Fix: Race condition sur les timeouts et handlers (Audit v5.5)
 */

import { state } from './state';
import { updateStorageUI } from './tileLoader';
import { reportNetworkFailure, reportNetworkSuccess } from './networkMonitor';
import { rotateMapTilerKey } from './config';
import { disposeAllCachedTiles } from './tileCache';

interface WorkerTask {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

class TileWorkerManager {
    private workers: Worker[] = [];
    private nextWorkerIndex = 0;
    private tasks = new Map<number, WorkerTask>();
    private nextTaskId = 0;
    /** Quel worker gère quelle task — nécessaire pour envoyer le message cancel au bon worker. */
    private taskWorkerMap = new Map<number, Worker>();
    /** Dédoublonnage des requêtes en cours pour éviter de surcharger les workers. */
    private inFlight = new Map<string, { promise: Promise<any>, taskId: number, refCount: number }>();

    constructor(poolSize?: number) {
        if (typeof Worker === 'undefined') return;
        // Mobile : 4 workers max (moins de parsing JS au démarrage, ~2-4s économisées)
        // PC    : 8 workers max (cores abondants, parsing instantané)
        const isMobile = typeof navigator !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
        const maxWorkers = isMobile ? 4 : 8;
        const count = poolSize ?? Math.min(navigator.hardwareConcurrency || 4, maxWorkers);

        for (let i = 0; i < count; i++) {
            const worker = new Worker(new URL('../workers/tileWorker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => this.handleMessage(e);
            worker.onerror = (e) => console.error('[WorkerManager] Worker crash:', e.message, e.filename, e.lineno);
            this.workers.push(worker);
        }
        console.log(`[WorkerManager] Initialized with ${this.workers.length} workers.`);
    }

    private handleMessage(e: MessageEvent) {
        const { id, error, cacheHits, networkRequests, forbidden, rateLimited, networkError, ...data } = e.data;

        // v5.29.5 : On cherche à quelle clé inFlight cette task correspond pour la nettoyer
        for (const [key, entry] of this.inFlight.entries()) {
            if (entry.taskId === id) {
                this.inFlight.delete(key);
                break;
            }
        }

        if (forbidden) {
            // v5.29.20 : Au lieu de désactiver tout de suite, on tente une rotation de clé
            const hasMoreKeys = rotateMapTilerKey();
            if (hasMoreKeys) {
                // On vide le cache mémoire pour forcer les tuiles échouées à être re-demandées avec la nouvelle clé
                disposeAllCachedTiles();
            }
        }
        if (rateLimited) {
            console.warn("[WorkerManager] 429 Rate limit MapTiler — backoff exponentiel actif dans les workers.");
        }
        if (networkError) {
            reportNetworkFailure();
        } else if (networkRequests) {
            reportNetworkSuccess();
        }

        if (cacheHits) state.cacheHits += cacheHits;
        if (networkRequests) state.networkRequests += networkRequests;
        if (cacheHits || networkRequests) updateStorageUI();

        const task = this.tasks.get(id);
        if (!task) return;

        this.tasks.delete(id);
        this.taskWorkerMap.delete(id);

        if (error) {
            task.reject(error);
        } else {
            task.resolve(data);
        }
    }

    /**
     * Lance le chargement d'une tuile et retourne { promise, taskId }.
     */
    loadTile(
        elevUrl: string | null, colorUrl: string | null, overlayUrl: string | null, 
        zoom: number, elevSourceZoom: number = zoom,
        blobs?: { elev?: Blob | null, color?: Blob | null, overlay?: Blob | null }
    ): { promise: Promise<any>, taskId: number } {
        if (this.workers.length === 0 || !state.USE_WORKERS) return { promise: Promise.resolve(null), taskId: -1 };

        // v5.29.5 : Dédoublonnage in-flight
        const dedupeKey = `${elevUrl}|${colorUrl}|${overlayUrl}|${zoom}|${elevSourceZoom}`;
        const existing = this.inFlight.get(dedupeKey);
        if (existing) {
            existing.refCount++;
            return { promise: existing.promise, taskId: existing.taskId };
        }

        const id = this.nextTaskId++;
        const worker = this.workers[this.nextWorkerIndex];
        this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
        this.taskWorkerMap.set(id, worker);

        const promise = new Promise<any>((resolve, reject) => {
            let settled = false;

            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.tasks.delete(id);
                this.taskWorkerMap.delete(id);
                console.error(`[WorkerManager] Task ${id} timed out!`);
                reject(new Error(`Worker timeout for task ${id}`));
            }, 15000);

            this.tasks.set(id, {
                resolve: (data: any) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err: any) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            worker.postMessage({ 
                id, elevUrl, colorUrl, overlayUrl, isOffline: state.IS_OFFLINE, zoom, elevSourceZoom,
                elevBlob: blobs?.elev,
                colorBlob: blobs?.color,
                overlayBlob: blobs?.overlay
            });
        });

        this.inFlight.set(dedupeKey, { promise, taskId: id, refCount: 1 });
        return { promise, taskId: id };
    }

    /**
     * Annule une task en cours (ou décrémente son refCount).
     */
    cancelTile(taskId: number): void {
        if (taskId < 0) return;

        for (const [key, entry] of this.inFlight.entries()) {
            if (entry.taskId === taskId) {
                entry.refCount--;
                if (entry.refCount <= 0) {
                    this.inFlight.delete(key);
                } else {
                    return; // Toujours attendue par un autre demandeur
                }
                break;
            }
        }

        const task = this.tasks.get(taskId);
        if (!task) return;
        this.tasks.delete(taskId);
        this.taskWorkerMap.delete(taskId);
        task.resolve(null); 
        const worker = this.taskWorkerMap.get(taskId);
        if (worker) {
            worker.postMessage({ type: 'cancel', id: taskId });
        }
    }
}

export const tileWorkerManager = new TileWorkerManager();
