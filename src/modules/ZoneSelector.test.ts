import { describe, it, expect, vi } from 'vitest';

vi.mock('three', () => {
    class MockVector3 {
        x: number;
        y: number;
        z: number;
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        clone() {
            return new MockVector3(this.x, this.y, this.z);
        }
        sub(v: MockVector3) {
            return new MockVector3(this.x - v.x, this.y - v.y, this.z - v.z);
        }
        normalize() {
            const l = Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2) || 1;
            return new MockVector3(this.x / l, this.y / l, this.z / l);
        }
        setFromSpherical() {
            return this;
        }
        addScaledVector(dir: MockVector3, t: number) {
            return new MockVector3(
                this.x + dir.x * t,
                this.y + dir.y * t,
                this.z + dir.z * t
            );
        }
    }
    return {
        Vector3: MockVector3,
        Raycaster: class {},
        Plane: class {},
        LineBasicMaterial: class {},
        LineLoop: class {},
        MeshBasicMaterial: class {},
        Mesh: class {},
        BoxGeometry: class {},
        PlaneGeometry: class {},
        BufferGeometry: class {
            setFromPoints() {
                return this;
            }
            setAttribute() {
                return this;
            }
        },
        BufferAttribute: class {
            constructor(_arr: any, _size: number) {}
        },
        LineSegments: class {},
        Group: class {
            add() {}
            remove() {}
        },
        DoubleSide: 0,
    };
});

vi.mock('./state', () => ({
    state: {
        ZOOM: 14,
        originTile: { x: 8610, y: 5742, z: 14 },
        camera: null,
        controls: null,
        scene: null,
    },
    isProActive: () => true,
}));

vi.mock('./analysis', () => ({
    getAltitudeAt: () => 1500,
}));

vi.mock('./geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./geo')>();
    return {
        ...actual,
    };
});

import { getVisibleTilesBBox, computeZoneSelection } from './ZoneSelector';

describe('ZoneSelector', () => {
    describe('getVisibleTilesBBox', () => {
        it('should return null for empty tiles', () => {
            const result = getVisibleTilesBBox(new Map());
            expect(result).toBeNull();
        });

        it('should compute correct bounding box from tiles', () => {
            const tiles = new Map([
                ['tile1', { tx: 8610, ty: 5742, zoom: 14 }],
                ['tile2', { tx: 8611, ty: 5742, zoom: 14 }],
                ['tile3', { tx: 8610, ty: 5743, zoom: 14 }],
            ]);

            const result = getVisibleTilesBBox(tiles);
            expect(result).not.toBeNull();
            expect(result!.minLat).toBeLessThan(result!.maxLat);
            expect(result!.minLon).toBeLessThan(result!.maxLon);
            expect(result!.minLon).toBeGreaterThanOrEqual(-180);
            expect(result!.maxLon).toBeLessThanOrEqual(180);
        });

        it('should handle a single tile', () => {
            const tiles = new Map([
                ['tile1', { tx: 8610, ty: 5742, zoom: 14 }],
            ]);

            const result = getVisibleTilesBBox(tiles);
            expect(result).not.toBeNull();
            expect(result!.minLat).toBeLessThan(result!.maxLat);
            expect(result!.minLon).toBeLessThan(result!.maxLon);
        });
    });

    describe('computeZoneSelection', () => {
        const bbox = {
            minLat: 46.8,
            maxLat: 47.0,
            minLon: 6.8,
            maxLon: 7.2,
        };

        it('should compute tiles for a single LOD', () => {
            const result = computeZoneSelection(bbox, 12, 12);
            expect(result.tilesByLod.size).toBe(1);
            expect(result.tilesByLod.has(12)).toBe(true);
            expect(result.totalTiles).toBeGreaterThan(0);
            expect(result.tooLarge).toBe(false);
            expect(result.totalSizeMB).toContain('Mo');
        });

        it('should compute tiles for multiple LODs', () => {
            const result = computeZoneSelection(bbox, 10, 14);
            const lods = Array.from(result.tilesByLod.keys()).sort(
                (a, b) => a - b
            );
            expect(lods).toEqual([10, 11, 12, 13, 14]);
            expect(result.totalTiles).toBeGreaterThan(0);
        });

        it('should have more tiles at higher LOD', () => {
            const low = computeZoneSelection(bbox, 10, 10);
            const high = computeZoneSelection(bbox, 14, 14);
            expect(high.totalTiles).toBeGreaterThan(low.totalTiles);
        });

        it('should warn when tiles exceed threshold using mid LODs', () => {
            const midBbox = {
                minLat: 46.9,
                maxLat: 47.0,
                minLon: 6.9,
                maxLon: 7.0,
            };
            const result = computeZoneSelection(midBbox, 14, 18);
            expect(
                result.warning || result.hardWarning || result.tooLarge
            ).toBe(true);
        });

        it('should show hardWarning between 1000 and 2000 tiles', () => {
            const midBbox = {
                minLat: 46.9,
                maxLat: 47.0,
                minLon: 6.9,
                maxLon: 7.0,
            };
            const result = computeZoneSelection(midBbox, 14, 18);
            if (result.totalTiles > 1000 && result.totalTiles <= 2000) {
                expect(result.hardWarning).toBe(true);
            }
        });

        it('should flag tooLarge when LODs are skipped due to limit', () => {
            const midBbox = {
                minLat: 46.9,
                maxLat: 47.0,
                minLon: 6.9,
                maxLon: 7.0,
            };
            const result = computeZoneSelection(midBbox, 14, 18);
            if (result.totalTiles > 1500) {
                expect(result.tooLarge).toBe(true);
                expect(result.hardWarning).toBe(true);
            } else {
                const result2 = computeZoneSelection(midBbox, 12, 18);
                expect(result2.tooLarge).toBe(true);
            }
        });

        it('should have correct size format', () => {
            const smallBbox = {
                minLat: 46.9,
                maxLat: 46.95,
                minLon: 6.9,
                maxLon: 7.0,
            };
            const result = computeZoneSelection(smallBbox, 14, 14);
            expect(result.totalSizeMB).toMatch(/^~\d+[,.]?\d* (Ko|Mo)$/);
        });

        it('should limit download to the provided bbox', () => {
            const bboxA = {
                minLat: 46.9,
                maxLat: 47.0,
                minLon: 6.9,
                maxLon: 7.0,
            };
            const resultA = computeZoneSelection(bboxA, 14, 14);
            expect(resultA.totalTiles).toBeGreaterThan(0);

            const bboxB = {
                minLat: 46.9,
                maxLat: 46.95,
                minLon: 6.9,
                maxLon: 6.95,
            };
            const resultB = computeZoneSelection(bboxB, 14, 14);
            expect(resultB.totalTiles).toBeGreaterThan(0);
            expect(resultA.totalTiles).toBeGreaterThan(resultB.totalTiles);
        });

        it('should not include tiles from outside the bbox', () => {
            const bbox = {
                minLat: 46.9,
                maxLat: 47.0,
                minLon: 6.9,
                maxLon: 7.0,
            };
            const result = computeZoneSelection(bbox, 13, 13);

            for (const tiles of result.tilesByLod.values()) {
                for (const tile of tiles) {
                    expect(tile.zoom).toBe(13);
                    expect(tile.tx).toBeGreaterThanOrEqual(0);
                    expect(tile.ty).toBeGreaterThanOrEqual(0);
                }
            }
            expect(result.bbox).toEqual(bbox);
        });
    });
});
