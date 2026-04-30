
/**
 * SunTrail Tile Worker Manager (v5.40.35)
 * Load balancing: least-loaded worker selection with per-worker concurrency cap.
 * Timeout: 45s (was 15s) to avoid false positives on large queues.
 */

import { state } from './state';
import { updateStorageUI } from './tileLoader';
import { reportNetworkFailure, reportNetworkSuccess } from './networkMonitor';
import { rotateMapTilerKey } from './config';
import { disposeAllCachedTiles } from './tileCache';
import type { TileWorkerRequest, TileWorkerResponse } from '../types/worker';

interface WorkerTask {
    resolve: (value: TileWorkerResponse | null) => void;
    reject: (reason: any) => void;
}

/** Entrée en attente quand tous les workers sont saturés (cap MAX_PER_WORKER). */
interface PendingEntry {
    id: number;
    dispatch: () => void;
    dedupeKey: string;
    resolve: (value: TileWorkerResponse | null) => void;
    reject: (reason: any) => void;
}

class TileWorkerManager {
    private workers: Worker[] = [];
    private tasks = new Map<number, WorkerTask>();
    private nextTaskId = 0;
    /** Quel worker gère quelle task — nécessaire pour envoyer le message cancel au bon worker. */
    private taskWorkerMap = new Map<number, Worker>();
    /** Dédoublonnage des requêtes en cours pour éviter de surcharger les workers. */
    private inFlight = new Map<string, { promise: Promise<TileWorkerResponse | null>, taskId: number, refCount: number }>();
    /** Nombre de tâches actives par worker (cap à MAX_PER_WORKER pour éviter la concurrence intra-worker). */
    private workerLoadCounts = new Map<Worker, number>();
    /** Tâches en attente quand tous les workers sont saturés. */
    private pendingQueue: PendingEntry[] = [];
    private static readonly MAX_PER_WORKER = 4;

    constructor(poolSize?: number) {
        if (typeof Worker === 'undefined') return;
        const isMobile = typeof navigator !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
        const maxWorkers = isMobile ? 4 : 8;
        const count = poolSize ?? Math.min(navigator.hardwareConcurrency || 4, maxWorkers);

        for (let i = 0; i < count; i++) {
            const worker = new Worker(new URL('../workers/tileWorker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = (e: MessageEvent<TileWorkerResponse>) => this.handleMessage(e);
            worker.onerror = (e) => console.error('[WorkerManager] Worker crash:', e.message, e.filename, e.lineno);
            this.workers.push(worker);
        }
        if (state.DEBUG_MODE) console.log(`[WorkerManager] Initialized with ${this.workers.length} workers.`);
    }

    private handleMessage(e: MessageEvent<TileWorkerResponse>) {
        const { id, error, cacheHits, networkRequests, forbidden, rateLimited, networkError, ...data } = e.data;

        for (const [key, entry] of this.inFlight.entries()) {
            if (entry.taskId === id) {
                this.inFlight.delete(key);
                break;
            }
        }

        if (forbidden) {
            const hasMoreKeys = rotateMapTilerKey();
            if (hasMoreKeys) disposeAllCachedTiles();
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

        const worker = this.taskWorkerMap.get(id);
        this.tasks.delete(id);
        this.taskWorkerMap.delete(id);

        if (worker) {
            const load = this.workerLoadCounts.get(worker) || 1;
            this.workerLoadCounts.set(worker, Math.max(0, load - 1));
        }
        this.flushPendingQueue();

        if (error) {
            task.reject(error);
        } else {
            task.resolve({ id, cacheHits, networkRequests, ...data } as TileWorkerResponse);
        }
    }

    /** Sélectionne le worker le moins chargé (sous le cap). Retourne null si tous saturés. */
    private selectWorker(): Worker | null {
        let best: Worker | null = null;
        let bestLoad = Infinity;
        for (const w of this.workers) {
            const load = this.workerLoadCounts.get(w) || 0;
            if (load < TileWorkerManager.MAX_PER_WORKER && load < bestLoad) {
                best = w; bestLoad = load;
            }
        }
        return best;
    }

    /** Démarre le traitement sur un worker et retourne l'id de la tâche interne. */
    private dispatchTask(
        taskId: number,
        worker: Worker,
        msg: TileWorkerRequest,
        resolve: (value: TileWorkerResponse | null) => void,
        reject: (reason: any) => void
    ): void {
        this.taskWorkerMap.set(taskId, worker);
        const load = this.workerLoadCounts.get(worker) || 0;
        this.workerLoadCounts.set(worker, load + 1);

        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            this.tasks.delete(taskId);
            const w = this.taskWorkerMap.get(taskId);
            this.taskWorkerMap.delete(taskId);
            if (w) {
                const wload = this.workerLoadCounts.get(w) || 1;
                this.workerLoadCounts.set(w, Math.max(0, wload - 1));
            }
            this.flushPendingQueue();
            console.error(`[WorkerManager] Task ${taskId} timed out!`);
            reject(new Error(`Worker timeout for task ${taskId}`));
        }, 45000);

        this.tasks.set(taskId, {
            resolve: (data: TileWorkerResponse | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                const w = this.taskWorkerMap.get(taskId);
                if (w) {
                    const wload = this.workerLoadCounts.get(w) || 1;
                    this.workerLoadCounts.set(w, Math.max(0, wload - 1));
                }
                this.flushPendingQueue();
                resolve(data);
            },
            reject: (err: any) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                const w = this.taskWorkerMap.get(taskId);
                if (w) {
                    const wload = this.workerLoadCounts.get(w) || 1;
                    this.workerLoadCounts.set(w, Math.max(0, wload - 1));
                }
                this.flushPendingQueue();
                reject(err);
            }
        });

        worker.postMessage(msg);
    }

    /** Dépile la première tâche en attente si un worker est disponible. */
    private flushPendingQueue(): void {
        while (this.pendingQueue.length > 0) {
            const worker = this.selectWorker();
            if (!worker) return;
            const entry = this.pendingQueue.shift()!;
            entry.dispatch();
        }
    }

    loadTile(
        tileX: number, tileY: number,
        elevUrl: string | null, colorUrl: string | null, overlayUrl: string | null,
        zoom: number, elevSourceZoom: number = zoom,
        blobs?: { elev?: Blob | null, color?: Blob | null, overlay?: Blob | null },
        is2D: boolean = false
    ): { promise: Promise<TileWorkerResponse | null>, taskId: number } {
        if (this.workers.length === 0 || !state.USE_WORKERS) return { promise: Promise.resolve(null), taskId: -1 };

        const dedupeKey = `${tileX}|${tileY}|${elevUrl}|${colorUrl}|${overlayUrl}|${zoom}|${elevSourceZoom}|${is2D}`;
        const existing = this.inFlight.get(dedupeKey);
        if (existing) {
            existing.refCount++;
            return { promise: existing.promise, taskId: existing.taskId };
        }

        const taskId = this.nextTaskId++;

        const msg: TileWorkerRequest = {
            id: taskId, tileX, tileY, elevUrl, colorUrl, overlayUrl,
            isOffline: state.IS_OFFLINE, zoom, elevSourceZoom, is2D,
            elevBlob: blobs?.elev, colorBlob: blobs?.color, overlayBlob: blobs?.overlay
        };

        const promise = new Promise<TileWorkerResponse | null>((resolve, reject) => {
            const worker = this.selectWorker();
            if (worker) {
                this.dispatchTask(taskId, worker, msg, resolve, reject);
            } else {
                this.pendingQueue.push({
                    id: taskId,
                    dedupeKey,
                    resolve,
                    reject,
                    dispatch: () => {
                        const w = this.selectWorker()!;
                        this.dispatchTask(taskId, w, msg, resolve, reject);
                    }
                });
            }
        });

        this.inFlight.set(dedupeKey, { promise, taskId, refCount: 1 });
        return { promise, taskId };
    }

    cancelTile(taskId: number): void {
        if (taskId < 0) return;

        for (const [key, entry] of this.inFlight.entries()) {
            if (entry.taskId === taskId) {
                entry.refCount--;
                if (entry.refCount <= 0) {
                    this.inFlight.delete(key);
                } else {
                    return;
                }
                break;
            }
        }

        // Retirer de la file d'attente si pas encore dispatché
        const pendingIndex = this.pendingQueue.findIndex(e => e.id === taskId);
        if (pendingIndex !== -1) {
            const entry = this.pendingQueue.splice(pendingIndex, 1)[0];
            entry.resolve(null);
            this.flushPendingQueue();
            return;
        }

        const task = this.tasks.get(taskId);
        if (!task) return;
        this.tasks.delete(taskId);
        const worker = this.taskWorkerMap.get(taskId);
        this.taskWorkerMap.delete(taskId);
        task.resolve(null);
        if (worker) {
            worker.postMessage({ type: 'cancel', id: taskId });
            const load = this.workerLoadCounts.get(worker) || 1;
            this.workerLoadCounts.set(worker, Math.max(0, load - 1));
        }
        this.flushPendingQueue();
    }
}

export const tileWorkerManager = new TileWorkerManager();
