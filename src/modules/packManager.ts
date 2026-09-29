/**
 * packManager.ts — Country Packs Manager
 *
 * Gère le cycle de vie complet des packs pays :
 *   - Téléchargement vers OPFS (Android + PWA) avec progression
 *   - Montage d'archives PMTiles via FileSource (offline) ou CDN (purchased)
 *   - Serving des tuiles LOD 12-14 sans réseau
 *
 * Le catalogue est délégué à packCatalog.ts.
 * Les packs sont des achats non-consumable indépendants de l'abonnement Pro.
 * Tout acheteur d'un pack accède aux LOD 12-14 complets.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as pmtiles from 'pmtiles';
import { state } from './state';
import { eventBus } from './eventBus';
import { showToast } from './toast';
import { i18n } from '../i18n/I18nService';
import type { PackMeta, PackState, PackStatus } from './packTypes';
import { iapService } from './iapService';
import { isPointInCountry, tilePixelToLatLon } from './geo';
import { STORAGE_KEYS } from '../constants/storage';
import { EmbeddedAssetSource } from './embeddedAssetSource';
import { elevationParentTile } from './elevationParentTile';
import {
    fetchCatalog,
    getAvailablePacks,
    getPackMeta,
    findPackContaining as catalogFindPackContaining,
    checkForUpdates,
    catalogScopedStorageKey,
} from './packCatalog';

const PACK_STATES_KEY = catalogScopedStorageKey(
    STORAGE_KEYS.PACK_STATES,
    import.meta.env.VITE_PACKS_CATALOG_URL as string | undefined
);
const PACKS_DIR = 'packs';
const NATIVE_LOCALHOST_UNLOCK_CLEANUP_KEY =
    'suntrail_native_localhost_unlock_cleanup_v1';

export function packArchiveFilename(packId: string, version: number): string {
    // A reduced Swiss pack must not overwrite the legacy filename read by
    // clients that do not understand elevationMaxZoom.
    if (packId === 'switzerland' && version >= 6) {
        return `${packId}-v${version}.pmtiles`;
    }
    return `${packId}.pmtiles`;
}

function storedPackArchiveFilename(packId: string, ps: PackState): string {
    const versioned = packArchiveFilename(packId, ps.installedVersion);
    if (ps.filePath === `opfs://${PACKS_DIR}/${versioned}`) return versioned;
    return `${packId}.pmtiles`;
}

class PackManager {
    private packStates: Map<string, PackState> = new Map();
    private mountedArchives: Map<
        string,
        {
            archive: pmtiles.PMTiles;
            source: 'opfs' | 'cdn' | 'asset';
            elevationMaxZoom?: number;
        }
    > = new Map();
    private downloadControllers: Map<string, AbortController> = new Map();
    private interruptedDownloads: Set<string> = new Set();

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        this.loadPersistedStates();
        await fetchCatalog();
        await this.cleanupInterruptedDownloads();
        await this.syncDiskStates();
        this.runCheckForUpdates();
        this.clearLegacyNativeLocalhostUnlocks();

        // Auto-débloquer TOUS les packs sur localhost (Dev mode) ou via paramètre URL
        const params = new URLSearchParams(window.location.search);
        // Le WebView Capacitor utilise lui aussi https://localhost : ce n'est
        // pas un serveur de développement et il ne doit jamais débloquer les
        // packs payants automatiquement.
        const isBrowserDevHost =
            !Capacitor.isNativePlatform() &&
            (location.hostname === 'localhost' ||
                location.hostname === '127.0.0.1');
        const isDev =
            isBrowserDevHost ||
            params.get('allpacks') === 'true' ||
            params.get('dev') === 'true';

        if (isDev) {
            if (state.DEBUG_MODE)
                console.log(
                    '[Packs] Dev mode détecté : déblocage de tous les packs.'
                );
            for (const meta of getAvailablePacks()) {
                this.markPurchased(meta.id);
            }
        } else if (import.meta.env.VITE_DIAGNOSTIC_PACK_URL) {
            // Defined only in the diagnostic APK; it neither unlocks nor
            // replaces a production pack.
            this.markPurchased('switzerland_diagnostic');
        }

        // Monter d'abord les archives locales. Un simple statut `purchased`
        // persisté doit être confirmé par RevenueCat avant tout streaming CDN.
        await this.mountAllInstalled();
        // Sync pack purchases avec RevenueCat (restaure après clear storage)
        this.syncPackPurchases().catch((e) => {
            if (state.DEBUG_MODE) console.warn('[Packs] Sync failed', e);
        });
        if (state.DEBUG_MODE)
            console.log(
                `[Packs] Initialisé. ${this.mountedArchives.size} pack(s) monté(s).`
            );
    }

    /**
     * Les versions antérieures prenaient le hostname interne `localhost` de
     * Capacitor pour un serveur de développement et débloquaient tout le
     * catalogue. Nettoyage ponctuel : les packs installés restent intacts et
     * RevenueCat restaurera ensuite les achats réels.
     */
    private clearLegacyNativeLocalhostUnlocks(): void {
        if (!Capacitor.isNativePlatform()) return;
        try {
            if (localStorage.getItem(NATIVE_LOCALHOST_UNLOCK_CLEANUP_KEY))
                return;

            const packIds = getAvailablePacks().map((pack) => pack.id);
            const entireCatalogUnlocked =
                packIds.length > 0 &&
                packIds.every((id) => {
                    const status = this.packStates.get(id)?.status;
                    return status && status !== 'not_purchased';
                });

            if (entireCatalogUnlocked) {
                let changed = false;
                for (const id of packIds) {
                    const packState = this.packStates.get(id);
                    if (packState?.status === 'purchased') {
                        packState.status = 'not_purchased';
                        changed = true;
                    }
                }
                if (changed) this.persistStates();
            }
            localStorage.setItem(NATIVE_LOCALHOST_UNLOCK_CLEANUP_KEY, '1');
        } catch {
            // Stockage indisponible : la réconciliation RevenueCat reste active.
        }
    }

    /**
     * Tente de réconcilier les états locaux avec les fichiers réellement présents dans l'OPFS.
     * Utile si le localStorage est perdu mais pas le stockage de fichiers (persistance Android/PWA).
     */
    private async syncDiskStates(): Promise<void> {
        try {
            const root = await navigator.storage.getDirectory();
            let packsDir: FileSystemDirectoryHandle | null = null;
            try {
                packsDir = await root.getDirectoryHandle(PACKS_DIR);
            } catch {
                // Répertoire inexistant : aucun état local ne doit rester
                // affiché comme installé.
            }

            for (const meta of getAvailablePacks()) {
                const ps = this.getOrCreateState(meta.id);
                const legacyFilename = `${meta.id}.pmtiles`;
                const currentFilename = packArchiveFilename(
                    meta.id,
                    meta.version
                );
                const filenames = ps.filePath
                    ? [storedPackArchiveFilename(meta.id, ps)]
                    : [...new Set([currentFilename, legacyFilename])];
                let foundFilename: string | null = null;

                if (packsDir) {
                    for (const filename of filenames) {
                        try {
                            await packsDir.getFileHandle(filename);
                            foundFilename = filename;
                            break;
                        } catch {
                            // absent
                        }
                    }
                }

                // Si l'état dit pas installé, mais que le fichier est là : on resync
                // On accepte 'purchased' ou 'not_purchased' (si on a un fichier on le prend)
                if (
                    foundFilename &&
                    (ps.status === 'purchased' ||
                        ps.status === 'not_purchased' ||
                        ps.status === 'error')
                ) {
                    if (state.DEBUG_MODE)
                        console.log(
                            `[Packs] ${meta.id}: fichier trouvé sur disque, restauration de l'état 'installed'.`
                        );
                    ps.status = 'installed';
                    if (foundFilename === currentFilename) {
                        ps.installedVersion =
                            ps.installedVersion || meta.version;
                    }
                    ps.sizeMB = ps.sizeMB || meta.sizeMB;
                    ps.filePath = `opfs://${PACKS_DIR}/${foundFilename}`;
                } else if (
                    !foundFilename &&
                    (ps.status === 'installed' ||
                        ps.status === 'update_available')
                ) {
                    console.warn(
                        `[Packs] ${meta.id}: état local installé sans fichier OPFS, retour à l'état acheté.`
                    );
                    ps.status = 'purchased';
                    ps.installedVersion = 0;
                    ps.sizeMB = 0;
                    ps.filePath = null;
                }
            }
            this.persistStates();
        } catch (e) {
            console.warn('[Packs] Erreur syncDiskStates:', e);
        }
    }

    /** Vérifie les achats de packs sur RevenueCat (natif + web) et met à jour les états locaux. */
    private async syncPackPurchases(): Promise<void> {
        const ready = await iapService.waitForInit();
        if (!ready) return;

        const purchased = await iapService.checkAllPackPurchases();
        // RevenueCat est la source de vérité sur Web comme sur natif. On ne
        // révoque qu'après une lecture réussie, afin de conserver l'état local
        // lorsque l'initialisation IAP ou le réseau sont indisponibles.
        const verified = new Set(purchased);
        let changed = false;
        for (const [packId, ps] of this.packStates) {
            // The embedded diagnostic archive is deliberately not a store
            // product. RevenueCat must not revoke its local test entitlement.
            if (
                packId === 'switzerland_diagnostic' &&
                import.meta.env.VITE_DIAGNOSTIC_PACK_URL
            )
                continue;
            if (ps.status === 'purchased' && !verified.has(packId)) {
                ps.status = 'not_purchased';
                changed = true;
            }
        }
        if (changed) {
            this.persistStates();
            eventBus.emit('packStatusChanged', {
                packId: '',
                status: 'not_purchased',
            });
        }
        for (const packId of purchased) {
            this.markPurchased(packId);
        }
    }

    // ── Catalog ── (délégué à packCatalog.ts)

    findPackContaining(lat: number, lon: number): PackMeta | null {
        return catalogFindPackContaining(lat, lon, isPointInCountry);
    }

    getPackState(packId: string): PackState | null {
        return this.packStates.get(packId) ?? null;
    }

    // ── Download & Install ───────────────────────────────────────────────────

    async downloadPack(
        packId: string,
        onProgress?: (p: number) => void
    ): Promise<boolean> {
        const meta = getPackMeta(packId);
        if (!meta) return false;

        const ps = this.getOrCreateState(packId);
        if (this.downloadControllers.has(packId)) return false;
        const targetFilename = packArchiveFilename(meta.id, meta.version);
        // Never overwrite a validated installation with the same version.
        if (
            ps.status === 'installed' &&
            ps.installedVersion === meta.version &&
            ps.filePath === `opfs://${PACKS_DIR}/${targetFilename}`
        )
            return true;
        const previousState = { ...ps };
        const previousArchiveIsSeparate =
            !!previousState.filePath &&
            previousState.filePath !== `opfs://${PACKS_DIR}/${targetFilename}`;
        ps.status = 'downloading';
        ps.downloadProgress = 0;
        this.persistStates();
        this.emitStatus(packId, 'downloading');

        const controller = new AbortController();
        this.downloadControllers.set(packId, controller);

        try {
            // OPFS pour les deux plateformes : FileSource permet une lecture offline
            // sans Range requests HTTP (file.slice() direct, sans réseau).
            // downloadNative (Filesystem.External) ne supporte pas FileSource.
            await this.downloadWeb(meta, ps, onProgress, controller.signal);

            ps.status = 'installed';
            ps.downloadProgress = 1;
            ps.installedVersion = meta.version;
            ps.sizeMB = meta.sizeMB;
            this.persistStates();
            this.emitStatus(packId, 'installed');

            // Replace any older local archive already mounted for this pack.
            this.unmountPack(packId);
            await this.mountPack(packId);
            showToast(i18n.t('packs.toast.installed'));
            return true;
        } catch (e) {
            // A failed update must not hide or delete the previously installed
            // archive. The new filename is the only cleanup target.
            if (
                previousArchiveIsSeparate ||
                !previousState.filePath ||
                (e as Error).name !== 'AbortError'
            ) {
                await this.deletePackFile(packId, targetFilename);
            }
            if (previousArchiveIsSeparate) Object.assign(ps, previousState);
            if ((e as Error).name === 'AbortError') {
                if (!previousArchiveIsSeparate) ps.status = 'purchased';
                ps.downloadProgress = 0;
                this.persistStates();
                this.emitStatus(packId, ps.status);
                showToast(i18n.t('packs.toast.downloadCancelled'));
            } else {
                console.error(`[Packs] Download error for ${packId}:`, e);
                if (!previousArchiveIsSeparate) ps.status = 'error';
                this.persistStates();
                this.emitStatus(packId, ps.status);
                const msg = (e as Error).message ?? '';
                if (
                    (e as Error).name === 'QuotaExceededError' ||
                    /quota|ENOSPC/i.test(msg)
                ) {
                    showToast(i18n.t('packs.error.storageFull'));
                } else {
                    showToast(
                        `${i18n.t('packs.error.downloadFailed')} (${msg.slice(0, 60)})`
                    );
                }
            }
            return false;
        } finally {
            this.downloadControllers.delete(packId);
        }
    }

    private async downloadWeb(
        meta: PackMeta,
        ps: PackState,
        onProgress?: (p: number) => void,
        signal?: AbortSignal
    ): Promise<void> {
        // OPFS (Origin Private File System) pour PWA
        const root = await navigator.storage.getDirectory();
        const packsDir = await root.getDirectoryHandle(PACKS_DIR, {
            create: true,
        });
        const filename = packArchiveFilename(meta.id, meta.version);
        const fileHandle = await packsDir.getFileHandle(filename, {
            create: true,
        });
        const writable = await fileHandle.createWritable();

        let contentLength: number;
        let received = 0;

        try {
            const resp = await fetch(meta.cdnUrl, { signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const reader = resp.body?.getReader();
            if (!reader) throw new Error('No response body');

            contentLength = parseInt(
                resp.headers.get('content-length') ?? '0',
                10
            );
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                await writable.write(value);
                received += value.length;
                if (contentLength > 0) {
                    ps.downloadProgress = received / contentLength;
                    onProgress?.(ps.downloadProgress);
                }
            }
            await writable.close();
        } catch (e) {
            try {
                await writable.abort();
            } catch (abortError) {
                console.warn('[Packs] OPFS abort failed:', abortError);
            }
            throw e;
        }

        await this.validateDownloadedPack(
            fileHandle,
            received,
            contentLength,
            meta
        );

        ps.filePath = `opfs://${PACKS_DIR}/${filename}`;
    }

    private async validateDownloadedPack(
        fileHandle: FileSystemFileHandle,
        received: number,
        contentLength: number,
        meta: PackMeta
    ): Promise<void> {
        if (contentLength > 0 && received !== contentLength) {
            throw new Error(
                `Téléchargement incomplet: ${received}/${contentLength} octets`
            );
        }

        const file = await fileHandle.getFile();
        if (file.size !== received) {
            throw new Error(
                `Écriture OPFS incomplète: ${file.size}/${received} octets`
            );
        }

        const archive = new pmtiles.PMTiles(new pmtiles.FileSource(file));
        const header = await archive.getHeader();
        const metadata = (await archive.getMetadata()) as Record<
            string,
            unknown
        >;
        this.readElevationMaxZoom(
            metadata,
            meta.lodRange.min,
            meta.lodRange.max
        );

        const sections = [
            ['root', header.rootDirectoryOffset, header.rootDirectoryLength],
            ['metadata', header.jsonMetadataOffset, header.jsonMetadataLength],
            ['leaf', header.leafDirectoryOffset, header.leafDirectoryLength],
            ['tiles', header.tileDataOffset, header.tileDataLength],
        ] as const;
        for (const [name, offset, length] of sections) {
            const numericOffset = Number(offset);
            const numericLength = Number(length);
            const end = numericOffset + numericLength;
            if (
                !Number.isSafeInteger(numericOffset) ||
                !Number.isSafeInteger(numericLength) ||
                numericOffset < 0 ||
                numericLength < 0 ||
                end > file.size
            ) {
                throw new Error(
                    `Archive PMTiles tronquée: section ${name} finit à ${end}/${file.size}`
                );
            }
        }

        if (
            header.minZoom > meta.lodRange.min ||
            header.maxZoom < meta.lodRange.max
        ) {
            throw new Error(
                `Zooms PMTiles incohérents: ${header.minZoom}-${header.maxZoom}, attendu ${meta.lodRange.min}-${meta.lodRange.max}`
            );
        }
    }

    private readElevationMaxZoom(
        metadata: Record<string, unknown>,
        minZoom: number,
        maxZoom: number
    ): number | undefined {
        const value = metadata.elevationMaxZoom;
        if (value === undefined) return undefined;
        if (
            !Number.isInteger(value) ||
            (value as number) < minZoom ||
            (value as number) >= maxZoom ||
            metadata.elevationEncoding !== 'terrain-rgb-v2-lossless-webp'
        ) {
            throw new Error('Métadonnées du relief réduit invalides');
        }
        return value as number;
    }

    cancelDownload(packId: string): void {
        const controller = this.downloadControllers.get(packId);
        controller?.abort();
    }

    async deletePack(packId: string): Promise<void> {
        const ps = this.packStates.get(packId);
        const activeFilename = ps
            ? storedPackArchiveFilename(packId, ps)
            : `${packId}.pmtiles`;
        try {
            // Delete the legacy copy first, so a failure leaves the active v6
            // installation mounted and its state unchanged.
            if (activeFilename !== `${packId}.pmtiles`) {
                await this.deletePackFile(packId, `${packId}.pmtiles`, true);
            }
            await this.deletePackFile(packId, activeFilename, true);
        } catch (e) {
            console.error(`[Packs] Delete error for ${packId}:`, e);
            showToast(i18n.t('packs.error.deleteFailed'));
            return;
        }
        this.unmountPack(packId);
        if (ps) {
            ps.status = 'purchased';
            ps.downloadProgress = 0;
            ps.filePath = null;
            ps.sizeMB = 0;
            this.persistStates();
            this.emitStatus(packId, 'purchased');
        }
        showToast(i18n.t('packs.toast.deleted'));
    }

    private async deletePackFile(
        packId: string,
        filename = `${packId}.pmtiles`,
        strict = false
    ): Promise<void> {
        // OPFS (chemin principal depuis la nouvelle architecture)
        let packsDir: FileSystemDirectoryHandle | null = null;
        try {
            const root = await navigator.storage.getDirectory();
            packsDir = await root.getDirectoryHandle(PACKS_DIR);
            await packsDir.removeEntry(filename);
        } catch (e) {
            if (strict && (e as Error).name !== 'NotFoundError') throw e;
        }
        // Chromium can leave a .crswap sibling when a process dies during an
        // OPFS write. Only the versioned Swiss target is ours to clean here;
        // never touch legacy .crswap files from an older installation.
        if (
            packsDir &&
            packId === 'switzerland' &&
            /^switzerland-v\d+\.pmtiles$/.test(filename)
        ) {
            try {
                for await (const [name] of packsDir.entries()) {
                    const suffix = name.slice(filename.length);
                    if (
                        name.startsWith(filename) &&
                        /^(?:\.\d+)?\.crswap$/.test(suffix)
                    ) {
                        await packsDir.removeEntry(name);
                    }
                }
            } catch (e) {
                console.warn(
                    `[Packs] OPFS swap cleanup failed for ${filename}:`,
                    e
                );
            }
        }
        // Ancienne installation via Filesystem.External (migration)
        if (filename === `${packId}.pmtiles` && Capacitor.isNativePlatform()) {
            try {
                await Filesystem.deleteFile({
                    path: `${packId}.pmtiles`,
                    directory: Directory.External,
                });
            } catch {
                /* may not exist */
            }
        }
    }

    // ── Mount / Unmount ──────────────────────────────────────────────────────

    async mountPack(packId: string): Promise<void> {
        if (this.mountedArchives.has(packId)) return;

        const ps = this.packStates.get(packId);
        if (
            !ps ||
            (ps.status !== 'installed' &&
                ps.status !== 'purchased' &&
                ps.status !== 'update_available')
        )
            return;

        let archiveSource: 'opfs' | 'cdn' | 'asset' | null = null;
        try {
            let archive: pmtiles.PMTiles;

            // v5.28.2 : On utilise le fichier local si status === 'installed'
            // OU si status === 'update_available' et que le fichier est présent.
            const hasLocalFile =
                ps.status === 'installed' ||
                (ps.status === 'update_available' && ps.filePath);

            if (hasLocalFile) {
                // OPFS : FileSource lit les bytes directement (file.slice), sans réseau.
                // Fonctionne offline sur Android WebView (Chrome 105+) et PWA.
                try {
                    const root = await navigator.storage.getDirectory();
                    const packsDir = await root.getDirectoryHandle(PACKS_DIR);
                    const fileHandle = await packsDir.getFileHandle(
                        storedPackArchiveFilename(packId, ps)
                    );
                    const file = await fileHandle.getFile();
                    archive = new pmtiles.PMTiles(new pmtiles.FileSource(file));
                    archiveSource = 'opfs';
                } catch {
                    // Fichier OPFS absent (ancienne installation sur Filesystem.External ou cache vidé)
                    // → fallback CDN si possible, sinon reset
                    const meta = getPackMeta(packId);
                    if (meta) {
                        console.warn(
                            `[Packs] ${packId}: fichier OPFS absent, fallback CDN streaming.`
                        );
                        archive = new pmtiles.PMTiles(meta.cdnUrl);
                        archiveSource = 'cdn';
                    } else {
                        throw new Error('Pack metadata missing');
                    }
                }
            } else {
                // purchased (sans fichier local) → CDN streaming (requiert réseau)
                const meta = getPackMeta(packId);
                if (!meta) return;
                const isEmbeddedAsset = meta.cdnUrl.startsWith('./diagnostic/');
                archive = isEmbeddedAsset
                    ? new pmtiles.PMTiles(new EmbeddedAssetSource(meta.cdnUrl))
                    : new pmtiles.PMTiles(meta.cdnUrl);
                archiveSource = isEmbeddedAsset ? 'asset' : 'cdn';
            }

            // Warmup: read header pour vérifier l'archive
            const header = await archive.getHeader();
            const metadata = (await archive.getMetadata()) as Record<
                string,
                unknown
            >;
            const packMeta = getPackMeta(packId);
            const elevationMaxZoom = packMeta
                ? this.readElevationMaxZoom(
                      metadata,
                      packMeta.lodRange.min,
                      packMeta.lodRange.max
                  )
                : undefined;
            if (state.DEBUG_MODE)
                console.log(
                    `[Packs] ${packId} monté. LOD ${header.minZoom}-${header.maxZoom}, ${header.numTileEntries} tuiles`
                );

            this.mountedArchives.set(packId, {
                archive,
                source: archiveSource,
                elevationMaxZoom,
            });
            if (
                import.meta.env.VITE_DIAGNOSTIC_PACK_URL &&
                packId === 'switzerland_diagnostic'
            ) {
                console.info(
                    `[PackDiag] mounted ${packId} source=${archiveSource} elevationMaxZoom=${elevationMaxZoom ?? 'exact'}`
                );
            }
            eventBus.emit('packMounted', { packId });
        } catch (e) {
            if (archiveSource === 'opfs') {
                const filename = storedPackArchiveFilename(packId, ps);
                console.warn(
                    `[Packs] Archive locale invalide pour ${packId}; nouveau téléchargement requis.`,
                    e
                );
                ps.status = 'error';
                ps.installedVersion = 0;
                ps.filePath = null;
                ps.sizeMB = 0;
                this.persistStates();
                this.emitStatus(packId, 'error');
                await this.deletePackFile(packId, filename);
                return;
            }
            console.error(`[Packs] Erreur montage ${packId}:`, e);
        }
    }

    unmountPack(packId: string): void {
        if (this.mountedArchives.delete(packId)) {
            eventBus.emit('packUnmounted', { packId });
        }
    }

    async mountAllInstalled(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const [packId, ps] of this.packStates) {
            if (ps.status === 'installed' || ps.status === 'update_available') {
                promises.push(this.mountPack(packId));
            }
        }
        // Warmup parallèle non-bloquant pour le thread principal
        await Promise.all(promises);
    }

    // ── Tile Serving (chemin critique) ───────────────────────────────────────

    hasMountedPacks(): boolean {
        return this.mountedArchives.size > 0;
    }

    /**
     * Retourne le LOD minimum parmi tous les packs montés.
     * Utilisé par tileLoader pour savoir à partir de quel zoom interroger les packs.
     */
    getMinPackZoom(): number {
        let min = 18;
        for (const [packId] of this.mountedArchives) {
            const meta = getPackMeta(packId);
            if (meta && meta.lodRange.min < min) min = meta.lodRange.min;
        }
        return min;
    }

    /**
     * Vérifie si un pack installé/monté couvre le code pays donné.
     * Utilisé par tileLoader pour savoir s'il faut extraire la couleur depuis le pack.
     */
    hasInstalledPackForCountry(code: string): boolean {
        if (!code || !this.mountedArchives.size) return false;
        for (const [packId] of this.mountedArchives) {
            const meta = getPackMeta(packId);
            if (meta?.regionCheck === code) return true;
        }
        return false;
    }

    /**
     * Vrai si un pack local (OPFS ou asset embarqué) couvre le pays donné.
     * Un pack uniquement CDN ne justifie pas une lecture locale bloquante sur
     * le thread principal : le worker sait lire le cache et le réseau.
     */
    hasLocalPackForCountry(code: string): boolean {
        if (!code || !this.mountedArchives.size) return false;
        for (const [packId, mounted] of this.mountedArchives) {
            if (mounted.source !== 'opfs' && mounted.source !== 'asset')
                continue;
            const meta = getPackMeta(packId);
            if (meta?.regionCheck === code) return true;
        }
        return false;
    }

    async getTileFromPacks(
        z: number,
        x: number,
        y: number,
        type: 'color' | 'elevation' | 'overlay' = 'color',
        signal?: AbortSignal
    ): Promise<Blob | null> {
        return (
            (await this.getTileFromPacksDetailed(z, x, y, type, false, signal))
                ?.blob ?? null
        );
    }

    /**
     * Lit uniquement les archives locales (OPFS ou asset embarqué). Cette voie
     * n'interroge jamais un pack acheté disponible seulement sur le CDN.
     */
    async getOfflineTileFromPacks(
        z: number,
        x: number,
        y: number,
        type: 'color' | 'elevation' | 'overlay' = 'color',
        signal?: AbortSignal
    ): Promise<Blob | null> {
        return (
            (await this.getTileFromPacksDetailed(z, x, y, type, true, signal))
                ?.blob ?? null
        );
    }

    async getTileFromPacksDetailed(
        z: number,
        x: number,
        y: number,
        type: 'color' | 'elevation' | 'overlay',
        localOnly: boolean,
        signal?: AbortSignal
    ): Promise<{
        blob: Blob;
        packId: string;
        source: 'opfs' | 'cdn' | 'asset';
        elevationSourceZoom?: number;
    } | null> {
        // Deux passes : sources locales en premier, CDN ensuite.
        for (const pass of [true, false]) {
            for (const [packId, mounted] of this.mountedArchives) {
                const meta = getPackMeta(packId);
                if (!meta) continue;
                if (z < meta.lodRange.min || z > meta.lodRange.max) continue;
                if (!this.isTileInPackRegion(x, y, z, meta)) continue;

                const isLocal =
                    mounted.source === 'opfs' || mounted.source === 'asset';

                if (localOnly && !isLocal) continue;
                if (pass !== isLocal) continue;
                if (!isLocal && state.IS_OFFLINE) continue;

                try {
                    let tileData;
                    const sourceZoom =
                        type === 'elevation' &&
                        mounted.elevationMaxZoom !== undefined
                            ? Math.min(z, mounted.elevationMaxZoom)
                            : z;
                    const sourceTile = elevationParentTile(z, x, y, sourceZoom);

                    // v5.28.1 : Support Multi-Layer (Couleur + Élévation + Overlay dans 1 seul PMTiles)
                    if (type === 'color') {
                        tileData = await mounted.archive.getZxy(
                            z,
                            x,
                            y,
                            signal
                        );
                    } else {
                        // On utilise les offsets Hilbert définis dans build-country-pack.ts
                        const OFFSET_ELEV = 100_000_000_000;
                        const OFFSET_OVERLAY = 200_000_000_000;
                        const offset =
                            type === 'elevation' ? OFFSET_ELEV : OFFSET_OVERLAY;

                        const baseId = pmtiles.zxyToTileId(
                            sourceTile.z,
                            sourceTile.x,
                            sourceTile.y
                        );
                        const [fz, fx, fy] = pmtiles.tileIdToZxy(
                            baseId + offset
                        );
                        tileData = await mounted.archive.getZxy(
                            fz,
                            fx,
                            fy,
                            signal
                        );
                    }

                    if (tileData?.data) {
                        const mime =
                            type === 'overlay' ? 'image/png' : 'image/webp';
                        return {
                            blob: new Blob([tileData.data], { type: mime }),
                            packId,
                            source: mounted.source,
                            ...(type === 'elevation'
                                ? { elevationSourceZoom: sourceZoom }
                                : {}),
                        };
                    }
                } catch {
                    // Tuile manquante dans ce pack — continue
                }
            }
        }
        return null;
    }

    private isTileInPackRegion(
        tx: number,
        ty: number,
        zoom: number,
        meta: PackMeta
    ): boolean {
        const { lat: centerLat, lon: centerLon } = tilePixelToLatLon(
            tx + 0.5,
            ty + 0.5,
            Math.pow(2, zoom)
        );
        // Vérification polygone si le pays est connu, sinon fallback bbox
        if (
            meta.regionCheck &&
            isPointInCountry(centerLat, centerLon, meta.regionCheck)
        )
            return true;
        return (
            centerLat >= meta.bounds.minLat &&
            centerLat <= meta.bounds.maxLat &&
            centerLon >= meta.bounds.minLon &&
            centerLon <= meta.bounds.maxLon
        );
    }

    // ── Purchase status ──────────────────────────────────────────────────────

    onPurchaseCompleted(packId: string): void {
        const ps = this.getOrCreateState(packId);
        ps.status = 'purchased';
        this.persistStates();
        this.emitStatus(packId, 'purchased');
        // Auto-mount via CDN (pas besoin de download pour servir les tuiles)
        void this.mountPack(packId).catch((e) => {
            if (state.DEBUG_MODE) console.warn('[Packs] Mount failed', e);
        });
    }

    markPurchased(packId: string): void {
        const ps = this.getOrCreateState(packId);
        if (ps.status === 'not_purchased' || ps.status === 'error') {
            ps.status = 'purchased';
            this.persistStates();
            this.emitStatus(packId, 'purchased');
        }
        // Auto-mount via CDN, y compris après confirmation d'un statut
        // `purchased` restauré depuis le stockage local.
        void this.mountPack(packId).catch((e) => {
            if (state.DEBUG_MODE) console.warn('[Packs] Mount failed', e);
        });
    }

    // ── Updates ── (délégué à packCatalog.ts)

    private runCheckForUpdates(): void {
        const updated = checkForUpdates(this.packStates);
        if (updated.length > 0) this.persistStates();
        for (const packId of updated) {
            this.emitStatus(packId, 'update_available');
        }
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    private persistStates(): void {
        const obj: Record<string, PackState> = {};
        for (const [id, ps] of this.packStates) {
            obj[id] = ps;
        }
        localStorage.setItem(PACK_STATES_KEY, JSON.stringify(obj));

        // Sync reactive state arrays
        state.purchasedPacks = [...this.packStates.entries()]
            .filter(([, ps]) => ps.status !== 'not_purchased')
            .map(([id]) => id);
        state.installedPacks = [...this.packStates.entries()]
            .filter(
                ([, ps]) =>
                    ps.status === 'installed' ||
                    ps.status === 'update_available'
            )
            .map(([id]) => id);
    }

    private loadPersistedStates(): void {
        try {
            // v5.28.19 : Toujours réinitialiser les Maps pour éviter les fuites d'état
            // entre les tests ou lors de re-initialisations manuelles.
            this.packStates.clear();
            this.mountedArchives.clear();
            this.interruptedDownloads.clear();

            const raw =
                localStorage.getItem(PACK_STATES_KEY) ??
                (PACK_STATES_KEY !== STORAGE_KEYS.PACK_STATES
                    ? localStorage.getItem(STORAGE_KEYS.PACK_STATES)
                    : null);
            if (!raw) return;
            const obj = JSON.parse(raw) as Record<string, PackState>;
            for (const [id, ps] of Object.entries(obj)) {
                // Reset downloading state on restart
                if (ps.status === 'downloading') {
                    this.interruptedDownloads.add(id);
                    ps.status =
                        ps.filePath && ps.installedVersion > 0
                            ? 'installed'
                            : ps.downloadProgress > 0
                              ? 'error'
                              : 'purchased';
                    ps.downloadProgress = 0;
                }
                this.packStates.set(id, ps);
            }
            this.persistStates();
        } catch {
            /* corrupt data */
        }
    }

    private async cleanupInterruptedDownloads(): Promise<void> {
        for (const packId of this.interruptedDownloads) {
            const meta = getPackMeta(packId);
            const ps = this.packStates.get(packId);
            if (!meta || !ps) continue;
            const targetFilename = packArchiveFilename(packId, meta.version);
            if (ps.filePath !== `opfs://${PACKS_DIR}/${targetFilename}`) {
                await this.deletePackFile(packId, targetFilename);
            }
        }
        this.interruptedDownloads.clear();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private getOrCreateState(packId: string): PackState {
        let ps = this.packStates.get(packId);
        if (!ps) {
            ps = {
                id: packId,
                status: 'not_purchased',
                installedVersion: 0,
                downloadProgress: 0,
                filePath: null,
                sizeMB: 0,
            };
            this.packStates.set(packId, ps);
        }
        return ps;
    }

    private emitStatus(packId: string, status: PackStatus): void {
        eventBus.emit('packStatusChanged', { packId, status });
    }
}

export const packManager = new PackManager();
