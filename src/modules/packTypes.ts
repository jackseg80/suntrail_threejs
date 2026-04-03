/**
 * Types pour les Country Packs (archives PMTiles régionales achetables).
 */

export type PackStatus = 'not_purchased' | 'purchased' | 'downloading' | 'installed' | 'update_available' | 'error';

/** Métadonnées d'un pack — provenant du catalog CDN. */
export interface PackMeta {
    id: string;                    // 'switzerland' | 'france_alps'
    productId: string;             // RevenueCat: 'suntrail_pack_switzerland'
    name: Record<string, string>;  // { fr, de, it, en }
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    lodRange: { min: number; max: number };  // { min: 12, max: 14 }
    version: number;
    sizeMB: number;
    cdnUrl: string;
    regionCheck: 'switzerland' | 'france_alps';
}

/** État local d'un pack — persisté en localStorage. */
export interface PackState {
    id: string;
    status: PackStatus;
    installedVersion: number;
    downloadProgress: number;      // 0..1
    filePath: string | null;       // chemin device storage
    sizeMB: number;                // taille réelle sur disque
}

/** Catalogue des packs disponibles — récupéré depuis le CDN R2. */
export interface PackCatalog {
    version: number;
    packs: PackMeta[];
}
