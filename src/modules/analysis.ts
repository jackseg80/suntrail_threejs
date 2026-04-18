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

/**
 * Récupère l'altitude précise à une coordonnée monde (x, z).
 * v5.30.3 : Recherche multi-niveaux ultra-robuste avec cache et interpolation bilinéaire.
 */
export function getAltitudeAt(worldX: number, worldZ: number, hintTile: any = null): number {
    const testPoint = new THREE.Vector3(worldX, 0, worldZ);
    let tile = hintTile;

    if (!tile) {
        if (lastUsedTile && lastUsedTile.status === 'loaded' && lastUsedTile.pixelData && lastUsedTile.bounds && lastUsedTile.bounds.containsPoint(testPoint)) {
            tile = lastUsedTile;
        } else {
            const candidates = queryTiles(worldX, worldZ);
            for (const t of candidates) {
                if (t.status === 'loaded' && t.pixelData && t.bounds && t.bounds.containsPoint(testPoint)) {
                    if (!tile || t.zoom > tile.zoom) tile = t;
                }
            }
            if (!tile) {
                for (const t of activeTiles.values()) {
                    if (t.status === 'loaded' && t.pixelData && t.bounds && t.bounds.containsPoint(testPoint)) {
                        if (!tile || t.zoom > tile.zoom) tile = t;
                    }
                }
            }
            if (tile) lastUsedTile = tile;
        }
    }

    if (!tile || !tile.pixelData) return 0;

    const res = Math.sqrt(tile.pixelData.length / 4);
    const b = tile.bounds;
    const localX = (worldX - b.min.x) / (b.max.x - b.min.x);
    const localZ = (worldZ - b.min.z) / (b.max.z - b.min.z);

    // v5.30.3 : Interpolation bilinéaire avec décalage demi-pixel
    const fx = (localX * res) - 0.5;
    const fz = (localZ * res) - 0.5;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const dx = fx - x0;
    const dz = fz - z0;

    const getH = (x: number, z: number) => {
        const clX = Math.max(0, Math.min(res - 1, x));
        const clZ = Math.max(0, Math.min(res - 1, z));
        const i = (clZ * res + clX) * 4;
        const r = tile.pixelData[i];
        const g = tile.pixelData[i+1];
        const b = tile.pixelData[i+2];
        return decodeTerrainRGB(r, g, b, state.RELIEF_EXAGGERATION);
    };

    const h00 = getH(x0, z0);
    const h10 = getH(x1, z0);
    const h01 = getH(x0, z1);
    const h11 = getH(x1, z1);

    return (h00 * (1 - dx) * (1 - dz) + h10 * dx * (1 - dz) + h01 * (1 - dx) * dz + h11 * dx * dz);
}

export interface SolarAnalysisResult {
    totalSunlightMinutes: number;
    firstSunTime: Date | null;
    timeline: { isNight: boolean; inShadow: boolean }[];
    gps: { lat: number; lon: number };
    sunrise: Date | null;
    sunset: Date | null;
    solarNoon: Date | null;
    goldenHourMorningStart: Date | null;
    goldenHourMorningEnd: Date | null;
    goldenHourEveningStart: Date | null;
    goldenHourEveningEnd: Date | null;
    dayDurationMinutes: number;
    currentAzimuthDeg: number;
    currentElevationDeg: number;
    moonPhase: number;
    moonPhaseName: string;
    elevationCurve: number[];
    maxElevationDeg: number;
}

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

export function runSolarProbe(worldX: number, worldZ: number, altitude: number): SolarAnalysisResult | null {
    if (!state.simDate) return null;
    const gps = worldToLngLat(worldX, worldZ, state.originTile);
    const steps = 48; 

    let totalSunlightMinutes = 0;
    let firstSunTime: Date | null = null;
    const timeline: { isNight: boolean; inShadow: boolean }[] = [];

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

    const baseDate = new Date(state.simDate);
    baseDate.setHours(12, 0, 0, 0);
    const times = SunCalc.getTimes(baseDate, gps.lat, gps.lon);
    const toValidDate = (d: Date): Date | null => (d && !isNaN(d.getTime()) ? d : null);

    const sunrise = toValidDate(times.sunrise);
    const sunset = toValidDate(times.sunset);
    
    const nowPos = SunCalc.getPosition(state.simDate, gps.lat, gps.lon);
    const baseMoon = SunCalc.getMoonIllumination(baseDate);
    
    return {
        totalSunlightMinutes,
        firstSunTime,
        timeline,
        gps,
        sunrise,
        sunset,
        solarNoon: toValidDate(times.solarNoon),
        goldenHourMorningStart: toValidDate(times.sunrise),
        goldenHourMorningEnd: toValidDate(times.goldenHourEnd),
        goldenHourEveningStart: toValidDate(times.goldenHour),
        goldenHourEveningEnd: toValidDate(times.sunset),
        dayDurationMinutes: sunrise && sunset ? Math.round((sunset.getTime() - sunrise.getTime()) / 60000) : 0,
        currentAzimuthDeg: ((nowPos.azimuth * (180 / Math.PI)) + 180 + 360) % 360,
        currentElevationDeg: nowPos.altitude * (180 / Math.PI),
        moonPhase: baseMoon.phase,
        moonPhaseName: getMoonPhaseName(baseMoon.phase),
        elevationCurve: Array.from({length:144}, (_, i) => {
            const d = new Date(state.simDate); d.setHours(0, i*10, 0, 0);
            return SunCalc.getPosition(d, gps.lat, gps.lon).altitude * (180/Math.PI);
        }),
        maxElevationDeg: Math.max(...Array.from({length:144}, (_, i) => {
             const d = new Date(state.simDate); d.setHours(0, i*10, 0, 0);
             return SunCalc.getPosition(d, gps.lat, gps.lon).altitude * (180/Math.PI);
        }))
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
    let dist = 0;
    while (dist < maxDist) {
        ray.at(dist, p);
        const groundH = getAltitudeAt(p.x, p.z);
        if (p.y < groundH) {
            return ray.at(dist - 10, new THREE.Vector3());
        }
        const gap = p.y - groundH;
        if (gap > 5000) dist += 500;
        else if (gap > 1000) dist += 200;
        else dist += 100;
    }
    return null;
}

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
        const y = is2D ? surfaceOffset : Math.max(terrainY, elevGPX) + surfaceOffset;
        const currentPos = new THREE.Vector3(pos.x, y, pos.z);

        if (lastPos && currentPos.distanceTo(lastPos) < 1.0) continue;
        result.push(currentPos);
        lastPos = currentPos;
        
        if (i < points.length - 1 && densifySteps > 0) {
            const pNext = points[i + 1];
            for (let s = 1; s < densifySteps; s++) {
                const t = s / densifySteps;
                const iLon = p.lon + (pNext.lon - p.lon) * t;
                const iLat = p.lat + (pNext.lat - p.lat) * t;
                const iEle = rawAlt + ((pNext.ele ?? pNext.alt ?? 0) - rawAlt) * t;
                const iPos = lngLatToWorld(iLon, iLat, originTile);
                const iTerrainY = is2D ? 0 : getAltitudeAt(iPos.x, iPos.z);
                const iY = is2D ? surfaceOffset : Math.max(iTerrainY, iEle * state.RELIEF_EXAGGERATION) + surfaceOffset;
                const currentIPos = new THREE.Vector3(iPos.x, iY, iPos.z);
                if (lastPos && currentIPos.distanceTo(lastPos) < 1.0) continue;
                result.push(currentIPos);
                lastPos = currentIPos;
            }
        }
    }
    return result;
}
