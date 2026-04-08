import * as THREE from 'three';
import { disposeObject } from './memory';
import { state, GPX_COLORS } from './state';
import type { GPXLayer } from './state';
import { isPositionInSwitzerland, isPositionInFrance, isMobileDevice } from './utils';
import { updateElevationProfile, haversineDistance } from './profile';
import { lngLatToWorld, worldToLngLat, lngLatToTile } from './geo';
import { eventBus } from './eventBus';
import { getAltitudeAt } from './analysis';
import { getTileCacheKey, markCacheKeyInactive, hasInCache, getFromCache } from './tileCache';
import { insertTile, removeTile, clearIndex as clearSpatialIndex } from './tileSpatialIndex';

// Re-exports de la refactorisation
export { Tile, terrainUniforms } from './terrain/Tile';
export { loadQueue, processLoadQueue, clearLoadQueue, addToLoadQueue, removeFromLoadQueue } from './terrain/tileQueue';

import { Tile } from './terrain/Tile';
import { loadQueue, processLoadQueue } from './terrain/tileQueue';

export const activeTiles = new Map<string, Tile>(); 
export const activeLabels = new Map<string, any>(); 

const fadingOutTiles = new Set<Tile>();
let lastRenderedZoom: number = -1;

export function resetTerrain(): void {
    clearLabels();
    for (const tile of fadingOutTiles) {
        markCacheKeyInactive(getTileCacheKey(tile.key, tile.zoom));
        tile.dispose();
    }
    fadingOutTiles.clear();
    lastRenderedZoom = -1;
    for (const tile of activeTiles.values()) tile.dispose();
    activeTiles.clear();
    clearSpatialIndex();
}

export function rebuildActiveTiles(): void {
    const toReload: string[] = [];
    for (const tile of activeTiles.values()) {
        if (!tile.elevationTex || !tile.colorTex) continue;
        if (!state.IS_2D_MODE && !tile.pixelData && tile.zoom > 10) {
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
    }
    (repositionAllTiles as any).lastOrigin = { ...state.originTile };
}

// Fixed constant access
const EARTH_CIRCUMFERENCE_VAL = 40075016.686;

export function animateTiles(delta: number): boolean { 
    let stillFading = false;
    for (const tile of activeTiles.values()) { if (tile.isFadingIn) { tile.updateFade(delta); stillFading = true; } }
    if (fadingOutTiles.size > 0) {
        const deltaMs = delta * 1000;
        for (const tile of fadingOutTiles) {
            tile.updateFadeOut(deltaMs);
            if (!tile.isFadingOut) {
                markCacheKeyInactive(getTileCacheKey(tile.key, tile.zoom));
                fadingOutTiles.delete(tile);
                tile.dispose();
            } else {
                stillFading = true;
            }
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

import { terrainUniforms } from './terrain/Tile';

export function updateVisibleTiles(_camLat: number = state.TARGET_LAT, _camLon: number = state.TARGET_LON, _camAltitude: number = 5000, worldX: number | null = null, worldZ: number | null = null): Promise<void> {
    const is2DGlobal = state.IS_2D_MODE || state.PERFORMANCE_PRESET === 'eco' || state.ZOOM <= 10;
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;
    const MIN_SLOPE_LOD = 11;
    terrainUniforms.uShowSlopes.value = (state.SHOW_SLOPES && !is2DGlobal && state.ZOOM >= MIN_SLOPE_LOD) ? 1.0 : 0.0;
    terrainUniforms.uShowHydrology.value = state.SHOW_HYDROLOGY ? 1.0 : 0.0;

    if (!state.camera || Math.abs(state.camera.position.y) < 1) return Promise.resolve();

    const wx = (worldX !== null) ? worldX : state.camera.position.x;
    const wz = (worldZ !== null) ? worldZ : state.camera.position.z;

    const currentGPS = worldToLngLat(wx, wz, state.originTile);
    const zoom = state.ZOOM; const maxTile = Math.pow(2, zoom);
    const centerTile = lngLatToTile(currentGPS.lon, currentGPS.lat, zoom);
    const camGPS = worldToLngLat(state.camera.position.x, state.camera.position.z, state.originTile);
    const camTile = lngLatToTile(camGPS.lon, camGPS.lat, zoom);
    const currentActiveKeys = new Set<string>();
    
    const camKey = `${camTile.x}_${camTile.y}_${zoom}`;
    if (camTile.x >= 0 && camTile.x < maxTile && camTile.y >= 0 && camTile.y < maxTile) {
        currentActiveKeys.add(camKey);
        if (!activeTiles.has(camKey)) { const t = new Tile(camTile.x, camTile.y, zoom, camKey); activeTiles.set(camKey, t); insertTile(t); loadQueue.add(t); }
    }

    const mobile = isMobileDevice();
    let range = (zoom <= 10) ? Math.max(state.RANGE, 3)
        : (zoom >= 17 || (zoom >= 15 && mobile)) ? Math.max(4, Math.floor(state.RANGE/1.2))
        : state.RANGE;

    if (!state.IS_2D_MODE && state.ZOOM >= 14 && state.controls) {
        const polar = state.controls.getPolarAngle();
        if (polar > 0.4) {
            range = Math.min(range + 1, state.RANGE + 2);
        }
    }

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx; const ty = centerTile.y + dy;
            if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) continue;
            const key = `${tx}_${ty}_${zoom}`; currentActiveKeys.add(key);
            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, zoom, key);
                if (tile.isVisible() || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)) { activeTiles.set(key, tile); insertTile(tile); loadQueue.add(tile); }
            }
        }
    }
    const lodChanging = lastRenderedZoom !== -1 && zoom !== lastRenderedZoom;
    for (const [key, tile] of activeTiles.entries()) {
        if (!currentActiveKeys.has(key)) {
            if (lodChanging && tile.mesh && tile.status !== 'disposed') {
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
    lastRenderedZoom = zoom;
    processLoadQueue();

    if (loadQueue.size === 0) {
        const nextZoom = zoom + 1;
        if (nextZoom <= 18) {
            const ct = lngLatToTile(currentGPS.lon, currentGPS.lat, nextZoom);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const tx = ct.x + dx; const ty = ct.y + dy;
                    if (tx < 0 || tx >= Math.pow(2, nextZoom) || ty < 0 || ty >= Math.pow(2, nextZoom)) continue;
                    const pKey = `${tx}_${ty}_${nextZoom}`;
                    if (!hasInCache(getTileCacheKey(pKey, nextZoom))) loadQueue.add(new Tile(tx, ty, nextZoom, pKey));
                }
            }
        }
        if (loadQueue.size > 0) processLoadQueue();
    }
    return Promise.resolve();
}

export function updateHydrologyVisibility(visible: boolean): void { state.SHOW_HYDROLOGY = visible; resetTerrain(); updateVisibleTiles(); }
export function updateSlopeVisibility(visible: boolean): void { state.SHOW_SLOPES = visible; resetTerrain(); updateVisibleTiles(); }
export async function loadTerrain(): Promise<void> { await updateVisibleTiles(); }

export function prefetchAdjacentLODs(): void {
    if (!state.camera || !state.controls) return;
    const wx = state.controls.target.x;
    const wz = state.controls.target.z;
    const center = worldToLngLat(wx, wz, state.originTile);
    const zoom = state.ZOOM;
    const MAX_PREFETCH = 20;
    let added = 0;

    const _prefetchMaxZoom = state.isPro ? (state.MAX_ALLOWED_ZOOM || 18) : Math.min(state.MAX_ALLOWED_ZOOM || 18, 14);
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
    for (let i = 0; i < rawPts.length; i++) {
        const p = rawPts[i];
        const pos = lngLatToWorld(p.lon, p.lat, originTile);
        const elevGPX = (p.ele || 0) * state.RELIEF_EXAGGERATION;
        const terrainY = getAltitudeAt(pos.x, pos.z);
        const y = Math.max(terrainY, elevGPX) + GPX_SURFACE_OFFSET;
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
                const iTerrainY = getAltitudeAt(iPos.x, iPos.z);
                const iY = Math.max(iTerrainY, iElevGPX) + GPX_SURFACE_OFFSET;
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
    let distance = 0; let dPlus = 0; let dMinus = 0;
    
    // Lissage altitude pour éviter gonflement D+ par bruit GPS (coherent avec TrackSheet.updateStats)
    // Moyenne mobile sur 3 points (fenêtre glissante)
    const smoothedAlts: number[] = validPoints.map((p: any, i: number) => {
        const alt = p.ele !== undefined ? p.ele : (p.alt !== undefined ? p.alt : 0);
        if (i === 0 || i === validPoints.length - 1) return alt;
        const prevAlt = validPoints[i - 1].ele !== undefined ? validPoints[i - 1].ele : (validPoints[i - 1].alt !== undefined ? validPoints[i - 1].alt : 0);
        const nextAlt = validPoints[i + 1].ele !== undefined ? validPoints[i + 1].ele : (validPoints[i + 1].alt !== undefined ? validPoints[i + 1].alt : 0);
        return (prevAlt + alt + nextAlt) / 3;
    });
    
    for (let i = 1; i < validPoints.length; i++) {
        const p1 = validPoints[i - 1]; const p2 = validPoints[i];
        const segmentDist = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
        distance += segmentDist;
        // Utiliser altitude lissée pour D+/D- (coherent avec TrackSheet)
        // Seuil de 1m pour filtrer le bruit GPS tout en capturant les vraies montées
        const diff = smoothedAlts[i] - smoothedAlts[i - 1];
        if (diff > 1) dPlus += diff;        // Monte de plus de 1m = comptabilisé
        else if (diff < -1) dMinus += Math.abs(diff);  // Descend de plus de 1m = comptabilisé
        // Ignore les variations entre -1m et +1m (bruit GPS)
    }
    const box = new THREE.Box3();
    const camAlt = state.camera ? state.camera.position.y : 10000;
    const thickness = Math.max(1.5, camAlt / 1200);
    const threePoints = gpxDrapePoints(validPoints, state.originTile);
    threePoints.forEach(v => box.expandByPoint(v));
    const curve = new THREE.CatmullRomCurve3(threePoints);
    const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 1500), thickness, 4, false);
    const material = new THREE.MeshStandardMaterial({
        color: color, emissive: color, emissiveIntensity: 0.3, transparent: true, opacity: 0.95, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;
    mesh.userData = { type: 'gpx-track', layerId: id };
    if (state.scene) state.scene.add(mesh);
    const layer: GPXLayer = { id, name, color, visible: true, rawData, points: threePoints, mesh, stats: { distance, dPlus, dMinus, pointCount: validPoints.length } };
    state.gpxLayers = [...state.gpxLayers, layer];
    if (!state.activeGPXLayerId) state.activeGPXLayerId = id;
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

export function updateAllGPXMeshes(): void {
    if (!state.camera) return;
    const camAlt = state.camera.position.y;
    const thickness = Math.max(1.5, camAlt / 1200);
    const updatedLayers: GPXLayer[] = state.gpxLayers.map(layer => {
        if (layer.mesh) { if (state.scene) state.scene.remove(layer.mesh); disposeObject(layer.mesh); }
        const track = layer.rawData.tracks[0]; const points = track.points; const threePoints = gpxDrapePoints(points, state.originTile);
        const curve = new THREE.CatmullRomCurve3(threePoints);
        const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length, 1500), thickness, 4, false);
        const material = new THREE.MeshStandardMaterial({
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
    if (state.recordedPoints.length < 2 || !state.camera || !state.scene || !state.originTile) return;
    const camAlt = state.camera.position.y; const thickness = Math.max(2.0, camAlt / 800); 
    if (state.recordedMesh) { state.scene.remove(state.recordedMesh); disposeObject(state.recordedMesh); }
    const originTile = state.recordingOriginTile || state.originTile;
    const threePoints = state.recordedPoints
        .filter(p => {
            if (typeof p.lat !== 'number' || typeof p.lon !== 'number' || typeof p.alt !== 'number') return false;
            if (isNaN(p.lat) || isNaN(p.lon) || isNaN(p.alt)) return false;
            if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return false;
            if (p.alt < -500 || p.alt > 9000) return false;
            return true;
        })
        .map(p => {
            const pos = lngLatToWorld(p.lon, p.lat, originTile);
            const terrainY = getAltitudeAt(pos.x, pos.z);
            const gpsY = p.alt * state.RELIEF_EXAGGERATION + 8;
            const finalY = terrainY === 0 ? gpsY : Math.max(terrainY, gpsY);
            return new THREE.Vector3(pos.x, finalY, pos.z);
        });
    if (threePoints.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(threePoints);
    const geometry = new THREE.TubeGeometry(curve, Math.min(threePoints.length * 2, 800), thickness, 4, false);
    const material = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 });
    state.recordedMesh = new THREE.Mesh(geometry, material);
    state.scene.add(state.recordedMesh);
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
