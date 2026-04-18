import * as THREE from 'three';
import { disposeObject } from './memory';
import { state, isProActive, type GPXLayer, GPX_COLORS } from './state';
import { isMobileDevice, simplifyRDP } from './utils';
import { updateElevationProfile } from './profile';
import { lngLatToWorld, worldToLngLat, lngLatToTile, isPositionInSwitzerland, isPositionInFrance } from './geo';
import { eventBus } from './eventBus';
import { getAltitudeAt, drapeToTerrain } from './analysis';
import { getTileCacheKey, markCacheKeyInactive, hasInCache, getFromCache, purgeOldPixelData } from './tileCache';
import { insertTile, removeTile, clearIndex as clearSpatialIndex } from './tileSpatialIndex';
import { calculateTrackStats } from './geoStats';

// Re-exports de la refactorisation
export { Tile, terrainUniforms } from './terrain/Tile';
export { loadQueue, processLoadQueue, clearLoadQueue, addToLoadQueue, removeFromLoadQueue } from './terrain/tileQueue';

import { Tile } from './terrain/Tile';
import { loadQueue, processLoadQueue, clearLoadQueue } from './terrain/tileQueue';

export const activeTiles = new Map<string, Tile>(); 
export const activeLabels = new Map<string, any>(); 

const fadingOutTiles = new Set<Tile>();
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
        
        // v5.28.45 : Nettoyage forcé des objets 3D si on passe en 2D
        if (is2D) {
            if (tile.forestMesh) { if (state.scene) state.scene.remove(tile.forestMesh); disposeObject(tile.forestMesh); tile.forestMesh = null; }
            if (tile.buildingGroup) { if (state.scene) state.scene.remove(tile.buildingGroup); disposeObject(tile.buildingGroup); tile.buildingGroup = null; }
            if (tile.hydroGroup) { if (state.scene) state.scene.remove(tile.hydroGroup); disposeObject(tile.hydroGroup); tile.hydroGroup = null; }
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
        const offsetX = (ooxNorm - oxNorm) * EARTH_CIRCUMFERENCE_VAL; // EARTH_CIRCUMFERENCE_VAL defined in geo
        const offsetZ = (ooyNorm - oyNorm) * EARTH_CIRCUMFERENCE_VAL;

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
        // Empêche les tracés de "suivre" l'utilisateur lors de grands déplacements (voiture)
        terrainUpdates.updateAllGPXMeshes();
        terrainUpdates.updateRecordedTrackMesh();

        // v5.28.31 : Repositionner le marqueur utilisateur lors d'un Origin Shift
        import('./location').then(m => m.updateUserMarker());
    }
    (repositionAllTiles as any).lastOrigin = { ...state.originTile };
}

/** 
 * v5.27.3: Groupement des fonctions de mise à jour pour testabilité
 * Permet à Vitest d'espionner les appels internes lors des Origin Shifts.
 */
export const terrainUpdates = {
    updateAllGPXMeshes,
    updateRecordedTrackMesh,
    refreshTracks,
    resetTerrain,
    repositionAllTiles
};

/**
 * Rafraîchit l'affichage de tous les tracés (GPX et enregistrement en cours).
 * Utile après un changement de mode 2D/3D ou un déplacement majeur.
 */
export function refreshTracks(): void {
    updateAllGPXMeshes();
    updateRecordedTrackMesh();
}

// Fixed constant access
const EARTH_CIRCUMFERENCE_VAL = 40075016.686;

export function animateTiles(delta: number): boolean { 
    let stillFading = false;
    for (const tile of activeTiles.values()) { if (tile.isFadingIn) { tile.updateFade(delta); stillFading = true; } }
    
    // v5.28.40 : Optimisation — Ne pas créer d'Array si le Set est vide (évite le GC pressure à 60fps)
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
    // v5.29.28 : Protection renforcée. Si l'utilisateur a choisi une source, on n'y touche plus.
    if (state.hasManualSource || isNaN(lat) || lat === 0) return;
    
    let newSource = (state.ZOOM > 10 && (isPositionInSwitzerland(lat, lon) || isPositionInFrance(lat, lon))) ? 'swisstopo' : 'opentopomap';
    if (state.MAP_SOURCE !== newSource) {
        console.log(`[Terrain] Auto-switching source to ${newSource} based on location`);
        state.MAP_SOURCE = newSource;
        document.querySelectorAll('.layer-item').forEach(i => { i.classList.remove('active'); if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active'); });
        if (state.camera && state.controls) {
            updateVisibleTiles(lat, lon, state.camera.position.y, state.controls.target.x, state.controls.target.z);
        } else {
            updateVisibleTiles();
        }
    }
}

import { terrainUniforms } from './terrain/Tile';

let isUpdating = false;
let updatePending = false;

export async function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number | null = null, worldZ: number | null = null, force: boolean = false): Promise<void> {
    if (isUpdating && !force) {
        updatePending = true;
        return Promise.resolve();
    }
    isUpdating = true;
    updatePending = false;

    // v5.29.28 : Détection de changement de source de carte
    if (lastMapSource !== state.MAP_SOURCE) {
        lastMapSource = state.MAP_SOURCE;
        resetTerrain();
    }

    try {
        const is2DGlobal = state.IS_2D_MODE || state.PERFORMANCE_PRESET === 'eco' || state.ZOOM <= 10;
        terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
        const MIN_SLOPE_LOD = 11;
        terrainUniforms.uShowSlopes.value = (state.SHOW_SLOPES && !is2DGlobal && state.ZOOM >= MIN_SLOPE_LOD) ? 1.0 : 0.0;
        terrainUniforms.uShowHydrology.value = state.SHOW_HYDROLOGY ? 1.0 : 0.0;

        if (!state.camera) return Promise.resolve();

        const wx = (worldX !== null) ? worldX : (state.controls ? state.controls.target.x : state.camera.position.x);
        const wz = (worldZ !== null) ? worldZ : (state.controls ? state.controls.target.z : state.camera.position.z);

        const currentGPS = worldToLngLat(wx, wz, state.originTile);
        const zoom = state.ZOOM; const maxTile = Math.pow(2, zoom);
        const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
        const currentActiveKeys = new Set<string>();

        const isZoomIn = zoom > lastRenderedZoom;
        const lodChanging = lastRenderedZoom !== -1 && zoom !== lastRenderedZoom;

        // v5.28.48 : Nettoyage immédiat lors d'un changement de LOD
        if (lodChanging) {
            clearLoadQueue();
            purgeOldPixelData(); // v5.29.31 : Libérer la RAM des anciennes données d'altitude
            if (fadingOutTiles.size > 0) {
                for (const t of fadingOutTiles) t.dispose();
                fadingOutTiles.clear();
            }
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
            for (let dy = -range; dy <= range; dy++) {
                for (let dx = -range; dx <= range; dx++) {
                    const tx = centerTile.x + dx; const ty = centerTile.y + dy;
                    if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) continue;
                    const key = `${state.MAP_SOURCE}_${tx}_${ty}_${zoom}`; 
                    currentActiveKeys.add(key);
                    if (!activeTiles.has(key)) {
                        const tile = new Tile(tx, ty, zoom, key);
                        if (tile.isVisible() || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)) { 
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
                if (lodChanging && isZoomIn && tile.mesh && tile.status !== 'disposed') {
                    removeTile(tile);
                    activeTiles.delete(key);
                    fadingOutTiles.add(tile);
                    tile.startFadeOut();
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
            setTimeout(() => { updateVisibleTiles(); }, 50);
        }
    }
    return Promise.resolve();
}

export function updateHydrologyVisibility(visible: boolean): void { state.SHOW_HYDROLOGY = visible; resetTerrain(); updateVisibleTiles(); }
export function updateSlopeVisibility(visible: boolean): void { state.SHOW_SLOPES = visible; resetTerrain(); updateVisibleTiles(); }
export async function loadTerrain(): Promise<void> { await updateVisibleTiles(); }

/**
 * v5.28.2: Centralise la réinitialisation du terrain.
 * Assure que repositionAllTiles() est appelé pour déclencher le recalage de l'origine
 * et la mise à jour des maillages GPX lors d'une téléportation.
 */
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

const GPX_SURFACE_OFFSET = 30;

function gpxDrapePoints(
    rawPts: Array<{lon: number; lat: number; ele: number}>,
    originTile: {x: number; y: number; z: number},
    densifySteps = 4
): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];
    const is2D = state.IS_2D_MODE;
    for (let i = 0; i < rawPts.length; i++) {
        const p = rawPts[i];
        const pos = lngLatToWorld(p.lon, p.lat, originTile);
        const elevGPX = (p.ele || 0) * state.RELIEF_EXAGGERATION;
        const terrainY = is2D ? 0 : getAltitudeAt(pos.x, pos.z);
        const y = is2D ? GPX_SURFACE_OFFSET : Math.max(terrainY, elevGPX) + GPX_SURFACE_OFFSET;
        result.push(new THREE.Vector3(pos.x, y, pos.z));
        if (i < rawPts.length - 1 && densifySteps > 0) {
            const pNext = rawPts[i + 1];
            for (let s = 1; s < densifySteps; s++) {
                const t = s / densifySteps;
                const iLon = p.lon + (pNext.lon - p.lon) * t;
                const iLat = p.lat + (pNext.lat - p.lat) * t;
                const iEle = (p.ele || 0) + ((pNext.ele || 0) - (p.ele || 0)) * t;
                const iPos = lngLatToWorld(iLon, iLat, originTile);
                const iElevGPX = iEle * state.RELIEF_EXAGGERATION;
                const iTerrainY = is2D ? 0 : getAltitudeAt(iPos.x, iPos.z);
                const iY = is2D ? GPX_SURFACE_OFFSET : Math.max(iTerrainY, iElevGPX) + GPX_SURFACE_OFFSET;
                result.push(new THREE.Vector3(iPos.x, iY, iPos.z));
            }
        }
    }
    return result;
}

export function addGPXLayer(rawData: Record<string, any>, name: string): GPXLayer {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const colorIndex = state.gpxLayers.length % GPX_COLORS.length;
    const color = GPX_COLORS[colorIndex];
    const track = rawData.tracks[0];
    const points = track.points;
    
    // Vérifier que les points sont valides
    if (!points || points.length < 2) {
        throw new Error(`Cannot add GPX layer: not enough points (${points?.length || 0})`);
    }
    
    // Vérifier que les points ont des coordonnées valides
    const validPoints = points.filter((p: any) => 
        typeof p.lat === 'number' && typeof p.lon === 'number' && 
        !isNaN(p.lat) && !isNaN(p.lon)
    );
    
    if (validPoints.length < 2) {
        throw new Error(`Cannot add GPX layer: not enough valid points (${validPoints.length})`);
    }
    
    // ✅ Utiliser l'algorithme centralisé avec hystérésis (coherent avec TrackSheet)
    const stats = calculateTrackStats(validPoints.map((p: any) => ({
        lat: p.lat,
        lon: p.lon,
        alt: p.ele !== undefined ? p.ele : (p.alt !== undefined ? p.alt : 0),
        timestamp: p.time ? new Date(p.time).getTime() : 0
    })));

    const box = new THREE.Box3();
    const camAlt = state.camera ? state.camera.position.y : 10000;
    const thickness = Math.max(1.5, camAlt / 1200);
    const threePoints = gpxDrapePoints(validPoints, state.originTile);
    threePoints.forEach(v => box.expandByPoint(v));
    const curve = new THREE.CatmullRomCurve3(threePoints);
    const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 1500), thickness, 4, false);
    const is2D = state.IS_2D_MODE;
    const material = is2D 
        ? new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.95, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
        })
        : new THREE.MeshStandardMaterial({
            color: color, emissive: color, emissiveIntensity: 0.3, transparent: true, opacity: 0.95, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
        });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;
    mesh.userData = { type: 'gpx-track', layerId: id };
    if (state.scene) state.scene.add(mesh);
    const layer: GPXLayer = {
        id, name, color, visible: true, rawData, points: threePoints, mesh,
        stats: { 
            distance: stats.distance, 
            dPlus: stats.dPlus, 
            dMinus: stats.dMinus, 
            pointCount: validPoints.length, 
            estimatedTime: stats.estimatedTime 
        }
    };
    state.gpxLayers = [...state.gpxLayers, layer];
    state.activeGPXLayerId = id; // v5.29.28 : Toujours activer le dernier import
    const lats = validPoints.map((p: any) => p.lat as number); const lons = validPoints.map((p: any) => p.lon as number); const eles = validPoints.map((p: any) => (p.ele as number) || 0);
    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2; const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;
    const avgEle = eles.reduce((s: number, v: number) => s + v, 0) / eles.length;
    const size = new THREE.Vector3(); box.getSize(size);
    const trackSpread = Math.max(size.x, size.z); const viewDistance = Math.max(trackSpread * 1.5, 3000);
    const flyCenter = lngLatToWorld(centerLon, centerLat, state.originTile);
    const targetElevation = avgEle * state.RELIEF_EXAGGERATION;
    eventBus.emit('flyTo', { worldX: flyCenter.x, worldZ: flyCenter.z, targetElevation, targetDistance: viewDistance });
    setTimeout(() => updateAllGPXMeshes(), 0);
    setTimeout(() => { if (state.gpxLayers.length > 0) updateAllGPXMeshes(); }, 3000);
    setTimeout(() => { if (state.gpxLayers.length > 0) updateAllGPXMeshes(); }, 6000);
    updateElevationProfile();
    return layer;
}

export function removeGPXLayer(id: string): void {
    const layer = state.gpxLayers.find(l => l.id === id);
    if (!layer) return;
    if (layer.mesh) { if (state.scene) state.scene.remove(layer.mesh); disposeObject(layer.mesh); }
    state.gpxLayers = state.gpxLayers.filter(l => l.id !== id);
    if (state.activeGPXLayerId === id) state.activeGPXLayerId = state.gpxLayers.length > 0 ? state.gpxLayers[0].id : null;
    if (state.gpxLayers.length === 0) { const prof = document.getElementById('elevation-profile'); if (prof) prof.style.display = 'none'; } else updateElevationProfile();
}

export function toggleGPXLayer(id: string): void {
    const layers = state.gpxLayers;
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    const layer = layers[idx];
    const newVisible = !layer.visible;
    if (layer.mesh) layer.mesh.visible = newVisible;
    const updated = [...layers]; updated[idx] = { ...layer, visible: newVisible }; state.gpxLayers = updated;
}

let gpxUpdateTimeout: any = null;
let recordedUpdateTimeout: any = null;

export function updateAllGPXMeshes(): void {
    if (gpxUpdateTimeout) clearTimeout(gpxUpdateTimeout);
    gpxUpdateTimeout = setTimeout(() => {
        _doUpdateAllGPXMeshes();
        gpxUpdateTimeout = null;
    }, 100);
}

function _doUpdateAllGPXMeshes(): void {
    if (!state.camera) return;
    const camAlt = state.camera.position.y;
    const thickness = Math.max(1.5, camAlt / 1200);
    const updatedLayers: GPXLayer[] = state.gpxLayers.map(layer => {
        if (layer.mesh) { if (state.scene) state.scene.remove(layer.mesh); disposeObject(layer.mesh); }
        const track = layer.rawData.tracks[0]; const points = track.points; 
        
        // v5.28.4 : Utilisation de la fonction centralisée drapeToTerrain
        const threePoints = drapeToTerrain(points, state.originTile, 4, 30);
        
        const curve = new THREE.CatmullRomCurve3(threePoints);
        const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 1500), thickness, 4, false);
        const is2D = state.IS_2D_MODE;
        const material = is2D 
            ? new THREE.MeshBasicMaterial({
                color: layer.color, transparent: true, opacity: 0.95, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
            })
            : new THREE.MeshStandardMaterial({
                color: layer.color, emissive: layer.color, emissiveIntensity: 0.3, transparent: true, opacity: 0.95, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
            });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 10; mesh.visible = layer.visible;
        mesh.userData = { type: 'gpx-track', layerId: layer.id };
        if (state.scene) state.scene.add(mesh);
        return { ...layer, points: threePoints, mesh };
    });
    state.gpxLayers = updatedLayers;
}

export function updateRecordedTrackMesh(): void {
    if (recordedUpdateTimeout) clearTimeout(recordedUpdateTimeout);
    recordedUpdateTimeout = setTimeout(() => {
        _doUpdateRecordedTrackMesh();
        recordedUpdateTimeout = null;
    }, 150);
}

function _doUpdateRecordedTrackMesh(): void {
    if (state.recordedPoints.length < 2 || !state.camera || !state.scene || !state.originTile) return;
    
    // v5.28.25 : Dédoublonnage strict par timestamp pour éviter les artefacts de "traits droits"
    // (Retours en arrière si des points avec le même timestamp mais positions différentes existent)
    const uniquePointsMap = new Map<number, typeof state.recordedPoints[0]>();
    for (const p of state.recordedPoints) {
        uniquePointsMap.set(p.timestamp, p);
    }
    const uniquePoints = Array.from(uniquePointsMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    if (uniquePoints.length < 2) return;

    const camAlt = state.camera.position.y; 
    const thickness = Math.max(2.0, camAlt / 800); 
    
    if (state.recordedMesh) { 
        state.scene.remove(state.recordedMesh); 
        disposeObject(state.recordedMesh); 
    }
    
    const originTile = state.originTile;
    
    // v5.28.4: Utilisation de drapeToTerrain pour uniformiser le plaquage.
    // v5.28.25 : surfaceOffset=12 (au lieu de 8) pour être légèrement au dessus du terrain et éviter le Z-fighting
    const threePoints = drapeToTerrain(uniquePoints, originTile, 0, 12);

    // v5.28.5: Simplification RDP plus fine (epsilon 1.0 au lieu de 2.0)
    const simplifiedPoints = simplifyRDP(threePoints, 1.0, (v) => v);

    if (simplifiedPoints.length < 2) return;
    
    try {
        // v5.28.5: Augmentation du nombre de segments pour fluidité (1500 au lieu de 800)
        // et utilisation de 'centripetal' pour éviter les overshoots des splines.
        const curve = new THREE.CatmullRomCurve3(simplifiedPoints, false, 'centripetal');
        const geometry = new THREE.TubeGeometry(curve, Math.min(simplifiedPoints.length * 3, 1500), thickness, 4, false);
        const is2D = state.IS_2D_MODE;
        const material = is2D
            ? new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 })
            : new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 });
        state.recordedMesh = new THREE.Mesh(geometry, material);
        state.scene.add(state.recordedMesh);
    } catch (e) {
        console.error('[Terrain] Failed to create recorded track mesh:', e);
    }
}

export function clearAllGPXLayers(): void {
    for (const layer of state.gpxLayers) { if (layer.mesh) { if (state.scene) state.scene.remove(layer.mesh); disposeObject(layer.mesh); } }
    state.gpxLayers = []; state.activeGPXLayerId = null;
    if (state.recordedMesh) { if (state.scene) state.scene.remove(state.recordedMesh); disposeObject(state.recordedMesh); state.recordedMesh = null; }
    const prof = document.getElementById('elevation-profile'); if (prof) prof.style.display = 'none';
    const tc = document.getElementById('trail-controls'); if (tc) tc.style.display = 'none';
}

export function clearLabels(): void {
    for (const obj of activeLabels.values()) { if (state.scene) { state.scene.remove(obj.sprite); state.scene.remove(obj.line); } disposeObject(obj.sprite); disposeObject(obj.line); }
    activeLabels.clear();
}
