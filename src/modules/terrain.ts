import * as THREE from 'three';
import { disposeObject } from './memory';
import { state, isProActive } from './state';
import { isMobileDevice } from './utils';
import { worldToLngLat, lngLatToTile, isPositionInSwitzerland, isPositionInFrance, EARTH_CIRCUMFERENCE } from './geo';
import { getTileCacheKey, markCacheKeyInactive, hasInCache, getFromCache, purgeOldPixelData } from './tileCache';
import { insertTile, removeTile, clearIndex as clearSpatialIndex } from './tileSpatialIndex';
import { updateAllGPXMeshes, updateRecordedTrackMesh, refreshTracks as gpxRefreshTracks } from './gpxLayers';

// Re-exports de la refactorisation
export { Tile, terrainUniforms, sharedFrustum } from './terrain/Tile';
export { loadQueue, processLoadQueue, clearLoadQueue, addToLoadQueue, removeFromLoadQueue, prioritizeNewZoom } from './terrain/tileQueue';

import { Tile } from './terrain/Tile';
import { sharedFrustum } from './terrain/Tile';
import { loadQueue, processLoadQueue, clearLoadQueue, prioritizeNewZoom } from './terrain/tileQueue';
import { terrainUniforms } from './terrain/Tile';

export const activeTiles = new Map<string, Tile>(); 
export const activeLabels = new Map<string, any>(); 

export const fadingOutTiles = new Set<Tile>();
let lastRenderedZoom: number = -1;
let lastMapSource: string = '';

export function resetTerrain(): void {
    clearLabels();
    clearLoadQueue(); // v5.29.28 : Annuler les chargements en cours de l'ancienne source/LOD
    for (const tile of fadingOutTiles) {
        markCacheKeyInactive(getTileCacheKey(tile.key, tile.zoom));
        tile.dispose();
    }
    fadingOutTiles.clear();
    lastRenderedZoom = -1;
    for (const tile of activeTiles.values()) {
        removeTile(tile);
        tile.dispose();
    }
    activeTiles.clear();
    clearSpatialIndex();
}

export function rebuildActiveTiles(): void {
    const toReload: string[] = [];
    const is2D = state.IS_2D_MODE;
    
    for (const tile of activeTiles.values()) {
        if (!tile.elevationTex || !tile.colorTex) continue;
        
        // v5.40.18 : Nettoyage forcé des objets 3D lors d'un changement de mode (2D/3D)
        // On les supprime systématiquement pour forcer un re-rendu à la bonne altitude (0 en 2D, réel en 3D).
        if (tile.forestMesh) { if (state.scene) state.scene.remove(tile.forestMesh); disposeObject(tile.forestMesh); tile.forestMesh = null; }
        if (tile.buildingGroup) { if (state.scene) state.scene.remove(tile.buildingGroup); disposeObject(tile.buildingGroup); tile.buildingGroup = null; }
        if (tile.poiGroup) { if (state.scene) state.scene.remove(tile.poiGroup); disposeObject(tile.poiGroup); tile.poiGroup = null; }
        
        if (is2D) {
            if (tile.waterMaskTex) { tile.waterMaskTex.dispose(); tile.waterMaskTex = null; }
        }

        if (!is2D && !tile.pixelData && tile.zoom > 10) {
            toReload.push(tile.key);
        } else {
            tile.buildMesh(state.RESOLUTION);
        }
    }
    for (const key of toReload) {
        const tile = activeTiles.get(key);
        if (!tile) continue;
        const cacheKey = getTileCacheKey(key, tile.zoom);
        getFromCache(cacheKey);
        removeTile(tile);
        tile.dispose();
        activeTiles.delete(key);
    }
}

export function repositionAllTiles(): void { 
    const originUnit = 1.0 / Math.pow(2, state.originTile.z);
    const oxNorm = (state.originTile.x + 0.5) * originUnit;
    const oyNorm = (state.originTile.y + 0.5) * originUnit;

    for (const tile of activeTiles.values()) {
        tile.updateWorldPosition();
    }
    for (const tile of fadingOutTiles) {
        tile.updateWorldPosition();
    }

    const lastOrigin = (repositionAllTiles as any).lastOrigin || { x: state.originTile.x, y: state.originTile.y, z: state.originTile.z };
    if (lastOrigin.x !== state.originTile.x || lastOrigin.y !== state.originTile.y || lastOrigin.z !== state.originTile.z) {
        const oldOriginUnit = 1.0 / Math.pow(2, lastOrigin.z);
        const ooxNorm = (lastOrigin.x + 0.5) * oldOriginUnit;
        const ooyNorm = (lastOrigin.y + 0.5) * oldOriginUnit;
        const offsetX = (ooxNorm - oxNorm) * EARTH_CIRCUMFERENCE;
        const offsetZ = (ooyNorm - oyNorm) * EARTH_CIRCUMFERENCE;

        for (const obj of activeLabels.values()) {
            if (obj.sprite) {
                obj.sprite.position.x += offsetX;
                obj.sprite.position.z += offsetZ;
            }
            if (obj.line) {
                obj.line.position.x += offsetX;
                obj.line.position.z += offsetZ;
            }
        }

        // v5.27.3: Recalculer les maillages GPX lors d'un Origin Shift
        updateAllGPXMeshes();
        updateRecordedTrackMesh();

        // v5.28.31 : Repositionner le marqueur utilisateur lors d'un Origin Shift
        import('./location').then(m => m.updateUserMarker());
    }
    (repositionAllTiles as any).lastOrigin = { ...state.originTile };
}

/** 
 * v5.27.3: Groupement des fonctions de mise à jour pour testabilité
 */
export const terrainUpdates = {
    updateAllGPXMeshes,
    updateRecordedTrackMesh,
    refreshTracks: gpxRefreshTracks,
    resetTerrain,
    repositionAllTiles
};

/**
 * Rafraîchit l'affichage de tous les tracés (GPX et enregistrement en cours).
 */
export function refreshTracks(): void {
    gpxRefreshTracks();
}

export function animateTiles(delta: number): boolean { 
    let stillFading = false;
    for (const tile of activeTiles.values()) { if (tile.isFadingIn) { tile.updateFade(delta); stillFading = true; } }
    
    if (fadingOutTiles.size > 0) {
        const deltaMs = delta * 1000;
        const toRemove: Tile[] = [];
        for (const tile of fadingOutTiles) {
            tile.updateFadeOut(deltaMs);
            if (!tile.isFadingOut) {
                toRemove.push(tile);
            } else {
                stillFading = true;
            }
        }
        for (const tile of toRemove) {
            markCacheKeyInactive(getTileCacheKey(tile.key, tile.zoom));
            fadingOutTiles.delete(tile);
            tile.dispose();
        }
    }
    return stillFading;
}

export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource || isNaN(lat) || lat === 0) return;
    
    let newSource = (state.ZOOM > 10 && (isPositionInSwitzerland(lat, lon) || isPositionInFrance(lat, lon))) ? 'swisstopo' : 'opentopomap';
    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        document.querySelectorAll('.layer-item').forEach(i => { i.classList.remove('active'); if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active'); });
        if (state.camera && state.controls) {
            updateVisibleTiles(lat, lon, state.camera.position.y, state.controls.target.x, state.controls.target.z);
        } else {
            updateVisibleTiles();
        }
    }
}

let isUpdating = false;
let updatePending = false;

export async function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number | null = null, worldZ: number | null = null, force: boolean = false): Promise<void> {
    if (isUpdating && !force) {
        updatePending = true;
        return Promise.resolve();
    }
    isUpdating = true;
    updatePending = false;

    if (lastMapSource !== state.MAP_SOURCE) {
        lastMapSource = state.MAP_SOURCE;
        resetTerrain();
    }

    try {
        const is2DGlobal = state.IS_2D_MODE || state.PERFORMANCE_PRESET === 'eco' || state.ZOOM <= 10;
        terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
        const MIN_SLOPE_LOD = 11;
        terrainUniforms.uShowSlopes.value = (state.SHOW_SLOPES && state.ZOOM >= MIN_SLOPE_LOD) ? 1.0 : 0.0;
        terrainUniforms.uShowHydrology.value = state.SHOW_HYDROLOGY ? 1.0 : 0.0;

        if (!state.camera) return Promise.resolve();

        const wx = (worldX !== null) ? worldX : (state.controls ? state.controls.target.x : state.camera.position.x);
        const wz = (worldZ !== null) ? worldZ : (state.controls ? state.controls.target.z : state.camera.position.z);

        const currentGPS = worldToLngLat(wx, wz, state.originTile);
        const zoom = state.ZOOM; const maxTile = Math.pow(2, zoom);
        const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
        const currentActiveKeys = new Set<string>();

        const lodChanging = lastRenderedZoom !== -1 && zoom !== lastRenderedZoom;

        if (lodChanging) {
            prioritizeNewZoom(zoom);
            purgeOldPixelData();
        }

        const camGPS = worldToLngLat(state.camera.position.x, state.camera.position.z, state.originTile);
        const camTile = lngLatToTile(camGPS.lon, camGPS.lat, zoom);
        const camKey = `${state.MAP_SOURCE}_${camTile.x}_${camTile.y}_${zoom}`;
        if (camTile.x >= 0 && camTile.x < maxTile && camTile.y >= 0 && camTile.y < maxTile) {
            currentActiveKeys.add(camKey);
            if (!activeTiles.has(camKey)) { 
                const t = new Tile(camTile.x, camTile.y, zoom, camKey); 
                activeTiles.set(camKey, t); 
                insertTile(t); 
                loadQueue.add(t); 
            }
        }

        const mobile = isMobileDevice();
        let range = (zoom <= 10) ? Math.max(state.RANGE, 3)
            : (zoom >= 17 || (zoom >= 15 && mobile)) ? Math.max(4, Math.floor(state.RANGE/1.2))
            : state.RANGE;

        if (!state.IS_2D_MODE && state.ZOOM >= 14 && state.controls) {
            const polar = state.controls.getPolarAngle();
            if (polar > 0.4) range = Math.min(range + 1, state.RANGE + 2);
        }

        const isCameraReady = Math.abs(state.camera.position.y) >= 1;
        if (isCameraReady) {
            state.camera.updateMatrixWorld();
            const proj = new THREE.Matrix4().multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
            sharedFrustum.setFromProjectionMatrix(proj);
            for (let dy = -range; dy <= range; dy++) {
                for (let dx = -range; dx <= range; dx++) {
                    const tx = centerTile.x + dx; const ty = centerTile.y + dy;
                    if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) continue;
                    const key = `${state.MAP_SOURCE}_${tx}_${ty}_${zoom}`; 
                    currentActiveKeys.add(key);

                    let forcedRadius = 1;
                    if (state.PERFORMANCE_PRESET === 'performance' || state.PERFORMANCE_PRESET === 'ultra') forcedRadius = 2;
                    if (state.IS_2D_MODE && mobile) forcedRadius = Math.max(forcedRadius, 2);

                    if (!activeTiles.has(key)) {
                        const tile = new Tile(tx, ty, zoom, key);
                        if (tile.isVisible(sharedFrustum) || (Math.abs(dx) <= forcedRadius && Math.abs(dy) <= forcedRadius)) { 
                            activeTiles.set(key, tile); 
                            insertTile(tile); 
                            loadQueue.add(tile); 
                        }
                    }
                }
            }
        }

        lastRenderedZoom = zoom;

        for (const [key, tile] of activeTiles.entries()) {
            if (!currentActiveKeys.has(key)) {
                const isZoomingOut = lodChanging && (zoom < lastRenderedZoom);
                if (lodChanging && tile.mesh && tile.status !== 'disposed' && !isZoomingOut) {
                    removeTile(tile);
                    activeTiles.delete(key);
                    if (!fadingOutTiles.has(tile)) {
                        fadingOutTiles.add(tile);
                        tile.startFadeOut(2500); 
                    }
                } else {
                    removeTile(tile);
                    tile.dispose();
                    activeTiles.delete(key);
                }
            }
        }

        processLoadQueue();
    } finally {
        isUpdating = false;
        if (updatePending) {
            requestAnimationFrame(() => { updateVisibleTiles(); });
        }
    }
    return Promise.resolve();
}

export function updateHydrologyVisibility(visible: boolean): void { state.SHOW_HYDROLOGY = visible; resetTerrain(); updateVisibleTiles(); }
export function updateSlopeVisibility(visible: boolean): void { state.SHOW_SLOPES = visible; resetTerrain(); updateVisibleTiles(); }
export async function loadTerrain(): Promise<void> { await updateVisibleTiles(); }

export function refreshTerrain(forceUpdate = false): void {
    terrainUpdates.resetTerrain();
    if (state.camera && state.originTile) {
        terrainUpdates.repositionAllTiles();
        const camPos = state.camera.position;
        const coords = worldToLngLat(camPos.x, camPos.z, state.originTile);
        updateVisibleTiles(coords.lat, coords.lon, camPos.y, camPos.x, camPos.z, forceUpdate);
    } else {
        terrainUpdates.repositionAllTiles();
        updateVisibleTiles(state.TARGET_LAT, state.TARGET_LON, 5000, null, null, forceUpdate);
    }
}

export function prefetchAdjacentLODs(): void {
    if (!state.camera || !state.controls) return;
    const wx = state.controls.target.x;
    const wz = state.controls.target.z;
    const center = worldToLngLat(wx, wz, state.originTile);
    const zoom = state.ZOOM;
    const MAX_PREFETCH = 20;
    let added = 0;

    const _prefetchMaxZoom = isProActive() ? (state.MAX_ALLOWED_ZOOM || 18) : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);
    const nextZoom = Math.min(zoom + 1, _prefetchMaxZoom);
    if (nextZoom !== zoom) {
        const ct = lngLatToTile(center.lon, center.lat, nextZoom);
        const r = Math.max(1, Math.ceil(state.RANGE / 2));
        const maxT = Math.pow(2, nextZoom);
        for (let dy = -r; dy <= r && added < MAX_PREFETCH; dy++) {
            for (let dx = -r; dx <= r && added < MAX_PREFETCH; dx++) {
                const tx = ct.x + dx; const ty = ct.y + dy;
                if (tx < 0 || tx >= maxT || ty < 0 || ty >= maxT) continue;
                const pKey = `${tx}_${ty}_${nextZoom}`;
                if (!hasInCache(getTileCacheKey(pKey, nextZoom))) {
                    loadQueue.add(new Tile(tx, ty, nextZoom, pKey));
                    added++;
                }
            }
        }
    }

    const prevZoom = Math.max(zoom - 1, 6);
    if (prevZoom !== zoom) {
        const ct = lngLatToTile(center.lon, center.lat, prevZoom);
        const maxT = Math.pow(2, prevZoom);
        for (let dy = -2; dy <= 2 && added < MAX_PREFETCH; dy++) {
            for (let dx = -2; dx <= 2 && added < MAX_PREFETCH; dx++) {
                const tx = ct.x + dx; const ty = ct.y + dy;
                if (tx < 0 || tx >= maxT || ty < 0 || ty >= maxT) continue;
                const pKey = `${tx}_${ty}_${prevZoom}`;
                if (!hasInCache(getTileCacheKey(pKey, prevZoom))) {
                    loadQueue.add(new Tile(tx, ty, prevZoom, pKey));
                    added++;
                }
            }
        }
    }
    if (added > 0) processLoadQueue();
}

export function clearLabels(): void {
    for (const obj of activeLabels.values()) { if (state.scene) { state.scene.remove(obj.sprite); state.scene.remove(obj.line); } disposeObject(obj.sprite); disposeObject(obj.line); }
    activeLabels.clear();
}
