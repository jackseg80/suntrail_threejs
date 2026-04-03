/**
 * packManager.ts — Country Packs Manager
 *
 * Gère le cycle de vie complet des packs pays :
 *   - Catalogue CDN (fetch + cache localStorage)
 *   - Téléchargement avec progression (Filesystem Android / OPFS PWA)
 *   - Montage d'archives PMTiles pour le serving local
 *   - Gating LOD selon isPro (Free = LOD 12, Pro = LOD 12-14)
 *
 * Les packs sont des achats non-consumable indépendants de l'abonnement Pro.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as pmtiles from 'pmtiles';
import { state } from './state';
import { eventBus } from './eventBus';
import { showToast } from './utils';
import { i18n } from '../i18n/I18nService';
import type { PackMeta, PackState, PackCatalog, PackStatus } from './packTypes';

const CATALOG_URL = import.meta.env.VITE_PACKS_CATALOG_URL as string | undefined;
const PACK_STATES_KEY = 'suntrail_pack_states';
const CATALOG_CACHE_KEY = 'suntrail_pack_catalog';
const PACKS_DIR = 'packs';

// Catalog embarqué — fallback si réseau absent ET localStorage vide.
// À mettre à jour manuellement à chaque nouveau pack publié.
const EMBEDDED_CATALOG: PackCatalog = {
    version: 1,
    packs: [
        {
            id: 'switzerland',
            productId: 'suntrail_pack_switzerland',
            name: { fr: 'Suisse HD', de: 'Schweiz HD', it: 'Svizzera HD', en: 'Switzerland HD' },
            bounds: { minLat: 45.8, maxLat: 47.8, minLon: 5.9, maxLon: 10.5 },
            lodRange: { min: 12, max: 14 },
            version: 1,
            sizeMB: 710,
            cdnUrl: `${CATALOG_URL?.replace('/catalog.json', '') ?? ''}/packs/suntrail-pack-switzerland-v1.pmtiles`,
            regionCheck: 'switzerland',
        },
        {
            id: 'france_alps',
            productId: 'suntrail_pack_france_alps',
            name: { fr: 'France Alpes HD', de: 'Französische Alpen HD', it: 'Alpi Francesi HD', en: 'French Alps HD' },
            bounds: { minLat: 43.5, maxLat: 46.5, minLon: 4.5, maxLon: 7.8 },
            lodRange: { min: 12, max: 14 },
            version: 1,
            sizeMB: 200,
            cdnUrl: `${CATALOG_URL?.replace('/catalog.json', '') ?? ''}/packs/suntrail-pack-france_alps-v1.pmtiles`,
            regionCheck: 'france_alps',
        },
    ],
};

class PackManager {
    private catalog: PackCatalog | null = null;
    private packStates: Map<string, PackState> = new Map();
    private mountedArchives: Map<string, pmtiles.PMTiles> = new Map();
    private downloadControllers: Map<string, AbortController> = new Map();
    private _tileHits = 0;
    private _tileMisses = 0;

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        this.loadPersistedStates();
        // Charger le catalog AVANT de monter (getPackMeta() a besoin du catalog)
        await this.fetchCatalog();
        // Mount all installed packs
        await this.mountAllInstalled();
        // Sync pack purchases avec RevenueCat (restaure après clear storage)
        this.syncPackPurchases().catch(() => {});
        console.log(`[Packs] Initialisé. ${this.mountedArchives.size} pack(s) monté(s).`);
    }

    /** Vérifie les achats de packs sur RevenueCat et met à jour les états locaux. */
    private async syncPackPurchases(): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        // Attendre que iapService soit initialisé
        const { iapService } = await import('./iapService');
        const ready = await iapService.waitForInit();
        if (!ready) return;
        const purchased = await iapService.checkAllPackPurchases();
        for (const packId of purchased) {
            this.markPurchased(packId);
        }
    }

    // ── Catalog ──────────────────────────────────────────────────────────────

    async fetchCatalog(): Promise<PackCatalog> {
        if (CATALOG_URL) {
            try {
                const resp = await fetch(CATALOG_URL, { cache: 'no-cache' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json() as PackCatalog;
                this.catalog = data;
                localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
                this.checkForUpdates();
                return data;
            } catch {
                console.warn('[Packs] Catalog réseau indisponible, fallback cache/embarqué.');
            }
        }
        // Priorité : localStorage → catalog embarqué (jamais null)
        this.catalog = this.getCachedCatalog() ?? EMBEDDED_CATALOG;
        return this.catalog;
    }

    private getCachedCatalog(): PackCatalog | null {
        try {
            const raw = localStorage.getItem(CATALOG_CACHE_KEY);
            return raw ? JSON.parse(raw) as PackCatalog : null;
        } catch { return null; }
    }

    getAvailablePacks(): PackMeta[] {
        return this.catalog?.packs ?? [];
    }

    getPackMeta(packId: string): PackMeta | undefined {
        return this.catalog?.packs.find(p => p.id === packId);
    }

    getPackState(packId: string): PackState | null {
        return this.packStates.get(packId) ?? null;
    }

    // ── Download & Install ───────────────────────────────────────────────────

    async downloadPack(packId: string, onProgress?: (p: number) => void): Promise<boolean> {
        const meta = this.getPackMeta(packId);
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
                    showToast(`${i18n.t('packs.error.downloadFailed')} (${msg.slice(0, 60)})`);
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
        meta: PackMeta, ps: PackState,
        onProgress?: (p: number) => void, signal?: AbortSignal
    ): Promise<void> {
        // OPFS (Origin Private File System) pour PWA
        const root = await navigator.storage.getDirectory();
        const packsDir = await root.getDirectoryHandle(PACKS_DIR, { create: true });
        const fileHandle = await packsDir.getFileHandle(`${meta.id}.pmtiles`, { create: true });
        const writable = await fileHandle.createWritable();

        const resp = await fetch(meta.cdnUrl, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const reader = resp.body?.getReader();
        if (!reader) throw new Error('No response body');

        const contentLength = parseInt(resp.headers.get('content-length') ?? '0', 10);
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
        } catch { /* may not exist */ }
        // Ancienne installation via Filesystem.External (migration)
        if (Capacitor.isNativePlatform()) {
            try {
                await Filesystem.deleteFile({
                    path: `${packId}.pmtiles`,
                    directory: Directory.External,
                });
            } catch { /* may not exist */ }
        }
    }

    // ── Mount / Unmount ──────────────────────────────────────────────────────

    async mountPack(packId: string): Promise<void> {
        if (this.mountedArchives.has(packId)) return;

        const ps = this.packStates.get(packId);
        if (!ps || (ps.status !== 'installed' && ps.status !== 'purchased' && ps.status !== 'update_available')) return;

        try {
            let archive: pmtiles.PMTiles;

            if (ps.status === 'installed') {
                // OPFS : FileSource lit les bytes directement (file.slice), sans réseau.
                // Fonctionne offline sur Android WebView (Chrome 105+) et PWA.
                try {
                    const root = await navigator.storage.getDirectory();
                    const packsDir = await root.getDirectoryHandle(PACKS_DIR);
                    const fileHandle = await packsDir.getFileHandle(`${packId}.pmtiles`);
                    const file = await fileHandle.getFile();
                    archive = new pmtiles.PMTiles(new pmtiles.FileSource(file));
                } catch {
                    // Fichier OPFS absent (ancienne installation sur Filesystem.External)
                    // → reset pour re-téléchargement
                    console.warn(`[Packs] ${packId}: fichier OPFS absent, re-téléchargement requis`);
                    ps.status = 'purchased';
                    this.persistStates();
                    this.emitStatus(packId, 'purchased');
                    const meta = this.getPackMeta(packId);
                    if (!meta) return;
                    archive = new pmtiles.PMTiles(meta.cdnUrl);
                }
            } else {
                // purchased / update_available → CDN streaming (requiert réseau)
                const meta = this.getPackMeta(packId);
                if (!meta) return;
                archive = new pmtiles.PMTiles(meta.cdnUrl);
            }

            // Warmup: read header pour vérifier l'archive
            const header = await archive.getHeader();
            console.log(`[Packs] ${packId} monté. LOD ${header.minZoom}-${header.maxZoom}, ${header.numTileEntries} tuiles`);

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
        for (const [packId, ps] of this.packStates) {
            if (ps.status === 'installed' || ps.status === 'purchased' || ps.status === 'update_available') {
                await this.mountPack(packId);
            }
        }
    }

    // ── Tile Serving (chemin critique) ───────────────────────────────────────

    hasMountedPacks(): boolean {
        return this.mountedArchives.size > 0;
    }

    async getTileFromPacks(z: number, x: number, y: number): Promise<Blob | null> {
        // LOD gating : Free = max LOD 12, Pro = max LOD 14
        const maxPackLod = state.isPro ? 14 : 12;
        if (z > maxPackLod) return null;

        for (const [packId, archive] of this.mountedArchives) {
            const meta = this.getPackMeta(packId);
            if (!meta) continue;

            // Check LOD range
            if (z < meta.lodRange.min || z > meta.lodRange.max) continue;

            // Check region bounds (simple bounding box, pas 4-corners ici car l'archive
            // ne contient QUE des tuiles valides — le filtrage 4-corners a été fait au build)
            if (!this.isTileInPackRegion(x, y, z, meta)) continue;

            try {
                const tileData = await archive.getZxy(z, x, y);
                if (tileData?.data) {
                    this._tileHits++;
                    if (this._tileHits % 50 === 1) {
                        console.log(`[Packs] ✓ ${this._tileHits} tuile(s) servie(s) depuis "${packId}" (dernière: LOD${z} ${x}/${y})`);
                    }
                    return new Blob([tileData.data], { type: 'image/webp' });
                }
            } catch {
                // Tile not in archive — continue to next pack
            }
        }
        this._tileMisses++;
        return null;
    }

    /** Stats de debug accessibles depuis la console : packManager.debugStats() */
    debugStats(): void {
        console.group('[Packs] Debug stats');
        console.log('Packs montés :', [...this.mountedArchives.keys()]);
        console.log('Tuiles servies depuis pack :', this._tileHits);
        console.log('Tuiles non trouvées dans pack :', this._tileMisses);
        for (const [id, ps] of this.packStates) {
            console.log(`  ${id}: status=${ps.status} progress=${ps.downloadProgress} path=${ps.filePath}`);
        }
        console.groupEnd();
    }

    private isTileInPackRegion(tx: number, ty: number, zoom: number, meta: PackMeta): boolean {
        const n = Math.pow(2, zoom);
        // Centre de la tuile
        const centerLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 0.5) / n))) * 180 / Math.PI;
        const centerLon = (tx + 0.5) / n * 360 - 180;
        return centerLat >= meta.bounds.minLat && centerLat <= meta.bounds.maxLat &&
               centerLon >= meta.bounds.minLon && centerLon <= meta.bounds.maxLon;
    }

    // ── Purchase status ──────────────────────────────────────────────────────

    onPurchaseCompleted(packId: string): void {
        const ps = this.getOrCreateState(packId);
        ps.status = 'purchased';
        this.persistStates();
        this.emitStatus(packId, 'purchased');
        // Auto-mount via CDN (pas besoin de download pour servir les tuiles)
        void this.mountPack(packId);
    }

    markPurchased(packId: string): void {
        const ps = this.getOrCreateState(packId);
        if (ps.status === 'not_purchased') {
            ps.status = 'purchased';
            this.persistStates();
            this.emitStatus(packId, 'purchased');
            // Auto-mount via CDN
            void this.mountPack(packId);
        }
    }

    // ── Updates ──────────────────────────────────────────────────────────────

    private checkForUpdates(): void {
        if (!this.catalog) return;
        for (const meta of this.catalog.packs) {
            const ps = this.packStates.get(meta.id);
            if (ps && ps.status === 'installed' && ps.installedVersion < meta.version) {
                ps.status = 'update_available';
                this.persistStates();
                this.emitStatus(meta.id, 'update_available');
            }
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
            .filter(([, ps]) => ps.status === 'installed' || ps.status === 'update_available')
            .map(([id]) => id);
    }

    private loadPersistedStates(): void {
        try {
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
        } catch { /* corrupt data */ }
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
