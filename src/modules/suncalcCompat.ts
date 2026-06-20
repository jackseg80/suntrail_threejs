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
let _isV2: boolean | null = null;

function detectVersion(): void {
    // La propriété `waxing: boolean` n'existe que dans suncalc v2
    const moon = SunCalc.getMoonIllumination(new Date());
    _isV2 = 'waxing' in moon;
}

const _getPosition = (date: Date, lat: number, lng: number) => {
    if (_isV2 === null) detectVersion();
    const p = SunCalc.getPosition(date, lat, lng);
    if (_isV2) {
        return {
            altitude: p.altitude * DEG2RAD,
            azimuth: (p.azimuth + 180) * DEG2RAD,
        };
    }
    return { altitude: p.altitude, azimuth: p.azimuth };
};

const _getMoonPosition = (date: Date, lat: number, lng: number) => {
    if (_isV2 === null) detectVersion();
    const p = SunCalc.getMoonPosition(date, lat, lng);
    if (_isV2) {
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
