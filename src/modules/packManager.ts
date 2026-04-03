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

class PackManager {
    private catalog: PackCatalog | null = null;
    private packStates: Map<string, PackState> = new Map();
    private mountedArchives: Map<string, pmtiles.PMTiles> = new Map();
    private downloadControllers: Map<string, AbortController> = new Map();

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        this.loadPersistedStates();
        // Fetch catalog (non-blocking)
        this.fetchCatalog().catch(() => { /* catalog fail = silent */ });
        // Mount all installed packs
        await this.mountAllInstalled();
        console.log(`[Packs] Initialisé. ${this.mountedArchives.size} pack(s) monté(s).`);
    }

    // ── Catalog ──────────────────────────────────────────────────────────────

    async fetchCatalog(): Promise<PackCatalog | null> {
        if (!CATALOG_URL) {
            // Fallback cached catalog
            this.catalog = this.getCachedCatalog();
            return this.catalog;
        }
        try {
            const resp = await fetch(CATALOG_URL, { cache: 'no-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as PackCatalog;
            this.catalog = data;
            localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
            // Check for updates on installed packs
            this.checkForUpdates();
            return data;
        } catch {
            console.warn('[Packs] Catalog fetch failed, using cache.');
            this.catalog = this.getCachedCatalog();
            return this.catalog;
        }
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
            if (Capacitor.isNativePlatform()) {
                await this.downloadNative(meta, ps, onProgress, controller.signal);
            } else {
                await this.downloadWeb(meta, ps, onProgress, controller.signal);
            }

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
                ps.status = 'error';
                this.persistStates();
                this.emitStatus(packId, 'error');
                const msg = (e as Error).message ?? '';
                if (msg.includes('quota') || msg.includes('ENOSPC')) {
                    showToast(i18n.t('packs.error.storageFull'));
                } else {
                    showToast(i18n.t('packs.error.downloadFailed'));
                }
                // Cleanup partial file
                this.deletePackFile(packId).catch(() => {});
            }
            return false;
        } finally {
            this.downloadControllers.delete(packId);
        }
    }

    private async downloadNative(
        meta: PackMeta, ps: PackState,
        onProgress?: (p: number) => void, signal?: AbortSignal
    ): Promise<void> {
        const filePath = `${PACKS_DIR}/${meta.id}.pmtiles`;

        // Ensure directory exists
        try {
            await Filesystem.mkdir({ path: PACKS_DIR, directory: Directory.Data, recursive: true });
        } catch { /* exists */ }

        // Streaming download with fetch + chunked write
        const resp = await fetch(meta.cdnUrl, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const reader = resp.body?.getReader();
        if (!reader) throw new Error('No response body');

        const contentLength = parseInt(resp.headers.get('content-length') ?? '0', 10);
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (contentLength > 0) {
                ps.downloadProgress = received / contentLength;
                onProgress?.(ps.downloadProgress);
            }
        }

        // Combine chunks and write to filesystem
        const fullData = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            fullData.set(chunk, offset);
            offset += chunk.length;
        }

        // Write as base64 (Capacitor Filesystem requirement for binary)
        const base64 = btoa(String.fromCharCode(...fullData));
        await Filesystem.writeFile({
            path: filePath,
            data: base64,
            directory: Directory.Data,
        });

        ps.filePath = filePath;
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
        try {
            if (Capacitor.isNativePlatform()) {
                await Filesystem.deleteFile({
                    path: `${PACKS_DIR}/${packId}.pmtiles`,
                    directory: Directory.Data,
                });
            } else {
                const root = await navigator.storage.getDirectory();
                const packsDir = await root.getDirectoryHandle(PACKS_DIR);
                await packsDir.removeEntry(`${packId}.pmtiles`);
            }
        } catch { /* file may not exist */ }
    }

    // ── Mount / Unmount ──────────────────────────────────────────────────────

    async mountPack(packId: string): Promise<void> {
        if (this.mountedArchives.has(packId)) return;

        const ps = this.packStates.get(packId);
        if (!ps || ps.status !== 'installed' || !ps.filePath) return;

        try {
            let archive: pmtiles.PMTiles;

            if (Capacitor.isNativePlatform()) {
                // Read file from device storage
                const result = await Filesystem.readFile({
                    path: ps.filePath,
                    directory: Directory.Data,
                });
                // Convert base64 to ArrayBuffer
                const binary = atob(result.data as string);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const file = new File([blob], `${packId}.pmtiles`);
                archive = new pmtiles.PMTiles(new pmtiles.FileSource(file));
            } else {
                // OPFS
                const root = await navigator.storage.getDirectory();
                const packsDir = await root.getDirectoryHandle(PACKS_DIR);
                const fileHandle = await packsDir.getFileHandle(`${packId}.pmtiles`);
                const file = await fileHandle.getFile();
                archive = new pmtiles.PMTiles(new pmtiles.FileSource(file));
            }

            // Warmup: read header + one tile to prime internal cache
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
            if (ps.status === 'installed') {
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
                    return new Blob([tileData.data], { type: 'image/webp' });
                }
            } catch {
                // Tile not in archive — continue to next pack
            }
        }
        return null;
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
    }

    markPurchased(packId: string): void {
        const ps = this.getOrCreateState(packId);
        if (ps.status === 'not_purchased') {
            ps.status = 'purchased';
            this.persistStates();
            this.emitStatus(packId, 'purchased');
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
