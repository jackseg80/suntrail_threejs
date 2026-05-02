import * as THREE from 'three';
import { state } from '../state';
import type { Tile } from './Tile';
import { activeTiles } from '../terrain';

export let loadQueue: Set<Tile> = new Set<Tile>();
let isProcessingQueue = false;

const buildQueue: Tile[] = [];
const buildQueueKeys = new Set<string>();
let isProcessingBuildQueue = false;

// v5.31.1 : Sort cache to amortize O(n log n) cost
let sortedCache: Tile[] | null = null;
let lastSortTime = 0;
const SORT_INTERVAL_MS = 200;
let loadingCount = 0; // v5.34.5 : True connection pool counter

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
        if (loadQueue.size === 0 && loadingCount === 0) {
            state.isProcessingTiles = false;
        }
    }
}

export async function processLoadQueue() {
    if (isProcessingQueue || loadQueue.size === 0) {
        if (loadingCount === 0) state.isProcessingTiles = false;
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
        let pruned = false;
        for (const t of loadQueue) {
            if (!activeTiles.has(t.key)) {
                loadQueue.delete(t);
                pruned = true;
            }
        }
        if (pruned) sortedCache = null;

        // v5.31.1 : Amortized sort — only re-sort every 200ms or when queue changes significantly
        // v5.32.4 : Re-sort IMMEDIATELY if cache is empty to avoid "performance holes"
        const now = performance.now();
        if (!sortedCache || sortedCache.length === 0 || (now - lastSortTime) > SORT_INTERVAL_MS) {
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
        const targetInFlight = isTransitioning
            ? Math.max(1, state.MAX_BUILDS_PER_CYCLE + 2)
            : Math.max(1, state.MAX_BUILDS_PER_CYCLE);
        
        // v5.34.5 : Calcul des slots disponibles dans le "pool" de connexion
        const availableSlots = Math.max(0, targetInFlight - loadingCount);
        if (availableSlots <= 0) {
            return; // On attend que des tuiles finissent de charger
        }
        
        const batch = sortedCache.splice(0, availableSlots);
        batch.forEach(t => loadQueue.delete(t));

        // On lance le chargement de manière asynchrone (fire-and-forget pour la file).
        // Le statut 'loaded' déclenchera automatiquement queueBuildMesh() à la fin du chargement réel.
        batch.forEach((tile) => {
            if (tile.status === 'idle' && activeTiles.has(tile.key)) {
                loadingCount++;
                state.isProcessingTiles = true;
                tile.load().finally(() => {
                    loadingCount--;
                    // Si on vient de finir une tuile, on relance immédiatement la queue pour boucher le trou
                    if (!isProcessingQueue && loadQueue.size > 0) processLoadQueue();
                }).catch(() => {
                    tile.status = 'failed';
                });
            }
        });
    } finally {
        isProcessingQueue = false;
        if (loadQueue.size > 0) {
            // Intervalle réduit (16ms) pour saturer les workers plus vite si slots dispo
            setTimeout(processLoadQueue, 16);
        } else {
            setTimeout(() => { if (loadingCount === 0) state.isProcessingTiles = false; }, 100);
        }
    }
}

/**
 * v5.32.0 : Prioritize new LOD tiles over old ones.
 * v5.32.10: Keep parent zoom tiles (newZoom - 1) for Fade Out protection.
 */
export function prioritizeNewZoom(newZoom: number): void {
    // Remove old-zoom tiles from load queue (except parent LOD for backdrop)
    for (const t of loadQueue) {
        if (t.zoom !== newZoom && t.zoom !== newZoom - 1) {
            loadQueue.delete(t);
        }
    }
    // Remove old-zoom tiles from build queue (except parent LOD)
    for (let i = buildQueue.length - 1; i >= 0; i--) {
        const z = buildQueue[i].zoom;
        if (z !== newZoom && z !== newZoom - 1) {
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
