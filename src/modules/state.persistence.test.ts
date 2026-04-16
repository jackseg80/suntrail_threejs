import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveLastView, state, loadSettings, CURRENT_SETTINGS_VERSION } from './state';
import * as THREE from 'three';

describe('Audit Persistance Vue (v5.29.6)', () => {
    beforeEach(() => {
        localStorage.clear();
        state.controls = { target: new THREE.Vector3(0, 0, 0) } as any;
        state.camera = new THREE.PerspectiveCamera();
        state.originTile = { x: 0, y: 0, z: 0 };
        state.ZOOM = 15;
        state.MAP_SOURCE = 'swisstopo';
        state.PERFORMANCE_PRESET = 'balanced';
        vi.useFakeTimers();
    });

    it('SHOULD save current target coordinates and zoom to localStorage after debounce', () => {
        saveLastView();
        
        // Faire avancer le temps pour déclencher le saveSettings()
        vi.advanceTimersByTime(400);
        
        const saved = JSON.parse(localStorage.getItem('suntrail_settings') || '{}');
        expect(saved.LAST_LAT).toBeDefined();
        expect(saved.LAST_LON).toBeDefined();
        expect(saved.LAST_ZOOM).toBe(15);
        expect(saved.version).toBe(CURRENT_SETTINGS_VERSION);
    });

    it('SHOULD restore view coordinates during loadSettings', () => {
        const settings = {
            version: CURRENT_SETTINGS_VERSION,
            MAP_SOURCE: 'swisstopo',
            PERFORMANCE_PRESET: 'balanced',
            LAST_LAT: 45.123,
            LAST_LON: 6.456,
            LAST_ZOOM: 12
        };
        localStorage.setItem('suntrail_settings', JSON.stringify(settings));

        loadSettings();

        expect(state.TARGET_LAT).toBe(45.123);
        expect(state.TARGET_LON).toBe(6.456);
        expect(state.ZOOM).toBe(12);
    });
});
