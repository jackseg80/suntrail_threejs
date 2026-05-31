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
 * @param temp      Temperature in °C
 * @param wind      Wind speed in km/h
 * @param uv        UV index
 * @param humidity  Relative humidity in % (0–100)
 * @param precProb  Precipitation probability in % (0–100)
 * @param windGusts Wind gusts in km/h (optional)
 */
export function getComfortIndex(
    temp: number,
    wind: number,
    uv: number,
    humidity: number,
    precProb: number,
    windGusts?: number
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
