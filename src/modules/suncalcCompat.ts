/**
 * SunCalc v2.x → v1.x compatibility layer.
 *
 * SunCalc v2.0 introduced breaking changes:
 *  - Angles in degrees (was radians)
 *  - Azimuth from north (was south-based)
 *  - Missing events are null (was Invalid Date)
 *
 * This wrapper converts v2 outputs back to v1 conventions so that
 * all existing SunTrail code works without modification.
 */
import * as SunCalc from 'suncalc';

const DEG2RAD = Math.PI / 180;
let _versionDetected: 'v1' | 'v2' | null = null;
let _loggedOnce = false;

function detectVersion(): 'v1' | 'v2' {
    // Test avec une altitude extrême : si abs > 1.58 c'est forcément des degrés (v2)
    // Car en radians l'altitude max est π/2 ≈ 1.57
    const test = SunCalc.getPosition(new Date('2026-06-21T12:00:00Z'), 47, 8);
    const isV2 = Math.abs(test.altitude) > 1.58;
    return isV2 ? 'v2' : 'v1';
}

const _getPosition = (date: Date, lat: number, lng: number) => {
    if (!_versionDetected) _versionDetected = detectVersion();

    const p = SunCalc.getPosition(date, lat, lng);
    const isV2 = _versionDetected === 'v2';

    if (!_loggedOnce) {
        _loggedOnce = true;
        console.warn(
            '[suncalcCompat] version détectée : %s | raw altitude=%f° azimuth=%f°',
            _versionDetected,
            isV2 ? p.altitude : p.altitude * (180 / Math.PI),
            isV2 ? p.azimuth : (p.azimuth * (180 / Math.PI) + 180 + 360) % 360
        );
    }

    // v2 (degrés, nord-based) → v1 (radians, sud-based)
    if (isV2) {
        return {
            altitude: p.altitude * DEG2RAD,
            azimuth: (p.azimuth + 180) * DEG2RAD,
        };
    }
    // v1 (déjà radians, sud-based) → retour direct
    return { altitude: p.altitude, azimuth: p.azimuth };
};

const _getMoonPosition = (date: Date, lat: number, lng: number) => {
    const p = SunCalc.getMoonPosition(date, lat, lng);
    const isV2 = _versionDetected === 'v2';
    if (isV2) {
        return {
            altitude: p.altitude * DEG2RAD,
            azimuth: (p.azimuth + 180) * DEG2RAD,
            distance: p.distance,
            parallacticAngle: p.parallacticAngle * DEG2RAD,
        };
    }
    return {
        altitude: p.altitude,
        azimuth: p.azimuth,
        distance: p.distance,
        parallacticAngle: p.parallacticAngle,
    };
};

interface TimesCompat {
    sunrise: Date; sunriseEnd: Date; goldenHourEnd: Date; solarNoon: Date;
    goldenHour: Date; sunsetStart: Date; sunset: Date; dusk: Date;
    nauticalDusk: Date; night: Date; nadir: Date; nightEnd: Date;
    nauticalDawn: Date; dawn: Date;
    alwaysUp?: boolean; alwaysDown?: boolean;
}

const _getTimes = (date: Date, lat: number, lng: number, height = 0) => {
    const times = SunCalc.getTimes(date, lat, lng, height) as Record<string, Date | null | boolean>;
    const res: Record<string, Date | boolean> = {};
    for (const key of Object.keys(times)) {
        const val = times[key];
        if (val instanceof Date) {
            res[key] = val;
        } else if (val === null) {
            res[key] = new Date(NaN);
        } else {
            res[key] = val;
        }
    }
    return res as unknown as TimesCompat;
};

export default {
    getPosition: _getPosition,
    getMoonPosition: _getMoonPosition,
    getMoonIllumination: SunCalc.getMoonIllumination.bind(SunCalc),
    getTimes: _getTimes,
};
