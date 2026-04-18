import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { activeTiles } from './terrain';
import { queryTiles } from './tileSpatialIndex';
import { worldToLngLat, lngLatToWorld, decodeTerrainRGB } from './geo';

let lastUsedTile: any = null;

export function resetAnalysisCache(): void {
    lastUsedTile = null;
}

export function getAltitudeAt(worldX: number, worldZ: number, hintTile: any = null): number {
    const testPoint = new THREE.Vector3(worldX, 0, worldZ);
    let tile = hintTile;

    if (!tile) {
        // v5.30.3 : Recherche multi-niveaux ultra-robuste
        const candidates = queryTiles(worldX, worldZ);
        
        // 1. Chercher d'abord la tuile la plus précise (zoom max) ayant des données
        for (const t of candidates) {
            if (t.status === 'loaded' && t.pixelData && t.bounds && t.bounds.containsPoint(testPoint)) {
                if (!tile || t.zoom > tile.zoom) tile = t;
            }
        }
        
        // 2. Si rien trouvé dans l'index spatial, scan complet des tuiles actives (plus lent mais sûr)
        if (!tile) {
            for (const t of activeTiles.values()) {
                if (t.status === 'loaded' && t.pixelData && t.bounds && t.bounds.containsPoint(testPoint)) {
                    if (!tile || t.zoom > tile.zoom) tile = t;
                }
            }
        }
    }

    if (!tile || !tile.pixelData) return 0;

    // Calcul de l'index dans le buffer 256x256
    const b = tile.bounds;
    const localX = (worldX - b.min.x) / (b.max.x - b.min.x);
    const localZ = (worldZ - b.min.z) / (b.max.z - b.min.z);

    const px = Math.min(255, Math.max(0, Math.floor(localX * 255)));
    const pz = Math.min(255, Math.max(0, Math.floor(localZ * 255)));
    const idx = (pz * 256 + px);
    
    // Altitude brute (0..255) mappée sur l'échelle réelle (ex: 0..5000m)
    const rawH = tile.pixelData[idx];
    return rawH * tile.heightScale * state.RELIEF_EXAGGERATION;
}

export interface SolarAnalysisResult {
    // Existing
    totalSunlightMinutes: number;
    firstSunTime: Date | null;
    timeline: { isNight: boolean; inShadow: boolean }[];
    gps: { lat: number; lon: number };
    // New — sun times
    sunrise: Date | null;
    sunset: Date | null;
    solarNoon: Date | null;
    goldenHourMorningStart: Date | null;
    goldenHourMorningEnd: Date | null;
    goldenHourEveningStart: Date | null;
    goldenHourEveningEnd: Date | null;
    dayDurationMinutes: number;
    // New — real-time position (at state.simDate)
    currentAzimuthDeg: number;
    currentElevationDeg: number;
    // New — moon
    moonPhase: number;
    moonPhaseName: string;
    // New — 24h elevation curve (144 pts, one per 10 min)
    elevationCurve: number[];
    maxElevationDeg: number;
}

/**
 * Returns the moon phase name from a 0-1 phase value (SunCalc convention).
 * 0 = new moon, 0.25 = first quarter, 0.5 = full moon, 0.75 = last quarter.
 */
export function getMoonPhaseName(phase: number): string {
    if (phase < 0.03 || phase >= 0.97) return 'new';
    if (phase < 0.22) return 'waxing_crescent';
    if (phase < 0.28) return 'first_quarter';
    if (phase < 0.47) return 'waxing_gibbous';
    if (phase < 0.53) return 'full';
    if (phase < 0.72) return 'waning_gibbous';
    if (phase < 0.78) return 'last_quarter';
    return 'waning_crescent';
}

/**
 * Analyse solaire avancée (v5.4.2 → enrichie v5.12)
 * Retourne les données pour affichage dans l'UI
 */
export function runSolarProbe(worldX: number, worldZ: number, altitude: number): SolarAnalysisResult | null {
    if (!state.simDate) return null;
    const gps = worldToLngLat(worldX, worldZ, state.originTile);
    const steps = 48; 

    let totalSunlightMinutes = 0;
    let firstSunTime: Date | null = null;
    const timeline: { isNight: boolean; inShadow: boolean }[] = [];

    // Simulation sur 24h
    for (let i = 0; i < steps; i++) {
        const date = new Date(state.simDate);
        date.setHours(0, i * 30, 0, 0);
        const sunPos = SunCalc.getPosition(date, gps.lat, gps.lon);
        const sunPosVector = new THREE.Vector3().setFromSphericalCoords(100000, Math.PI/2 - sunPos.altitude, sunPos.azimuth + Math.PI);
        
        const inShadow = isAtShadow(worldX, worldZ, altitude, sunPosVector);
        const hasSun = (sunPos.altitude > 0) && !inShadow;

        if (hasSun) {
            totalSunlightMinutes += 30;
            if (firstSunTime === null) firstSunTime = date;
        }

        timeline.push({
            isNight: sunPos.altitude <= 0,
            inShadow: inShadow
        });
    }

    // ── Sun times ──────────────────────────────────────────────────────────────
    const baseDate = new Date(state.simDate);
    baseDate.setHours(12, 0, 0, 0); // Use noon as reference date for getTimes
    const times = SunCalc.getTimes(baseDate, gps.lat, gps.lon);

    const toValidDate = (d: Date): Date | null => (d && !isNaN(d.getTime()) ? d : null);

    const sunrise   = toValidDate(times.sunrise);
    const sunset    = toValidDate(times.sunset);
    const solarNoon = toValidDate(times.solarNoon);

    // Morning golden hour: sunrise → goldenHourEnd
    const goldenHourMorningStart = toValidDate(times.sunrise);
    const goldenHourMorningEnd   = toValidDate(times.goldenHourEnd);
    // Evening golden hour: goldenHour → sunset
    const goldenHourEveningStart = toValidDate(times.goldenHour);
    const goldenHourEveningEnd   = toValidDate(times.sunset);

    const dayDurationMinutes =
        sunrise && sunset
            ? Math.round((sunset.getTime() - sunrise.getTime()) / 60000)
            : 0;

    // ── Real-time sun position at state.simDate ────────────────────────────────
    const nowPos = SunCalc.getPosition(state.simDate, gps.lat, gps.lon);
    const currentElevationDeg = nowPos.altitude * (180 / Math.PI);
    // SunCalc azimuth is measured from south, clockwise → normalize to 0-360° from north
    const currentAzimuthDeg   = ((nowPos.azimuth * (180 / Math.PI)) + 180 + 360) % 360;

    // ── Moon ──────────────────────────────────────────────────────────────────
    const moonIllum  = SunCalc.getMoonIllumination(baseDate);
    const moonPhase  = moonIllum.phase;
    const moonPhaseName = getMoonPhaseName(moonPhase);

    // ── 24h elevation curve (144 pts × 10 min) ────────────────────────────────
    let maxElevationDeg = -90;
    const elevationCurve: number[] = [];
    for (let i = 0; i < 144; i++) {
        const d = new Date(state.simDate);
        d.setHours(0, i * 10, 0, 0);
        const pos = SunCalc.getPosition(d, gps.lat, gps.lon);
        const elev = pos.altitude * (180 / Math.PI);
        elevationCurve.push(elev);
        if (elev > maxElevationDeg) maxElevationDeg = elev;
    }

    return {
        totalSunlightMinutes,
        firstSunTime,
        timeline,
        gps,
        sunrise,
        sunset,
        solarNoon,
        goldenHourMorningStart,
        goldenHourMorningEnd,
        goldenHourEveningStart,
        goldenHourEveningEnd,
        dayDurationMinutes,
        currentAzimuthDeg,
        currentElevationDeg,
        moonPhase,
        moonPhaseName,
        elevationCurve,
        maxElevationDeg,
    };
}

export function isAtShadow(worldX: number, worldZ: number, altitude: number, sunPos: THREE.Vector3): boolean {
    const ray = new THREE.Ray(new THREE.Vector3(worldX, altitude + 2, worldZ), sunPos.clone().normalize());
    const hit = findTerrainIntersection(ray);
    return hit !== null;
}

export function findTerrainIntersection(ray: THREE.Ray): THREE.Vector3 | null {
    const maxDist = 500000;
    const p = new THREE.Vector3();
    let hintTile: any = null;
    let dist = 0; // v5.30.1 : Commencer à 0 pour ne pas rater le terrain proche
    while (dist < maxDist) {
        ray.at(dist, p);
        const groundH = getAltitudeAt(p.x, p.z, hintTile);
        if (p.y < groundH) {
            // Recul de sécurité pour ne pas être "sous" le terrain
            return ray.at(dist - (dist > 1000 ? 50 : 10), new THREE.Vector3());
        }
        // Step adaptatif : grand pas en altitude, petit pas proche du terrain
        const gap = p.y - groundH;
        if (gap > 5000) dist += 500;
        else if (gap > 1000) dist += 200;
        else dist += 100;
    }
    return null;
}

/**
 * Plaque une série de points GPS (lat, lon, alt) sur le relief 3D.
 * Gère la densification (interpolation) pour que le tracé suive les courbes du terrain.
 * v5.28.4 : Centralisation de la logique autrefois dupliquée dans terrain.ts.
 */
export function drapeToTerrain(
    points: Array<{lon: number; lat: number; ele?: number; alt?: number}>,
    originTile: {x: number; y: number; z: number},
    densifySteps = 4,
    surfaceOffset = 30
): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];
    let lastPos: THREE.Vector3 | null = null;
    const is2D = state.IS_2D_MODE;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const pos = lngLatToWorld(p.lon, p.lat, originTile);
        const rawAlt = (p.ele !== undefined ? p.ele : (p.alt !== undefined ? p.alt : 0));
        const elevGPX = rawAlt * state.RELIEF_EXAGGERATION;
        const terrainY = is2D ? 0 : getAltitudeAt(pos.x, pos.z);
        
        // On prend le max entre l'altitude GPS et le terrain pour éviter que le trait s'enterre
        // En 2D, on force à 0 + offset
        const y = is2D ? surfaceOffset : Math.max(terrainY, elevGPX) + surfaceOffset;
        const currentPos = new THREE.Vector3(pos.x, y, pos.z);

        // v5.28.5: Filtrage anti-frétillement (jitter) au niveau du draping
        // Si les points sont trop proches (< 1m), on évite de les ajouter
        if (lastPos && currentPos.distanceTo(lastPos) < 1.0) {
            continue;
        }

        result.push(currentPos);
        lastPos = currentPos;
        
        if (i < points.length - 1 && densifySteps > 0) {
            const pNext = points[i + 1];
            const nextRawAlt = (pNext.ele !== undefined ? pNext.ele : (pNext.alt !== undefined ? pNext.alt : 0));
            
            for (let s = 1; s < densifySteps; s++) {
                const t = s / densifySteps;
                const iLon = p.lon + (pNext.lon - p.lon) * t;
                const iLat = p.lat + (pNext.lat - p.lat) * t;
                const iEle = rawAlt + (nextRawAlt - rawAlt) * t;
                
                const iPos = lngLatToWorld(iLon, iLat, originTile);
                const iElevGPX = iEle * state.RELIEF_EXAGGERATION;
                const iTerrainY = is2D ? 0 : getAltitudeAt(iPos.x, iPos.z);
                const iY = is2D ? surfaceOffset : Math.max(iTerrainY, iElevGPX) + surfaceOffset;
                
                const currentIPos = new THREE.Vector3(iPos.x, iY, iPos.z);
                if (lastPos && currentIPos.distanceTo(lastPos) < 1.0) {
                    continue;
                }
                result.push(currentIPos);
                lastPos = currentIPos;
            }
        }
    }
    return result;
}
