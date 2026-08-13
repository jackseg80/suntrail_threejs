import type {
    PreparedRouteV1,
    RoutePoint,
} from '../preparedRoutes/preparedRoute';

export const CORRIDOR_MIN_LOD = 5;
export const FREE_CORRIDOR_MAX_LOD = 14;
export const MAX_CORRIDOR_TILES = 2_000;
export const FREE_CORRIDOR_RADIUS_METERS = 1_000;

const WEB_MERCATOR_MAX_LAT = 85.05112878;
const ESTIMATED_BYTES_PER_TILE = 80 * 1024;
const METERS_PER_LATITUDE_DEGREE = 110_540;
const METERS_PER_LONGITUDE_DEGREE = 111_320;
const ALLOWED_RADII = new Set([500, 1_000, 2_000]);

export interface CorridorTileRef {
    zoom: number;
    tx: number;
    ty: number;
}

export interface RouteCorridorPlanV1 {
    schemaVersion: 1;
    routeId: string;
    radiusMeters: 500 | 1_000 | 2_000;
    minLod: number;
    maxLod: number;
    tiles: CorridorTileRef[];
    tileCount: number;
    estimatedSizeBytes: number;
}

export type CorridorPlanningErrorCode =
    'invalid-options' | 'invalid-geometry' | 'antimeridian' | 'too-large';

export class CorridorPlanningError extends Error {
    constructor(public readonly code: CorridorPlanningErrorCode) {
        super(`routeCorridor.${code}`);
        this.name = 'CorridorPlanningError';
    }
}

export interface BuildRouteCorridorOptions {
    radiusMeters?: 500 | 1_000 | 2_000;
    minLod?: number;
    maxLod?: number;
    maxTiles?: number;
}

export interface CorridorTileInspection {
    covered: boolean;
    sizeBytes: number;
}

export interface CorridorCoverageMeasurement {
    coveragePercent: number;
    coveredTileCount: number;
    requiredTileCount: number;
    sizeBytes: number;
}

interface Point2D {
    x: number;
    y: number;
}

interface Rect2D {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

function isValidGeometry(geometry: RoutePoint[]): boolean {
    return (
        geometry.length >= 2 &&
        geometry.every(
            (point) =>
                Number.isFinite(point.lat) &&
                Number.isFinite(point.lon) &&
                Math.abs(point.lat) <= WEB_MERCATOR_MAX_LAT &&
                point.lon >= -180 &&
                point.lon <= 180
        )
    );
}

function crossesAntimeridian(geometry: RoutePoint[]): boolean {
    for (let index = 1; index < geometry.length; index++) {
        if (Math.abs(geometry[index].lon - geometry[index - 1].lon) > 180) {
            return true;
        }
    }
    return false;
}

function longitudeToTileX(lon: number, zoom: number): number {
    const count = 2 ** zoom;
    return Math.max(
        0,
        Math.min(count - 1, Math.floor(((lon + 180) / 360) * count))
    );
}

function latitudeToTileY(lat: number, zoom: number): number {
    const count = 2 ** zoom;
    const clamped = Math.max(
        -WEB_MERCATOR_MAX_LAT,
        Math.min(WEB_MERCATOR_MAX_LAT, lat)
    );
    const radians = (clamped * Math.PI) / 180;
    const normalized =
        (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
    return Math.max(0, Math.min(count - 1, Math.floor(normalized * count)));
}

function tileBounds(tile: CorridorTileRef): {
    north: number;
    south: number;
    west: number;
    east: number;
} {
    const count = 2 ** tile.zoom;
    const west = (tile.tx / count) * 360 - 180;
    const east = ((tile.tx + 1) / count) * 360 - 180;
    const toLatitude = (normalizedY: number) =>
        (Math.atan(Math.sinh(Math.PI * (1 - 2 * normalizedY))) * 180) / Math.PI;
    return {
        west,
        east,
        north: toLatitude(tile.ty / count),
        south: toLatitude((tile.ty + 1) / count),
    };
}

function project(
    lat: number,
    lon: number,
    referenceLat: number,
    referenceLon: number
): Point2D {
    return {
        x:
            (lon - referenceLon) *
            METERS_PER_LONGITUDE_DEGREE *
            Math.cos((referenceLat * Math.PI) / 180),
        y: (lat - referenceLat) * METERS_PER_LATITUDE_DEGREE,
    };
}

function orientation(a: Point2D, b: Point2D, c: Point2D): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point2D, b: Point2D, point: Point2D): boolean {
    const epsilon = 1e-6;
    return (
        Math.abs(orientation(a, b, point)) <= epsilon &&
        point.x >= Math.min(a.x, b.x) - epsilon &&
        point.x <= Math.max(a.x, b.x) + epsilon &&
        point.y >= Math.min(a.y, b.y) - epsilon &&
        point.y <= Math.max(a.y, b.y) + epsilon
    );
}

function segmentsIntersect(
    a: Point2D,
    b: Point2D,
    c: Point2D,
    d: Point2D
): boolean {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    if (
        ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
        ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
    ) {
        return true;
    }
    return (
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
    );
}

function pointToSegmentDistance(
    point: Point2D,
    start: Point2D,
    end: Point2D
): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0)
        return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = Math.max(
        0,
        Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
                lengthSquared
        )
    );
    return Math.hypot(
        point.x - (start.x + ratio * dx),
        point.y - (start.y + ratio * dy)
    );
}

function pointToRectDistance(point: Point2D, rect: Rect2D): number {
    const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
    const dy = Math.max(rect.minY - point.y, 0, point.y - rect.maxY);
    return Math.hypot(dx, dy);
}

function segmentToRectDistance(
    start: Point2D,
    end: Point2D,
    rect: Rect2D
): number {
    const corners = [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
    ];
    if (
        pointToRectDistance(start, rect) === 0 ||
        pointToRectDistance(end, rect) === 0
    ) {
        return 0;
    }
    for (let index = 0; index < corners.length; index++) {
        if (
            segmentsIntersect(
                start,
                end,
                corners[index],
                corners[(index + 1) % corners.length]
            )
        ) {
            return 0;
        }
    }
    return Math.min(
        pointToRectDistance(start, rect),
        pointToRectDistance(end, rect),
        ...corners.map((corner) => pointToSegmentDistance(corner, start, end))
    );
}

function tileTouchesSegmentCorridor(
    tile: CorridorTileRef,
    start: RoutePoint,
    end: RoutePoint,
    radiusMeters: number
): boolean {
    const bounds = tileBounds(tile);
    const referenceLat = (start.lat + end.lat) / 2;
    const referenceLon = (start.lon + end.lon) / 2;
    const projectedStart = project(
        start.lat,
        start.lon,
        referenceLat,
        referenceLon
    );
    const projectedEnd = project(end.lat, end.lon, referenceLat, referenceLon);
    const southWest = project(
        bounds.south,
        bounds.west,
        referenceLat,
        referenceLon
    );
    const northEast = project(
        bounds.north,
        bounds.east,
        referenceLat,
        referenceLon
    );
    return (
        segmentToRectDistance(projectedStart, projectedEnd, {
            minX: Math.min(southWest.x, northEast.x),
            maxX: Math.max(southWest.x, northEast.x),
            minY: Math.min(southWest.y, northEast.y),
            maxY: Math.max(southWest.y, northEast.y),
        }) <= radiusMeters
    );
}

function validateOptions(options: Required<BuildRouteCorridorOptions>): void {
    if (
        !ALLOWED_RADII.has(options.radiusMeters) ||
        !Number.isInteger(options.minLod) ||
        !Number.isInteger(options.maxLod) ||
        options.minLod < 0 ||
        options.maxLod > 18 ||
        options.minLod > options.maxLod ||
        !Number.isInteger(options.maxTiles) ||
        options.maxTiles <= 0
    ) {
        throw new CorridorPlanningError('invalid-options');
    }
}

export function buildRouteCorridorPlan(
    route: PreparedRouteV1,
    requested: BuildRouteCorridorOptions = {}
): RouteCorridorPlanV1 {
    const options: Required<BuildRouteCorridorOptions> = {
        radiusMeters: requested.radiusMeters ?? FREE_CORRIDOR_RADIUS_METERS,
        minLod: requested.minLod ?? CORRIDOR_MIN_LOD,
        maxLod: requested.maxLod ?? FREE_CORRIDOR_MAX_LOD,
        maxTiles: requested.maxTiles ?? MAX_CORRIDOR_TILES,
    };
    validateOptions(options);
    if (!isValidGeometry(route.geometry)) {
        throw new CorridorPlanningError('invalid-geometry');
    }
    if (crossesAntimeridian(route.geometry)) {
        throw new CorridorPlanningError('antimeridian');
    }

    const tileKeys = new Set<string>();
    for (let index = 1; index < route.geometry.length; index++) {
        const start = route.geometry[index - 1];
        const end = route.geometry[index];
        const latitudeRadius =
            options.radiusMeters / METERS_PER_LATITUDE_DEGREE;
        const smallestLongitudeScale = Math.max(
            0.01,
            Math.cos(
                (Math.max(Math.abs(start.lat), Math.abs(end.lat)) * Math.PI) /
                    180
            )
        );
        const longitudeRadius =
            options.radiusMeters /
            (METERS_PER_LONGITUDE_DEGREE * smallestLongitudeScale);

        for (let zoom = options.minLod; zoom <= options.maxLod; zoom++) {
            const minTx = longitudeToTileX(
                Math.min(start.lon, end.lon) - longitudeRadius,
                zoom
            );
            const maxTx = longitudeToTileX(
                Math.max(start.lon, end.lon) + longitudeRadius,
                zoom
            );
            const minTy = latitudeToTileY(
                Math.max(start.lat, end.lat) + latitudeRadius,
                zoom
            );
            const maxTy = latitudeToTileY(
                Math.min(start.lat, end.lat) - latitudeRadius,
                zoom
            );
            for (let tx = minTx; tx <= maxTx; tx++) {
                for (let ty = minTy; ty <= maxTy; ty++) {
                    const tile = { zoom, tx, ty };
                    if (
                        tileTouchesSegmentCorridor(
                            tile,
                            start,
                            end,
                            options.radiusMeters
                        )
                    ) {
                        tileKeys.add(`${zoom}/${tx}/${ty}`);
                        if (tileKeys.size > options.maxTiles) {
                            throw new CorridorPlanningError('too-large');
                        }
                    }
                }
            }
        }
    }

    const tiles = [...tileKeys]
        .map((key) => {
            const [zoom, tx, ty] = key.split('/').map(Number);
            return { zoom, tx, ty };
        })
        .sort((a, b) => a.zoom - b.zoom || a.tx - b.tx || a.ty - b.ty);
    return {
        schemaVersion: 1,
        routeId: route.id,
        radiusMeters: options.radiusMeters as 500 | 1_000 | 2_000,
        minLod: options.minLod,
        maxLod: options.maxLod,
        tiles,
        tileCount: tiles.length,
        estimatedSizeBytes: tiles.length * ESTIMATED_BYTES_PER_TILE,
    };
}

export async function measureCorridorCoverage(
    plan: RouteCorridorPlanV1,
    inspectTile: (tile: CorridorTileRef) => Promise<CorridorTileInspection>,
    concurrency = 8
): Promise<CorridorCoverageMeasurement> {
    if (!Number.isInteger(concurrency) || concurrency <= 0) {
        throw new CorridorPlanningError('invalid-options');
    }
    let nextIndex = 0;
    let coveredTileCount = 0;
    let sizeBytes = 0;
    const workers = Array.from(
        { length: Math.min(concurrency, Math.max(1, plan.tiles.length)) },
        async () => {
            while (nextIndex < plan.tiles.length) {
                const tile = plan.tiles[nextIndex++];
                const inspection = await inspectTile(tile);
                if (
                    !Number.isFinite(inspection.sizeBytes) ||
                    inspection.sizeBytes < 0
                ) {
                    throw new CorridorPlanningError('invalid-options');
                }
                sizeBytes += inspection.sizeBytes;
                if (inspection.covered) coveredTileCount++;
            }
        }
    );
    await Promise.all(workers);
    const requiredTileCount = plan.tiles.length;
    return {
        coveragePercent:
            requiredTileCount === 0
                ? 0
                : Math.round(
                      (coveredTileCount / requiredTileCount) * 100 * 10
                  ) / 10,
        coveredTileCount,
        requiredTileCount,
        sizeBytes,
    };
}
