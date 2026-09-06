import { MathUtils } from 'three';

/** Shared terrain-aware limit for manual navigation and camera follow. */
export function getCameraTiltLimit(zoom: number, targetHeight: number): number {
    let limit = 1.1;
    if (zoom <= 10) limit = 0;
    else if (zoom === 11) limit = 0.45;
    else if (zoom === 12) limit = 0.7;
    else if (zoom === 13) limit = 0.9;
    else if (zoom === 14) limit = 0.95;
    else if (zoom === 15) limit = 0.85;
    else if (zoom === 16) limit = 0.65;
    else if (zoom === 17) limit = 0.5;
    else if (zoom >= 18) limit = 0.4;
    if (zoom >= 14) limit *= 1 - MathUtils.clamp(targetHeight / 8000, 0, 0.5);
    return limit;
}
