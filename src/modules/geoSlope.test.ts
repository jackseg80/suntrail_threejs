import { describe, it, expect } from 'vitest';

/**
 * Test de la logique de correction de latitude pour les pentes.
 * On simule la formule utilisée dans le worker.
 */
describe('Slope Latitude Correction', () => {
    const EARTH_CIRCUMFERENCE = 40075016.686;

    function getTileLatFactor(ty: number, zoom: number): number {
        const n = Math.pow(2, zoom);
        const yNorm = (ty + 0.5) / n;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm)));
        return Math.cos(latRad);
    }

    it('should have latFactor close to 1.0 at equator', () => {
        const zoom = 10;
        const equatorTy = Math.pow(2, zoom-1); // Milieu de la grille Y
        const factor = getTileLatFactor(equatorTy, zoom);
        expect(factor).toBeGreaterThan(0.99);
    });

    it('should have latFactor around 0.7 for Switzerland (lat 46°)', () => {
        // En Suisse (46°N), cos(46°) ≈ 0.694
        // On cherche le ty correspondant à 46°N
        // lat = atan(sinh(PI * (1 - 2 * yNorm)))
        // sinh(...) = tan(lat)
        // PI * (1 - 2 * yNorm) = asinh(tan(lat))
        // 1 - 2 * yNorm = asinh(tan(lat)) / PI
        // 2 * yNorm = 1 - asinh(tan(lat)) / PI
        const latRad = 46 * Math.PI / 180;
        const val = Math.log(Math.tan(latRad) + 1/Math.cos(latRad)); // asinh(tan(lat))
        const yNorm = (1 - val / Math.PI) / 2;
        
        const zoom = 14;
        const ty = Math.floor(yNorm * Math.pow(2, zoom));
        
        const factor = getTileLatFactor(ty, zoom);
        expect(factor).toBeCloseTo(0.694, 1);
    });

    it('should correctly adjust pixelSize based on latitude', () => {
        const zoom = 14;
        const width = 256;
        const equatorSize = EARTH_CIRCUMFERENCE / (1 << zoom);
        
        // Simulation Suisse ty=5815 @ Z14
        const tySwiss = 5815; 
        const factor = getTileLatFactor(tySwiss, zoom);
        const swissTileSize = equatorSize * factor;
        
        expect(swissTileSize).toBeLessThan(equatorSize * 0.8);
        expect(swissTileSize).toBeGreaterThan(equatorSize * 0.6);
    });
});
