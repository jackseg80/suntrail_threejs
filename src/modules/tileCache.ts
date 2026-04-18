import * as THREE from 'three';
import { state } from './state';
import { isMobileDevice } from './utils';
import { BoundedCache } from './boundedCache';

/**
 * Interface pour les données de tuiles mises en cache.
 */
export interface CachedTileData {
    elev: THREE.Texture;
    pixelData: Uint8ClampedArray | null;
    color: THREE.Texture;
    overlay: THREE.Texture | null;
    normal: THREE.Texture | null;
}

/**
 * Clés de cache des tuiles actuellement en scène (à ne pas évincer).
 */
const activeCacheKeys = new Set<string>();

/**
 * Cache interne pour les données de tuiles (v5.29.38 : LRU + Pinning).
 */
const dataCache = new BoundedCache<string, CachedTileData>({
    maxSize: 120, // Valeur par défaut (balanced mobile)
    isPinned: (key) => activeCacheKeys.has(key),
    onEvict: (_key, data) => {
        data.elev.dispose();
        data.color.dispose();
        if (data.overlay) data.overlay.dispose();
        if (data.normal) data.normal.dispose();
    }
});

export function markCacheKeyActive(key: string): void {
    activeCacheKeys.add(key);
}
export function markCacheKeyInactive(key: string): void {
    activeCacheKeys.delete(key);
}

/**
 * Taille max du cache alignée sur le RANGE effectif de chaque tier.
 */
function getMaxCacheSize(): number {
    const mobile = isMobileDevice();
    if (state.PERFORMANCE_PRESET === 'ultra')       return mobile ? 350 : 800;
    if (state.PERFORMANCE_PRESET === 'performance') return mobile ? 180 : 400;
    if (state.PERFORMANCE_PRESET === 'balanced')    return mobile ? 120 : 300;
    return 60; // eco
}

/**
 * Génère une clé de cache cohérente pour une tuile.
 */
export function getTileCacheKey(key: string, zoom: number): string {
    const is2D = (zoom <= 10 || state.RESOLUTION <= 2);
    return `${state.MAP_SOURCE}_z${zoom}_${state.SHOW_TRAILS}_${is2D ? '2D' : '3D'}_${key}`;
}

/**
 * Purge les données pixelData (RAM) des tuiles non prioritaires.
 * v5.29.31 : Optimisation majeure de la RAM.
 */
export function purgeOldPixelData(): void {
    for (const [key, data] of dataCache.entries()) {
        if (!data.pixelData) continue;
        
        // On ne purge QUE si la tuile n'est pas active (actuellement à l'écran)
        // ET si elle n'est pas dans un zoom "haute précision" (LOD > 14)
        if (!activeCacheKeys.has(key)) {
            const isHighRes = key.includes('_z15') || key.includes('_z16') || key.includes('_z17') || key.includes('_z18');
            if (!isHighRes) {
                data.pixelData = null;
            }
        }
    }
}

/**
 * Ajoute des données de tuiles au cache. 
 */
export function addToCache(key: string, elevTex: THREE.Texture, pixelData: Uint8ClampedArray | null, colorTex: THREE.Texture, overlayTex: THREE.Texture | null, normalTex: THREE.Texture | null): void {
    dataCache.resize(getMaxCacheSize());
    dataCache.set(key, { elev: elevTex, pixelData, color: colorTex, overlay: overlayTex, normal: normalTex });
}

/**
 * Récupère des données du cache.
 */
export function getFromCache(key: string): CachedTileData | null {
    return dataCache.get(key) || null;
}

/**
 * Élague le cache jusqu'à sa taille maximale.
 */
export function trimCache(): void {
    dataCache.resize(getMaxCacheSize());
}

/**
 * Vide complètement le cache.
 */
export function disposeAllCachedTiles(): void {
    dataCache.clear();
    activeCacheKeys.clear();
}

/**
 * Vérifie si une clé existe dans le cache.
 */
export function hasInCache(key: string): boolean {
    return dataCache.has(key);
}

/**
 * Retourne le nombre d'entrées dans le cache.
 */
export function getCacheSize(): number {
    return dataCache.size;
}
