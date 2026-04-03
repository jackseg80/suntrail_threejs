
/**
 * SunTrail Tile Worker Manager (v5.0.2)
 * Fix: Race condition sur les timeouts et handlers (Audit v5.5)
 */

import { state } from './state';
import { updateStorageUI } from './tileLoader';
import { reportNetworkFailure, reportNetworkSuccess } from './networkMonitor';

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

        if (forbidden) {
            if (!state.isMapTilerDisabled) {
                console.warn("[WorkerManager] 403 Forbidden reçu d'un worker. Désactivation de MapTiler et basculement OSM.");
                state.isMapTilerDisabled = true;
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
        if (error) {
            task.reject(error);
        } else {
            task.resolve(data);
        }
    }

    /**
     * Lance le chargement d'une tuile et retourne { promise, taskId }.
     * Le taskId permet d'annuler la task via cancelTile() si la tuile est disposée
     * avant la fin du fetch — économise la bande passante (abort HTTP dans le worker).
     */
    loadTile(elevUrl: string | null, colorUrl: string | null, overlayUrl: string | null, zoom: number, elevSourceZoom: number = zoom): { promise: Promise<any>, taskId: number } {
        if (this.workers.length === 0 || !state.USE_WORKERS) return { promise: Promise.resolve(null), taskId: -1 };

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
                    this.taskWorkerMap.delete(id);
                    resolve(data);
                },
                reject: (err: any) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    this.taskWorkerMap.delete(id);
                    reject(err);
                }
            });

            worker.postMessage({ id, elevUrl, colorUrl, overlayUrl, isOffline: state.IS_OFFLINE, zoom, elevSourceZoom });
        });

        return { promise, taskId: id };
    }

    /**
     * Annule une task en cours.
     * - Résout immédiatement la Promise avec null (Tile.load() sort proprement).
     * - Envoie un message cancel au worker concerné → abort du fetch HTTP en cours.
     */
    cancelTile(taskId: number): void {
        if (taskId < 0) return;
        const task = this.tasks.get(taskId);
        if (!task) return;
        this.tasks.delete(taskId);
        task.resolve(null); // Tile.load() reçoit null → early return propre
        const worker = this.taskWorkerMap.get(taskId);
        if (worker) {
            worker.postMessage({ type: 'cancel', id: taskId });
            this.taskWorkerMap.delete(taskId);
        }
    }
}

export const tileWorkerManager = new TileWorkerManager();
