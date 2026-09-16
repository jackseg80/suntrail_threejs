import { describe, it, expect } from 'vitest';
import {
    computeTrackFitDistance,
    FLYTO_CAMERA_DISTANCE_FACTOR,
} from './cameraFit';

const FOV = 45;

function angularRadius(
    targetDistance: number,
    width: number,
    depth: number,
    height: number
): number {
    const radius = 0.5 * Math.hypot(width, depth, height);
    const cameraDistance = targetDistance * FLYTO_CAMERA_DISTANCE_FACTOR;
    return Math.asin(Math.min(1, radius / cameraDistance));
}

function halfFov(fovDeg: number, aspect: number): number {
    const vFov = (fovDeg * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    return Math.min(vFov, hFov) / 2;
}

describe('computeTrackFitDistance', () => {
    it('augmente avec la taille du tracé', () => {
        const small = computeTrackFitDistance(1000, 1000, 0, 1.1, FOV, 1);
        const big = computeTrackFitDistance(5000, 5000, 0, 1.1, FOV, 1);
        expect(big).toBeGreaterThan(small);
    });

    it('cadre le tracé dans le FOV avec marge (portrait S23)', () => {
        const width = 4000;
        const depth = 3000;
        const height = 500;
        const aspect = 1080 / 2340; // portrait
        const distance = computeTrackFitDistance(
            width,
            depth,
            height,
            1.1,
            FOV,
            aspect
        );
        expect(angularRadius(distance, width, depth, height)).toBeLessThan(
            halfFov(FOV, aspect)
        );
    });

    it('demande plus de recul en portrait qu’en paysage', () => {
        const portrait = computeTrackFitDistance(3000, 3000, 0, 1.1, FOV, 0.46);
        const landscape = computeTrackFitDistance(
            3000,
            3000,
            0,
            1.1,
            FOV,
            2.16
        );
        expect(portrait).toBeGreaterThan(landscape);
    });

    it('renvoie 0 pour une taille nulle', () => {
        expect(computeTrackFitDistance(0, 0, 0, 1.1, FOV, 1)).toBe(0);
    });
});
