/**
 * weatherUtils.ts — Helper functions for weather Pro features.
 * Exported for use in ExpertSheets.ts and tests.
 */

/** UV Index category key (maps to i18n 'weather.uv.*') */
export function getUVCategory(uv: number): 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme' {
    if (uv <= 2) return 'low';
    if (uv <= 5) return 'moderate';
    if (uv <= 7) return 'high';
    if (uv <= 10) return 'veryHigh';
    return 'extreme';
}

/**
 * Hiking comfort index (0–10).
 * Higher = more comfortable.
 * @param temp  Temperature in °C
 * @param wind  Wind speed in km/h
 * @param uv    UV index
 */
export function getComfortIndex(temp: number, wind: number, uv: number): number {
    const score = 10 - (Math.abs(temp - 18) / 2) - (wind / 15) - (uv > 6 ? 2 : 0);
    return Math.min(10, Math.max(0, score));
}

/**
 * Freezing level alert key.
 * @param alt          Current altitude in metres
 * @param freezingLevel Freezing level in metres
 */
export function getFreezingAlert(alt: number, freezingLevel: number): 'aboveFreezing' | 'nearFreezing' | 'belowFreezing' {
    if (alt > freezingLevel) return 'aboveFreezing';
    if (alt + 300 > freezingLevel) return 'nearFreezing';
    return 'belowFreezing';
}

/**
 * Format wind direction degrees to cardinal abbreviation.
 * Returns abbreviations suitable for display.
 */
export function fmtWindDir(deg: number): string {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return dirs[idx];
}
