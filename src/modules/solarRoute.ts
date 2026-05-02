import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state, isProActive } from './state';
import { isAtShadow, drapeToTerrain, getAltitudeAt, GPX_SURFACE_OFFSET } from './analysis';
import { worldToLngLat, haversineDistance } from './geo';
import { isLatLonInForest } from './landcover';
import { getSunDirection } from './sun';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SolarRouteMode = 'snapshot' | 'hikerTimeline';

export interface RouteSolarPoint {
    worldPos: THREE.Vector3;
    distKm: number;
    evalDate: Date;      // simDate (snapshot) ou arrivalDate (hikerTimeline)
    inShadow: boolean;
    isNight: boolean;
    inForest: boolean;
}

export interface RouteSolarAnalysis {
    mode: SolarRouteMode;
    points: RouteSolarPoint[];
    sunExposedKm: number;
    shadowKm: number;
    forestKm: number;
    sunPct: number;       // 0–100 (soleil direct uniquement, forêt exclue)
    totalKm: number;
    shadowSegments: { startKm: number; endKm: number; lengthKm: number }[];
    optimalDepartureMinutes?: number;
    optimalSunPct?: number;
    goldenHourSummit?: { startMinutes: number; endMinutes: number; altitudeM: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_POINTS = 200;
const TEXTURE_WIDTH = 256;
const DEFAULT_SPEED_KMH = 4;

// ─── Module state ─────────────────────────────────────────────────────────────

let _currentAnalysis: RouteSolarAnalysis | null = null;
let _optimalData: Pick<RouteSolarAnalysis, 'optimalDepartureMinutes' | 'optimalSunPct' | 'goldenHourSummit'> | null = null;
let _avgSpeedKmh = DEFAULT_SPEED_KMH;
let _currentMode: SolarRouteMode = 'hikerTimeline';

let _overlayMesh: THREE.Mesh | null = null;
let _overlayMaterial: THREE.MeshBasicMaterial | null = null;
let _overlayTexture: THREE.DataTexture | null = null;

let _analysisTimer: ReturnType<typeof setTimeout> | null = null;
let _abortController: AbortController | null = null;

let _cacheKey = '';
let _cachedAnalysis: RouteSolarAnalysis | null = null;

// ─── Public getters ───────────────────────────────────────────────────────────

export function getCurrentRouteSolarAnalysis(): RouteSolarAnalysis | null { return _currentAnalysis; }
export function getOptimalDepartureData() { return _optimalData; }
export function getSolarRouteMode(): SolarRouteMode { return _currentMode; }
export function getAvgSpeedKmh(): number { return _avgSpeedKmh; }

export function setAvgSpeedKmh(speed: number): void {
    _avgSpeedKmh = speed;
    invalidateRouteCache();
    scheduleRouteSolarAnalysis(200);
}

export function setSolarRouteMode(mode: SolarRouteMode): void {
    if (_currentMode === mode) return;
    _currentMode = mode;
    invalidateRouteCache();
    scheduleRouteSolarAnalysis(200);
}

// ─── Source resolution ────────────────────────────────────────────────────────

function getActivePoints(): THREE.Vector3[] | null {
    // Priorité 1 : layer GPX actif — contient la vraie géométrie OSRM/ORS (centaines de points)
    // plutôt que les waypoints bruts (seulement 2-5 points à vol d'oiseau).
    if (state.activeGPXLayerId) {
        const layer = state.gpxLayers.find(l => l.id === state.activeGPXLayerId);
        if (layer?.points && layer.points.length >= 2) return layer.points;
    }
    // Priorité 2 : waypoints bruts si aucun layer calculé (route en cours de calcul)
    if (state.routeWaypoints.length >= 2 && state.originTile) {
        const draped = drapeToTerrain(
            state.routeWaypoints.map(w => ({ lat: w.lat, lon: w.lon, ele: w.alt ?? 0 })),
            state.originTile,
            4,
            GPX_SURFACE_OFFSET
        );
        if (draped.length >= 2) return draped;
    }
    return null;
}

function getActiveSourceMesh(): THREE.Mesh | null {
    if (state.activeGPXLayerId) {
        const layer = state.gpxLayers.find(l => l.id === state.activeGPXLayerId);
        return layer?.mesh ?? null;
    }
    return null;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export function buildRouteHash(points: THREE.Vector3[]): string {
    if (points.length < 2) return '';
    const f = points[0]; const l = points[points.length - 1];
    return `${f.x.toFixed(0)},${f.z.toFixed(0)},${l.x.toFixed(0)},${l.z.toFixed(0)},${points.length}`;
}

export function makeCacheKey(routeHash: string, simDate: Date, mode: SolarRouteMode, avgSpeed: number): string {
    const dateStr = simDate.toISOString().slice(0, 10);
    const slot30 = Math.floor((simDate.getHours() * 60 + simDate.getMinutes()) / 30);
    return `${routeHash}|${dateStr}|${slot30}|${mode}|${Math.round(avgSpeed * 10)}`;
}

export function invalidateRouteCache(): void {
    _cacheKey = '';
    _cachedAnalysis = null;
    _optimalData = null;
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

export function sampleRoutePoints(points: THREE.Vector3[]): THREE.Vector3[] {
    if (points.length === 0) return [];
    // Distance totale en mètres (coordonnées monde)
    let totalM = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dz = points[i].z - points[i - 1].z;
        totalM += Math.sqrt(dx * dx + dz * dz);
    }
    const stepM = Math.max(100, totalM / MAX_POINTS);

    const result: THREE.Vector3[] = [points[0]];
    let accum = 0;
    let last = points[0];

    for (let i = 1; i < points.length; i++) {
        const pt = points[i];
        const dx = pt.x - last.x;
        const dz = pt.z - last.z;
        accum += Math.sqrt(dx * dx + dz * dz);
        if (accum >= stepM) {
            result.push(pt);
            last = pt;
            accum = 0;
        }
    }
    const lastPt = points[points.length - 1];
    if (result[result.length - 1] !== lastPt) result.push(lastPt);
    return result;
}

// ─── Core analysis ────────────────────────────────────────────────────────────

async function analyzeRouteSolar(
    points: THREE.Vector3[],
    mode: SolarRouteMode,
    avgSpeedKmh: number,
    signal: AbortSignal,
): Promise<RouteSolarAnalysis> {
    const samples = sampleRoutePoints(points);
    if (samples.length === 0) {
        return buildAnalysis([], mode);
    }
    const results: RouteSolarPoint[] = [];
    let cumulativeDistKm = 0;

    const midPt = samples[Math.floor(samples.length / 2)];
    const originTile = state.originTile;
    if (!originTile) return buildAnalysis([], mode);
    const midGps = worldToLngLat(midPt.x, midPt.z, originTile);

    const snapshotSunVec = mode === 'snapshot'
        ? getSunDirection(state.simDate, midGps.lat, midGps.lon)
        : null;

    const CHUNK = 10;
    for (let i = 0; i < samples.length; i += CHUNK) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const chunk = samples.slice(i, Math.min(i + CHUNK, samples.length));
        for (const pt of chunk) {
            const prevResult = results[results.length - 1];
            // Convertir en GPS une fois — utilisé pour la distance haversine ET le soleil local
            const ptGps = worldToLngLat(pt.x, pt.z, originTile);

            if (prevResult) {
                // Haversine au lieu de coordonnées Mercator (évite la déformation 1/cos(lat) ≈ 1.47 à 47°N)
                const prevGps = worldToLngLat(prevResult.worldPos.x, prevResult.worldPos.z, originTile);
                cumulativeDistKm += haversineDistance(prevGps.lat, prevGps.lon, ptGps.lat, ptGps.lon);
            }

            let evalDate: Date;
            let sunVec: THREE.Vector3;

            if (mode === 'hikerTimeline') {
                const delayHours = cumulativeDistKm / avgSpeedKmh;
                evalDate = new Date(state.simDate.getTime() + delayHours * 3_600_000);
                sunVec = getSunDirection(evalDate, ptGps.lat, ptGps.lon);
            } else {
                evalDate = state.simDate;
                sunVec = snapshotSunVec!;
            }

            // Position solaire au GPS local du point (plus précis que midGps pour les longs tracés)
            const sunPos = SunCalc.getPosition(evalDate, ptGps.lat, ptGps.lon);
            const isNight = sunPos.altitude <= 0;
            const terrainY = getAltitudeAt(pt.x, pt.z);
            const altForShadow = terrainY > 0 ? terrainY + GPX_SURFACE_OFFSET : pt.y;
            const inShadow = !isNight && isAtShadow(pt.x, pt.z, altForShadow, sunVec);
            const inForest = !isNight && !inShadow && isLatLonInForest(ptGps.lat, ptGps.lon);

            results.push({ worldPos: pt, distKm: cumulativeDistKm, evalDate, inShadow, isNight, inForest });
        }

        await new Promise<void>(res => setTimeout(res, 0));
    }

    return buildAnalysis(results, mode);
}

export function buildAnalysis(points: RouteSolarPoint[], mode: SolarRouteMode): RouteSolarAnalysis {
    const totalKm = points.at(-1)?.distKm ?? 0;
    let sunExposedKm = 0;
    let shadowKm = 0;
    let forestKm = 0;
    const shadowSegments: { startKm: number; endKm: number; lengthKm: number }[] = [];
    let segStart: number | null = null;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        const segLen = cur.distKm - prev.distKm;

        if (!cur.isNight) {
            if (cur.inShadow)      { shadowKm += segLen; }
            else if (cur.inForest) { forestKm += segLen; }
            else                   { sunExposedKm += segLen; }
        }

        // Détecter les segments ombragés continus (par indice, jamais par position géo)
        const curShaded = !cur.isNight && cur.inShadow;
        if (curShaded && segStart === null) segStart = prev.distKm;
        if (!curShaded && segStart !== null) {
            shadowSegments.push({ startKm: segStart, endKm: prev.distKm, lengthKm: prev.distKm - segStart });
            segStart = null;
        }
    }
    if (segStart !== null) {
        shadowSegments.push({ startKm: segStart, endKm: totalKm, lengthKm: totalKm - segStart });
    }

    // sunPct sur le total du parcours (km nuit inclus) — évite le 100% trompeur
    // quand tout le trajet est de nuit sauf 1 km final au soleil.
    const sunPct = totalKm > 0 ? Math.round((sunExposedKm / totalKm) * 100) : 0;

    return { mode, points, sunExposedKm, shadowKm, forestKm, sunPct, totalKm, shadowSegments };
}

// ─── PRO : départ optimal (deux passes) ──────────────────────────────────────

async function analyzeOptimalDeparture(
    points: THREE.Vector3[],
    signal: AbortSignal,
): Promise<void> {
    const samples = sampleRoutePoints(points);
    if (samples.length === 0) return;
    const midPt = samples[Math.floor(samples.length / 2)];
    const originTile = state.originTile;
    if (!originTile) return;
    const midGps = worldToLngLat(midPt.x, midPt.z, originTile);
    const summitPt = samples.reduce((a, b) => b.y > a.y ? b : a, samples[0]);

    let totalDistKm = 0;
    for (let i = 1; i < samples.length; i++) {
        const dx = samples[i].x - samples[i - 1].x;
        const dz = samples[i].z - samples[i - 1].z;
        totalDistKm += Math.sqrt(dx * dx + dz * dz) / 1000;
    }
    const totalDurationMs = (totalDistKm / Math.max(0.1, _avgSpeedKmh)) * 3600 * 1000;

    // Passe 1 : grossière — 48 slots × 1 point sur 10
    const coarseSamples = samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 20)) === 0);
    const slotScores: { minutes: number; pct: number }[] = [];

    for (let slot = 0; slot < 48; slot++) {
        if (signal.aborted) return;
        const minutes = slot * 30;
        const testDate = new Date(state.simDate);
        testDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
        const sunPos = SunCalc.getPosition(testDate, midGps.lat, midGps.lon);
        if (sunPos.altitude <= 0) { slotScores.push({ minutes, pct: 0 }); continue; }

        let sunCount = 0;
        for (let ci = 0; ci < coarseSamples.length; ci++) {
            const pt = coarseSamples[ci];
            const ptDate = new Date(testDate.getTime() + (ci / coarseSamples.length) * totalDurationMs);
            const pSunVec = getSunDirection(ptDate, midGps.lat, midGps.lon);
            const terrainY = getAltitudeAt(pt.x, pt.z);
            const altForShadow = terrainY > 0 ? terrainY + GPX_SURFACE_OFFSET : pt.y;
            if (!isAtShadow(pt.x, pt.z, altForShadow, pSunVec)) sunCount++;
        }
        slotScores.push({ minutes, pct: Math.round((sunCount / coarseSamples.length) * 100) });
        await new Promise<void>(res => setTimeout(res, 0));
    }

    // Passe 2 : affiner sur les 3 meilleurs créneaux
    const top3 = [...slotScores].sort((a, b) => b.pct - a.pct).slice(0, 3);
    let bestMinutes = top3[0]?.minutes ?? 480;
    let bestPct = 0;

    for (const { minutes } of top3) {
        if (signal.aborted) return;
        const testDate = new Date(state.simDate);
        testDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
        let sunCount = 0;
        for (let si = 0; si < samples.length; si++) {
            const pt = samples[si];
            const arrivalDate = new Date(testDate.getTime() + (si / samples.length) * totalDurationMs);
            const pSunVec = getSunDirection(arrivalDate, midGps.lat, midGps.lon);
            const pSunPos = SunCalc.getPosition(arrivalDate, midGps.lat, midGps.lon);
            const terrainY = getAltitudeAt(pt.x, pt.z);
            const altForShadow = terrainY > 0 ? terrainY + GPX_SURFACE_OFFSET : pt.y;
            if (pSunPos.altitude > 0 && !isAtShadow(pt.x, pt.z, altForShadow, pSunVec)) sunCount++;
        }
        const pct = Math.round((sunCount / samples.length) * 100);
        if (pct > bestPct) { bestPct = pct; bestMinutes = minutes; }
        await new Promise<void>(res => setTimeout(res, 0));
    }

    // Golden hour au sommet
    const summitGps = worldToLngLat(summitPt.x, summitPt.z, originTile);
    const times = SunCalc.getTimes(state.simDate, summitGps.lat, summitGps.lon);
    let goldenHourSummit: RouteSolarAnalysis['goldenHourSummit'];

    if (times.goldenHour && times.sunset && !isNaN(times.goldenHour.getTime())) {
        const start = times.goldenHour;
        const end = times.sunset;
        goldenHourSummit = {
            startMinutes: start.getHours() * 60 + start.getMinutes(),
            endMinutes: end.getHours() * 60 + end.getMinutes(),
            altitudeM: Math.round(summitPt.y / (state.RELIEF_EXAGGERATION || 1)),
        };
    }

    _optimalData = { optimalDepartureMinutes: bestMinutes, optimalSunPct: bestPct, goldenHourSummit };

    // Notifier SolarProbeSheet de se mettre à jour
    if (_currentAnalysis) {
        _currentAnalysis = { ..._currentAnalysis, ..._optimalData };
        notifySolarRouteUpdate();
    }
}

// ─── Overlay 3D ───────────────────────────────────────────────────────────────

// Couleurs RGBA (uint8)
const _COL_SUN    = [245, 166, 35, 220] as const;
const _COL_SHADE  = [71, 85, 120, 200] as const;
const _COL_NIGHT  = [10, 15, 30, 153] as const;  // bleu très sombre, 60% opacité
const _COL_FOREST = [30, 100, 50, 200] as const;  // vert sombre, canopée

function findClosestPoint(points: RouteSolarPoint[], targetKm: number): RouteSolarPoint {
    let best = points[0];
    let bestDiff = Math.abs(best.distKm - targetKm);
    for (const p of points) {
        const diff = Math.abs(p.distKm - targetKm);
        if (diff < bestDiff) { best = p; bestDiff = diff; }
    }
    return best;
}

function fillTextureData(data: Uint8Array, analysis: RouteSolarAnalysis): void {
    const totalKm = analysis.totalKm || 1;
    for (let i = 0; i < TEXTURE_WIDTH; i++) {
        const progressKm = (i / TEXTURE_WIDTH) * totalKm;
        const pt = findClosestPoint(analysis.points, progressKm);
        const col = pt.isNight  ? _COL_NIGHT
                  : pt.inShadow ? _COL_SHADE
                  : pt.inForest ? _COL_FOREST
                  : _COL_SUN;
        data[i * 4]     = col[0];
        data[i * 4 + 1] = col[1];
        data[i * 4 + 2] = col[2];
        data[i * 4 + 3] = col[3];
    }
}

export function buildSolarOverlay(sourceMesh: THREE.Mesh, analysis: RouteSolarAnalysis): void {
    disposeSolarOverlay();

    const data = new Uint8Array(TEXTURE_WIDTH * 4);
    fillTextureData(data, analysis);

    _overlayTexture = new THREE.DataTexture(data, TEXTURE_WIDTH, 1, THREE.RGBAFormat);
    _overlayTexture.magFilter = THREE.LinearFilter;
    _overlayTexture.minFilter = THREE.LinearFilter;
    _overlayTexture.generateMipmaps = false;
    _overlayTexture.needsUpdate = true;

    _overlayMaterial = new THREE.MeshBasicMaterial({
        map: _overlayTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
    });

    // Partage de la géométrie (non clonée) — ne PAS disposer dans disposeSolarOverlay
    _overlayMesh = new THREE.Mesh(sourceMesh.geometry, _overlayMaterial);
    _overlayMesh.renderOrder = 11;
    _overlayMesh.visible = sourceMesh.visible;
    _overlayMesh.userData = { type: 'solar-route-overlay' };
    _overlayMesh.position.copy(sourceMesh.position);
    _overlayMesh.rotation.copy(sourceMesh.rotation);
    _overlayMesh.scale.copy(sourceMesh.scale);

    if (state.scene) state.scene.add(_overlayMesh);
}

export function updateSolarOverlay(analysis: RouteSolarAnalysis): void {
    if (!_overlayTexture) return;
    fillTextureData(_overlayTexture.image.data as unknown as Uint8Array, analysis);
    _overlayTexture.needsUpdate = true;
}

/** Appelé AVANT geometry.dispose() dans gpxLayers.ts */
export function disposeSolarOverlay(): void {
    if (_overlayMesh) {
        if (state.scene) state.scene.remove(_overlayMesh);
        // Ne pas disposer la géométrie — elle appartient au mesh source
        _overlayMaterial?.dispose();
        _overlayTexture?.dispose();
        _overlayMesh = null;
        _overlayMaterial = null;
        _overlayTexture = null;
    }
}

export function setOverlayVisible(visible: boolean): void {
    if (_overlayMesh) _overlayMesh.visible = visible;
}

export function updateOverlayTransform(sourceMesh: THREE.Mesh): void {
    if (!_overlayMesh) return;
    _overlayMesh.geometry = sourceMesh.geometry;
    _overlayMesh.position.copy(sourceMesh.position);
    _overlayMesh.rotation.copy(sourceMesh.rotation);
    _overlayMesh.scale.copy(sourceMesh.scale);
    _overlayMesh.visible = sourceMesh.visible;
}

// ─── Notification vers l'UI ───────────────────────────────────────────────────

function notifySolarRouteUpdate(): void {
    // Importer dynamiquement pour éviter les dépendances circulaires
    void import('./profile').then(({ setSolarBandData }) => {
        if (_currentAnalysis) setSolarBandData(_currentAnalysis);
        else setSolarBandData(null);
    });
    // Déclencher un re-render de SolarProbeSheet si ouvert
    window.dispatchEvent(new CustomEvent('solarRouteUpdated'));
}

// ─── Planificateur principal ──────────────────────────────────────────────────

export function scheduleRouteSolarAnalysis(delay = 1200): void {
    if (_analysisTimer) clearTimeout(_analysisTimer);
    _analysisTimer = setTimeout(() => {
        _analysisTimer = null;
        void runRouteSolarAnalysis();
    }, delay);
}

async function runRouteSolarAnalysis(): Promise<void> {
    const points = getActivePoints();
    if (!points || points.length < 2 || !state.originTile) return;

    const routeHash = buildRouteHash(points);
    const cacheKey = makeCacheKey(routeHash, state.simDate, _currentMode, _avgSpeedKmh);

    // Cache hit : juste mettre à jour la texture, pas de raymarching
    if (cacheKey === _cacheKey && _cachedAnalysis) {
        _currentAnalysis = _cachedAnalysis;
        updateSolarOverlay(_cachedAnalysis);
        notifySolarRouteUpdate();
        return;
    }

    // Annuler l'analyse précédente
    _abortController?.abort();
    _abortController = new AbortController();
    const { signal } = _abortController;

    try {
        const analysis = await analyzeRouteSolar(points, _currentMode, _avgSpeedKmh, signal);
        if (signal.aborted) return;

        _cacheKey = cacheKey;
        _cachedAnalysis = analysis;
        _currentAnalysis = analysis;

        // Overlay 3D
        const sourceMesh = getActiveSourceMesh();
        if (sourceMesh) {
            buildSolarOverlay(sourceMesh, analysis);
        }

        notifySolarRouteUpdate();

        // PRO : lancer l'analyse du départ optimal en arrière-plan
        if (isProActive() && _currentMode === 'hikerTimeline') {
            void analyzeOptimalDeparture(points, signal);
        }
    } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.warn('[SolarRoute] Analysis failed', e);
    }
}

// ─── Nettoyage global ────────────────────────────────────────────────────────

export function clearSolarRouteAnalysis(): void {
    _abortController?.abort();
    disposeSolarOverlay();
    _currentAnalysis = null;
    _optimalData = null;
    invalidateRouteCache();
    notifySolarRouteUpdate();
}
