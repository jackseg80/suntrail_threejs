import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { state } from './state';
import {
    beginUserFollow,
    clearUserMarker,
    centerOnUser,
    setUserFollowViewport,
} from './location';
import { lngLatToWorld } from './geo';

const terrain = vi.hoisted(() => ({ altitude: 0 as number | null }));
vi.mock('./analysis', () => ({ getTerrainAltitudeAt: () => terrain.altitude }));

describe('follow camera with real MapControls', () => {
    let camera: THREE.PerspectiveCamera;
    let controls: MapControls;

    function frames(count = 360) {
        for (let frame = 0; frame < count; frame++) centerOnUser(1 / 30);
        camera.updateMatrixWorld();
    }

    beforeEach(() => {
        clearUserMarker();
        terrain.altitude = 0;
        state.originTile = { x: 65536, y: 65536, z: 17 };
        state.userLocation = { lat: 0, lon: 0, alt: 0 };
        state.userSpeedMps = 0;
        state.userHeading = null;
        state.IS_2D_MODE = false;
        state.ZOOM = 17;
        state.isFollowingUser = true;
        state.isTiltTransitioning = false;
        camera = new THREE.PerspectiveCamera(45, 1080 / 2400, 10, 4000000);
        controls = new MapControls(camera, document.createElement('canvas'));
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.minDistance = 100;
        controls.maxDistance = 4000000;
        controls.minPolarAngle = 0.05;
        controls.maxPolarAngle = 0.5;
        const gps = lngLatToWorld(0, 0, state.originTile);
        controls.target.set(gps.x, 0, gps.z);
        camera.position
            .copy(controls.target)
            .add(
                new THREE.Vector3().setFromSpherical(
                    new THREE.Spherical(1500, 0.5, 0)
                )
            );
        controls.update();
        state.camera = camera;
        state.controls = controls;
        setUserFollowViewport('guidanceExpanded');
        beginUserFollow();
    });

    afterEach(() => {
        controls.dispose();
        state.camera = null;
        state.controls = null;
        state.isFollowingUser = false;
        state.isTiltTransitioning = false;
        setUserFollowViewport();
    });

    it('settles with the GPS marker visible above the panel', () => {
        frames();
        const settled = camera.position.clone();
        frames(60);
        expect(camera.position.distanceTo(settled)).toBeLessThan(0.01);
        const gps = lngLatToWorld(0, 0, state.originTile);
        const projected = new THREE.Vector3(
            gps.x,
            terrain.altitude ?? 0,
            gps.z
        ).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(0.1);
        expect(projected.y).toBeGreaterThan(0);
        expect(projected.y).toBeLessThan(0.8);
    });

    it('completes the 2D to 3D transition while following', () => {
        state.IS_2D_MODE = true;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = 0;
        controls.update();
        frames();
        state.IS_2D_MODE = false;
        state.isTiltTransitioning = true;
        frames();
        expect(controls.getPolarAngle()).toBeGreaterThan(0.2);
        expect(state.isTiltTransitioning).toBe(false);
    });

    it('finishes its initial tilt when follow starts from a vertical camera', () => {
        camera.position
            .copy(controls.target)
            .add(new THREE.Vector3(0, 1500, 0));
        controls.minPolarAngle = 0;
        controls.update();
        frames();
        expect(controls.getPolarAngle()).toBeCloseTo(0.5, 2);
        expect(state.isTiltTransitioning).toBe(false);
    });

    it('completes the 3D to 2D transition while following', () => {
        frames();
        state.IS_2D_MODE = true;
        state.isTiltTransitioning = true;
        frames();
        expect(controls.getPolarAngle()).toBeLessThan(0.005);
        expect(state.isTiltTransitioning).toBe(false);
    });

    it.each([18000, 700000])(
        'settles follow from a high 2D viewpoint (%i units)',
        (distance) => {
            controls.target.add(new THREE.Vector3(5000, 0, 3000));
            camera.position
                .copy(controls.target)
                .add(new THREE.Vector3(0, distance, 0));
            controls.minPolarAngle = 0;
            controls.maxPolarAngle = 0;
            controls.update();
            state.IS_2D_MODE = false;
            state.isTiltTransitioning = true;
            beginUserFollow();
            for (let frame = 0; frame < 600; frame++) {
                const radius = controls.getDistance();
                state.ZOOM =
                    radius > 350000
                        ? 9
                        : radius > 22000
                          ? 12
                          : radius > 1800
                            ? 14
                            : 17;
                centerOnUser(1 / 30);
            }
            camera.updateMatrixWorld();
            expect(Math.abs(controls.getDistance() - 1500)).toBeLessThan(1.01);
            expect(controls.getPolarAngle()).toBeCloseTo(0.5, 2);
            expect(state.isTiltTransitioning).toBe(false);
            const gps = lngLatToWorld(0, 0, state.originTile);
            const projected = new THREE.Vector3(gps.x, 0, gps.z).project(
                camera
            );
            expect(Math.abs(projected.x)).toBeLessThan(0.01);
            expect(projected.y).toBeGreaterThan(0);
            expect(projected.y).toBeLessThan(0.8);
        }
    );

    it('settles after delayed terrain arrives without changing the GPS', () => {
        frames();
        const gpsBefore = { ...state.userLocation };
        terrain.altitude = 1200;
        frames();
        const settled = camera.position.clone();
        frames(60);
        expect(camera.position.distanceTo(settled)).toBeLessThan(0.01);
        expect(controls.target.y).toBeCloseTo(1200, 4);
        expect(state.userLocation).toEqual(gpsBefore);
    });

    it('holds camera height across missing LOD tiles, but accepts real sea level', () => {
        terrain.altitude = 1200;
        frames();
        const gpsBefore = { ...state.userLocation };
        const settled = camera.position.clone();
        terrain.altitude = null;
        frames();
        expect(controls.target.y).toBeCloseTo(1200, 4);
        expect(camera.position.distanceTo(settled)).toBeLessThan(0.01);
        terrain.altitude = 0;
        frames();
        expect(controls.target.y).toBeCloseTo(0, 4);
        expect(state.userLocation).toEqual(gpsBefore);
    });
});
