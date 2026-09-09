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

/** Restore purged CPU heights from the retained bitmap, without fetching textures again. */
export function restoreCachedPixelData(
    data: CachedTileData
): Uint8ClampedArray | null {
    if (data.pixelData) return data.pixelData;
    const image = data.elev.image as ImageBitmap | HTMLCanvasElement | null;
    if (!image?.width || !image?.height) return null;
    let canvas: OffscreenCanvas | HTMLCanvasElement | undefined;
    try {
        canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(image.width, image.height)
                : document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        // Match tileWorker's elevation decode, including opaque alpha.
        const ctx = canvas.getContext('2d', {
            alpha: false,
            willReadFrequently: true,
        }) as
            OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
        if (!ctx) return null;
        ctx.drawImage(image, 0, 0);
        data.pixelData = ctx.getImageData(0, 0, image.width, image.height).data;
        return data.pixelData;
    } catch {
        // Missing/unsupported bitmap: the caller retains its normal loading fallback.
        return null;
    } finally {
        if (canvas) canvas.width = canvas.height = 1;
    }
}

/**
 * Clés de cache des tuiles actuellement en scène (à ne pas évincer).
 */
const activeCacheKeys = new Set<string>();

/**
 * Compteur de références des textures par tuile vivante (mesh encore en scène).
 * Une texture dont le compteur est > 0 ne doit JAMAIS être libérée : la fermer
 * rendrait noires les tuiles qui l'affichent (bitmap fermé = ré-upload impossible).
 */
const textureRefs = new WeakMap<THREE.Texture, number>();
/**
 * Textures actuellement possédées par le cache (entrée non évincée).
 * Une texture toujours dans le cache est libérée par l'éviction, pas par la
 * tuile qui la partage.
 */
const cachedTextureOwners = new Map<THREE.Texture, number>();

/**
 * Libère la texture GPU. On ferme volontairement JAMAIS l'ImageBitmap :
 * si une texture encore liée à un mesh est libérée par un cas limite, le
 * moteur peut la ré-uploader depuis le bitmap encore valide et la tuile
 * récupère. Fermer le bitmap rendait la tuile noire permanente en mode suivi
 * (v5.86.1). Le GPU est libéré par dispose() ; le bitmap natif reste géré par
 * le GC de la WebView.
 */
function disposeCachedTexture(texture: THREE.Texture | null): void {
    if (!texture) return;
    texture.dispose();
}

/**
 * Textures référencées par une tuile (élévation/relief, couleur, overlay,
 * normal). Les champs sont nullables car une tuile en cours de chargement ou
 * non affichée n'a pas encore de texture assignée.
 */
export interface TileTextureRefs {
    elev: THREE.Texture | null;
    color: THREE.Texture | null;
    overlay: THREE.Texture | null;
    normal: THREE.Texture | null;
}

function allTextures(data: TileTextureRefs): (THREE.Texture | null)[] {
    return [data.elev, data.color, data.overlay, data.normal];
}

/**
 * Une tuile vivante commence à afficher ces textures (mesh construit ou en
 * cours de construction). Incrémente le compteur pour empêcher toute libération
 * prématurée par l'éviction LRU (corrige la carte noire en mode suivi v5.86.1).
 */
export function retainCachedTileData(data: TileTextureRefs): void {
    for (const t of allTextures(data)) {
        if (t) textureRefs.set(t, (textureRefs.get(t) || 0) + 1);
    }
}

/**
 * Une tuile cesse d'afficher ces textures (mesh détruit). La libération native
 * n'a lieu qu'une fois que plus aucune tuile vivante ni le cache ne les
 * référencent.
 */
export function releaseCachedTileData(data: TileTextureRefs): void {
    for (const t of allTextures(data)) {
        if (!t) continue;
        const n = (textureRefs.get(t) || 1) - 1;
        if (n <= 0) {
            textureRefs.delete(t);
            if (!cachedTextureOwners.has(t)) disposeCachedTexture(t);
        } else {
            textureRefs.set(t, n);
        }
    }
}

/**
 * Cache interne pour les données de tuiles (v5.29.38 : LRU + Pinning).
 */
const dataCache = new BoundedCache<string, CachedTileData>({
    maxSize: 120, // Valeur par défaut (balanced mobile)
    isPinned: (key) => activeCacheKeys.has(key),
    onEvict: (_key, data) => {
        for (const t of allTextures(data)) {
            if (!t) continue;
            const owners = (cachedTextureOwners.get(t) || 1) - 1;
            if (owners > 0) {
                cachedTextureOwners.set(t, owners);
                continue;
            }
            cachedTextureOwners.delete(t);
            // Ne libérer que les textures sans aucune tuile vivante : les autres
            // restent affichées par leur mesh et seront libérées à son dispose.
            if ((textureRefs.get(t) || 0) === 0) {
                textureRefs.delete(t);
                disposeCachedTexture(t);
            }
        }
    },
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
    // v5.86.1 : le relevé terrain S23 a montré une forte pression mémoire
    // WebView avec le plafond précédent de 360 entrées. Les tuiles visibles restent épinglées ;
    // cette limite réduit uniquement la rétention inactive et le préchargement
    // passé. Les plafonds desktop restent inchangés.
    if (state.PERFORMANCE_PRESET === 'ultra') return mobile ? 160 : 800;
    if (state.PERFORMANCE_PRESET === 'performance') return mobile ? 120 : 500;
    if (state.PERFORMANCE_PRESET === 'balanced') return mobile ? 120 : 400;
    return 80; // eco
}

/**
 * Background work must stay well below the full cache capacity on mobile.
 * The remaining entries are kept for visible tiles, transitions and warm
 * returns. A small fixed working set also prevents successive idle waves from
 * decoding every adjacent-LOD candidate before LRU eviction catches up.
 */
function getMaxBackgroundPrefetchEntries(): number {
    if (!isMobileDevice()) return getMaxCacheSize();
    if (state.PERFORMANCE_PRESET === 'ultra') return 32;
    if (state.PERFORMANCE_PRESET === 'performance') return 24;
    if (state.PERFORMANCE_PRESET === 'balanced') return 20;
    return 8;
}

/**
 * Reserve room for displayed and pending tiles before selecting prefetch neighbors.
 */
export function getPrefetchBudget(reservedKeys: Iterable<string>): number {
    const reserved = new Set([...activeCacheKeys, ...reservedKeys]);
    return Math.max(
        0,
        Math.min(
            getMaxBackgroundPrefetchEntries(),
            getMaxCacheSize() - reserved.size
        )
    );
}

export interface TileCacheStats {
    entries: number;
    maxEntries: number;
    activeKeys: number;
    cachedActiveEntries: number;
    cachedInactiveEntries: number;
    cachedTextures: number;
    estimatedTextureBytes: number;
    pixelDataBytes: number;
    maxBackgroundPrefetchEntries: number;
}

function estimateTextureBytes(texture: THREE.Texture): number {
    const image = texture.image as
        | {
              width?: number;
              height?: number;
              data?: ArrayBufferView;
          }
        | undefined;
    if (!image) return 0;
    if (image.data && ArrayBuffer.isView(image.data)) {
        return image.data.byteLength;
    }
    const width = Number(image.width) || 0;
    const height = Number(image.height) || 0;
    return width > 0 && height > 0 ? width * height * 4 : 0;
}

/** Diagnostic estimate for the decoded cache owned by this module. */
export function getTileCacheStats(): TileCacheStats {
    let cachedActiveEntries = 0;
    let pixelDataBytes = 0;
    for (const [key, data] of dataCache.entries()) {
        if (activeCacheKeys.has(key)) cachedActiveEntries++;
        pixelDataBytes += data.pixelData?.byteLength ?? 0;
    }
    let estimatedTextureBytes = 0;
    for (const texture of cachedTextureOwners.keys()) {
        estimatedTextureBytes += estimateTextureBytes(texture);
    }
    return {
        entries: dataCache.size,
        maxEntries: getMaxCacheSize(),
        activeKeys: activeCacheKeys.size,
        cachedActiveEntries,
        cachedInactiveEntries: dataCache.size - cachedActiveEntries,
        cachedTextures: cachedTextureOwners.size,
        estimatedTextureBytes,
        pixelDataBytes,
        maxBackgroundPrefetchEntries: getMaxBackgroundPrefetchEntries(),
    };
}

/** Génère une clé de cache cohérente pour une tuile. */
export function getTileCacheKey(
    key: string,
    zoom: number,
    dataMode2D: boolean = zoom <= 10 || state.RESOLUTION <= 2
): string {
    const is2D = zoom <= 10 || dataMode2D;
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
    const maxPixelData =
        preset === 'ultra' ? 50 : preset === 'performance' ? 30 : 10; // eco, balanced, custom
    const maxParentPixelData =
        preset === 'ultra' ? 25 : preset === 'performance' ? 15 : 5; // eco, balanced, custom
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
export function addToCache(
    key: string,
    elevTex: THREE.Texture,
    pixelData: Uint8ClampedArray | null,
    colorTex: THREE.Texture,
    overlayTex: THREE.Texture | null,
    normalTex: THREE.Texture | null
): void {
    dataCache.resize(getMaxCacheSize());
    const data: CachedTileData = {
        elev: elevTex,
        pixelData,
        color: colorTex,
        overlay: overlayTex,
        normal: normalTex,
    };
    for (const t of allTextures(data)) {
        if (t)
            cachedTextureOwners.set(t, (cachedTextureOwners.get(t) || 0) + 1);
    }
    dataCache.set(key, data);
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
