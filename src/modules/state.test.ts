import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state, PRESETS } from './state';

describe('state.ts', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('should have a default TARGET_LAT and TARGET_LON (Suisse centroïde)', () => {
        expect(state.TARGET_LAT).toBe(46.8182);
        expect(state.TARGET_LON).toBe(8.2275);
    });

    it('should have initial three.js instances as null', () => {
        expect(state.scene).toBeNull();
        expect(state.camera).toBeNull();
        expect(state.renderer).toBeNull();
    });

    it('should have new performance parameters defined (v5.4.1)', () => {
        expect(state.VEGETATION_DENSITY).toBeDefined();
        expect(state.BUILDING_LIMIT).toBeDefined();
        expect(state.MAX_BUILDS_PER_CYCLE).toBeDefined();
        expect(state.LOAD_DELAY_FACTOR).toBeDefined();
    });

    it('should have battery optimization parameters defined (v4.5.52)', () => {
        expect(state.ENERGY_SAVER).toBe(false);
    });

    describe('PRESETS', () => {
        it('ultra — PC bureau / Snapdragon Elite : pleine qualité', () => {
            expect(PRESETS.ultra.RANGE).toBe(12);
            expect(PRESETS.ultra.RESOLUTION).toBe(256);
            expect(PRESETS.ultra.SHADOW_RES).toBe(4096);
            expect(PRESETS.ultra.VEGETATION_DENSITY).toBe(8000);
        });

        it('eco — vieux mobile : désactiver tous les détails', () => {
            expect(PRESETS.eco.SHOW_VEGETATION).toBe(false);
            expect(PRESETS.eco.SHOW_BUILDINGS).toBe(false);
            expect(PRESETS.eco.RANGE).toBe(3);
            expect(PRESETS.eco.MAX_ALLOWED_ZOOM).toBe(18);
        });

        it('balanced (STD) — Galaxy A53 : valeurs calibrées actuelles', () => {
            expect(PRESETS.balanced.RESOLUTION).toBe(64);             // v5.40.18: 96 -> 64 (Performance optimization)
            expect(PRESETS.balanced.RANGE).toBe(5);                  // v5.40.18: 4 -> 5 (Horizon optimization)
            expect(PRESETS.balanced.VEGETATION_DENSITY).toBe(1500);   // v5.21: 500 → 1500

            expect(PRESETS.balanced.WEATHER_DENSITY).toBe(1000);
        });

        it('performance (High) — Galaxy S23 : valeurs baked-in sans caps', () => {
            expect(PRESETS.performance.RESOLUTION).toBe(160);
            expect(PRESETS.performance.RANGE).toBe(6);
            expect(PRESETS.performance.SHADOW_RES).toBe(1024);
            expect(PRESETS.performance.MAX_BUILDS_PER_CYCLE).toBe(6); // v5.34.5: 4 → 6
            expect(PRESETS.performance.MAX_ALLOWED_ZOOM).toBe(18);
            expect(PRESETS.performance.POI_ZOOM_THRESHOLD).toBe(15);
        });

        it('should have POI_ZOOM_THRESHOLD at 15 for all non-eco presets', () => {
            expect(PRESETS.balanced.POI_ZOOM_THRESHOLD).toBe(15);
            expect(PRESETS.performance.POI_ZOOM_THRESHOLD).toBe(15);
            expect(PRESETS.ultra.POI_ZOOM_THRESHOLD).toBe(15);
        });
    });

    it('should have USE_WORKERS enabled by default (v5.0.1)', () => {
        expect(state.USE_WORKERS).toBe(true);
    });

    it('should have IS_2D_MODE enabled by default (v5.34.2)', () => {
        expect(state.IS_2D_MODE).toBe(true);
    });
});

import { saveSettings, loadSettings } from './state';

describe('state persistance (v5.7)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        state.MAP_SOURCE = 'swisstopo';
        state.PERFORMANCE_PRESET = 'balanced';
        state.SHOW_TRAILS = false;
        state.IS_2D_MODE = true;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should save and load basic settings', () => {
        state.MAP_SOURCE = 'satellite';
        state.SHOW_TRAILS = true;
        state.IS_2D_MODE = false;
        
        saveSettings();
        vi.advanceTimersByTime(300);
        
        state.MAP_SOURCE = 'opentopomap'; // change to something else
        state.SHOW_TRAILS = false;
        state.IS_2D_MODE = true;
        
        const loaded = loadSettings();
        expect(loaded).not.toBeNull();
        expect(loaded?.MAP_SOURCE).toBe('satellite');
        
        // Ensure state was modified
        expect(state.MAP_SOURCE).toBe('satellite');
        expect(state.SHOW_TRAILS).toBe(true);
        expect(state.IS_2D_MODE).toBe(false);
    });

    it('should save and restore last view coordinates and zoom (v5.34.2)', () => {
        state.TARGET_LAT = 45.0;
        state.TARGET_LON = 6.0;
        state.ZOOM = 14.5;
        
        saveSettings();
        vi.advanceTimersByTime(300);
        
        // Reset state
        state.TARGET_LAT = 0;
        state.TARGET_LON = 0;
        state.ZOOM = 6;
        
        loadSettings();
        
        expect(state.TARGET_LAT).toBe(45.0);
        expect(state.TARGET_LON).toBe(6.0);
        expect(state.ZOOM).toBe(14.5);
        expect(state.initialLat).toBe(45.0);
        expect(state.initialLon).toBe(6.0);
    });

    it('should return null and clear if data is corrupted', () => {
        localStorage.setItem('suntrail_settings', '{ invalid_json: ');
        
        const loaded = loadSettings();
        expect(loaded).toBeNull();
        expect(localStorage.getItem('suntrail_settings')).toBeNull();
    });

    it('should restore custom performance settings if preset is custom', () => {
        state.PERFORMANCE_PRESET = 'custom';
        state.RESOLUTION = 999;
        state.RANGE = 10;
        
        saveSettings();
        vi.advanceTimersByTime(300);
        
        state.RESOLUTION = 64; // Reset to default
        state.RANGE = 4;
        
        const loaded = loadSettings();
        expect(loaded?.PERFORMANCE_PRESET).toBe('custom');
        
        // Ensure state was properly modified
        expect(state.RESOLUTION).toBe(999);
        expect(state.RANGE).toBe(10);
    });

    it('should not override custom performance settings if preset is not custom', () => {
        state.PERFORMANCE_PRESET = 'balanced';
        state.RESOLUTION = 999; // even if set manually, balanced shouldn't use it on load
        
        saveSettings();
        vi.advanceTimersByTime(300);
        
        state.RESOLUTION = 64; // Reset
        
        const loaded = loadSettings();
        expect(loaded?.PERFORMANCE_PRESET).toBe('balanced');
        
        // loadSettings only restores these on 'custom', so it shouldn't modify state.RESOLUTION here
        expect(state.RESOLUTION).toBe(64);
    });

    describe('route planner state (v5.50.x)', () => {
        it('should have default route planner properties', () => {
            expect(state.ORS_KEY).toBe('');
            expect(state.routeWaypoints).toEqual([]);
            expect(state.routeLoading).toBe(false);
            expect(state.routeError).toBeNull();
            expect(state.activeRouteProfile).toBe('foot-hiking');
        });

        it('should allow adding route waypoints', () => {
            state.routeWaypoints = [
                { lat: 46.5, lon: 7.5 },
                { lat: 46.6, lon: 7.6 },
            ];
            expect(state.routeWaypoints.length).toBe(2);
            expect(state.routeWaypoints[0].lat).toBe(46.5);
        });

        it('should allow setting ORS key', () => {
            state.ORS_KEY = 'test-key-12345';
            expect(state.ORS_KEY).toBe('test-key-12345');
        });

        it('should allow changing route profile', () => {
            state.activeRouteProfile = 'foot-walking';
            expect(state.activeRouteProfile).toBe('foot-walking');
        });

        it('should track route loading and error states', () => {
            state.routeLoading = true;
            expect(state.routeLoading).toBe(true);
            state.routeError = 'Network error';
            expect(state.routeError).toBe('Network error');
            state.routeLoading = false;
            expect(state.routeLoading).toBe(false);
        });
    });
});
