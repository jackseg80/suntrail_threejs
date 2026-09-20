export const TERRAIN_RGB_BASE_METERS = -10_000;
export const TERRAIN_RGB_STEP_METERS = 0.1;

export interface ElevationLimits {
    minMeters: number;
    maxMeters: number;
    maxGradientMeters: number;
    maxSeamMeters: number;
}

export interface ElevationScan {
    validPixels: number;
    noDataPixels: number;
    impossiblePixels: number;
    minMeters: number | null;
    maxMeters: number | null;
    maxGradientMeters: number;
    abnormalGradients: number;
}

export function decodeTerrainRgb(r: number, g: number, b: number): number {
    return (
        TERRAIN_RGB_BASE_METERS +
        (r * 65_536 + g * 256 + b) * TERRAIN_RGB_STEP_METERS
    );
}

export function scanElevationRgba(
    rgba: Uint8Array,
    width: number,
    height: number,
    limits: ElevationLimits
): ElevationScan {
    if (rgba.length !== width * height * 4) {
        throw new RangeError(
            `RGBA length ${rgba.length} does not match ${width}x${height}`
        );
    }

    let validPixels = 0;
    let noDataPixels = 0;
    let impossiblePixels = 0;
    let minMeters = Number.POSITIVE_INFINITY;
    let maxMeters = Number.NEGATIVE_INFINITY;
    let maxGradientMeters = 0;
    let abnormalGradients = 0;

    const heightAt = (pixelIndex: number): number | null => {
        const offset = pixelIndex * 4;
        if (rgba[offset + 3] === 0) return null;
        return decodeTerrainRgb(
            rgba[offset],
            rgba[offset + 1],
            rgba[offset + 2]
        );
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixelIndex = y * width + x;
            const elevation = heightAt(pixelIndex);
            if (elevation === null) {
                noDataPixels++;
                continue;
            }

            validPixels++;
            minMeters = Math.min(minMeters, elevation);
            maxMeters = Math.max(maxMeters, elevation);
            if (elevation < limits.minMeters || elevation > limits.maxMeters) {
                impossiblePixels++;
            }

            for (const neighbour of [
                x + 1 < width ? pixelIndex + 1 : -1,
                y + 1 < height ? pixelIndex + width : -1,
            ]) {
                if (neighbour < 0) continue;
                const neighbourElevation = heightAt(neighbour);
                if (neighbourElevation === null) continue;
                const gradient = Math.abs(elevation - neighbourElevation);
                maxGradientMeters = Math.max(maxGradientMeters, gradient);
                if (gradient > limits.maxGradientMeters) {
                    abnormalGradients++;
                }
            }
        }
    }

    return {
        validPixels,
        noDataPixels,
        impossiblePixels,
        minMeters: validPixels > 0 ? minMeters : null,
        maxMeters: validPixels > 0 ? maxMeters : null,
        maxGradientMeters,
        abnormalGradients,
    };
}

export function maxVerticalSeamDifference(
    leftRgba: Uint8Array,
    rightRgba: Uint8Array,
    width: number,
    height: number
): number {
    let maximum = 0;
    for (let y = 0; y < height; y++) {
        const leftOffset = (y * width + width - 1) * 4;
        const rightOffset = y * width * 4;
        if (leftRgba[leftOffset + 3] === 0 || rightRgba[rightOffset + 3] === 0)
            continue;
        maximum = Math.max(
            maximum,
            Math.abs(
                decodeTerrainRgb(
                    leftRgba[leftOffset],
                    leftRgba[leftOffset + 1],
                    leftRgba[leftOffset + 2]
                ) -
                    decodeTerrainRgb(
                        rightRgba[rightOffset],
                        rightRgba[rightOffset + 1],
                        rightRgba[rightOffset + 2]
                    )
            )
        );
    }
    return maximum;
}

export function maxHorizontalSeamDifference(
    topRgba: Uint8Array,
    bottomRgba: Uint8Array,
    width: number,
    height: number
): number {
    let maximum = 0;
    for (let x = 0; x < width; x++) {
        const topOffset = ((height - 1) * width + x) * 4;
        const bottomOffset = x * 4;
        if (topRgba[topOffset + 3] === 0 || bottomRgba[bottomOffset + 3] === 0)
            continue;
        maximum = Math.max(
            maximum,
            Math.abs(
                decodeTerrainRgb(
                    topRgba[topOffset],
                    topRgba[topOffset + 1],
                    topRgba[topOffset + 2]
                ) -
                    decodeTerrainRgb(
                        bottomRgba[bottomOffset],
                        bottomRgba[bottomOffset + 1],
                        bottomRgba[bottomOffset + 2]
                    )
            )
        );
    }
    return maximum;
}
