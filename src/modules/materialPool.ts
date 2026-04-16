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
const MAX_POOL_SIZE = 12;

class MaterialPool {
    private standardPool: THREE.MeshStandardMaterial[] = [];
    private basicPool: THREE.MeshBasicMaterial[] = [];
    private depthPool: THREE.MeshDepthMaterial[] = [];

    /**
     * Acquiert un matériau depuis le pool ou en crée un nouveau.
     */
    acquire(is2D: boolean, onCompile: (shader: any) => void): THREE.Material {
        if (is2D) {
            return this.basicPool.pop() || new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
        } else {
            const mat = this.standardPool.pop() || new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0 });
            
            // v5.29.16 : Initialisation systématique des uniforms personnalisés
            if (!mat.userData.uniforms) {
                mat.userData.uniforms = {
                    uElevationMap: { value: null },
                    uNormalMap: { value: null },
                    uOverlayMap: { value: null },
                    uTileSize: { value: 0 },
                    uElevOffset: { value: new THREE.Vector2() },
                    uElevScale: { value: 1.0 },
                    uColorOffset: { value: new THREE.Vector2() },
                    uColorScale: { value: 1.0 },
                    uHasOverlay: { value: false }
                };
            }
            
            mat.onBeforeCompile = (shader: any) => {
                mat.userData.shader = shader;
                // On lie les uniforms du shader à nos objets persistants dans userData
                Object.assign(shader.uniforms, mat.userData.uniforms);
                // On laisse le reste de la logique spécifique (injectée par Tile.ts) s'exécuter
                onCompile(shader);
            };
            
            return mat;
        }
    }

    /**
     * Acquiert un matériau de profondeur depuis le pool.
     */
    acquireDepth(onCompile: (shader: any) => void): THREE.MeshDepthMaterial {
        const mat = this.depthPool.pop() || new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
        
        if (!mat.userData.uniforms) {
            mat.userData.uniforms = {
                uElevationMap: { value: null },
                uElevOffset: { value: new THREE.Vector2() },
                uElevScale: { value: 1.0 }
            };
        }

        mat.onBeforeCompile = (shader: any) => {
            mat.userData.shader = shader;
            Object.assign(shader.uniforms, mat.userData.uniforms);
            onCompile(shader);
        };
        
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

            if (material instanceof THREE.MeshStandardMaterial) {
                if (this.standardPool.length < MAX_POOL_SIZE) this.standardPool.push(material);
                else material.dispose();
            } else {
                if (this.basicPool.length < MAX_POOL_SIZE) this.basicPool.push(material);
                else material.dispose();
            }
        } else if (material instanceof THREE.MeshDepthMaterial) {
            if ((material as any).userData && (material as any).userData.shader) {
                const shader = (material as any).userData.shader;
                if (shader.uniforms && shader.uniforms.uElevationMap) shader.uniforms.uElevationMap.value = null;
            }
            if (this.depthPool.length < MAX_POOL_SIZE) this.depthPool.push(material);
            else material.dispose();
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
