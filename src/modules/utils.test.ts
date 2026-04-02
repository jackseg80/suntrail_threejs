import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isPositionInSwitzerland, isPositionInFrance, showToast, throttle } from './utils';

describe('utils.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        document.body.innerHTML = '<div id="toast-container"></div>';
    });

    describe('Geographical Detection', () => {
        it('should correctly identify Swiss coordinates', () => {
            expect(isPositionInSwitzerland(46.8, 8.2)).toBe(true);   // Suisse Centrale
            expect(isPositionInSwitzerland(46.95, 7.45)).toBe(true); // Berne
            expect(isPositionInSwitzerland(47.37, 8.54)).toBe(true); // Zürich
            expect(isPositionInSwitzerland(46.01, 8.96)).toBe(true); // Lugano (Tessin)
        });

        it('should reject coordinates outside Switzerland', () => {
            expect(isPositionInSwitzerland(45.5, 6.8)).toBe(false);  // Hors Suisse (Sud)
            expect(isPositionInSwitzerland(48.8, 2.3)).toBe(false);  // Paris
            expect(isPositionInSwitzerland(48.5, 9.0)).toBe(false);  // Allemagne (Baden-Württemberg)
        });

        it('should correctly identify French continental coordinates', () => {
            expect(isPositionInFrance(48.8, 2.3)).toBe(true);   // Paris
            expect(isPositionInFrance(44.8, -0.5)).toBe(true);  // Bordeaux
            expect(isPositionInFrance(43.3, 5.4)).toBe(true);   // Marseille
            expect(isPositionInFrance(48.58, 7.75)).toBe(true);  // Strasbourg (Alsace, lon < 8.3)
        });

        it('should correctly identify Corsica as French (v5.16.3)', () => {
            expect(isPositionInFrance(42.15, 9.1)).toBe(true);  // Corse (lat 41-43, lon 8.4-9.7)
            expect(isPositionInFrance(41.5, 9.0)).toBe(true);   // Corse sud
        });

        it('should reject coordinates outside France', () => {
            expect(isPositionInFrance(52.5, 13.4)).toBe(false);   // Berlin
            expect(isPositionInFrance(48.1, 8.5)).toBe(false);    // Forêt Noire (lon > 8.3, pas Corse)
            expect(isPositionInFrance(47.5, 9.0)).toBe(false);    // Schaffhausen zone (lon > 8.3, lat > 43.1)
        });

        it('limite est France continentale à 8.3°E — pas 9.6°E (v5.16.3)', () => {
            // Lauterbourg (frontière Rhin, 8.18°E) = France
            expect(isPositionInFrance(48.97, 8.18)).toBe(true);
            // Baden-Baden (8.24°E, Allemagne) — juste sous la limite mais lat > 51.1 ? Non, lat ~48.7
            expect(isPositionInFrance(48.76, 8.24)).toBe(true); // encore en France (<8.3)
            // Freiburg im Breisgau (7.85°E) — Allemagne mais dans la zone lon
            expect(isPositionInFrance(48.0, 7.85)).toBe(true); // lon < 8.3, lat dans bornes
        });
    });

    it('should show toast message', () => {
        showToast("Hello");
        const toast = document.querySelector('.toast');
        expect(toast).not.toBeNull();
        expect(toast?.textContent).toContain("Hello");
    });

    it('should throttle function calls', async () => {
        vi.useFakeTimers();
        const func = vi.fn();
        const throttled = throttle(func, 100);

        throttled();
        throttled();
        throttled();

        expect(func).toHaveBeenCalledTimes(1);
        
        vi.advanceTimersByTime(150);
        throttled();
        expect(func).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});
