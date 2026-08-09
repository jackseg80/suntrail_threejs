import {
    emptyCoverage,
    unknownDifficulty,
    type RouteDataCoverage,
    type TechnicalDifficulty,
} from './preparedRoute';

export interface ORSExtraSummaryItem {
    value: number;
    distance?: number;
    amount?: number;
}

export interface ORSExtraInfoItem {
    values?: Array<[number, number, number]>;
    summary?: ORSExtraSummaryItem[];
}

export interface ORSExtras {
    traildifficulty?: ORSExtraInfoItem;
    steepness?: ORSExtraInfoItem;
    surface?: ORSExtraInfoItem;
    waytype?: ORSExtraInfoItem;
    waytypes?: ORSExtraInfoItem;
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function coverageFromExtra(
    extra: ORSExtraInfoItem | undefined,
    pointCount: number,
    isKnownValue: (value: number) => boolean
): number {
    if (!extra) return 0;
    if (Array.isArray(extra.summary) && extra.summary.length > 0) {
        return clampPercent(
            extra.summary
                .filter((item) => isKnownValue(Number(item.value)))
                .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
        );
    }
    if (!Array.isArray(extra.values) || pointCount < 2) return 0;
    const coveredSegments = extra.values
        .filter(([, , value]) => isKnownValue(Number(value)))
        .reduce(
            (sum, [start, end]) =>
                sum + Math.max(0, Math.min(pointCount - 1, end) - start),
            0
        );
    return clampPercent((coveredSegments / (pointCount - 1)) * 100);
}

function maxSacLevel(
    extra: ORSExtraInfoItem | undefined
): 1 | 2 | 3 | 4 | 5 | 6 | null {
    const values = [
        ...(extra?.summary?.map((item) => Number(item.value)) ?? []),
        ...(extra?.values?.map(([, , value]) => Number(value)) ?? []),
    ].filter((value) => Number.isInteger(value) && value >= 1 && value <= 6);
    if (values.length === 0) return null;
    return Math.max(...values) as 1 | 2 | 3 | 4 | 5 | 6;
}

export function analyzeORSDifficulty(
    extras: ORSExtras | undefined,
    pointCount: number
): { difficulty: TechnicalDifficulty; coverage: RouteDataCoverage } {
    const coverage = emptyCoverage();
    coverage.trailDifficulty = coverageFromExtra(
        extras?.traildifficulty,
        pointCount,
        (value) => value >= 1 && value <= 6
    );
    coverage.steepness = coverageFromExtra(
        extras?.steepness,
        pointCount,
        () => true
    );
    coverage.surface = coverageFromExtra(
        extras?.surface,
        pointCount,
        (value) => value > 0
    );
    coverage.wayType = coverageFromExtra(
        extras?.waytype ?? extras?.waytypes,
        pointCount,
        (value) => value > 0
    );

    const sacLevel = maxSacLevel(extras?.traildifficulty);
    if (!sacLevel || coverage.trailDifficulty <= 0) {
        return {
            difficulty: unknownDifficulty('ors', 'missing-data'),
            coverage,
        };
    }
    const complete = coverage.trailDifficulty >= 99.5;
    return {
        difficulty: {
            status: complete ? 'known' : 'partial',
            source: 'ors',
            sacLevel,
            coveragePercent: coverage.trailDifficulty,
            reason: complete ? 'complete' : 'partial',
        },
        coverage,
    };
}

export function createOSRMDifficulty(): {
    difficulty: TechnicalDifficulty;
    coverage: RouteDataCoverage;
} {
    return {
        difficulty: unknownDifficulty('osrm', 'osrm-fallback'),
        coverage: emptyCoverage(),
    };
}
