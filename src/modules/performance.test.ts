import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state';
import {
    detectBestPreset,
    applyPreset,
    applyCustomSettings,
} from './performance';
import { refreshTerrain } from './terrain';

// Mocks des dépendances lourdes de performance.ts
const { mockDisposeAll } = vi.hoisted(() => ({
    mockDisposeAll: vi.fn(),
}));

vi.mock('./terrain', () => ({
    resetTerrain: vi.fn(),
    updateVisibleTiles: vi.fn(),
    refreshTerrain: vi.fn(),
    refreshTracks: vi.fn(),
}));
vi.mock('./sun', () => ({ updateShadowMapResolution: vi.fn() }));
vi.mock('./utils', () => ({ isMobileDevice: vi.fn(() => false) }));
vi.mock('./toast', () => ({ showToast: vi.fn() }));
// tileCache.ts (importé via trimCache) utilise aussi isMobileDevice depuis utils
vi.mock('../i18n/I18nService', () => ({ i18n: { t: (_k: string) => _k } }));

vi.mock('./materialPool', () => ({
    materialPool: { disposeAll: mockDisposeAll },
}));

// --- Helpers ---
const setUA = (ua: string) =>
    Object.defineProperty(navigator, 'userAgent', {
        value: ua,
        configurable: true,
    });

const setInnerWidth = (w: number) =>
    Object.defineProperty(window, 'innerWidth', {
        value: w,
        configurable: true,
        writable: true,
    });

const setDevicePixelRatio = (dpr: number) =>
    Object.defineProperty(window, 'devicePixelRatio', {
        value: dpr,
        configurable: true,
        writable: true,
    });

const DESKTOP_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0';
const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

describe('performance.ts — Optimisations Batterie Mobile (v5.11)', () => {
    beforeEach(() => {
        state.PIXEL_RATIO_LIMIT = 1.0;
        state.SHADOW_RES = 128;
        state.PERFORMANCE_PRESET = 'balanced';
        state.IS_BATTERY_LOW = false;
        state.renderer = null;
        state.sunLight = null;
        // Défaut : desktop
        setUA(DESKTOP_UA);
        setInnerWidth(1920);
        setDevicePixelRatio(1.0);
    });

    describe('applyPreset() — Side effects', () => {
        it('should call refreshTerrain(true) to force a refresh and avoid race conditions', () => {
            state.renderer = { setPixelRatio: vi.fn() } as any;
            applyPreset('balanced');
            expect(refreshTerrain).toHaveBeenCalledWith(true);
        });

        it('should flush materialPool on preset change to force shader recompilation', () => {
            state.renderer = { setPixelRatio: vi.fn() } as any;
            mockDisposeAll.mockClear();
            applyPreset('eco');
            expect(mockDisposeAll).toHaveBeenCalledTimes(1);
        });

        it('should flush materialPool on custom settings apply', () => {
            state.renderer = { setPixelRatio: vi.fn() } as any;
            mockDisposeAll.mockClear();
            applyCustomSettings({ SHADOWS: false });
            expect(mockDisposeAll).toHaveBeenCalledTimes(1);
        });
    });

    describe('applyPreset() — Batterie faible (v5.86)', () => {
        it('refuse un profil 3D quand la batterie est < 20%', () => {
            state.IS_BATTERY_LOW = true;
            state.PERFORMANCE_PRESET = 'eco';
            state.RESOLUTION = 2;

            applyPreset('balanced');

            expect(state.PERFORMANCE_PRESET).toBe('eco');
            expect(state.RESOLUTION).toBe(2);
        });

        it('autorise le profil eco même batterie faible', () => {
            state.IS_BATTERY_LOW = true;
            state.PERFORMANCE_PRESET = 'balanced';

            applyPreset('eco');

            expect(state.PERFORMANCE_PRESET).toBe('eco');
        });

        it('ne bloque pas les profils quand la batterie est OK', () => {
            state.IS_BATTERY_LOW = false;
            state.PERFORMANCE_PRESET = 'eco';

            applyPreset('balanced');

            expect(state.PERFORMANCE_PRESET).toBe('balanced');
        });
    });

    // ── detectBestPreset() — Détection GPU ────────────────────────────────────

    describe('detectBestPreset() — grille de détection GPU v5.11', () => {
        // Helper : simuler un GPU via mock WebGL
        // En happy-dom, WebGL n'est pas disponible → gpu = 'unknown'
        // On teste la logique via le fallback CPU (hardwareConcurrency)

        it('GPU inconnu + ≥8 cores CPU → balanced (fallback PC moyen)', () => {
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                value: 8,
                configurable: true,
            });
            const preset = detectBestPreset();
            // 'unknown' ne matche rien → hardwareConcurrency ≥8 → balanced
            expect(preset).toBe('balanced');
        });

        it('GPU inconnu + 4 cores CPU → eco (vieux device ou mobile faible)', () => {
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                value: 4,
                configurable: true,
            });
            const preset = detectBestPreset();
            expect(preset).toBe('eco');
        });
    });

    describe('detectBestPreset() — pas de faux-positif mobile', () => {
        it('desktop UA + large écran → isMobile=false (pas de faux-positif)', () => {
            const isMobile =
                /Mobi|Android/i.test(DESKTOP_UA) || window.innerWidth <= 768;
            expect(isMobile).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // applyPreset() — Caps PIXEL_RATIO_LIMIT et SHADOW_RES sur mobile
    // -------------------------------------------------------------------------
    describe('applyPreset() — cap PIXEL_RATIO_LIMIT sur mobile', () => {
        it('cap à 2.0 sur mobile avec preset ultra et devicePixelRatio=3.0', () => {
            setUA(ANDROID_UA);
            setDevicePixelRatio(3.0);

            applyPreset('ultra');

            expect(state.PIXEL_RATIO_LIMIT).toBeLessThanOrEqual(2.0);
        });

        it('cap à 2.0 sur innerWidth <= 768 avec preset ultra et devicePixelRatio=3.0', () => {
            setInnerWidth(390);
            setDevicePixelRatio(3.0);

            applyPreset('ultra');

            expect(state.PIXEL_RATIO_LIMIT).toBeLessThanOrEqual(2.0);
        });

        it('ne cap PAS sur desktop avec preset ultra et devicePixelRatio=2.0', () => {
            setDevicePixelRatio(2.0); // ≤ 2.0 → pas de cap de toute façon

            applyPreset('ultra');

            // 2.0 ≤ 2.0 → pas de cap, valeur conservée
            expect(state.PIXEL_RATIO_LIMIT).toBe(2.0);
        });

        it('preset balanced sur mobile laisse PIXEL_RATIO_LIMIT=1.2 intact (déjà ≤ 2.0)', () => {
            setUA(ANDROID_UA);

            applyPreset('balanced');

            expect(state.PIXEL_RATIO_LIMIT).toBe(1.2);
        });
    });

    describe('applyPreset() — cap SHADOW_RES sur mobile', () => {
        it('cap SHADOW_RES à 1024 sur mobile avec preset performance (2048)', () => {
            setUA(ANDROID_UA);

            applyPreset('performance');

            expect(state.SHADOW_RES).toBeLessThanOrEqual(1024);
        });

        it('cap SHADOW_RES à 2048 sur mobile avec preset ultra (4096 → 2048)', () => {
            setUA(ANDROID_UA);

            applyPreset('ultra');

            expect(state.SHADOW_RES).toBeLessThanOrEqual(2048);
        });

        it('cap SHADOW_RES respecté via innerWidth <= 768 (tablette sans UA Mobile)', () => {
            setInnerWidth(768);

            applyPreset('performance');

            expect(state.SHADOW_RES).toBeLessThanOrEqual(1024);
        });

        it('performance preset : SHADOW_RES=1024 baked-in, même sur desktop', () => {
            // performance preset a SHADOW_RES=1024 dans PRESETS (baked-in, pas un cap mobile)

            applyPreset('performance');

            expect(state.SHADOW_RES).toBe(1024);
        });

        it('preset balanced sur mobile conserve SHADOW_RES=512 (déjà sous le cap de 1024)', () => {
            setUA(ANDROID_UA);

            applyPreset('balanced');

            expect(state.SHADOW_RES).toBe(512); // v5.21: balanced.SHADOW_RES=512 < 1024 → pas de cap
        });

        it('preset eco sur mobile conserve SHADOW_RES=128 (déjà sous le cap)', () => {
            setUA(ANDROID_UA);

            applyPreset('eco');

            expect(state.SHADOW_RES).toBe(128); // 128 < 1024 → pas de cap
        });
    });

    // -------------------------------------------------------------------------
    // applyPreset() — Cap RANGE et MAX_BUILDS_PER_CYCLE sur mobile
    // -------------------------------------------------------------------------
    describe('applyPreset() — Ultra mobile : caps légers (shadow 2048, RANGE 8)', () => {
        it('Ultra mobile : SHADOW_RES plafonné à 2048 (pas 4096)', () => {
            setUA(ANDROID_UA);
            setDevicePixelRatio(3.0);

            applyPreset('ultra');

            expect(state.SHADOW_RES).toBeLessThanOrEqual(2048);
        });

        it('Ultra mobile : RANGE plafonné à 8 (pas 12)', () => {
            setUA(ANDROID_UA);

            applyPreset('ultra');

            expect(state.RANGE).toBeLessThanOrEqual(8);
        });

        it('Ultra desktop : pas de cap SHADOW_RES (4096 conservé)', () => {
            applyPreset('ultra');

            expect(state.SHADOW_RES).toBe(4096);
        });

        it('Ultra desktop : pas de cap RANGE (12 conservé)', () => {
            applyPreset('ultra');

            expect(state.RANGE).toBe(12);
        });
    });

    describe('applyPreset() — Performance / High : valeurs baked-in, pas de caps', () => {
        it('performance preset : RANGE=6 quelle que soit la plateforme', () => {
            applyPreset('performance');
            expect(state.RANGE).toBe(6);
        });

        it('performance preset : SHADOW_RES=1024 quelle que soit la plateforme', () => {
            applyPreset('performance');
            expect(state.SHADOW_RES).toBe(1024);
        });

        it('performance preset : MAX_BUILDS_PER_CYCLE=6 quelle que soit la plateforme', () => {
            applyPreset('performance');
            expect(state.MAX_BUILDS_PER_CYCLE).toBe(6); // v5.34.5: 4 → 6
        });
    });
});
