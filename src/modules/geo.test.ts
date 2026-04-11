import { describe, it, expect } from 'vitest';
import { lngLatToWorld, worldToLngLat, lngLatToTile, getTileBounds, perpendicularDistance, ramerDouglasPeucker } from './geo';

describe('Module Géo (geo.ts)', () => {
    const originTile = { x: 4270, y: 2891, z: 13 }; // Spiez, Suisse

    it('should correctly calculate perpendicular distance', () => {
        const start = { x: 0, z: 0 };
        const end = { x: 10, z: 0 };
        const pt = { x: 5, z: 5 };
        expect(perpendicularDistance(pt, start, end)).toBe(5);

        const pt2 = { x: 5, z: -3 };
        expect(perpendicularDistance(pt2, start, end)).toBe(3);
    });

    it('should simplify points using RDP algorithm', () => {
        const points = [
            { x: 0, z: 0 },
            { x: 1, z: 0.1 },
            { x: 2, z: -0.1 },
            { x: 3, z: 5 }, // Spike
            { x: 4, z: 0 },
            { x: 5, z: 0 }
        ];
        
        // With small epsilon, should keep the spike
        const simplified1 = ramerDouglasPeucker(points, 0.5);
        expect(simplified1.length).toBeGreaterThan(2);
        expect(simplified1.some(p => p.z === 5)).toBe(true);

        // With large epsilon, should simplify to start/end
        const simplified2 = ramerDouglasPeucker(points, 10);
        expect(simplified2.length).toBe(2);
        expect(simplified2[0]).toEqual({ x: 0, z: 0 });
        expect(simplified2[1]).toEqual({ x: 5, z: 0 });
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
});
