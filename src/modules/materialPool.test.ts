import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { materialPool } from './materialPool';

describe('materialPool.ts', () => {
    beforeEach(() => {
        materialPool.disposeAll();
    });

    it('should acquire and release standard materials', () => {
        const mat1 = materialPool.acquire(false, () => {});
        expect(mat1).toBeInstanceOf(THREE.MeshStandardMaterial);
        
        materialPool.release(mat1);
        const mat2 = materialPool.acquire(false, () => {});
        
        expect(mat1).toBe(mat2); // Réutilisation
    });

    it('should acquire and release basic materials', () => {
        const mat1 = materialPool.acquire(true, () => {});
        expect(mat1).toBeInstanceOf(THREE.MeshBasicMaterial);
        
        materialPool.release(mat1);
        const mat2 = materialPool.acquire(true, () => {});
        
        expect(mat1).toBe(mat2); // Réutilisation
    });

    it('should acquire and release depth materials', () => {
        const mat1 = materialPool.acquireDepth(() => {});
        expect(mat1).toBeInstanceOf(THREE.MeshDepthMaterial);
        
        materialPool.release(mat1);
        const mat2 = materialPool.acquireDepth(() => {});
        
        expect(mat1).toBe(mat2); // Réutilisation
    });

    it('should reset textures on release', () => {
        const mat = materialPool.acquire(false, () => {}) as THREE.MeshStandardMaterial;
        mat.map = new THREE.Texture();
        
        materialPool.release(mat);
        expect(mat.map).toBeNull();
    });

    it('should cleanup shader uniforms on release', () => {
        const mat = materialPool.acquire(false, (shader) => {
            shader.uniforms.uElevationMap = { value: new THREE.Texture() };
        }) as any;
        
        // Simuler la compilation qui attache le shader
        const mockShader = { uniforms: { uElevationMap: { value: {} } } };
        mat.userData.shader = mockShader;
        
        materialPool.release(mat);
        expect(mockShader.uniforms.uElevationMap.value).toBeNull();
    });
});
