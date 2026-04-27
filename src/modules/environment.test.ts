import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { initEnvironment, updateEnvironment } from './environment';
import { state } from './state';

describe('environment.ts — 3D Atmospheric Integrity', () => {
    let scene: THREE.Scene;

    beforeEach(() => {
        scene = new THREE.Scene();
        state.scene = scene;
        state.FOG_NEAR = 1000;
        state.FOG_FAR = 10000;
        state.SHADOWS = true;
    });

    it('initEnvironment should populate the scene with essential elements', () => {
        initEnvironment(scene);

        // 1. Fog
        expect(scene.fog).toBeInstanceOf(THREE.Fog);
        expect((scene.fog as THREE.Fog).color.getHex()).toBe(0x87CEEB);

        // 2. Lights
        const directionalLights = scene.children.filter(c => c instanceof THREE.DirectionalLight);
        const ambientLights = scene.children.filter(c => c instanceof THREE.AmbientLight);

        expect(directionalLights.length).toBe(1);
        expect(ambientLights.length).toBe(1);
        
        // 3. Sun target (vital for shadow direction)
        const hasSunTarget = scene.children.some(c => c === (directionalLights[0] as THREE.DirectionalLight).target);
        expect(hasSunTarget).toBe(true);

        // 4. Sky
        expect(state.sky).toBeDefined();
        expect(scene.children.some(c => c === state.sky)).toBe(true);
    });

    it('updateEnvironment should adjust fog based on altitude', () => {
        initEnvironment(scene);
        const fog = scene.fog as THREE.Fog;

        // Altitude basse
        updateEnvironment(100);
        const nearLow = fog.near;
        const farLow = fog.far;

        // Altitude haute
        updateEnvironment(5000);
        const nearHigh = fog.near;
        const farHigh = fog.far;

        // Le brouillard doit reculer (far augmente) et s'éclaircir (near diminue) avec l'altitude
        expect(nearHigh).toBeLessThan(nearLow);
        expect(farHigh).toBeGreaterThan(farLow);
    });

    it('should configure shadow properties correctly', () => {
        state.SHADOW_RES = 1024;
        initEnvironment(scene);
        const sun = state.sunLight!;

        expect(sun.castShadow).toBe(true);
        expect(sun.shadow.mapSize.x).toBe(1024);
        expect(sun.shadow.camera.near).toBe(100);
    });
});
