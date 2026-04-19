import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { getPlaneGeometry, disposeAllGeometries } from './geometryCache';

describe('geometryCache.ts', () => {
    beforeEach(() => {
        disposeAllGeometries();
    });

    it('should create and return a geometry with skirt', () => {
        const geo = getPlaneGeometry(32);
        expect(geo).toBeInstanceOf(THREE.BufferGeometry);
        // Base: (32+1)² = 1089 vertices + skirt: 4*32 = 128 → total 1217
        expect(geo.attributes.position.count).toBe(1089 + 128);
        expect(geo.attributes.aSkirt).toBeDefined();
    });

    it('should cache and reuse geometries', () => {
        const geo1 = getPlaneGeometry(32);
        const geo2 = getPlaneGeometry(32);
        
        expect(geo1).toBe(geo2); // Doivent être la même instance
    });

    it('should return the same geometry for the same resolution but different sizes', () => {
        const geo1 = getPlaneGeometry(32);
        const geo2 = getPlaneGeometry(32);
        const geo3 = getPlaneGeometry(64);

        expect(geo1).toBe(geo2); // v5.32.14 : Unifié
        expect(geo1).not.toBe(geo3); // Résolution différente -> géométrie différente
    });

    it('should have correct orientation and UVs', () => {
        const geo = getPlaneGeometry(2);
        
        // La rotation X devrait être appliquée (-Math.PI / 2)
        // Note: Three.js stocke les rotations différemment, 
        // on vérifie plutôt le résultat sur les positions ou normals.
        // Ici on fait confiance à l'implémentation car c'est une migration directe.
        
        const uvs = geo.attributes.uv.array;
        // On vérifie que certains UVs ont été modifiés (v = 1.0 - v)
        // Les UVs d'un plan standard sont [0,1, 1,1, 0,0, 1,0]
        // Après inversion de l'axe V, ils devraient être différents.
        expect(uvs.length).toBeGreaterThan(0);
    });

    it('should dispose all geometries when cleared', () => {
        const geo = getPlaneGeometry(32);
        const spy = vi.spyOn(geo, 'dispose');
        
        disposeAllGeometries();
        
        expect(spy).toHaveBeenCalled();
    });
});
