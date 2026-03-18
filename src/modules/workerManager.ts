
/**
 * SunTrail Tile Worker Manager (v5.0.1)
 * Gère le pool de workers pour le chargement asynchrone des tuiles.
 * Support des statistiques de cache/réseau.
 */

import { state } from './state';
import { updateStorageUI } from './terrain';

interface WorkerTask {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

class TileWorkerManager {
    private workers: Worker[] = [];
    private nextWorkerIndex = 0;
    private tasks = new Map<number, WorkerTask>();
    private nextTaskId = 0;

    constructor(poolSize: number = Math.min(navigator.hardwareConcurrency || 4, 8)) {
        if (typeof Worker === 'undefined') return;

        for (let i = 0; i < poolSize; i++) {
            const worker = new Worker(new URL('../workers/tileWorker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => this.handleMessage(e);
            this.workers.push(worker);
        }
        console.log(`[WorkerManager] Initialized with ${this.workers.length} workers.`);
    }

    private handleMessage(e: MessageEvent) {
        const { id, error, cacheHits, networkRequests, ...data } = e.data;
        
        // --- MISE À JOUR STATS (v5.0.1) ---
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

    async loadTile(elevUrl: string | null, colorUrl: string | null, overlayUrl: string | null): Promise<any> {
        if (this.workers.length === 0 || !state.USE_WORKERS) {
            console.warn("[WorkerManager] Workers disabled or unavailable.");
            return null; 
        }

        const id = this.nextTaskId++;
        const worker = this.workers[this.nextWorkerIndex];
        this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;

        return new Promise((resolve, reject) => {
            this.tasks.set(id, { resolve, reject });
            const timeout = setTimeout(() => {
                if (this.tasks.has(id)) {
                    this.tasks.delete(id);
                    console.error(`[WorkerManager] Task ${id} timed out!`);
                    reject(new Error("Worker timeout"));
                }
            }, 15000);

            worker.postMessage({ id, elevUrl, colorUrl, overlayUrl, isOffline: state.IS_OFFLINE });
            
            // On enveloppe le resolve pour clear le timeout
            const originalResolve = resolve;
            this.tasks.get(id)!.resolve = (data) => {
                clearTimeout(timeout);
                originalResolve(data);
            };
        });
    }
}

export const tileWorkerManager = new TileWorkerManager();
