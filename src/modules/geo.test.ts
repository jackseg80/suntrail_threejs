import { describe, it, expect } from 'vitest';
import {
    lngLatToWorld,
    worldToLngLat,
    lngLatToTile,
    getTileBounds,
    isPositionInSwitzerland,
    isPositionInFrance,
    isPositionInItaly,
    haversineDistance,
    isPointInPolygon,
    isPointInCountry,
    isTileInCountry,
    isTileInSwitzerland,
    isTileInSwitzerlandStrict,
    countPointsInCountry,
} from './geo';

describe('Module Géo (geo.ts)', () => {
    const originTile = { x: 4270, y: 2891, z: 13 }; // Spiez, Suisse

    describe('Point-in-Polygon', () => {
        it('should return true for a point inside a simple square', () => {
            const square: number[][] = [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
            ];
            expect(isPointInPolygon(5, 5, square)).toBe(true);
            expect(isPointInPolygon(-1, 5, square)).toBe(false);
            expect(isPointInPolygon(5, -1, square)).toBe(false);
            expect(isPointInPolygon(11, 5, square)).toBe(false);
        });

        it('should handle points near the boundary', () => {
            const square: number[][] = [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
            ];
            // (0.0001, 5) est juste à droite du bord gauche → inside
            expect(isPointInPolygon(0.0001, 5, square)).toBe(true);
            // (-0.0001, 5) est clairement outside
            expect(isPointInPolygon(-0.0001, 5, square)).toBe(false);
        });
    });

    describe('isPointInCountry', () => {
        it('should use fast BBox reject for points far outside CH', () => {
            expect(isPointInCountry(48.8, 2.3, 'CH')).toBe(false); // Paris
            expect(isPointInCountry(40.0, 14.0, 'CH')).toBe(false); // Mediterranean
        });

        it('should return false for unknown country code', () => {
            expect(isPointInCountry(46.9, 7.4, 'XX')).toBe(false);
            expect(isPointInCountry(46.9, 7.4, '')).toBe(false);
        });
    });

    describe('Geographical Detection', () => {
        it('should correctly identify Swiss coordinates (polygon)', () => {
            expect(isPositionInSwitzerland(46.8, 8.2)).toBe(true); // Suisse Centrale
            expect(isPositionInSwitzerland(46.95, 7.45)).toBe(true); // Berne
            expect(isPositionInSwitzerland(47.37, 8.54)).toBe(true); // Zürich
            expect(isPositionInSwitzerland(46.01, 8.96)).toBe(true); // Lugano (Tessin)
            expect(isPositionInSwitzerland(45.835, 9.03)).toBe(true); // Chiasso (sud Tessin — v5.40.50 polygon)
        });

        it('should reject coordinates outside Switzerland', () => {
            expect(isPositionInSwitzerland(48.8, 2.3)).toBe(false); // Paris
            expect(isPositionInSwitzerland(48.5, 9.0)).toBe(false); // Allemagne (Baden-Württemberg)
            expect(isPositionInSwitzerland(47.9, 7.25)).toBe(false); // Issenheim (Alsace) — v5.40.50
            expect(isPositionInSwitzerland(45.73, 7.34)).toBe(false); // Aoste (Italie)
            expect(isPositionInSwitzerland(45.92, 6.86)).toBe(false); // Chamonix (France)
        });

        it('should correctly identify French continental coordinates', () => {
            expect(isPositionInFrance(48.8, 2.3)).toBe(true); // Paris
            expect(isPositionInFrance(44.8, -0.5)).toBe(true); // Bordeaux
            expect(isPositionInFrance(43.3, 5.4)).toBe(true); // Marseille
            expect(isPositionInFrance(47.9, 7.25)).toBe(true); // Issenheim (Alsace)
        });

        it('should correctly identify Corsica as French (v5.16.3)', () => {
            expect(isPositionInFrance(42.15, 9.1)).toBe(true); // Corse
            expect(isPositionInFrance(41.5, 9.0)).toBe(true); // Corse sud
        });

        it('should correctly identify Italy (v5.35.2)', () => {
            expect(isPositionInItaly(41.9, 12.5)).toBe(true); // Rome
            expect(isPositionInItaly(45.46, 9.18)).toBe(true); // Milan
            expect(isPositionInItaly(45.73, 7.34)).toBe(true); // Aoste
            expect(isPositionInItaly(37.5, 15.0)).toBe(true); // Sicile
            expect(isPositionInItaly(40.1, 9.0)).toBe(true); // Sardaigne
        });

        it('should correctly separate France and Italy at the Alpine border', () => {
            expect(isPositionInItaly(45.73, 7.34)).toBe(true);
            expect(isPositionInSwitzerland(45.73, 7.34)).toBe(false);
            expect(isPositionInFrance(45.73, 7.34)).toBe(false);

            expect(isPositionInFrance(45.92, 6.86)).toBe(true);
            expect(isPositionInItaly(45.92, 6.86)).toBe(false);
        });

        it('should reject coordinates outside Italy', () => {
            expect(isPositionInItaly(48.8, 2.3)).toBe(false); // Paris
            expect(isPositionInItaly(52.5, 13.4)).toBe(false); // Berlin
        });
    });

    describe('Tile-in-Country (multi-point check)', () => {
        it('isTileInCountry should detect a tile fully in CH (5/5)', () => {
            // Coords around Bern — well inside CH
            const tile = lngLatToTile(7.45, 46.95, 13);
            expect(isTileInCountry(tile.x, tile.y, tile.z, 'CH', 3)).toBe(true);
            expect(isTileInCountry(tile.x, tile.y, tile.z, 'CH', 5)).toBe(true);
        });

        it('isTileInCountry should return false for a tile fully outside CH', () => {
            // Paris tile
            const tile = lngLatToTile(2.35, 48.86, 13);
            expect(isTileInCountry(tile.x, tile.y, tile.z, 'CH', 3)).toBe(
                false
            );
            expect(isTileInCountry(tile.x, tile.y, tile.z, 'CH', 5)).toBe(
                false
            );
        });

        it('isTileInSwitzerland vs isTileInSwitzerlandStrict for Issenheim border', () => {
            // Issenheim (~47.90°N, ~7.25°E) — à la frontière CH/FR
            const tile12 = lngLatToTile(7.25, 47.9, 12);
            const tile14 = lngLatToTile(7.25, 47.9, 14);

            // Ni LOD 12 ni LOD 14 ne devraient être classifiés CH
            expect(isTileInSwitzerland(tile12.x, tile12.y, 12)).toBe(false);
            expect(isTileInSwitzerlandStrict(tile12.x, tile12.y, 12)).toBe(
                false
            );
            expect(isTileInSwitzerland(tile14.x, tile14.y, 14)).toBe(false);
            expect(isTileInSwitzerlandStrict(tile14.x, tile14.y, 14)).toBe(
                false
            );
        });

        it('should produce consistent results across relevant LODs for same location', () => {
            // LODs 11+ where polygon check is actually used (zoom ≤ 10 uses OpenTopoMap unconditionally)
            for (const z of [11, 12, 13, 14, 15, 16]) {
                const tile = lngLatToTile(8.54, 47.37, z);
                expect(isTileInSwitzerland(tile.x, tile.y, z)).toBe(true);
                expect(isTileInSwitzerlandStrict(tile.x, tile.y, z)).toBe(true);
            }
        });

        it('isTileInCountry with unknown country returns false', () => {
            expect(isTileInCountry(4270, 2891, 13, 'XX', 3)).toBe(false);
        });

        it('countPointsInCountry should return 5/5 for central CH tile', () => {
            const tile = lngLatToTile(8.54, 47.37, 13);
            expect(countPointsInCountry(tile.x, tile.y, 13, 'CH')).toBe(5);
        });

        it('countPointsInCountry should return 0 for tile far outside CH', () => {
            const tile = lngLatToTile(2.3, 48.8, 13);
            expect(countPointsInCountry(tile.x, tile.y, 13, 'CH')).toBe(0);
        });

        it('countPointsInCountry should return 0 for unknown country code', () => {
            const tile = lngLatToTile(8.54, 47.37, 13);
            expect(countPointsInCountry(tile.x, tile.y, 13, 'XX')).toBe(0);
        });
    });

    it('lngLatToTile devrait retourner les bonnes coordonnées pour Spiez', () => {
        const coords = lngLatToTile(7.6617, 46.6863, 13);
        expect(coords.x).toBe(4270);
        expect(coords.y).toBe(2891);
    });

    it('lngLatToTile devrait retourner (0,0) pour Greenwich au zoom 0', () => {
        const coords = lngLatToTile(0, 0, 0);
        expect(coords.x).toBe(0);
        expect(coords.y).toBe(0);
    });

    it("worldToLngLat devrait être l'inverse de lngLatToWorld", () => {
        const lon = 7.6617;
        const lat = 46.6863;

        const world = lngLatToWorld(lon, lat, originTile);
        const result = worldToLngLat(world.x, world.z, originTile);

        expect(result.lon).toBeCloseTo(lon, 5);
        expect(result.lat).toBeCloseTo(lat, 5);
    });

    it('getTileBounds devrait calculer des bornes cohérentes', () => {
        const bounds = getTileBounds({ zoom: 13, tx: 4270, ty: 2891 });
        expect(bounds.north).toBeGreaterThan(bounds.south);
        expect(bounds.east).toBeGreaterThan(bounds.west);
        expect(bounds.south).toBeLessThan(46.6863);
        expect(bounds.north).toBeGreaterThan(46.6863);
    });

    it("lngLatToWorld à l'origine devrait être proche de 0,0", () => {
        const n = Math.pow(2, originTile.z);
        const lon = ((originTile.x + 0.5) / n) * 360 - 180;
        const latRad = Math.atan(
            Math.sinh(Math.PI * (1 - (2 * (originTile.y + 0.5)) / n))
        );
        const lat = (latRad * 180) / Math.PI;

        const world = lngLatToWorld(lon, lat, originTile);
        expect(world.x).toBeCloseTo(0, 1);
        expect(world.z).toBeCloseTo(0, 1);
    });

    describe('Haversine Distance', () => {
        it('should calculate distance correctly between Paris and Lyon', () => {
            const paris = { lat: 48.8566, lon: 2.3522 };
            const lyon = { lat: 45.764, lon: 4.8357 };
            const dist = haversineDistance(
                paris.lat,
                paris.lon,
                lyon.lat,
                lyon.lon
            );
            expect(dist).toBeGreaterThan(390);
            expect(dist).toBeLessThan(393);
        });

        it('should return 0 for same points', () => {
            const dist = haversineDistance(46.0, 7.0, 46.0, 7.0);
            expect(dist).toBe(0);
        });
    });
});
