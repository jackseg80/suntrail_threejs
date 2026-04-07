import { state } from '../state';
import type { Tile } from './Tile';

export let loadQueue: Set<Tile> = new Set<Tile>();
let isProcessingQueue = false;

export async function processLoadQueue() {
    if (isProcessingQueue || loadQueue.size === 0) {
        state.isProcessingTiles = false;
        return;
    }
    isProcessingQueue = true;
    state.isProcessingTiles = true;
    try {
        const visCache = new Map<Tile, boolean>();
        const isVis = (t: Tile) => { 
            let v = visCache.get(t); 
            if (v === undefined) { 
                v = t.isVisible(); 
                visCache.set(t, v); 
            } return v; 
        };

        const sorted = Array.from(loadQueue).sort((a, b) => {
            if (!state.camera) return 0;
            const camPos = state.camera.position;
            const aVis = isVis(a) ? 1 : 0;
            const bVis = isVis(b) ? 1 : 0;
            if (aVis !== bVis) return bVis - aVis;
            const da = (a.worldX - camPos.x) ** 2 + (a.worldZ - camPos.z) ** 2;
            const db = (b.worldX - camPos.x) ** 2 + (b.worldZ - camPos.z) ** 2;
            return da - db;
        });

        const visiblePending = sorted.filter(t => isVis(t)).length;
        const isTransitioning = visiblePending >= 4;
        const effectiveBatch = isTransitioning
            ? Math.max(1, state.MAX_BUILDS_PER_CYCLE + 2)
            : Math.max(1, state.MAX_BUILDS_PER_CYCLE);
        const batch = sorted.slice(0, effectiveBatch);
        batch.forEach(t => loadQueue.delete(t));

        await Promise.all(batch.map(async (tile) => {
            try { 
                if (tile.status === 'idle') {
                    state.isProcessingTiles = true;
                    await tile.load(); 
                }
            }
            catch (e) { tile.status = 'failed'; }
        }));
    } finally {
        isProcessingQueue = false;
        if (loadQueue.size > 0) setTimeout(processLoadQueue, 32);
        else {
            setTimeout(() => { state.isProcessingTiles = false; }, 50);
        }
    }
}

export function clearLoadQueue() {
    loadQueue.clear();
}

export function addToLoadQueue(tile: Tile) {
    loadQueue.add(tile);
}

export function removeFromLoadQueue(tile: Tile) {
    loadQueue.delete(tile);
}
