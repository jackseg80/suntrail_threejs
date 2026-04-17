import { state } from '../state';
import type { Tile } from './Tile';
import { activeTiles } from '../terrain';

export let loadQueue: Set<Tile> = new Set<Tile>();
let isProcessingQueue = false;

// v5.29.31 : Budget de Montage de Textures pour lisser les micro-saccades
export const buildQueue: Tile[] = [];
let isProcessingBuildQueue = false;

export function queueBuildMesh(tile: Tile) {
    if (tile.status === 'disposed') return;
    if (!buildQueue.includes(tile)) {
        buildQueue.push(tile);
    }
    if (!isProcessingBuildQueue) {
        isProcessingBuildQueue = true;
        state.isProcessingTiles = true; // v5.29.31 : Garder le moteur éveillé pendant le montage
        requestAnimationFrame(processBuildQueue);
    }
}

function processBuildQueue() {
    const BUILD_BUDGET_MS = 10; // Augmenté à 10ms pour plus de réactivité
    const start = performance.now();
    
    // v5.29.31 : Traiter au moins une tuile par frame quoi qu'il arrive
    let first = true;
    while (buildQueue.length > 0 && (first || (performance.now() - start < BUILD_BUDGET_MS))) {
        first = false;
        const tile = buildQueue.shift();
        if (tile && tile.status !== 'disposed' && activeTiles.has(tile.key)) {
            tile.buildMesh(state.RESOLUTION);
        }
    }
    
    if (buildQueue.length > 0) {
        state.isProcessingTiles = true;
        requestAnimationFrame(processBuildQueue);
    } else {
        isProcessingBuildQueue = false;
        // On ne coupe isProcessingTiles que si la loadQueue est aussi vide
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
        const visCache = new Map<Tile, boolean>();
        const isVis = (t: Tile) => { 
            let v = visCache.get(t); 
            if (v === undefined) { 
                v = t.isVisible(); 
                visCache.set(t, v); 
            } return v; 
        };

        // v5.28.48 : Filtrage immédiat des tuiles qui ne sont plus dans activeTiles (LOD obsolète)
        for (const t of loadQueue) {
            if (!activeTiles.has(t.key)) {
                loadQueue.delete(t);
            }
        }

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

export function clearLoadQueue() {
    loadQueue.clear();
    buildQueue.length = 0; // Vider également la file de montage en cas de changement majeur (LOD, Source)
}

export function addToLoadQueue(tile: Tile) {
    loadQueue.add(tile);
}

export function removeFromLoadQueue(tile: Tile) {
    loadQueue.delete(tile);
    const index = buildQueue.indexOf(tile);
    if (index !== -1) buildQueue.splice(index, 1);
}
