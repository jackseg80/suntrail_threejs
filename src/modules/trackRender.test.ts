import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
    detectSelfOverlap,
    offsetPolylineForSelfOverlap,
    buildDirectionChevrons,
} from './trackRender';

function outAndBack(limit = 100, step = 10): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let x = 0; x <= limit; x += step)
        points.push(new THREE.Vector3(x, 0, 0));
    for (let x = limit - step; x >= 0; x -= step)
        points.push(new THREE.Vector3(x, 0, 0));
    return points;
}

function straight(n = 12): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) points.push(new THREE.Vector3(i * 10, 0, 0));
    return points;
}

describe('detectSelfOverlap', () => {
    it('détecte un aller-retour sur la même trace', () => {
        expect(detectSelfOverlap(outAndBack())).toBe(true);
    });

    it('ne détecte pas une trace simple', () => {
        expect(detectSelfOverlap(straight())).toBe(false);
    });

    it('ne détecte pas deux passages éloignés (au-delà du seuil)', () => {
        const points: THREE.Vector3[] = [];
        for (let x = 0; x <= 100; x += 10)
            points.push(new THREE.Vector3(x, 0, 0));
        for (let x = 100; x >= 0; x -= 10)
            points.push(new THREE.Vector3(x, 0, 30)); // retour à 30 m
        expect(detectSelfOverlap(points)).toBe(false);
    });
});

describe('offsetPolylineForSelfOverlap', () => {
    it('sépare l’aller et le retour de part et d’autre', () => {
        const points = outAndBack(100, 10);
        const offset = 5;
        const shifted = offsetPolylineForSelfOverlap(points, offset);
        // Aller index 5 (x=50, direction +x) et retour à x=50
        const outbound = shifted[5];
        const returnIdx = points.findIndex((p, i) => i > 10 && p.x === 50);
        const inbound = shifted[returnIdx];
        expect(outbound.z).toBeCloseTo(-offset, 4);
        expect(inbound.z).toBeCloseTo(offset, 4);
        expect(Math.abs(outbound.z - inbound.z)).toBeCloseTo(2 * offset, 4);
    });

    it('renvoie la même référence si offset nul', () => {
        const points = straight();
        expect(offsetPolylineForSelfOverlap(points, 0)).toBe(points);
    });

    it('annule le décalage au demi-tour', () => {
        const points = outAndBack(100, 10);
        const shifted = offsetPolylineForSelfOverlap(points, 5);
        const turnaroundIndex = 10; // x=100
        expect(shifted[turnaroundIndex].z).toBeCloseTo(0, 4);
    });
});

describe('buildDirectionChevrons', () => {
    it('génère des chevrons clairs et sombres au même nombre', () => {
        const points = straight(12); // longueur 110
        const { light, dark } = buildDirectionChevrons(points, {
            size: 5,
            spacing: 30,
            lift: 1,
        });
        expect(light.length).toBeGreaterThan(0);
        expect(light.length).toBe(dark.length);
        // 3 sommets (9 nombres) par chevron
        expect(light.length % 9).toBe(0);
        expect(light.length / 9).toBe(3);
    });

    it('ne génère rien sans espace suffisant', () => {
        const points = straight(2); // 10 m
        const { light, dark } = buildDirectionChevrons(points, {
            size: 5,
            spacing: 500,
            lift: 1,
        });
        expect(light).toEqual([]);
        expect(dark).toEqual([]);
    });
});
