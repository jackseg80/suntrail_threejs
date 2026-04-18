/**
 * expertService.ts — Business logic for Expert Sheets (v5.29.37)
 *
 * Centralizes data formatting, reporting and calculations for Weather,
 * Solar and SOS sheets to enable unit testing.
 */

import { state } from './state';
import { i18n } from '../i18n/I18nService';
import { fmtTime, fmtDuration } from './utils';
import { getComfortIndex, fmtWindDir } from './weatherUtils';
import { worldToLngLat } from './geo';
import { getAltitudeAt, type SolarAnalysisResult } from './analysis';

export class ExpertService {
    
    /**
     * Generates a formatted text report for weather data.
     */
    generateWeatherReport(wd: NonNullable<typeof state.weatherData>): string {
        const lines = [
            'SunTrail Weather Report',
            `${i18n.t('weather.location')}: ${wd.locationName ?? '—'}`,
            `${i18n.t('weather.temp')}: ${Math.round(wd.temp)}°C`,
            `${i18n.t('weather.feelsLike')}: ${Math.round(wd.apparentTemp)}°C`,
            `${i18n.t('weather.humidity')}: ${wd.humidity}%`,
            `${i18n.t('weather.wind')}: ${Math.round(wd.windSpeed)} km/h ${fmtWindDir(wd.windDirDeg ?? wd.windDir)}`,
            `${i18n.t('weather.gusts')}: ${Math.round(wd.windGusts ?? 0)} km/h`,
            `${i18n.t('weather.stat.uvIndex')}: ${Math.round(wd.uvIndex ?? 0)}`,
            `${i18n.t('weather.freezingLevel')}: ${Math.round(wd.freezingLevel ?? 0)} m`,
            `${i18n.t('weather.visibility')}: ${Math.round(wd.visibility ?? 0)} km`,
            `${i18n.t('weather.stat.comfortIndex')}: ${Math.round(getComfortIndex(wd.temp, wd.windSpeed, wd.uvIndex ?? 0) * 10) / 10}/10`,
        ];
        
        if (wd.daily) {
            lines.push('');
            lines.push(i18n.t('weather.section.forecast3d') + ':');
            wd.daily.slice(0, 3).forEach(d => {
                lines.push(`  ${d.date}: ${Math.round(d.tempMax)}°/${Math.round(d.tempMin)}° · 💧${d.precipSum.toFixed(1)}mm · UV${Math.round(d.uvIndexMax)} · 💨${Math.round(d.windSpeedMax)}km/h`);
            });
        }
        
        return lines.join('\n');
    }

    /**
     * Generates a formatted text report for solar analysis.
     */
    generateSolarReport(result: SolarAnalysisResult): string {
        const lines = [
            'SunTrail Solar Report',
            `Location: ${result.gps.lat.toFixed(5)}, ${result.gps.lon.toFixed(5)}`,
            `${i18n.t('solar.stat.sunlight')}: ${fmtDuration(result.totalSunlightMinutes)}`,
            `${i18n.t('solar.stat.sunrise')}: ${fmtTime(result.sunrise)}`,
            `${i18n.t('solar.stat.noon')}: ${fmtTime(result.solarNoon)}`,
            `${i18n.t('solar.stat.sunset')}: ${fmtTime(result.sunset)}`,
            `${i18n.t('solar.stat.dayDuration')}: ${fmtDuration(result.dayDurationMinutes)}`,
            `${i18n.t('solar.stat.goldenMorning')}: ${fmtTime(result.goldenHourMorningStart)} → ${fmtTime(result.goldenHourMorningEnd)}`,
            `${i18n.t('solar.stat.goldenEvening')}: ${fmtTime(result.goldenHourEveningStart)} → ${fmtTime(result.goldenHourEveningEnd)}`,
            `${i18n.t('solar.stat.azimuth')}: ${Math.round(result.currentAzimuthDeg)}°`,
            `${i18n.t('solar.stat.elevation')}: ${Math.round(result.currentElevationDeg)}°`,
            `${i18n.t('solar.stat.moonPhase')}: ${this.getMoonEmoji(result.moonPhaseName)} ${Math.round(result.moonPhase * 100)}%`,
        ];
        return lines.join('\n');
    }

    /**
     * Resolves current SOS location and generates the emergency message.
     */
    async generateSOSMessage(batteryLevel?: number): Promise<string> {
        let lat: number, lon: number, alt: number;

        if (state.userLocation) {
            lat = state.userLocation.lat;
            lon = state.userLocation.lon;
            alt = state.userLocation.alt;
        } else {
            const gps = worldToLngLat(state.controls?.target.x || 0, state.controls?.target.z || 0, state.originTile);
            lat = gps.lat;
            lon = gps.lon;
            alt = getAltitudeAt(state.controls?.target.x || 0, state.controls?.target.z || 0) / state.RELIEF_EXAGGERATION;
        }

        let bat = "??";
        if (batteryLevel !== undefined) {
            bat = Math.round(batteryLevel * 100).toString();
        } else {
            try {
                const battery = await (navigator as any).getBattery();
                bat = Math.round(battery.level * 100).toString();
            } catch(e) {}
        }

        const now = new Date();
        const time = `${now.getHours()}h${now.getMinutes().toString().padStart(2, '0')}`;

        return `🆘 SOS SUNTRAIL: ${lat.toFixed(5)},${lon.toFixed(5)} | ALT:${Math.round(alt)}m | BAT:${bat}% | ${time}`;
    }

    getMoonEmoji(name: string): string {
        const map: Record<string, string> = {
            new: '🌑', waxing_crescent: '🌒', first_quarter: '🌓',
            waxing_gibbous: '🌔', full: '🌕', waning_gibbous: '🌖',
            last_quarter: '🌗', waning_crescent: '🌘',
        };
        return map[name] ?? '🌙';
    }
}

export const expertService = new ExpertService();
