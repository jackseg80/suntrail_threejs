
/**
 * SunTrail Tile Worker Manager (v5.0.2)
 * Fix: Race condition sur les timeouts et handlers (Audit v5.5)
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
        if (this.workers.length === 0 || !state.USE_WORKERS) return null;

        const id = this.nextTaskId++;
        const worker = this.workers[this.nextWorkerIndex];
        this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;

        return new Promise((resolve, reject) => {
            let settled = false;

            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.tasks.delete(id);
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

            worker.postMessage({ id, elevUrl, colorUrl, overlayUrl, isOffline: state.IS_OFFLINE });
        });
    }
}

export const tileWorkerManager = new TileWorkerManager();
