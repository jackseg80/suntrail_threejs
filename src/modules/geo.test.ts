import { describe, it, expect } from 'vitest';
import { lngLatToWorld, worldToLngLat, lngLatToTile, getTileBounds, isPositionInSwitzerland, isPositionInFrance, isPositionInItaly, haversineDistance } from './geo';

describe('Module Géo (geo.ts)', () => {
    const originTile = { x: 4270, y: 2891, z: 13 }; // Spiez, Suisse

    describe('Geographical Detection', () => {
        it('should correctly identify Swiss coordinates', () => {
            expect(isPositionInSwitzerland(46.8, 8.2)).toBe(true);   // Suisse Centrale
            expect(isPositionInSwitzerland(46.95, 7.45)).toBe(true); // Berne
            expect(isPositionInSwitzerland(47.37, 8.54)).toBe(true); // Zürich
            expect(isPositionInSwitzerland(46.01, 8.96)).toBe(true); // Lugano (Tessin)
        });

        it('should reject coordinates outside Switzerland', () => {
            expect(isPositionInSwitzerland(48.8, 2.3)).toBe(false);  // Paris
            expect(isPositionInSwitzerland(48.5, 9.0)).toBe(false);  // Allemagne (Baden-Württemberg)
        });

        it('should correctly identify French continental coordinates', () => {
            expect(isPositionInFrance(48.8, 2.3)).toBe(true);   // Paris
            expect(isPositionInFrance(44.8, -0.5)).toBe(true);  // Bordeaux
            expect(isPositionInFrance(43.3, 5.4)).toBe(true);   // Marseille
        });

        it('should correctly identify Corsica as French (v5.16.3)', () => {
            expect(isPositionInFrance(42.15, 9.1)).toBe(true);  // Corse
            expect(isPositionInFrance(41.5, 9.0)).toBe(true);   // Corse sud
        });

        it('should correctly identify Italy (v5.35.2)', () => {
            expect(isPositionInItaly(41.9, 12.5)).toBe(true);    // Rome
            expect(isPositionInItaly(45.46, 9.18)).toBe(true);   // Milan
            expect(isPositionInItaly(45.73, 7.34)).toBe(true);   // Aoste
            expect(isPositionInItaly(37.5, 15.0)).toBe(true);    // Sicile
            expect(isPositionInItaly(40.1, 9.0)).toBe(true);     // Sardaigne
        });

        it('should correctly separate France and Italy at 7.1°E', () => {
            // Aoste (7.34E, 45.73N) est en Italie, pas en France ni en Suisse (v5.35.2)
            expect(isPositionInItaly(45.73, 7.34)).toBe(true);
            expect(isPositionInSwitzerland(45.73, 7.34)).toBe(false);
            expect(isPositionInFrance(45.73, 7.34)).toBe(false);

            // Chamonix (6.86E, 45.92N) est en France et en Italie (overlap de sécurité)
            expect(isPositionInFrance(45.92, 6.86)).toBe(true);
            expect(isPositionInItaly(45.92, 6.86)).toBe(true); 
        });

        it('should reject coordinates outside Italy', () => {
            expect(isPositionInItaly(48.8, 2.3)).toBe(false);   // Paris
            expect(isPositionInItaly(52.5, 13.4)).toBe(false);  // Berlin
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

    it('worldToLngLat devrait être l\'inverse de lngLatToWorld', () => {
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
        // Spiez est à environ 46.68, 7.66
        expect(bounds.south).toBeLessThan(46.6863);
        expect(bounds.north).toBeGreaterThan(46.6863);
    });

    it('lngLatToWorld à l\'origine devrait être proche de 0,0', () => {
        // Le centre de la tuile d'origine
        const n = Math.pow(2, originTile.z);
        const lon = (originTile.x + 0.5) / n * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (originTile.y + 0.5) / n)));
        const lat = latRad * 180 / Math.PI;

        const world = lngLatToWorld(lon, lat, originTile);
        expect(world.x).toBeCloseTo(0, 1);
        expect(world.z).toBeCloseTo(0, 1);
    });

    describe('Haversine Distance', () => {
        it('should calculate distance correctly between Paris and Lyon', () => {
            const paris = { lat: 48.8566, lon: 2.3522 };
            const lyon = { lat: 45.7640, lon: 4.8357 };
            const dist = haversineDistance(paris.lat, paris.lon, lyon.lat, lyon.lon);
            // ~391km
            expect(dist).toBeGreaterThan(390);
            expect(dist).toBeLessThan(393);
        });

        it('should return 0 for same points', () => {
            const dist = haversineDistance(46.0, 7.0, 46.0, 7.0);
            expect(dist).toBe(0);
        });
    });
});

