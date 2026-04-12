import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { activeTiles } from './terrain';
import { queryTiles } from './tileSpatialIndex';
import { worldToLngLat, lngLatToWorld } from './geo';

let lastUsedTile: any = null;

export function resetAnalysisCache(): void {
    lastUsedTile = null;
}

export function getAltitudeAt(worldX: number, worldZ: number, hintTile: any = null): number {
    const testPoint = new THREE.Vector3(worldX, 0, worldZ);
    let tile = hintTile;

    if (!tile) {
        if (lastUsedTile && lastUsedTile.status === 'loaded' && lastUsedTile.bounds && lastUsedTile.bounds.containsPoint(testPoint)) {
            tile = lastUsedTile;
        } else {
            // O(1) spatial index lookup instead of O(n) activeTiles iteration
            const candidates = queryTiles(worldX, worldZ);
            for (const t of candidates) {
                if (t.status === 'loaded' && t.bounds && t.bounds.containsPoint(testPoint)) {
                    if (!tile || t.zoom > tile.zoom) tile = t;
                }
            }
            // Fallback to full scan if spatial index is empty (e.g. during init)
            if (!tile) {
                for (const t of activeTiles.values()) {
                    if (t.status === 'loaded' && t.bounds && t.bounds.containsPoint(testPoint)) {
                        if (!tile || t.zoom > tile.zoom) tile = t;
                    }
                }
            }
            if (tile) lastUsedTile = tile;
        }
    }

    if (!tile || !tile.pixelData) return 0;

    const res = Math.sqrt(tile.pixelData.length / 4);
    let relX = (worldX - tile.worldX) / tile.tileSizeMeters + 0.5;
    let relZ = (worldZ - tile.worldZ) / tile.tileSizeMeters + 0.5;

    if (tile.elevScale < 1.0) {
        relX = tile.elevOffset.x + (relX * tile.elevScale);
        relZ = tile.elevOffset.y + (relZ * tile.elevScale);
    }

    const fx = relX * res;
    const fz = relZ * res;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(x0 + 1, res - 1);
    const z1 = Math.min(z0 + 1, res - 1);
    const dx = fx - x0;
    const dz = fz - z0;

    const getH = (x: number, z: number) => {
        const i = (Math.max(0, Math.min(res - 1, z)) * res + Math.max(0, Math.min(res - 1, x))) * 4;
        const r = tile.pixelData[i];
        const g = tile.pixelData[i+1];
        const b = tile.pixelData[i+2];
        return (-10000 + ((r * 65536 + g * 256 + b) * 0.1)) * state.RELIEF_EXAGGERATION;
    };

    const h00 = getH(x0, z0);
    const h10 = getH(x1, z0);
    const h01 = getH(x0, z1);
    const h11 = getH(x1, z1);

    return (h00 * (1 - dx) * (1 - dz) + h10 * dx * (1 - dz) + h01 * (1 - dx) * dz + h11 * dx * dz);
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
    const elevationCurve: number[] = [];
    for (let i = 0; i < 144; i++) {
        const d = new Date(state.simDate);
        d.setHours(0, i * 10, 0, 0);
        const pos = SunCalc.getPosition(d, gps.lat, gps.lon);
        elevationCurve.push(pos.altitude * (180 / Math.PI));
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
    let dist = 100;
    while (dist < maxDist) {
        ray.at(dist, p);
        const groundH = getAltitudeAt(p.x, p.z, hintTile);
        if (p.y < groundH) {
            return ray.at(dist - (dist > 1000 ? 50 : 25), new THREE.Vector3());
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

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const pos = lngLatToWorld(p.lon, p.lat, originTile);
        const rawAlt = (p.ele !== undefined ? p.ele : (p.alt !== undefined ? p.alt : 0));
        const elevGPX = rawAlt * state.RELIEF_EXAGGERATION;
        const terrainY = getAltitudeAt(pos.x, pos.z);
        
        // On prend le max entre l'altitude GPS et le terrain pour éviter que le trait s'enterre
        const y = Math.max(terrainY, elevGPX) + surfaceOffset;
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
                const iTerrainY = getAltitudeAt(iPos.x, iPos.z);
                const iY = Math.max(iTerrainY, iElevGPX) + surfaceOffset;
                
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
