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
    if (state.PERFORMANCE_PRESET === 'ultra')       return mobile ? 500 : 800;
    if (state.PERFORMANCE_PRESET === 'performance') return mobile ? 360 : 500;
    if (state.PERFORMANCE_PRESET === 'balanced')    return mobile ? 200 : 400;
    return 80; // eco
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
 * v5.32.0 : Purge par preset + immunité pour les tuiles z-1 (parent LOD).
 * v5.32.3 : Correction LRU (itération inverse) + séparation budgets Pass 1.
 * eco/balanced: 10+5, performance: 30+15, ultra: 50+25
 */
export function purgeOldPixelData(): void {
    const preset = state.PERFORMANCE_PRESET;
    const maxPixelData = preset === 'ultra' ? 50
        : preset === 'performance' ? 30
        : 10; // eco, balanced, custom
    const maxParentPixelData = preset === 'ultra' ? 25
        : preset === 'performance' ? 15
        : 5; // eco, balanced, custom
    const currentZoom = state.ZOOM;
    
    let keptCount = 0;
    let keptParentCount = 0;
    const entries = [...dataCache.entries()];
    
    // Pass 1: Count active tiles (currently visible) in their respective budgets
    for (const [key, data] of entries) {
        if (data.pixelData && activeCacheKeys.has(key)) {
            const isParentZoom = key.includes(`_z${currentZoom - 1}_`);
            if (isParentZoom) {
                keptParentCount++;
            } else {
                keptCount++;
            }
        }
    }
    
    // Pass 2: For inactive tiles, purge pixelData keeping only the most recently used.
    // Loop in REVERSE order (from newest to oldest) to respect LRU.
    for (let i = entries.length - 1; i >= 0; i--) {
        const [key, data] = entries[i];
        
        if (!data.pixelData) continue;
        if (activeCacheKeys.has(key)) continue; // Already counted in Pass 1
        
        const isParentZoom = key.includes(`_z${currentZoom - 1}_`);
        
        if (isParentZoom) {
            if (keptParentCount < maxParentPixelData) {
                keptParentCount++;
            } else {
                data.pixelData = null; // Purge
            }
        } else {
            if (keptCount < maxPixelData) {
                keptCount++;
            } else {
                data.pixelData = null; // Purge
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
