import * as THREE from 'three';
import { disposeObject } from './memory';
import { state, isProActive } from './state';
import { isMobileDevice } from './utils';
import { worldToLngLat, lngLatToTile, EARTH_CIRCUMFERENCE } from './geo';
import {
    getTileCacheKey,
    markCacheKeyInactive,
    hasInCache,
    purgeOldPixelData,
    getPrefetchBudget,
} from './tileCache';
import {
    insertTile,
    removeTile,
    clearIndex as clearSpatialIndex,
} from './tileSpatialIndex';
import {
    updateAllGPXMeshes,
    updateRecordedTrackMesh,
    refreshTracks as gpxRefreshTracks,
} from './gpxLayers';

// Re-exports de la refactorisation
export { Tile, terrainUniforms, sharedFrustum } from './terrain/Tile';
export {
    loadQueue,
    processLoadQueue,
    clearLoadQueue,
    addToLoadQueue,
    removeFromLoadQueue,
    prioritizeNewZoom,
} from './terrain/tileQueue';

import { Tile, shouldLoadTileAs2D } from './terrain/Tile';
import { sharedFrustum } from './terrain/Tile';
import {
    processLoadQueue,
    clearLoadQueue,
    addToLoadQueue,
    prioritizeNewZoom,
} from './terrain/tileQueue';
import { terrainUniforms } from './terrain/Tile';
import { resizeGeometryCache } from './geometryCache';
import { eventBus } from './eventBus';

export const activeTiles = new Map<string, Tile>();
export const activeLabels = new Map<string, any>();

const _terrainMatrix = new THREE.Matrix4();
const _candidateBounds = new THREE.Box3();
export const fadingOutTiles = new Set<Tile>();
// Only the preceding zoom-out generation is retained while its parents load.
const zoomOutReplacements = new Map<Tile, string>();
let lastRenderedZoom: number = -1;
let lastMapSource: string = '';
const prefetchKeys = new Set<string>();

/** Retry only visible placeholders when connectivity returns. */
export function retryFallbackColorTiles(): void {
    let removed = 0;
    for (const [key, tile] of activeTiles) {
        if (!tile.usesFallbackColor) continue;
        removeTile(tile);
        tile.dispose();
        activeTiles.delete(key);
        removed++;
    }
    if (removed > 0)
        void updateVisibleTiles(
            undefined,
            undefined,
            undefined,
            null,
            null,
            true
        );
}

eventBus.on('networkOnline', retryFallbackColorTiles);

function isSameLodPrefetchExperimentEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return (
        new URLSearchParams(window.location.search).get(
            'tileSameLodPrefetch'
        ) === '1'
    );
}

function isTileCandidateVisible(
    tx: number,
    ty: number,
    zoom: number,
    frustum: THREE.Frustum
): boolean {
    const zoomScale = Math.pow(2, zoom);
    const tileSizeMeters = EARTH_CIRCUMFERENCE / zoomScale;
    const originScale = Math.pow(2, state.originTile.z);
    const worldX =
        ((tx + 0.5) / zoomScale - (state.originTile.x + 0.5) / originScale) *
        EARTH_CIRCUMFERENCE;
    const worldZ =
        ((ty + 0.5) / zoomScale - (state.originTile.y + 0.5) / originScale) *
        EARTH_CIRCUMFERENCE;
    const halfExtent = tileSizeMeters * 0.7;

    _candidateBounds.min.set(
        worldX - halfExtent,
        -1000 - tileSizeMeters * 0.2,
        worldZ - halfExtent
    );
    _candidateBounds.max.set(
        worldX + halfExtent,
        9000 + tileSizeMeters * 0.2,
        worldZ + halfExtent
    );
    return frustum.intersectsBox(_candidateBounds);
}

export function resetTerrain(): void {
    clearLabels();
    clearLoadQueue(); // v5.29.28 : Annuler les chargements en cours de l'ancienne source/LOD
    for (const tile of fadingOutTiles) {
        markCacheKeyInactive(tile.cacheKey);
        tile.dispose();
    }
    fadingOutTiles.clear();
    zoomOutReplacements.clear();
    prefetchKeys.clear();
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
        // Retirer aussi les tuiles 2D encore en vol avant le garde-fou sur les
        // textures. Sinon leur chargement peut se terminer après le passage en
        // 3D et produire un trou ou une dalle plate au LOD élevé.
        if (!is2D && tile.dataMode2D && tile.zoom > 10) {
            toReload.push(tile.key);
            continue;
        }

        if (!tile.elevationTex || !tile.colorTex) continue;

        // v5.40.18 : Nettoyage forcé des objets 3D lors d'un changement de mode (2D/3D)
        // On les supprime systématiquement pour forcer un re-rendu à la bonne altitude (0 en 2D, réel en 3D).
        if (tile.forestMesh) {
            if (state.scene) state.scene.remove(tile.forestMesh);
            disposeObject(tile.forestMesh);
            tile.forestMesh = null;
        }
        if (tile.buildingGroup) {
            if (state.scene) state.scene.remove(tile.buildingGroup);
            disposeObject(tile.buildingGroup);
            tile.buildingGroup = null;
        }
        if (tile.poiGroup) {
            if (state.scene) state.scene.remove(tile.poiGroup);
            disposeObject(tile.poiGroup);
            tile.poiGroup = null;
        }

        if (is2D) {
            if (tile.waterMaskTex) {
                tile.waterMaskTex.dispose();
                tile.waterMaskTex = null;
            }
        }

        tile.buildMesh(state.RESOLUTION);
    }
    for (const key of toReload) {
        const tile = activeTiles.get(key);
        if (!tile) continue;
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

    const lastOrigin = (repositionAllTiles as any).lastOrigin || {
        x: state.originTile.x,
        y: state.originTile.y,
        z: state.originTile.z,
    };
    if (
        lastOrigin.x !== state.originTile.x ||
        lastOrigin.y !== state.originTile.y ||
        lastOrigin.z !== state.originTile.z
    ) {
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
        import('./location').then((m) => m.updateUserMarker());
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
    repositionAllTiles,
};

/**
 * Rafraîchit l'affichage de tous les tracés (GPX et enregistrement en cours).
 */
export function refreshTracks(): void {
    gpxRefreshTracks();
}

export function animateTiles(delta: number): boolean {
    let stillFading = false;
    for (const tile of activeTiles.values()) {
        if (tile.isFadingIn) {
            tile.updateFade(delta);
            stillFading = true;
        }
    }

    if (fadingOutTiles.size > 0) {
        const deltaMs = delta * 1000;
        const toRemove: Tile[] = [];
        for (const tile of fadingOutTiles) {
            const replacementKey = zoomOutReplacements.get(tile);
            if (replacementKey) {
                const replacement = activeTiles.get(replacementKey);
                if (!replacement) {
                    toRemove.push(tile);
                    continue;
                }
                // A slow/offline parent must not erase the image already available.
                // Waiting alone does not request another rendered frame.
                if (!replacement.mesh || replacement.isFadingIn) continue;
                zoomOutReplacements.delete(tile);
            }
            tile.updateFadeOut(deltaMs);
            if (!tile.isFadingOut) {
                toRemove.push(tile);
            } else {
                stillFading = true;
            }
        }
        for (const tile of toRemove) {
            markCacheKeyInactive(tile.cacheKey);
            fadingOutTiles.delete(tile);
            zoomOutReplacements.delete(tile);
            tile.dispose();
        }
    }
    return stillFading;
}

export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource || isNaN(lat) || lat === 0) return;

    // En mode auto, MAP_SOURCE est toujours 'swisstopo'.
    // La source de tuiles reelle est determinee dans getColorUrl (data-driven),
    // et le badge TopStatusBar affiche le nom du pays via getCountryCode.
    // On ne manipule plus MAP_SOURCE pour eviter les conflits avec
    // la selection manuelle (opentopomap, satellite).
    if (state.MAP_SOURCE !== 'swisstopo') {
        state.MAP_SOURCE = 'swisstopo';
        if (state.camera && state.controls) {
            updateVisibleTiles(
                lat,
                lon,
                state.camera.position.y,
                state.controls.target.x,
                state.controls.target.z
            );
        } else {
            updateVisibleTiles();
        }
    }
}

let isUpdating = false;
let updatePending = false;

export async function updateVisibleTiles(
    _camLat: number = state.TARGET_LAT,
    _camLon: number = state.TARGET_LON,
    _camAltitude: number = 5000,
    worldX: number | null = null,
    worldZ: number | null = null,
    force: boolean = false
): Promise<void> {
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
        const is2DGlobal =
            state.IS_2D_MODE ||
            state.PERFORMANCE_PRESET === 'eco' ||
            state.ZOOM <= 10;
        terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
        const MIN_SLOPE_LOD = 11;
        terrainUniforms.uShowSlopes.value =
            state.SHOW_SLOPES && !is2DGlobal && state.ZOOM >= MIN_SLOPE_LOD
                ? 1.0
                : 0.0;
        terrainUniforms.uShowHydrology.value = state.SHOW_HYDROLOGY ? 1.0 : 0.0;
        // v5.61.4 : normal maps RG compact toujours actif (Z reconstruit GPU).
        terrainUniforms.uCompactNormalmap.value = 1.0;
        resizeGeometryCache();

        if (!state.camera) return Promise.resolve();

        const wx =
            worldX !== null
                ? worldX
                : state.controls
                  ? state.controls.target.x
                  : state.camera.position.x;
        const wz =
            worldZ !== null
                ? worldZ
                : state.controls
                  ? state.controls.target.z
                  : state.camera.position.z;

        const currentGPS = worldToLngLat(wx, wz, state.originTile);
        const zoom = state.ZOOM;
        const maxTile = Math.pow(2, zoom);
        const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
        const currentActiveKeys = new Set<string>();

        const lodChanging =
            lastRenderedZoom !== -1 && zoom !== lastRenderedZoom;

        if (lodChanging) {
            // Bound retained coverage to one transition, including rapid gestures.
            for (const tile of zoomOutReplacements.keys()) {
                markCacheKeyInactive(tile.cacheKey);
                fadingOutTiles.delete(tile);
                tile.dispose();
            }
            zoomOutReplacements.clear();
            prioritizeNewZoom(zoom);
            purgeOldPixelData();
        }

        const camGPS = worldToLngLat(
            state.camera.position.x,
            state.camera.position.z,
            state.originTile
        );
        const camTile = lngLatToTile(camGPS.lon, camGPS.lat, zoom);
        const camKey = `${state.MAP_SOURCE}_${camTile.x}_${camTile.y}_${zoom}`;
        if (
            camTile.x >= 0 &&
            camTile.x < maxTile &&
            camTile.y >= 0 &&
            camTile.y < maxTile
        ) {
            currentActiveKeys.add(camKey);
            if (!activeTiles.has(camKey)) {
                const t = new Tile(camTile.x, camTile.y, zoom, camKey);
                activeTiles.set(camKey, t);
                insertTile(t);
                addToLoadQueue(t);
            }
        }

        const mobile = isMobileDevice();
        let range =
            zoom <= 10
                ? Math.max(state.RANGE, 3)
                : zoom >= 17 || (zoom >= 15 && mobile)
                  ? Math.max(4, Math.floor(state.RANGE / 1.2))
                  : state.RANGE;

        if (!state.IS_2D_MODE && state.ZOOM >= 14 && state.controls) {
            const polar = state.controls.getPolarAngle();
            if (polar > 0.4) range = Math.min(range + 1, state.RANGE + 2);
        }

        const isCameraReady = Math.abs(state.camera.position.y) >= 1;
        if (isCameraReady) {
            state.camera.updateMatrixWorld();
            _terrainMatrix.multiplyMatrices(
                state.camera.projectionMatrix,
                state.camera.matrixWorldInverse
            );
            sharedFrustum.setFromProjectionMatrix(_terrainMatrix);
            for (let dy = -range; dy <= range; dy++) {
                for (let dx = -range; dx <= range; dx++) {
                    const tx = centerTile.x + dx;
                    const ty = centerTile.y + dy;
                    if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile)
                        continue;
                    const key = `${state.MAP_SOURCE}_${tx}_${ty}_${zoom}`;
                    currentActiveKeys.add(key);

                    const forcedRadius = 1;

                    if (!activeTiles.has(key)) {
                        if (
                            (Math.abs(dx) <= forcedRadius &&
                                Math.abs(dy) <= forcedRadius) ||
                            isTileCandidateVisible(tx, ty, zoom, sharedFrustum)
                        ) {
                            const tile = new Tile(tx, ty, zoom, key);
                            activeTiles.set(key, tile);
                            insertTile(tile);
                            addToLoadQueue(tile);
                        }
                    }
                }
            }
        }

        const previousRenderedZoom = lastRenderedZoom;
        lastRenderedZoom = zoom;

        for (const [key, tile] of activeTiles.entries()) {
            if (!currentActiveKeys.has(key)) {
                const isZoomingOut = lodChanging && zoom < previousRenderedZoom;
                if (lodChanging && tile.mesh && tile.status !== 'disposed') {
                    removeTile(tile);
                    activeTiles.delete(key);
                    if (!fadingOutTiles.has(tile)) {
                        fadingOutTiles.add(tile);
                        tile.startFadeOut(isZoomingOut ? 200 : 2500);
                        if (isZoomingOut) {
                            const scale = 2 ** (tile.zoom - zoom);
                            zoomOutReplacements.set(
                                tile,
                                `${state.MAP_SOURCE}_${Math.floor(tile.tx / scale)}_${Math.floor(tile.ty / scale)}_${zoom}`
                            );
                        }
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
            requestAnimationFrame(() => {
                updateVisibleTiles();
            });
        }
    }
    return Promise.resolve();
}

export function updateHydrologyVisibility(visible: boolean): void {
    state.SHOW_HYDROLOGY = visible;
    resetTerrain();
    updateVisibleTiles();
}
export function updateSlopeVisibility(visible: boolean): void {
    state.SHOW_SLOPES = visible;
    resetTerrain();
    updateVisibleTiles();
}
export async function loadTerrain(): Promise<void> {
    await updateVisibleTiles();
}

export function refreshTerrain(forceUpdate = false): void {
    terrainUpdates.resetTerrain();
    if (state.camera && state.originTile) {
        terrainUpdates.repositionAllTiles();
        const camPos = state.camera.position;
        const coords = worldToLngLat(camPos.x, camPos.z, state.originTile);
        updateVisibleTiles(
            coords.lat,
            coords.lon,
            camPos.y,
            camPos.x,
            camPos.z,
            forceUpdate
        );
    } else {
        terrainUpdates.repositionAllTiles();
        updateVisibleTiles(
            state.TARGET_LAT,
            state.TARGET_LON,
            5000,
            null,
            null,
            forceUpdate
        );
    }
}

export function prefetchAdjacentLODs(): void {
    if (!state.camera || !state.controls) return;
    const center = worldToLngLat(
        state.controls.target.x,
        state.controls.target.z,
        state.originTile
    );
    const zoom = state.ZOOM;
    const maxZoom = isProActive()
        ? state.MAX_ALLOWED_ZOOM || 18
        : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);
    const reservedKeys = [...activeTiles.values(), ...fadingOutTiles].map(
        (tile) => tile.cacheKey
    );
    const budget = getPrefetchBudget(reservedKeys);
    if (budget === 0) return;
    const candidates: {
        tx: number;
        ty: number;
        zoom: number;
        key: string;
        distance: number;
        priority: number;
    }[] = [];
    const levels: {
        zoom: number;
        radius: number;
        innerRadius?: number;
        priority: number;
    }[] = [
        ...(isSameLodPrefetchExperimentEnabled()
            ? [
                  {
                      zoom,
                      radius: state.RANGE + 1,
                      innerRadius: state.RANGE,
                      priority: 0,
                  },
              ]
            : []),
        {
            zoom: Math.min(zoom + 1, maxZoom),
            radius: Math.max(1, Math.ceil(state.RANGE / 2)),
            priority: 1,
        },
        { zoom: Math.max(zoom - 1, 6), radius: 2, priority: 2 },
    ];
    for (const level of levels) {
        if (
            (level.zoom === zoom && level.priority !== 0) ||
            level.zoom > maxZoom
        )
            continue;
        const ct = lngLatToTile(center.lon, center.lat, level.zoom);
        const maxT = Math.pow(2, level.zoom);
        for (let dy = -level.radius; dy <= level.radius; dy++) {
            for (let dx = -level.radius; dx <= level.radius; dx++) {
                if (
                    level.innerRadius !== undefined &&
                    Math.max(Math.abs(dx), Math.abs(dy)) <= level.innerRadius
                )
                    continue;
                const tx = ct.x + dx,
                    ty = ct.y + dy;
                if (tx < 0 || tx >= maxT || ty < 0 || ty >= maxT) continue;
                const key = `${state.MAP_SOURCE}_${tx}_${ty}_${level.zoom}`;
                if (!activeTiles.has(key))
                    candidates.push({
                        tx,
                        ty,
                        zoom: level.zoom,
                        key,
                        distance: dx * dx + dy * dy,
                        priority: level.priority,
                    });
            }
        }
    }
    // Select the same nearby working set even when some entries are already cached.
    // Otherwise every pass replaces a neighbor that the next pass immediately reloads.
    candidates.sort(
        (a, b) =>
            a.priority - b.priority ||
            a.distance - b.distance ||
            a.zoom - b.zoom
    );
    let selectedCandidates: typeof candidates;
    const sameLodCandidates = candidates.filter(
        (candidate) => candidate.priority === 0
    );
    if (sameLodCandidates.length >= budget) {
        // When the explicit pan experiment is active, devote the small mobile
        // background budget to the current LOD instead of diluting it across
        // zoom levels that cannot cover an immediate pan.
        selectedCandidates = sameLodCandidates.slice(0, budget);
    } else {
        const zoomInCandidates = candidates.filter(
            (candidate) => candidate.priority === 1
        );
        const zoomOutCandidates = candidates.filter(
            (candidate) => candidate.priority === 2
        );
        const zoomOutTarget = Math.min(
            zoomOutCandidates.length,
            Math.max(1, Math.floor(budget / 3))
        );
        const zoomInTarget = Math.min(
            zoomInCandidates.length,
            budget - zoomOutTarget
        );
        selectedCandidates = [
            ...sameLodCandidates,
            ...zoomInCandidates.slice(0, zoomInTarget),
            ...zoomOutCandidates.slice(0, zoomOutTarget),
        ].slice(0, budget);
        if (selectedCandidates.length < budget) {
            const selectedKeys = new Set(
                selectedCandidates.map((candidate) => candidate.key)
            );
            selectedCandidates.push(
                ...candidates
                    .filter((candidate) => !selectedKeys.has(candidate.key))
                    .slice(0, budget - selectedCandidates.length)
            );
        }
    }
    let added = 0;
    for (const candidate of selectedCandidates) {
        const { tx, ty, zoom: targetZoom, key } = candidate;
        if (
            prefetchKeys.has(key) ||
            hasInCache(
                getTileCacheKey(key, targetZoom, shouldLoadTileAs2D(targetZoom))
            )
        )
            continue;
        prefetchKeys.add(key);
        addToLoadQueue(
            new Tile(tx, ty, targetZoom, key, true, () =>
                prefetchKeys.delete(key)
            )
        );
        added++;
    }
    if (added > 0) processLoadQueue();
}
export function clearLabels(): void {
    for (const obj of activeLabels.values()) {
        if (state.scene) {
            state.scene.remove(obj.sprite);
            state.scene.remove(obj.line);
        }
        disposeObject(obj.sprite);
        disposeObject(obj.line);
    }
    activeLabels.clear();
}
