import { describe, it, expect, vi } from 'vitest';
import { disposeObject } from './memory';
import * as THREE from 'three';

describe('Memory Module', () => {
    it('should recursively dispose geometry and materials of a mesh', () => {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.MeshBasicMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        const childGeom = new THREE.BufferGeometry();
        const childMat = new THREE.MeshBasicMaterial();
        const childMesh = new THREE.Mesh(childGeom, childMat);
        
        mesh.add(childMesh);

        // Espions sur les méthodes dispose
        const geomSpy = vi.spyOn(geometry, 'dispose');
        const matSpy = vi.spyOn(material, 'dispose');
        const childGeomSpy = vi.spyOn(childGeom, 'dispose');
        const childMatSpy = vi.spyOn(childMat, 'dispose');

        disposeObject(mesh);

        expect(geomSpy).toHaveBeenCalledTimes(1);
        expect(matSpy).toHaveBeenCalledTimes(1);
        expect(childGeomSpy).toHaveBeenCalledTimes(1);
        expect(childMatSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle null or undefined safely', () => {
        expect(() => disposeObject(null)).not.toThrow();
        expect(() => disposeObject(undefined)).not.toThrow();
    });

    it('should dispose arrays of materials', () => {
        const geometry = new THREE.BufferGeometry();
        const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
        const mesh = new THREE.Mesh(geometry, materials);

        const mat0Spy = vi.spyOn(materials[0], 'dispose');
        const mat1Spy = vi.spyOn(materials[1], 'dispose');

        disposeObject(mesh);

        expect(mat0Spy).toHaveBeenCalledTimes(1);
        expect(mat1Spy).toHaveBeenCalledTimes(1);
    });
});
