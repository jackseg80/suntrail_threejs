import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { updateSunPosition } from './sun';
import { state } from './state';

describe('sun.ts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Mock DOM elements
        document.body.innerHTML = `
            <div id="time-disp"></div>
            <div id="az-val"></div>
            <div id="alt-val"></div>
            <div id="sun-needle"></div>
            <span id="sun-phase"></span>
            <div id="day-duration"></div>
            <div id="sunrise-disp"></div>
            <div id="sunset-disp"></div>
            <div id="moon-phase-disp"></div>
        `;

        // Mock state
        state.sunLight = new THREE.DirectionalLight();
        state.ambientLight = new THREE.AmbientLight();
        state.scene = new THREE.Scene();
        state.scene.fog = new THREE.FogExp2(0xffffff, 0.001);
        state.simDate = new Date('2026-03-21T12:00:00Z'); // Equinox
        state.TARGET_LAT = 46.6863;
        state.TARGET_LON = 7.6617;
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('should update the time display', () => {
        updateSunPosition(750); // 12h30
        const timeDisp = document.getElementById('time-disp');
        expect(timeDisp?.textContent).toBe('12:30');
    });

    it('should update sun phase to "Plein jour" at noon', () => {
        updateSunPosition(720); // 12h00
        const phaseSpan = document.getElementById('sun-phase');
        expect(phaseSpan?.textContent).toBe('☀️ Plein jour');
    });

    it('should update sun phase to "Nuit" at midnight', () => {
        updateSunPosition(0); // 00h00
        const phaseSpan = document.getElementById('sun-phase');
        expect(phaseSpan?.textContent).toBe('🌙 Nuit');
    });

    it('should update sunLight intensity based on time', () => {
        updateSunPosition(720); // Midi
        const noonIntensity = state.sunLight?.intensity || 0;
        
        updateSunPosition(0); // Minuit
        const midnightIntensity = state.sunLight?.intensity || 0;
        
        expect(noonIntensity).toBeGreaterThan(midnightIntensity);
    });

    it('should adapt shadow camera frustum to RANGE and ZOOM', () => {
        // Setup shadow camera with initial oversized bounds
        state.sunLight!.castShadow = true;
        state.sunLight!.shadow.camera.left = -50000;
        state.sunLight!.shadow.camera.right = 50000;
        state.sunLight!.shadow.camera.top = 50000;
        state.sunLight!.shadow.camera.bottom = -50000;
        state.SHADOWS = true;
        state.RANGE = 4;
        state.ZOOM = 14;
        state.controls = { target: new THREE.Vector3(0, 0, 0) } as any;

        updateSunPosition(720); // Midi

        const cam = state.sunLight!.shadow.camera;
        // tileSizeMeters at zoom 14 ≈ 40075000 / 2^14 ≈ 2446m
        // extent = max(2000, min(4 * 2446 * 0.8, 30000)) ≈ 7827
        expect(cam.right).toBeLessThan(50000);
        expect(cam.right).toBeGreaterThan(2000);
        expect(cam.right).toBeCloseTo(4 * (40075000 / Math.pow(2, 14)) * 0.8, -2);
        expect(cam.left).toBe(-cam.right);
        expect(cam.top).toBe(cam.right);
        expect(cam.bottom).toBe(-cam.right);
    });

    it('should clamp shadow camera extent to 30000 max', () => {
        state.sunLight!.castShadow = true;
        state.sunLight!.shadow.camera.right = 50000;
        state.SHADOWS = true;
        state.RANGE = 12; // ultra
        state.ZOOM = 6;   // vue très large — tileSize énorme
        state.controls = { target: new THREE.Vector3(0, 0, 0) } as any;

        updateSunPosition(720);

        expect(state.sunLight!.shadow.camera.right).toBeLessThanOrEqual(30000);
    });

    it('should not update shadow camera when SHADOWS is false', () => {
        state.sunLight!.castShadow = true;
        state.sunLight!.shadow.camera.right = 50000;
        state.SHADOWS = false;
        state.RANGE = 4;
        state.ZOOM = 14;
        state.controls = { target: new THREE.Vector3(0, 0, 0) } as any;

        updateSunPosition(720);

        expect(state.sunLight!.shadow.camera.right).toBe(50000); // unchanged
    });

    it('should handle NaN minutes gracefully', () => {
        const timeDisp = document.getElementById('time-disp');
        if (timeDisp) timeDisp.textContent = "Old Value";
        
        updateSunPosition(NaN);
        expect(timeDisp?.textContent).toBe('Old Value');
    });
});
