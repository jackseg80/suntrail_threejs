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
import {
    fetchCatalog,
    getAvailablePacks,
    getPackMeta,
    findPackContaining as catalogFindPackContaining,
    checkForUpdates,
} from './packCatalog';

const PACK_STATES_KEY = STORAGE_KEYS.PACK_STATES;
const PACKS_DIR = 'packs';

class PackManager {
    private packStates: Map<string, PackState> = new Map();
    private mountedArchives: Map<string, pmtiles.PMTiles> = new Map();
    private downloadControllers: Map<string, AbortController> = new Map();

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        this.loadPersistedStates();
        await fetchCatalog();
        this.runCheckForUpdates();
        await this.syncDiskStates();

        // Auto-débloquer TOUS les packs sur localhost (Dev mode) ou via paramètre URL
        const params = new URLSearchParams(window.location.search);
        const isDev =
            location.hostname === 'localhost' ||
            location.hostname === '127.0.0.1' ||
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
        }

        // Mount all installed packs (purchased/installed/update_available)
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
     * Tente de réconcilier les états locaux avec les fichiers réellement présents dans l'OPFS.
     * Utile si le localStorage est perdu mais pas le stockage de fichiers (persistance Android/PWA).
     */
    private async syncDiskStates(): Promise<void> {
        try {
            const root = await navigator.storage.getDirectory();
            let packsDir: FileSystemDirectoryHandle;
            try {
                packsDir = await root.getDirectoryHandle(PACKS_DIR);
            } catch {
                return;
            } // Répertoire inexistant

            for (const meta of getAvailablePacks()) {
                const ps = this.getOrCreateState(meta.id);

                // Si l'état dit pas installé, mais que le fichier est là : on resync
                // On accepte 'purchased' ou 'not_purchased' (si on a un fichier on le prend)
                if (
                    ps.status === 'purchased' ||
                    ps.status === 'not_purchased'
                ) {
                    try {
                        await packsDir.getFileHandle(`${meta.id}.pmtiles`);
                        if (state.DEBUG_MODE)
                            console.log(
                                `[Packs] ${meta.id}: fichier trouvé sur disque, restauration de l'état 'installed'.`
                            );
                        ps.status = 'installed';
                        ps.installedVersion =
                            ps.installedVersion || meta.version;
                        ps.sizeMB = meta.sizeMB;
                        ps.filePath = `opfs://${PACKS_DIR}/${meta.id}.pmtiles`;
                    } catch {
                        /* absent */
                    }
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

        // Sur web : RevenueCat est la source de vérité — réinitialiser les états
        // 'purchased' avant de re-vérifier, pour révoquer les anciens auto-unlocks.
        // Les états 'installed' restent intacts (fichier téléchargé localement).
        if (!Capacitor.isNativePlatform()) {
            let changed = false;
            for (const [, ps] of this.packStates) {
                if (ps.status === 'purchased') {
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
        }

        const purchased = await iapService.checkAllPackPurchases();
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

            // Auto-mount
            await this.mountPack(packId);
            showToast(i18n.t('packs.toast.installed'));
            return true;
        } catch (e) {
            if ((e as Error).name === 'AbortError') {
                ps.status = 'purchased';
                ps.downloadProgress = 0;
                this.persistStates();
                this.emitStatus(packId, 'purchased');
                showToast(i18n.t('packs.toast.downloadCancelled'));
            } else {
                console.error(`[Packs] Download error for ${packId}:`, e);
                ps.status = 'error';
                this.persistStates();
                this.emitStatus(packId, 'error');
                const msg = (e as Error).message ?? '';
                if (msg.includes('quota') || msg.includes('ENOSPC')) {
                    showToast(i18n.t('packs.error.storageFull'));
                } else {
                    showToast(
                        `${i18n.t('packs.error.downloadFailed')} (${msg.slice(0, 60)})`
                    );
                }
                // Cleanup partial file
                this.deletePackFile(packId).catch(() => {});
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
        const fileHandle = await packsDir.getFileHandle(`${meta.id}.pmtiles`, {
            create: true,
        });
        const writable = await fileHandle.createWritable();

        const resp = await fetch(meta.cdnUrl, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const reader = resp.body?.getReader();
        if (!reader) throw new Error('No response body');

        const contentLength = parseInt(
            resp.headers.get('content-length') ?? '0',
            10
        );
        let received = 0;

        try {
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
            await writable.abort();
            throw e;
        }

        ps.filePath = `opfs://${PACKS_DIR}/${meta.id}.pmtiles`;
    }

    cancelDownload(packId: string): void {
        const controller = this.downloadControllers.get(packId);
        controller?.abort();
    }

    async deletePack(packId: string): Promise<void> {
        this.unmountPack(packId);
        await this.deletePackFile(packId);
        const ps = this.packStates.get(packId);
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

    private async deletePackFile(packId: string): Promise<void> {
        // OPFS (chemin principal depuis la nouvelle architecture)
        try {
            const root = await navigator.storage.getDirectory();
            const packsDir = await root.getDirectoryHandle(PACKS_DIR);
            await packsDir.removeEntry(`${packId}.pmtiles`);
        } catch {
            /* may not exist */
        }
        // Ancienne installation via Filesystem.External (migration)
        if (Capacitor.isNativePlatform()) {
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
                        `${packId}.pmtiles`
                    );
                    const file = await fileHandle.getFile();
                    archive = new pmtiles.PMTiles(new pmtiles.FileSource(file));
                } catch {
                    // Fichier OPFS absent (ancienne installation sur Filesystem.External ou cache vidé)
                    // → fallback CDN si possible, sinon reset
                    const meta = getPackMeta(packId);
                    if (meta) {
                        console.warn(
                            `[Packs] ${packId}: fichier OPFS absent, fallback CDN streaming.`
                        );
                        archive = new pmtiles.PMTiles(meta.cdnUrl);
                    } else {
                        throw new Error('Pack metadata missing');
                    }
                }
            } else {
                // purchased (sans fichier local) → CDN streaming (requiert réseau)
                const meta = getPackMeta(packId);
                if (!meta) return;
                archive = new pmtiles.PMTiles(meta.cdnUrl);
            }

            // Warmup: read header pour vérifier l'archive
            const header = await archive.getHeader();
            if (state.DEBUG_MODE)
                console.log(
                    `[Packs] ${packId} monté. LOD ${header.minZoom}-${header.maxZoom}, ${header.numTileEntries} tuiles`
                );

            this.mountedArchives.set(packId, archive);
            eventBus.emit('packMounted', { packId });
        } catch (e) {
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
            if (
                ps.status === 'installed' ||
                ps.status === 'purchased' ||
                ps.status === 'update_available'
            ) {
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

    async getTileFromPacks(
        z: number,
        x: number,
        y: number,
        type: 'color' | 'elevation' | 'overlay' = 'color'
    ): Promise<Blob | null> {
        return this.getTileFromPacksInternal(z, x, y, type, false);
    }

    /**
     * Lit uniquement les archives réellement installées en OPFS. Cette voie
     * n'interroge jamais un pack acheté disponible seulement sur le CDN.
     */
    async getOfflineTileFromPacks(
        z: number,
        x: number,
        y: number,
        type: 'color' | 'elevation' | 'overlay' = 'color'
    ): Promise<Blob | null> {
        return this.getTileFromPacksInternal(z, x, y, type, true);
    }

    private async getTileFromPacksInternal(
        z: number,
        x: number,
        y: number,
        type: 'color' | 'elevation' | 'overlay',
        localOnly: boolean
    ): Promise<Blob | null> {
        // Deux passes : OPFS (installed) en premier, CDN (purchased) ensuite.
        for (const pass of [true, false]) {
            for (const [packId, archive] of this.mountedArchives) {
                const meta = getPackMeta(packId);
                if (!meta) continue;
                if (z < meta.lodRange.min || z > meta.lodRange.max) continue;
                if (!this.isTileInPackRegion(x, y, z, meta)) continue;

                const ps = this.packStates.get(packId);
                const isOpfs =
                    ps?.status === 'installed' ||
                    ps?.status === 'update_available';

                if (localOnly && !isOpfs) continue;
                if (pass !== isOpfs) continue;
                if (!isOpfs && state.IS_OFFLINE) continue;

                try {
                    let tileData;

                    // v5.28.1 : Support Multi-Layer (Couleur + Élévation + Overlay dans 1 seul PMTiles)
                    if (type === 'color') {
                        tileData = await archive.getZxy(z, x, y);
                    } else {
                        // On utilise les offsets Hilbert définis dans build-country-pack.ts
                        const OFFSET_ELEV = 100_000_000_000;
                        const OFFSET_OVERLAY = 200_000_000_000;
                        const offset =
                            type === 'elevation' ? OFFSET_ELEV : OFFSET_OVERLAY;

                        const baseId = pmtiles.zxyToTileId(z, x, y);
                        const [fz, fx, fy] = pmtiles.tileIdToZxy(
                            baseId + offset
                        );
                        tileData = await archive.getZxy(fz, fx, fy);
                    }

                    if (tileData?.data) {
                        const mime =
                            type === 'overlay' ? 'image/png' : 'image/webp';
                        return new Blob([tileData.data], { type: mime });
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
        if (ps.status === 'not_purchased') {
            ps.status = 'purchased';
            this.persistStates();
            this.emitStatus(packId, 'purchased');
            // Auto-mount via CDN
            void this.mountPack(packId).catch((e) => {
                if (state.DEBUG_MODE) console.warn('[Packs] Mount failed', e);
            });
        }
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

            const raw = localStorage.getItem(PACK_STATES_KEY);
            if (!raw) return;
            const obj = JSON.parse(raw) as Record<string, PackState>;
            for (const [id, ps] of Object.entries(obj)) {
                // Reset downloading state on restart
                if (ps.status === 'downloading') {
                    ps.status = ps.downloadProgress > 0 ? 'error' : 'purchased';
                    ps.downloadProgress = 0;
                }
                this.packStates.set(id, ps);
            }
            this.persistStates();
        } catch {
            /* corrupt data */
        }
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
