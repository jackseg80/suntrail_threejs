import * as THREE from 'three';
import { disposeObject } from './memory';
import { state, type GPXLayer, GPX_COLORS, isProActive } from './state';
import { simplifyRDP } from './utils';
import type { GPXRawData } from './gpxTypes';
import { getElevation, isValidGeoPoint } from './gpxTypes';
import { updateElevationProfile, closeElevationProfile } from './profile';
import { lngLatToWorld, EARTH_CIRCUMFERENCE, worldToLngLat } from './geo';
import { eventBus } from './eventBus';
import { drapeToTerrain, getAltitudeAt, GPX_SURFACE_OFFSET } from './analysis';
import { calculateTrackStats } from './geoStats';
import {
    disposeSolarOverlay,
    buildSolarOverlay,
    setOverlayVisible,
    getCurrentRouteSolarAnalysis,
    scheduleRouteSolarAnalysis,
    invalidateRouteCache,
    clearSolarRouteAnalysis,
} from './solarRoute';
import { saveToHistory, updateHistoryEntryLocation } from './gpxHistoryService';
import { getPlaceName } from './geocodingService';

// v5.31.1 : Shared GPX track materials (1 per color × mode = 16 max instead of N per layer)
const gpxMaterials3D = new Map<string, THREE.MeshStandardMaterial>();
const gpxMaterials2D = new Map<string, THREE.MeshBasicMaterial>();

// v5.53.3 : Shared outline material for track visibility
const gpxOutlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
});

let _recMaterial3D: THREE.MeshStandardMaterial | null = null;
let _recMaterial2D: THREE.MeshBasicMaterial | null = null;

function getRecordedMaterial(is2D: boolean): THREE.Material {
    if (is2D) {
        if (!_recMaterial2D) {
            _recMaterial2D = new THREE.MeshBasicMaterial({
                color: 0xef4444,
                transparent: true,
                opacity: 0.8,
            });
        }
        return _recMaterial2D;
    }
    if (!_recMaterial3D) {
        _recMaterial3D = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xef4444,
            emissiveIntensity: 1.2, // v5.53.3 : Increased from 0.8
            transparent: true,
            opacity: 0.9,
        });
    }
    return _recMaterial3D;
}

function getGPXMaterial(color: string, is2D: boolean): THREE.Material {
    if (is2D) {
        let mat = gpxMaterials2D.get(color);
        if (!mat) {
            mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
            });
            gpxMaterials2D.set(color, mat);
        }
        return mat;
    }
    let mat = gpxMaterials3D.get(color);
    if (!mat) {
        mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 1.0, // v5.53.3 : Increased from 0.6
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
        });
        gpxMaterials3D.set(color, mat);
    }
    return mat;
}

// v5.52.7 : GPX_SURFACE_OFFSET importé de analysis.ts (source unique)

function computeTrackThickness(base: number, max: number): number {
    const zoom = state.ZOOM || 10;
    const exponent = Math.max(0, 18 - zoom);
    return Math.max(base, Math.min(max, base * Math.pow(2, exponent)));
}

/** v5.53.3 : Ajoute un contour noir translucide derrière le tracé pour améliorer le contraste */
function applyTrackOutline(
    mesh: THREE.Mesh,
    curve: THREE.Curve<THREE.Vector3>,
    segments: number,
    thickness: number
): void {
    const outlineThickness = thickness * 1.4;
    const outlineGeometry = new THREE.TubeGeometry(
        curve,
        segments,
        outlineThickness,
        4,
        false
    );
    const outlineMesh = new THREE.Mesh(outlineGeometry, gpxOutlineMaterial);
    outlineMesh.renderOrder = 9; // Derrière le tracé principal (10)
    outlineMesh.userData = { type: 'gpx-track-outline' };
    mesh.add(outlineMesh);
}

/** Recalcule les stats (distance, D+/D-, temps) d'un layer depuis l'altitude réelle du terrain.
 *  Source unique de vérité — utilisée par _computeDrapedResult, _doUpdateAllGPXMeshes, etc.
 *  ⚠️ Skip uniquement pour GPX importé avec élévation réelle.
 *  Interpole les trous d'altitude (tuiles non chargées) pour éviter les faux D+/D-. */
export function recalcLayerStatsFromTerrain(layer: GPXLayer): GPXLayer {
    if (!state.originTile || !layer.points || layer.points.length < 2)
        return layer;

    const rawPoints = layer.rawData?.tracks?.[0]?.points || [];
    const hasRawElevation =
        rawPoints.length > 0 &&
        rawPoints.some((p: any) => (p.ele || p.alt || 0) > 0);

    if (hasRawElevation && layer.stats.dPlus > 0) return layer;

    const relief = state.RELIEF_EXAGGERATION || 1;
    const n = layer.points.length;
    const alts: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        alts[i] = getAltitudeAt(layer.points[i].x, layer.points[i].z) / relief;
    }

    const interpAlts = [...alts];
    for (let i = 0; i < n; i++) {
        if (interpAlts[i] !== 0) continue;

        let prevIdx = i - 1;
        while (prevIdx >= 0 && alts[prevIdx] === 0) prevIdx--;

        let nextIdx = i + 1;
        while (nextIdx < n && alts[nextIdx] === 0) nextIdx++;

        if (prevIdx >= 0 && nextIdx < n) {
            const t = (i - prevIdx) / (nextIdx - prevIdx);
            interpAlts[i] = alts[prevIdx] + t * (alts[nextIdx] - alts[prevIdx]);
        } else if (prevIdx >= 0) {
            interpAlts[i] = alts[prevIdx];
        } else if (nextIdx < n) {
            interpAlts[i] = alts[nextIdx];
        }
    }

    const drapedPoints = layer.points.map((v, i) => {
        const gps = worldToLngLat(v.x, v.z, state.originTile!);
        return {
            lat: gps.lat,
            lon: gps.lon,
            alt: interpAlts[i],
            timestamp: i * 1000,
        };
    });

    const drapedStats = calculateTrackStats(drapedPoints);
    const updatedStats = {
        ...layer.stats,
        distance: drapedStats.distance,
        dPlus: drapedStats.dPlus,
        dMinus: drapedStats.dMinus,
        estimatedTime: drapedStats.estimatedTime,
    };
    state.gpxLayers = state.gpxLayers.map((l) =>
        l.id === layer.id ? { ...l, stats: updatedStats } : l
    );
    return { ...layer, stats: updatedStats };
}

export function addGPXLayer(
    rawData: GPXRawData,
    name: string,
    opts?: {
        silent?: boolean;
        forceVisible?: boolean;
        isManualRoute?: boolean;
        source?: 'import' | 'rec';
        id?: string;
    }
): GPXLayer {
    const id =
        opts?.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    if (GPX_COLORS.length === 0) throw new Error('GPX_COLORS is empty');
    const colorIndex = state.gpxLayers.length % GPX_COLORS.length;
    const color = GPX_COLORS[colorIndex];
    const track = rawData.tracks[0];
    const points = track.points;

    // Vérifier que les points sont valides
    if (!points || points.length < 2) {
        throw new Error(
            `Cannot add GPX layer: not enough points (${points?.length || 0})`
        );
    }

    // Vérifier que les points ont des coordonnées valides
    const validPoints = points.filter(isValidGeoPoint);

    if (validPoints.length < 2) {
        throw new Error(
            `Cannot add GPX layer: not enough valid points (${validPoints.length})`
        );
    }

    const stats = calculateTrackStats(
        validPoints.map((p, i) => ({
            lat: p.lat,
            lon: p.lon,
            alt: getElevation(p),
            timestamp: p.time ? new Date(p.time).getTime() : i * 1000,
        }))
    );

    const thickness = computeTrackThickness(2.0, 200); // v5.53.3 : Increased from 1.5

    const baseEpsilon = EARTH_CIRCUMFERENCE / Math.pow(2, state.ZOOM + 8);
    const epsilon = Math.max(0.5, baseEpsilon);

    const box = new THREE.Box3();
    const threePoints = drapeToTerrain(
        validPoints,
        state.originTile!,
        4,
        GPX_SURFACE_OFFSET
    );
    const simplifiedPoints = simplifyRDP(threePoints, epsilon, (v) => v);
    if (simplifiedPoints.length < 2) {
        throw new Error('Not enough simplified points for GPX layer');
    }

    simplifiedPoints.forEach((v) => box.expandByPoint(v));
    const curve = new THREE.CatmullRomCurve3(simplifiedPoints);
    const geometry = new THREE.TubeGeometry(
        curve,
        Math.min(simplifiedPoints.length * 2, 1500),
        thickness,
        4,
        false
    );
    const is2D = state.IS_2D_MODE;
    const material = getGPXMaterial(color, is2D);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;
    mesh.userData = { type: 'gpx-track', layerId: id };

    // v5.53.3 : Ajout du contour pour la visibilité
    applyTrackOutline(
        mesh,
        curve,
        geometry.parameters.tubularSegments,
        thickness
    );

    // v5.54 : Logique de visibilité Free (Teasing Multi-GPX)
    // 1. Les itinéraires manuels sont TOUJOURS visibles.
    // 2. Le PREMIER import GPX est TOUJOURS visible.
    // 3. Les imports GPX suivants (Multi-GPX) sont masqués en Free.
    const isManual = !!opts?.isManualRoute;
    const importedGpxCount = state.gpxLayers.filter(
        (l) => !l.isManualRoute
    ).length;
    const isFirstImport = !isManual && importedGpxCount === 0;

    const initialVisible =
        opts?.forceVisible || isManual || isProActive() || isFirstImport;

    if (state.scene) state.scene.add(mesh);
    const layer: GPXLayer = {
        id,
        name,
        color,
        visible: initialVisible,
        isManualRoute: isManual, // v5.54 : Persistance du type
        rawData,
        points: threePoints,
        mesh,
        stats: {
            distance: stats.distance,
            dPlus: stats.dPlus,
            dMinus: stats.dMinus,
            pointCount: validPoints.length,
            estimatedTime: stats.estimatedTime,
        },
    };
    if (mesh) mesh.visible = initialVisible;
    state.gpxLayers = [...state.gpxLayers, layer];

    if (!isManual) {
        saveToHistory(layer, opts?.source || 'import');
        if (validPoints.length > 0) {
            const clat =
                validPoints.reduce((s, p) => s + p.lat, 0) / validPoints.length;
            const clon =
                validPoints.reduce((s, p) => s + p.lon, 0) / validPoints.length;
            getPlaceName(clat, clon)
                .then((loc) => {
                    if (loc) updateHistoryEntryLocation(layer.id, loc);
                })
                .catch(() => {});
        }
    }

    // v5.54 : Un calque "verrouillé" ne doit pas devenir le calque actif
    // (sinon il écrase les stats et déclenche l'analyse solaire/pente)
    if (initialVisible) {
        state.activeGPXLayerId = id;
        scheduleRouteSolarAnalysis(1500); // Analyse solaire après flyTo
    }

    const lats = validPoints.map((p) => p.lat);
    const lons = validPoints.map((p) => p.lon);
    const eles = validPoints.map((p) => getElevation(p));
    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;
    const avgEle =
        eles.reduce((s: number, v: number) => s + v, 0) / eles.length;
    const size = new THREE.Vector3();
    box.getSize(size);
    const trackSpread = Math.max(size.x, size.z);
    const viewDistance = Math.max(trackSpread * 1.5, 3000);
    const flyCenter = lngLatToWorld(centerLon, centerLat, state.originTile!);
    const targetElevation = avgEle * state.RELIEF_EXAGGERATION;

    // FlyTo uniquement si visible (sinon c'est déroutant pour les imports en masse)
    if (!opts?.silent && initialVisible) {
        eventBus.emit('flyTo', {
            worldX: flyCenter.x,
            worldZ: flyCenter.z,
            targetElevation,
            targetDistance: viewDistance,
        });
    }
    requestAnimationFrame(() => updateAllGPXMeshes());
    updateElevationProfile();
    return layer;
}

export function removeGPXLayer(id: string): void {
    const layer = state.gpxLayers.find((l) => l.id === id);
    if (!layer) return;
    if (id === state.activeGPXLayerId) clearSolarRouteAnalysis();
    if (layer.mesh) {
        if (state.scene) state.scene.remove(layer.mesh);
        disposeObject(layer.mesh);
    }
    state.gpxLayers = state.gpxLayers.filter((l) => l.id !== id);
    if (state.activeGPXLayerId === id)
        state.activeGPXLayerId =
            state.gpxLayers.length > 0 ? state.gpxLayers[0].id : null;
    if (state.gpxLayers.length === 0) {
        closeElevationProfile();
    } else updateElevationProfile();
}

/**
 * Select a loaded GPX and guarantee that it is visible. Free users keep one
 * imported GPX visible at a time; the layers and their localStorage history
 * remain intact so switching never becomes a silent deletion.
 */
export function activateGPXLayer(id: string): GPXLayer | null {
    const selected = state.gpxLayers.find((layer) => layer.id === id);
    if (!selected) return null;
    const exclusiveImported = !isProActive() && !selected.isManualRoute;

    state.gpxLayers = state.gpxLayers.map((layer) => {
        const visible =
            layer.id === id
                ? true
                : exclusiveImported && !layer.isManualRoute
                  ? false
                  : layer.visible;
        if (layer.mesh) layer.mesh.visible = visible;
        return visible === layer.visible ? layer : { ...layer, visible };
    });
    state.activeGPXLayerId = id;
    setOverlayVisible(true);
    return state.gpxLayers.find((layer) => layer.id === id) ?? null;
}

export function toggleGPXLayer(id: string): void {
    const layers = state.gpxLayers;
    const idx = layers.findIndex((l) => l.id === id);
    if (idx === -1) return;
    const layer = layers[idx];
    const newVisible = !layer.visible;
    if (layer.mesh) layer.mesh.visible = newVisible;
    if (id === state.activeGPXLayerId) setOverlayVisible(newVisible);
    const updated = [...layers];
    updated[idx] = { ...layer, visible: newVisible };
    state.gpxLayers = updated;
}

/**
 * Keep one reference trace visible without deleting any loaded layer.
 * REC is intentionally outside this operation: it is an independent safety
 * recording and must never be hidden as a side effect of library browsing.
 */
export function showOnlyGPXLayer(id: string): GPXLayer | null {
    const selected = state.gpxLayers.find((layer) => layer.id === id);
    if (!selected) return null;
    state.gpxLayers = state.gpxLayers.map((layer) => {
        const visible = layer.id === id;
        if (layer.mesh) layer.mesh.visible = visible;
        return visible === layer.visible ? layer : { ...layer, visible };
    });
    state.activeGPXLayerId = id;
    setOverlayVisible(true);
    return state.gpxLayers.find((layer) => layer.id === id) ?? null;
}

/** Hide every loaded reference/planning layer while preserving its data. */
export function hideAllGPXLayers(): void {
    state.gpxLayers = state.gpxLayers.map((layer) => {
        if (layer.mesh) layer.mesh.visible = false;
        return layer.visible ? { ...layer, visible: false } : layer;
    });
    state.activeGPXLayerId = null;
    setOverlayVisible(false);
    closeElevationProfile();
}

function getPerformanceEpsilonMultiplier(): number {
    if (state.PERFORMANCE_PRESET === 'eco') return 2.0;
    if (state.PERFORMANCE_PRESET === 'ultra') return 0.5;
    return 1.0;
}

function disposeTrackMesh(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    if (state.scene) state.scene.remove(mesh);
    mesh.children.forEach((c) => {
        if (c instanceof THREE.Mesh && c.geometry !== mesh.geometry) {
            c.geometry?.dispose();
        }
    });
    mesh.geometry?.dispose();
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
    if (!state.camera || !state.originTile) return;
    const thickness = computeTrackThickness(2.0, 200); // v5.53.3 : Increased from 1.5

    const baseEpsilon =
        EARTH_CIRCUMFERENCE / Math.pow(2, (state.ZOOM || 10) + 8);
    const epsilon = Math.max(
        0.5,
        baseEpsilon * getPerformanceEpsilonMultiplier()
    );

    const is2D = state.IS_2D_MODE;
    const updatedLayers: GPXLayer[] = [];
    for (const layer of state.gpxLayers) {
        try {
            // Disposer l'overlay AVANT geometry.dispose() (géométrie partagée)
            if (layer.id === state.activeGPXLayerId) disposeSolarOverlay();
            disposeTrackMesh(layer.mesh);

            const track = layer.rawData.tracks[0];
            const points = track.points;

            const drapedPoints = drapeToTerrain(
                points,
                state.originTile,
                4,
                GPX_SURFACE_OFFSET
            );
            const simplifiedPoints = simplifyRDP(
                drapedPoints,
                epsilon,
                (v) => v
            );
            if (simplifiedPoints.length < 2)
                throw new Error('Not enough simplified points');

            const curve = new THREE.CatmullRomCurve3(simplifiedPoints);
            const geometry = new THREE.TubeGeometry(
                curve,
                Math.min(simplifiedPoints.length * 2, 1500),
                thickness,
                4,
                false
            );
            const material = getGPXMaterial(layer.color, is2D);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 10;
            mesh.visible = layer.visible;
            mesh.userData = { type: 'gpx-track', layerId: layer.id };

            // v5.53.3 : Ajout du contour pour la visibilité
            applyTrackOutline(
                mesh,
                curve,
                geometry.parameters.tubularSegments,
                thickness
            );

            if (state.scene) state.scene.add(mesh);

            // Reconstruire l'overlay solar si ce layer est actif et qu'une analyse existe
            if (layer.id === state.activeGPXLayerId) {
                const existing = getCurrentRouteSolarAnalysis();
                if (existing) {
                    buildSolarOverlay(mesh, existing);
                } else {
                    // Déclencher une nouvelle analyse après le rebuild
                    invalidateRouteCache();
                    scheduleRouteSolarAnalysis(500);
                }
            }

            const updated = recalcLayerStatsFromTerrain({
                ...layer,
                points: drapedPoints,
                mesh,
            });
            updatedLayers.push(updated);
        } catch (e) {
            console.warn('[GPX] Failed to rebuild layer', layer.name, e);
            // Un échec ponctuel de drapage (rotation, changement de tuiles,
            // mémoire sous pression) ne doit jamais supprimer la trace et ses
            // points. Le mesh déjà disposé reste nul et pourra être retenté au
            // prochain rebuild.
            updatedLayers.push({ ...layer, mesh: null });
        }
    }
    state.gpxLayers = updatedLayers;
    if (state.gpxLayers.length > 0)
        updateElevationProfile(undefined, { noOpen: true });
}

export function updateRecordedTrackMesh(): void {
    if (recordedUpdateTimeout) clearTimeout(recordedUpdateTimeout);
    recordedUpdateTimeout = setTimeout(() => {
        _doUpdateRecordedTrackMesh();
        recordedUpdateTimeout = null;
    }, 150);
}

function _doUpdateRecordedTrackMesh(): void {
    if (state.recordedPoints.length < 2) {
        disposeTrackMesh(state.recordedMesh);
        state.recordedMesh = null;
        return;
    }

    if (!state.camera || !state.scene || !state.originTile) {
        console.warn('[GPX] Recorded mesh update skipped — missing:', {
            camera: !!state.camera,
            scene: !!state.scene,
            originTile: !!state.originTile,
        });
        return;
    }

    // v5.28.25 : Dédoublonnage strict par timestamp
    const uniquePointsMap = new Map<number, (typeof state.recordedPoints)[0]>();
    for (const p of state.recordedPoints) {
        uniquePointsMap.set(p.timestamp, p);
    }
    const uniquePoints = Array.from(uniquePointsMap.values()).sort(
        (a, b) => a.timestamp - b.timestamp
    );
    if (uniquePoints.length < 2) {
        disposeTrackMesh(state.recordedMesh);
        state.recordedMesh = null;
        return;
    }

    const thickness = computeTrackThickness(2.5, 250);
    const originTile = state.originTile;

    const threePoints = drapeToTerrain(
        uniquePoints,
        originTile,
        0,
        GPX_SURFACE_OFFSET
    );
    const baseEpsilon =
        EARTH_CIRCUMFERENCE / Math.pow(2, (state.ZOOM || 10) + 9);
    const epsilon = Math.max(
        0.2,
        baseEpsilon * getPerformanceEpsilonMultiplier()
    );
    const simplifiedPoints = simplifyRDP(threePoints, epsilon, (v) => v);

    if (simplifiedPoints.length < 2) return;

    // Build new mesh BEFORE disposing old one (safety)
    let newMesh: THREE.Mesh | null;
    try {
        const curve = new THREE.CatmullRomCurve3(
            simplifiedPoints,
            false,
            'centripetal'
        );
        const geometry = new THREE.TubeGeometry(
            curve,
            Math.min(simplifiedPoints.length * 3, 1500),
            thickness,
            4,
            false
        );
        const material = getRecordedMaterial(state.IS_2D_MODE);
        newMesh = new THREE.Mesh(geometry, material);
        applyTrackOutline(
            newMesh,
            curve,
            geometry.parameters.tubularSegments,
            thickness
        );
    } catch (e) {
        console.error('[GPX] Failed to create recorded track mesh:', e);
        return;
    }

    // Only dispose old mesh after new one is successfully built
    disposeTrackMesh(state.recordedMesh);
    state.recordedMesh = newMesh;
    state.scene.add(state.recordedMesh);
}

export function refreshTracks(): void {
    updateAllGPXMeshes();
    updateRecordedTrackMesh();
}
