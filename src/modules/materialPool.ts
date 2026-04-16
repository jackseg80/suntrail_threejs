import * as THREE from 'three';

/**
 * Interface pour les uniforms du shader de terrain.
 */
export interface TerrainUniforms {
    uElevationMap: { value: THREE.Texture | null };
    uNormalMap: { value: THREE.Texture | null };
    uOverlayMap: { value: THREE.Texture | null };
    uExaggeration: { value: number };
    uShowSlopes: { value: number };
    uShowHydrology: { value: number };
    uTime: { value: number };
    uTileSize: { value: number };
    uElevOffset: { value: THREE.Vector2 };
    uElevScale: { value: number };
    uColorOffset: { value: THREE.Vector2 };
    uColorScale: { value: number };
    uHasOverlay: { value: boolean };
}

/**
 * Pool de matériaux pour optimiser les performances (v5.6.4).
 */
const MAX_POOL_SIZE = 12;

class MaterialPool {
    private standardPool: THREE.MeshStandardMaterial[] = [];
    private basicPool: THREE.MeshBasicMaterial[] = [];
    private depthPool: THREE.MeshDepthMaterial[] = [];

    acquire(is2D: boolean, onCompile: (shader: any) => void): THREE.Material {
        if (is2D) {
            const mat = this.basicPool.pop() || new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
            mat.onBeforeCompile = onCompile;
            return mat;
        } else {
            const mat = this.standardPool.pop() || new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0 });
            mat.onBeforeCompile = onCompile;
            return mat;
        }
    }

    acquireDepth(onCompile: (shader: any) => void): THREE.MeshDepthMaterial {
        const mat = this.depthPool.pop() || new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
        mat.onBeforeCompile = onCompile;
        return mat;
    }

    release(material: THREE.Material): void {
        if (!material) return;
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
            material.map = null;
            material.opacity = 0;
            material.transparent = true;
            if ((material as any).userData) (material as any).userData.shader = null;

            if (material instanceof THREE.MeshStandardMaterial) {
                if (this.standardPool.length < MAX_POOL_SIZE) this.standardPool.push(material);
                else material.dispose();
            } else {
                if (this.basicPool.length < MAX_POOL_SIZE) this.basicPool.push(material);
                else material.dispose();
            }
        } else if (material instanceof THREE.MeshDepthMaterial) {
            if (this.depthPool.length < MAX_POOL_SIZE) this.depthPool.push(material);
            else material.dispose();
        }
    }

    disposeAll(): void {
        [...this.standardPool, ...this.basicPool, ...this.depthPool].forEach(m => m.dispose());
        this.standardPool = [];
        this.basicPool = [];
        this.depthPool = [];
    }
}

export const materialPool = new MaterialPool();
