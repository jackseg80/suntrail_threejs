import * as THREE from 'three';
import { state } from './state';
import { isMobileDevice } from './utils';

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
 * Cache interne pour les données de tuiles.
 */
const dataCache = new Map<string, CachedTileData>();

/**
 * Calcule la taille maximale du cache en fonction du preset de performance.
 */
function getMaxCacheSize(): number {
    if (state.PERFORMANCE_PRESET === 'ultra') return 800;
    if (state.PERFORMANCE_PRESET === 'performance') return 400;
    if (state.PERFORMANCE_PRESET === 'balanced') return isMobileDevice() ? 150 : 300;
    return 80; // Minimum augmenté pour éviter les purges trop agressives
}

/**
 * Génère une clé de cache cohérente pour une tuile.
 */
export function getTileCacheKey(key: string, zoom: number): string {
    const is2D = (zoom <= 10 || state.RESOLUTION <= 2);
    return `${state.MAP_SOURCE}_${state.SHOW_TRAILS}_${is2D ? '2D' : '3D'}_${key}`;
}

/**
 * Ajoute des données de tuiles au cache. 
 * Si la taille maximale est atteinte, l'entrée la plus ancienne est supprimée (FIFO).
 */
export function addToCache(key: string, elevTex: THREE.Texture, pixelData: Uint8ClampedArray | null, colorTex: THREE.Texture, overlayTex: THREE.Texture | null, normalTex: THREE.Texture | null): void {
    if (dataCache.size >= getMaxCacheSize()) {
        const oldestKey = dataCache.keys().next().value;
        if (oldestKey) {
            const entry = dataCache.get(oldestKey);
            if (entry) {
                entry.elev.dispose();
                entry.color.dispose();
                if (entry.overlay) entry.overlay.dispose();
                if (entry.normal) entry.normal.dispose();
            }
            dataCache.delete(oldestKey);
        }
    }
    dataCache.set(key, { elev: elevTex, pixelData, color: colorTex, overlay: overlayTex, normal: normalTex });
}

/**
 * Récupère des données du cache et met à jour leur position pour la logique de remplacement.
 */
export function getFromCache(key: string): CachedTileData | null {
    const data = dataCache.get(key);
    if (!data) return null;
    // On déplace l'entrée à la fin pour la logique LRU/FIFO
    dataCache.delete(key);
    dataCache.set(key, data);
    return data;
}

/**
 * Vide complètement le cache et libère les ressources GPU.
 */
export function disposeAllCachedTiles(): void {
    for (const entry of dataCache.values()) {
        entry.elev.dispose();
        entry.color.dispose();
        if (entry.overlay) entry.overlay.dispose();
        if (entry.normal) entry.normal.dispose();
    }
    dataCache.clear();
}

/**
 * Vérifie si une clé existe dans le cache.
 */
export function hasInCache(key: string): boolean {
    return dataCache.has(key);
}

/**
 * Retourne le nombre d'entrées dans le cache (pour le debug).
 */
export function getCacheSize(): number {
    return dataCache.size;
}
