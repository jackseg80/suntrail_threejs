import * as THREE from 'three';
import { state } from '../state';
import type { Tile } from './Tile';
import { activeTiles } from '../terrain';

export let loadQueue: Set<Tile> = new Set<Tile>();
let isProcessingQueue = false;

export const buildQueue: Tile[] = [];
const buildQueueKeys = new Set<string>();
let isProcessingBuildQueue = false;

// v5.31.1 : Sort cache to amortize O(n log n) cost
let sortedCache: Tile[] | null = null;
let lastSortTime = 0;
const SORT_INTERVAL_MS = 200;

export function queueBuildMesh(tile: Tile) {
    if (tile.status === 'disposed') return;
    if (buildQueueKeys.has(tile.key)) return;
    buildQueueKeys.add(tile.key);
    buildQueue.push(tile);
    if (!isProcessingBuildQueue) {
        isProcessingBuildQueue = true;
        state.isProcessingTiles = true;
        requestAnimationFrame(processBuildQueue);
    }
}

function processBuildQueue() {
    const BUILD_BUDGET_MS = 10;
    const start = performance.now();
    
    let first = true;
    while (buildQueue.length > 0 && (first || (performance.now() - start < BUILD_BUDGET_MS))) {
        first = false;
        const tile = buildQueue.shift()!;
        buildQueueKeys.delete(tile.key);
        if (tile.status !== 'disposed' && activeTiles.has(tile.key)) {
            tile.buildMesh(state.RESOLUTION);
        }
    }
    
    if (buildQueue.length > 0) {
        state.isProcessingTiles = true;
        requestAnimationFrame(processBuildQueue);
    } else {
        isProcessingBuildQueue = false;
        if (loadQueue.size === 0) {
            state.isProcessingTiles = false;
        }
    }
}

export async function processLoadQueue() {
    if (isProcessingQueue || loadQueue.size === 0) {
        state.isProcessingTiles = false;
        return;
    }
    isProcessingQueue = true;
    state.isProcessingTiles = true;
    try {
        let frameFrustum: THREE.Frustum | null = null;
        if (state.camera && state.camera.projectionMatrix && state.camera.matrixWorldInverse) {
            const proj = new THREE.Matrix4().multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
            frameFrustum = new THREE.Frustum();
            frameFrustum.setFromProjectionMatrix(proj);
        }
        const visCache = new Map<Tile, boolean>();
        const isVis = (t: Tile) => { 
            let v = visCache.get(t); 
            if (v === undefined) { 
                v = t.isVisible(frameFrustum ?? undefined); 
                visCache.set(t, v); 
            } return v; 
        };

        // v5.28.48 : Filtrage immédiat des tuiles qui ne sont plus dans activeTiles (LOD obsolète)
        for (const t of loadQueue) {
            if (!activeTiles.has(t.key)) {
                loadQueue.delete(t);
            }
        }

        // v5.31.1 : Amortized sort — only re-sort every 200ms or when queue changes significantly
        const now = performance.now();
        if (!sortedCache || (now - lastSortTime) > SORT_INTERVAL_MS) {
            sortedCache = Array.from(loadQueue).sort((a, b) => {
                if (!state.camera) return 0;
                const camPos = state.camera.position;
                const aVis = isVis(a) ? 1 : 0;
                const bVis = isVis(b) ? 1 : 0;
                if (aVis !== bVis) return bVis - aVis;
                const da = (a.worldX - camPos.x) ** 2 + (a.worldZ - camPos.z) ** 2;
                const db = (b.worldX - camPos.x) ** 2 + (b.worldZ - camPos.z) ** 2;
                return da - db;
            });
            lastSortTime = now;
        }

        const visiblePending = sortedCache.filter(t => isVis(t)).length;
        const isTransitioning = visiblePending >= 4;
        const effectiveBatch = isTransitioning
            ? Math.max(1, state.MAX_BUILDS_PER_CYCLE + 2)
            : Math.max(1, state.MAX_BUILDS_PER_CYCLE);
        
        const batch = sortedCache.splice(0, effectiveBatch);
        batch.forEach(t => loadQueue.delete(t));

        await Promise.all(batch.map(async (tile) => {
            try { 
                // v5.28.48 : Double vérification avant chargement effectif
                if (tile.status === 'idle' && activeTiles.has(tile.key)) {
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

/**
 * v5.32.0 : Prioritize new LOD tiles over old ones.
 * Removes old-zoom tiles from load and build queues but does NOT cancel
 * in-flight network requests. New-zoom tiles get priority.
 */
export function prioritizeNewZoom(newZoom: number): void {
    // Remove old-zoom tiles from load queue (not yet started)
    for (const t of loadQueue) {
        if (t.zoom !== newZoom) {
            loadQueue.delete(t);
        }
    }
    // Remove old-zoom tiles from build queue
    for (let i = buildQueue.length - 1; i >= 0; i--) {
        if (buildQueue[i].zoom !== newZoom) {
            buildQueueKeys.delete(buildQueue[i].key);
            buildQueue.splice(i, 1);
        }
    }
    sortedCache = null; // Force re-sort with new priorities
}

export function clearLoadQueue() {
    loadQueue.clear();
    sortedCache = null;
    buildQueue.length = 0;
    buildQueueKeys.clear();
}

export function addToLoadQueue(tile: Tile) {
    loadQueue.add(tile);
    sortedCache = null;
}

export function removeFromLoadQueue(tile: Tile) {
    loadQueue.delete(tile);
    sortedCache = null;
    if (buildQueueKeys.has(tile.key)) {
        buildQueueKeys.delete(tile.key);
        const index = buildQueue.indexOf(tile);
        if (index !== -1) buildQueue.splice(index, 1);
    }
}
