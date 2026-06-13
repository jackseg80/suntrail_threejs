/**
 * weatherUtils.ts — Helper functions for weather Pro features.
 * Exported for use in ExpertSheets.ts and tests.
 */

/** UV Index category key (maps to i18n 'weather.uv.*') */
export function getUVCategory(
    uv: number
): 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme' {
    if (uv <= 2) return 'low';
    if (uv <= 5) return 'moderate';
    if (uv <= 7) return 'high';
    if (uv <= 10) return 'veryHigh';
    return 'extreme';
}

/**
 * Hiking comfort index (0–10).
 * Higher = more comfortable.
 * @param temp        Temperature in °C
 * @param wind        Wind speed in km/h
 * @param uv          UV index
 * @param humidity    Relative humidity in % (0–100)
 * @param precProb    Precipitation probability in % (0–100)
 * @param windGusts   Wind gusts in km/h (optional)
 * @param weatherCode WMO weather code (optional) — penalizes thunderstorms, heavy rain, etc.
 * @param visibility  Visibility in km (optional) — penalizes fog/low visibility
 * @param cloudCover  Cloud cover in % (optional) — penalizes overcast conditions
 */
export function getComfortIndex(
    temp: number,
    wind: number,
    uv: number,
    humidity: number,
    precProb: number,
    windGusts?: number,
    weatherCode?: number,
    visibility?: number,
    cloudCover?: number
): number {
    let score = 10;

    // Temperature — ideal range 5–22°C, asymmetric penalty
    if (temp < 5) {
        score -= (5 - temp) * 0.25;
    } else if (temp > 22) {
        const heatFactor = 1 + Math.max(0, (humidity - 50) / 100);
        score -= (temp - 22) * 0.5 * heatFactor;
    }

    // Wind — base speed + gust component (30% of gust excess)
    const gustPenalty = windGusts ? Math.max(0, (windGusts - wind) * 0.3) : 0;
    const effectiveWind = wind + gustPenalty;
    score -= effectiveWind / 20;

    // Precipitation — up to 4 points penalty
    score -= (precProb / 100) * 4;

    // UV — progressive penalty above 3, up to ~3.6 points at UV 12
    score -= Math.max(0, (uv - 3) * 0.4);

    // Weather code — penalize severe conditions
    if (weatherCode !== undefined) {
        if (weatherCode >= 95)
            score -= 3; // thunderstorm
        else if (weatherCode >= 85)
            score -= 1; // snow showers
        else if (weatherCode >= 80)
            score -= 2; // rain showers
        else if (weatherCode >= 71)
            score -= 1; // snow
        else if (weatherCode >= 61)
            score -= 2; // heavy/moderate rain
        else if (weatherCode >= 51) score -= 1; // drizzle
    }

    // Visibility — penalize low visibility (fog, heavy rain)
    if (visibility !== undefined && visibility > 0) {
        if (visibility < 0.5) score -= 2;
        else if (visibility < 2) score -= 1.5;
        else if (visibility < 5) score -= 1;
        else if (visibility < 10) score -= 0.5;
    }

    // Cloud cover — penalize overcast skies
    if (cloudCover !== undefined) {
        if (cloudCover > 90) score -= 1;
        else if (cloudCover > 70) score -= 0.5;
    }

    // Humidity — direct discomfort above 70%
    score -= Math.max(0, (humidity - 70) * 0.03);

    return Math.min(10, Math.max(0, score));
}

/**
 * Freezing level alert key.
 * @param alt          Current altitude in metres
 * @param freezingLevel Freezing level in metres
 */
export function getFreezingAlert(
    alt: number,
    freezingLevel: number
): 'aboveFreezing' | 'nearFreezing' | 'belowFreezing' {
    if (alt > freezingLevel) return 'aboveFreezing';
    if (alt + 300 > freezingLevel) return 'nearFreezing';
    return 'belowFreezing';
}

/**
 * Format wind direction degrees to cardinal abbreviation.
 * Returns abbreviations suitable for display.
 */
export function fmtWindDir(deg: number): string {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
    return dirs[idx];
}

export interface HourlyWeatherPoint {
    temp: number;
    precip?: number;
}

export interface TemperatureChartData {
    minT: number;
    maxT: number;
    rangeT: number;
    hasFreezeLine: boolean;
    points: Array<{ temp: number; y: number }>;
    precipBars: Array<{ index: number; y: number; height: number }>;
    /**
     * Mappe une température à une coordonnée Y dans le graphique.
     * Nécessaire pour le rendu SVG (isotherme, polyligne).
     */
    yFor: (temp: number) => number;
}

/**
 * Calcule les données pures pour le graphique de température SVG.
 * Sépare le calcul mathématique de la construction DOM.
 */
export function computeTemperatureChartData(
    hourly: HourlyWeatherPoint[],
    chartHeight: number = 80
): TemperatureChartData {
    if (hourly.length === 0) {
        return {
            minT: 0,
            maxT: 0,
            rangeT: 1,
            hasFreezeLine: false,
            points: [],
            precipBars: [],
            yFor: () => chartHeight - 8,
        };
    }

    const temps = hourly.map((h) => h.temp);
    const minT = Math.min(...temps);
    const maxT = Math.max(...temps);
    const rangeT = maxT - minT || 1;

    const yFor = (t: number): number =>
        chartHeight - 8 - ((t - minT) / rangeT) * (chartHeight - 16);

    const points = hourly.map((h) => ({ temp: h.temp, y: yFor(h.temp) }));

    const precipBars = hourly
        .map((h, i) => {
            if ((h.precip ?? 0) <= 10) return null;
            const bh = ((h.precip ?? 0) / 100) * (chartHeight - 16);
            return { index: i, y: chartHeight - 8 - bh, height: bh };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);

    return {
        minT,
        maxT,
        rangeT,
        hasFreezeLine: minT < 0 && maxT > 0,
        points,
        precipBars,
        yFor,
    };
}

/**
 * Retourne la catégorie de confort textuelle à partir du score 0-10.
 */
export function getComfortCategory(score: number): {
    emoji: string;
    label: string;
} {
    if (score >= 8) return { emoji: '😊', label: 'Excellent' };
    if (score >= 6) return { emoji: '👍', label: 'Bon' };
    if (score >= 4) return { emoji: '😐', label: 'Moyen' };
    return { emoji: '😟', label: 'Difficile' };
}
