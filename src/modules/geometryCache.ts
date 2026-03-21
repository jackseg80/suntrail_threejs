import * as THREE from 'three';

/**
 * Cache interne pour les géométries de plans.
 */
const geometryCache = new Map<string, THREE.PlaneGeometry>();

/**
 * Récupère ou crée une géométrie de plan avec la résolution et la taille spécifiées.
 * Les UVs sont inversés sur l'axe Y pour correspondre aux textures des tuiles.
 */
export function getPlaneGeometry(res: number, size: number): THREE.PlaneGeometry {
    const key = `${res}_${size}`;
    if (!geometryCache.has(key)) {
        const geometry = new THREE.PlaneGeometry(size, size, res, res);
        // On oriente le plan horizontalement
        geometry.rotateX(-Math.PI / 2);
        
        // On inverse l'axe V pour l'alignement texture
        const uvs = geometry.attributes.uv.array as Float32Array;
        for (let i = 1; i < uvs.length; i += 2) {
            uvs[i] = 1.0 - uvs[i];
        }
        
        geometryCache.set(key, geometry);
    }
    return geometryCache.get(key)!;
}

/**
 * Vide le cache de géométries et libère la mémoire.
 */
export function disposeAllGeometries(): void {
    for (const geometry of geometryCache.values()) {
        geometry.dispose();
    }
    geometryCache.clear();
}
