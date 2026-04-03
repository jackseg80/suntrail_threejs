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
            expect(PRESETS.eco.MAX_ALLOWED_ZOOM).toBe(14);
        });

        it('balanced (STD) — Galaxy A53 : valeurs calibrées actuelles', () => {
            expect(PRESETS.balanced.RESOLUTION).toBe(64);             // v5.21: 32 → 64 (meilleur rendu mid-range)
            expect(PRESETS.balanced.VEGETATION_DENSITY).toBe(1500);   // v5.21: 500 → 1500
            expect(PRESETS.balanced.WEATHER_DENSITY).toBe(1000);
        });

        it('performance (High) — Galaxy S23 : valeurs baked-in sans caps', () => {
            expect(PRESETS.performance.RESOLUTION).toBe(160);
            expect(PRESETS.performance.RANGE).toBe(6);
            expect(PRESETS.performance.SHADOW_RES).toBe(1024);
            expect(PRESETS.performance.MAX_BUILDS_PER_CYCLE).toBe(4); // v5.21: 2 → 4
            expect(PRESETS.performance.MAX_ALLOWED_ZOOM).toBe(18);
        });
    });

    it('should have USE_WORKERS enabled by default (v5.0.1)', () => {
        expect(state.USE_WORKERS).toBe(true);
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
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should save and load basic settings', () => {
        state.MAP_SOURCE = 'satellite';
        state.SHOW_TRAILS = true;
        
        saveSettings();
        vi.advanceTimersByTime(300);
        
        state.MAP_SOURCE = 'opentopomap'; // change to something else
        state.SHOW_TRAILS = false;
        
        const loaded = loadSettings();
        expect(loaded).not.toBeNull();
        expect(loaded?.MAP_SOURCE).toBe('satellite');
        
        // Ensure state was modified
        expect(state.MAP_SOURCE).toBe('satellite');
        expect(state.SHOW_TRAILS).toBe(true);
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
});
