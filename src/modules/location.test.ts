import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { state } from './state';
import {
    beginUserFollow,
    centerOnUser,
    setUserFollowViewport,
    updateUserMarker,
} from './location';

// Mock du contexte 2D pour JSDOM
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
})) as any;

// Mock de geo.ts
vi.mock('./geo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./geo')>();
    return {
        ...actual,
        lngLatToWorld: vi.fn((lon, lat) => ({ x: lon * 100, z: lat * 100 })),
    };
});

describe('location.ts', () => {
    beforeEach(() => {
        // Reset du state
        state.userLocation = null;
        state.userHeading = null;
        state.originTile = { x: 0, y: 0, z: 12 };

        // Mocks Three.js de base
        state.scene = new THREE.Scene();
        state.camera = new THREE.PerspectiveCamera();
        state.camera.position.set(0, 1000, 0);

        // Mock des controls (OrbitControls/MapControls)
        state.controls = {
            target: new THREE.Vector3(0, 0, 0),
            update: vi.fn(),
            getAzimuthalAngle: vi.fn(() => 0),
            minPolarAngle: 0,
            maxPolarAngle: Math.PI,
        } as any;

        state.userMarker = null;
        state.isFollowingUser = false;
        state.userSpeedMps = null;
        state.lastTrackingUpdate = 0;
        setUserFollowViewport('center');
    });

    describe('updateUserMarker', () => {
        it("should create a user marker if it doesn't exist", () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            updateUserMarker();

            expect(state.userMarker).not.toBeNull();
            expect(state.scene?.children).toContain(state.userMarker);
        });

        it('should update user marker position', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            updateUserMarker();
            const firstPos = state.userMarker!.position.clone();

            state.userLocation = { lat: 46, lon: 7, alt: 1100 };
            updateUserMarker();

            expect(state.userMarker!.position.x).not.toBe(firstPos.x);
            expect(state.userMarker!.position.z).not.toBe(firstPos.z);
        });
    });

    describe('centerOnUser', () => {
        it('should do nothing if location or controls are missing', () => {
            centerOnUser(0.016);
            expect(state.controls?.update).not.toHaveBeenCalled();
        });

        it('should move camera and target towards user location', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.lastTrackingUpdate = Date.now(); // Simuler un suivi actif

            const initialTarget = state.controls!.target.clone();
            const initialCamPos = state.camera!.position.clone();

            centerOnUser(0.1); // 100ms delta

            expect(state.controls!.target.x).not.toBe(initialTarget.x);
            expect(state.camera!.position.x).not.toBe(initialCamPos.x);
            expect(state.controls?.update).toHaveBeenCalled();
        });

        it('should rotate camera based on user heading', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.userHeading = 90; // Est
            state.userSpeedMps = 1;
            state.lastTrackingUpdate = Date.now() - 5000; // Pas initial

            // On place la caméra au sud de la cible
            state.camera!.position.set(0, 1500, 10);
            state.controls!.target.set(0, 0, 0);

            centerOnUser(0.1);

            // On s'attend à ce que la position X ou Z de la caméra ait changé pour s'aligner sur le heading
            expect(state.camera!.position.x).not.toBe(0);
        });

        it('keeps camera bearing fixed when the user turns while stationary', () => {
            state.userLocation = { lat: 46, lon: 7, alt: 1000 };
            state.userHeading = 120;
            state.userSpeedMps = 0;
            const target = new THREE.Vector3(700, 0, 4600);
            const orbit = new THREE.Vector3().setFromSpherical(
                new THREE.Spherical(1800, 0.8, Math.PI)
            );
            state.controls!.target.copy(target);
            state.camera!.position.copy(target).add(orbit);

            centerOnUser(1);

            const resultingTheta = new THREE.Spherical().setFromVector3(
                state.camera!.position.clone().sub(state.controls!.target)
            ).theta;
            expect(resultingTheta).toBeCloseTo(Math.PI, 6);
        });

        it('translates camera and target together when the GPS position moves', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            const target = new THREE.Vector3(600, 0, 4500);
            const orbit = new THREE.Vector3().setFromSpherical(
                new THREE.Spherical(1500, 0.8, Math.PI)
            );
            state.controls!.target.copy(target);
            state.camera!.position.copy(target).add(orbit);

            state.userLocation = { lat: 45, lon: 6.01, alt: 1000 };
            const previousTarget = state.controls!.target.clone();
            const previousCamera = state.camera!.position.clone();
            centerOnUser(0.1);

            const targetDelta = state
                .controls!.target.clone()
                .sub(previousTarget);
            const cameraDelta = state
                .camera!.position.clone()
                .sub(previousCamera);
            const resultingOrbit = state
                .camera!.position.clone()
                .sub(state.controls!.target);

            expect(cameraDelta.distanceTo(targetDelta)).toBeLessThan(0.000001);
            expect(resultingOrbit.distanceTo(orbit)).toBeLessThan(0.000001);
        });

        it('ignores small compass jitter while follow heading is settled', () => {
            state.userLocation = { lat: 46, lon: 7, alt: 1000 };
            state.userHeading = 0;
            state.userSpeedMps = 1;
            state.lastTrackingUpdate = Date.now() - 5000;
            const target = new THREE.Vector3(700, 0, 4600);
            const offset = new THREE.Vector3().setFromSpherical(
                new THREE.Spherical(1500, 0.8, Math.PI)
            );
            state.controls!.target.copy(target);
            state.camera!.position.copy(target).add(offset);

            centerOnUser(1 / 30);
            const settledTheta = new THREE.Spherical().setFromVector3(
                state.camera!.position.clone().sub(state.controls!.target)
            ).theta;
            state.userHeading = 8;
            centerOnUser(1 / 30);
            const jitterTheta = new THREE.Spherical().setFromVector3(
                state.camera!.position.clone().sub(state.controls!.target)
            ).theta;

            expect(jitterTheta).toBeCloseTo(settledTheta, 6);
        });

        it('should handle "isInitial" state with faster lerp and zoom adjustment', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.isFollowingUser = true;
            beginUserFollow();

            state.camera!.position.set(0, 10000, 0); // Très loin

            centerOnUser(0.5);

            // La distance devrait avoir significativement diminué
            const dist = state.camera!.position.distanceTo(
                state.controls!.target
            );
            expect(dist).toBeLessThan(10000);
        });

        it('does not restart camera initialization on every fresh GPS fix', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.isFollowingUser = true;
            beginUserFollow();

            const target = new THREE.Vector3(600, 0, 4500);
            state.controls!.target.copy(target);
            state
                .camera!.position.copy(target)
                .add(
                    new THREE.Vector3().setFromSpherical(
                        new THREE.Spherical(1500, 0.8, Math.PI)
                    )
                );
            centerOnUser(0.1); // consomme l'initialisation de cette session

            state.controls!.target.copy(target);
            state
                .camera!.position.copy(target)
                .add(
                    new THREE.Vector3().setFromSpherical(
                        new THREE.Spherical(1500, 1, Math.PI)
                    )
                );
            state.userHeading = 90;
            state.userSpeedMps = 1;
            state.lastTrackingUpdate = Date.now();
            centerOnUser(0.1);

            const spherical = new THREE.Spherical().setFromVector3(
                state.camera!.position.clone().sub(state.controls!.target)
            );
            expect(spherical.radius).toBeCloseTo(1500, 5);
            expect(spherical.phi).toBeCloseTo(1, 5);
        });

        it('converges follow distance to LOD 17', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.isFollowingUser = true;
            beginUserFollow();
            const target = new THREE.Vector3(600, 0, 4500);
            state.controls!.target.copy(target);
            state
                .camera!.position.copy(target)
                .add(
                    new THREE.Vector3().setFromSpherical(
                        new THREE.Spherical(7000, 0.8, Math.PI)
                    )
                );

            for (let index = 0; index < 120; index += 1) {
                centerOnUser(1 / 30);
            }

            const distance = state.camera!.position.distanceTo(
                state.controls!.target
            );
            expect(distance).toBeGreaterThan(1498);
            expect(distance).toBeLessThan(1502);
        });

        it('should move the follow target above the center for guidance', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.lastTrackingUpdate = Date.now();
            state.camera!.position.set(0, 1000, 700);
            state.camera!.lookAt(0, 0, 0);
            state.camera!.updateMatrixWorld();

            centerOnUser(0.1);
            const centeredTarget = state.controls!.target.clone();

            state.camera!.position.set(0, 1000, 700);
            state.camera!.lookAt(0, 0, 0);
            state.camera!.updateMatrixWorld();
            state.controls!.target.set(0, 0, 0);
            setUserFollowViewport('guidanceExpanded');
            centerOnUser(0.1);

            expect(
                state.controls!.target.distanceTo(centeredTarget)
            ).toBeGreaterThan(40);
            expect(
                state.controls!.target.distanceTo(centeredTarget)
            ).toBeLessThan(110);
        });

        it('should converge without oscillating for a stationary guidance position', () => {
            state.userLocation = { lat: 45, lon: 6, alt: 1000 };
            state.lastTrackingUpdate = Date.now();
            state.camera!.position.set(0, 1000, 700);
            state.camera!.lookAt(0, 0, 0);
            state.camera!.updateMatrixWorld();
            setUserFollowViewport('guidanceExpanded');

            for (let index = 0; index < 240; index += 1) {
                centerOnUser(1 / 60);
            }
            const settledTarget = state.controls!.target.clone();
            const settledCamera = state.camera!.position.clone();
            centerOnUser(1 / 60);

            expect(
                state.controls!.target.distanceTo(settledTarget)
            ).toBeLessThan(0.05);
            expect(
                state.camera!.position.distanceTo(settledCamera)
            ).toBeLessThan(0.05);
        });
    });
});
