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
 * Réutilise les matériaux Three.js pour éviter les micro-saccades de compilation de shaders.
 */
class MaterialPool {
    private standardPool: THREE.MeshStandardMaterial[] = [];
    private basicPool: THREE.MeshBasicMaterial[] = [];
    private depthPool: THREE.MeshDepthMaterial[] = [];

    /**
     * Acquiert un matériau depuis le pool ou en crée un nouveau.
     */
    acquire(is2D: boolean, onCompile: (shader: THREE.Shader) => void): THREE.Material {
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

    /**
     * Acquiert un matériau de profondeur depuis le pool.
     */
    acquireDepth(onCompile: (shader: THREE.Shader) => void): THREE.MeshDepthMaterial {
        const mat = this.depthPool.pop() || new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
        mat.onBeforeCompile = onCompile;
        return mat;
    }

    /**
     * Relâche un matériau dans le pool après usage.
     */
    release(material: THREE.Material): void {
        if (!material) return;

        // Reset des textures pour libérer les références du cache
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
            material.map = null;
            material.opacity = 0;
            material.transparent = true;
            
            // Nettoyage des uniforms personnalisés via userData
            if ((material as any).userData && (material as any).userData.shader) {
                const shader = (material as any).userData.shader;
                if (shader.uniforms) {
                    if (shader.uniforms.uElevationMap) shader.uniforms.uElevationMap.value = null;
                    if (shader.uniforms.uNormalMap) shader.uniforms.uNormalMap.value = null;
                    if (shader.uniforms.uOverlayMap) shader.uniforms.uOverlayMap.value = null;
                }
            }

            if (material instanceof THREE.MeshStandardMaterial) this.standardPool.push(material);
            else this.basicPool.push(material);
        } else if (material instanceof THREE.MeshDepthMaterial) {
            if ((material as any).userData && (material as any).userData.shader) {
                const shader = (material as any).userData.shader;
                if (shader.uniforms && shader.uniforms.uElevationMap) shader.uniforms.uElevationMap.value = null;
            }
            this.depthPool.push(material);
        }
    }

    /**
     * Vide le pool et détruit physiquement les matériaux.
     */
    disposeAll(): void {
        [...this.standardPool, ...this.basicPool, ...this.depthPool].forEach(m => m.dispose());
        this.standardPool = [];
        this.basicPool = [];
        this.depthPool = [];
    }
}

export const materialPool = new MaterialPool();
