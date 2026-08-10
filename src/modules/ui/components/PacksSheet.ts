import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { packManager } from '../../packManager';
import { getAvailablePacks, fetchCatalog } from '../../packCatalog';
import { iapService } from '../../iapService';
import { sheetManager } from '../core/SheetManager';
import { showToast } from '../../toast';
import { haptic } from '../../haptics';
import { eventBus } from '../../eventBus';
import { i18n } from '../../../i18n/I18nService';
import type { PackMeta, PackStatus } from '../../packTypes';

/** Convertit un code ISO 3166-1 alpha-2 en drapeau emoji. Ex: 'CH' → 🇨🇭 */
function countryCodeToFlag(code: string | undefined): string | null {
    if (!code || code.length !== 2) return null;
    const a = code.charCodeAt(0);
    const b = code.charCodeAt(1);
    if (a < 65 || a > 90 || b < 65 || b > 90) return null;
    return String.fromCodePoint(a - 65 + 0x1f1e6, b - 65 + 0x1f1e6);
}

/** Fallback pour les packs dont regionCheck est un packId (ex: CDN v2). */
const PACK_ID_TO_FLAG: Record<string, string> = {
    switzerland: '\u{1f1e8}\u{1f1ed}',
    france_alps: '\u{1f1eb}\u{1f1f7}',
    austria: '\u{1f1e6}\u{1f1f9}',
};

function packIdToFlag(id: string): string {
    return PACK_ID_TO_FLAG[id] ?? '\u{1F4CD}';
}
import templateHTML from '../templates/packs.html?raw';

export class PacksSheet extends BaseComponent {
    private highlightPackId: string | null = null;

    constructor() {
        super('template-packs', 'sheet-container', templateHTML);
    }

    public render(): void {
        if (!this.element) return;

        // Close button
        const closeBtn = this.element.querySelector('#close-packs');
        closeBtn?.setAttribute('aria-label', i18n.t('packs.aria.close'));
        closeBtn?.addEventListener('click', () => sheetManager.close());

        // Restore purchases
        const restoreBtn = this.element.querySelector('#packs-restore-btn');
        restoreBtn?.addEventListener('click', async () => {
            void haptic('medium');
            // Restaurer Pro + vérifier les packs (indépendamment)
            await iapService.restorePurchases();
            const purchased = await iapService.checkAllPackPurchases();
            for (const packId of purchased) {
                packManager.markPurchased(packId);
            }
            if (purchased.length > 0) {
                showToast(`${purchased.length} pack(s) restauré(s)`);
            }
            this.renderPackList();
        });

        // Listen for pack status changes
        const onStatusChanged = () => this.renderPackList();
        eventBus.on('packStatusChanged', onStatusChanged);
        this.subscriptions.push(() =>
            eventBus.off('packStatusChanged', onStatusChanged)
        );

        // Store packId to highlight when event is received before opening
        const onPackHighlight = ({ packId }: { packId: string }) => {
            this.highlightPackId = packId;
        };
        eventBus.on('packHighlight', onPackHighlight);
        this.subscriptions.push(() =>
            eventBus.off('packHighlight', onPackHighlight)
        );

        // Scroll to highlighted pack when this sheet opens
        const onSheetOpened = ({ id }: { id: string }) => {
            if (id === 'packs' && this.highlightPackId) {
                this.scrollToPack(this.highlightPackId);
                this.highlightPackId = null;
            }
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.subscriptions.push(() =>
            eventBus.off('sheetOpened', onSheetOpened)
        );

        const onLocaleChanged = () => {
            if (this.element) i18n.applyToDOM(this.element);
            this.renderPackList();
            this.updateStorageInfo();
        };
        eventBus.on('localeChanged', onLocaleChanged);
        this.subscriptions.push(() =>
            eventBus.off('localeChanged', onLocaleChanged)
        );

        // Initial render — retenter le fetch catalog si pas encore chargé
        void this.loadAndRender();
    }

    private async loadAndRender(): Promise<void> {
        this.renderPackList();
        this.updateStorageInfo();
        // Si le catalog est vide, retenter le fetch
        if (getAvailablePacks().length === 0) {
            await fetchCatalog();
            this.renderPackList();
            this.updateStorageInfo();
        }
    }

    private renderPackList(): void {
        const container = this.element?.querySelector('#packs-list');
        if (!container) return;

        const packs = getAvailablePacks();
        container.innerHTML = '';

        if (packs.length === 0) {
            this.renderFallbackList(container);
            return;
        }

        for (const meta of packs) {
            const card = this.createPackCard(meta);
            container.appendChild(card);
        }
    }

    private createPackCard(meta: PackMeta): HTMLElement {
        const ps = packManager.getPackState(meta.id);
        const status: PackStatus = ps?.status ?? 'not_purchased';
        const lang = state.lang || 'en';

        const card = document.createElement('div');
        card.className = 'pack-card';
        card.style.cssText =
            'padding:var(--space-3); margin-bottom:var(--space-3); background:var(--glass-bg); border-radius:var(--radius-lg); border:1px solid var(--glass-border);';

        // Header: flag + name + size
        const flag =
            countryCodeToFlag(meta.regionCheck) || packIdToFlag(meta.id);
        const name = meta.name[lang] || meta.name['en'] || meta.id;

        const header = document.createElement('div');
        header.style.cssText =
            'display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);';
        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:var(--space-2);">
                <span style="font-size:24px;">${flag}</span>
                <div>
                    <div style="font-weight:600; font-size:var(--text-sm);">${name}</div>
                    <div style="font-size:var(--text-xs); color:var(--text-3);">${i18n.t('packs.detailRange', { min: String(meta.lodRange.min), max: String(meta.lodRange.max) })}</div>
                </div>
            </div>
            <div style="font-size:var(--text-xs); color:var(--text-3);">${meta.sizeMB} MB</div>
        `;
        card.appendChild(header);

        // Description
        const descKey = `packs.description.${meta.id}`;
        const desc = document.createElement('div');
        desc.style.cssText =
            'font-size:var(--text-xs); color:var(--text-3); margin-bottom:var(--space-2);';
        desc.textContent = i18n.t(descKey);
        card.appendChild(desc);

        // Status & action button
        const actions = document.createElement('div');
        actions.style.cssText =
            'display:flex; align-items:center; gap:var(--space-2);';

        if (status === 'not_purchased') {
            const buyBtn = this.createButton(
                'packs.btn.buy',
                'var(--accent, #3b7ef8)'
            );
            buyBtn.addEventListener('click', () => this.handleBuy(meta.id));
            // Afficher le prix (natif + web)
            void iapService.getPackPrice(meta.id).then((price) => {
                if (price !== '—')
                    buyBtn.textContent = `${i18n.t('packs.btn.buy')} ${price}`;
            });
            actions.appendChild(buyBtn);
        } else if (status === 'purchased') {
            // Pack acheté = streaming CDN (réseau requis, pas de copie locale)
            const badge = document.createElement('span');
            badge.style.cssText =
                'color:#f59e0b; font-size:var(--text-sm); font-weight:600;';
            badge.textContent = i18n.t('packs.status.online');
            actions.appendChild(badge);

            // Bouton download pour mode offline
            const dlBtn = this.createButton(
                'packs.btn.download',
                'var(--accent, #3b7ef8)'
            );
            dlBtn.style.marginLeft = 'auto';
            dlBtn.addEventListener('click', () => this.handleDownload(meta.id));
            actions.appendChild(dlBtn);
        } else if (status === 'downloading') {
            // Progress bar
            const progress = ps?.downloadProgress ?? 0;
            const bar = document.createElement('div');
            bar.style.cssText =
                'flex:1; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;';
            const fill = document.createElement('div');
            fill.id = `pack-progress-${meta.id}`;
            fill.style.cssText = `height:100%; background:var(--accent, #3b7ef8); border-radius:3px; width:${Math.round(progress * 100)}%; transition:width 0.3s;`;
            bar.appendChild(fill);
            actions.appendChild(bar);

            const pct = document.createElement('span');
            pct.id = `pack-pct-${meta.id}`;
            pct.style.cssText =
                'font-size:var(--text-xs); color:var(--text-2); min-width:35px; text-align:right;';
            pct.textContent = `${Math.round(progress * 100)}%`;
            actions.appendChild(pct);

            const cancelBtn = this.createButton('packs.btn.cancel', '#ef4444');
            cancelBtn.style.padding = 'var(--space-1) var(--space-2)';
            cancelBtn.style.fontSize = 'var(--text-xs)';
            cancelBtn.addEventListener('click', () =>
                packManager.cancelDownload(meta.id)
            );
            actions.appendChild(cancelBtn);
        } else if (status === 'installed') {
            const badge = document.createElement('span');
            badge.style.cssText =
                'color:#22c55e; font-size:var(--text-sm); font-weight:600;';
            badge.textContent = `\u2713 ${i18n.t('packs.status.installed')}`;
            actions.appendChild(badge);

            const delBtn = this.createButton('packs.btn.delete', '#ef4444');
            delBtn.style.marginLeft = 'auto';
            delBtn.addEventListener('click', () => this.handleDelete(meta.id));
            actions.appendChild(delBtn);
        } else if (status === 'update_available') {
            const badge = document.createElement('span');
            badge.style.cssText = 'color:#f97316; font-size:var(--text-xs);';
            badge.textContent = i18n.t('packs.status.updateAvailable');
            actions.appendChild(badge);

            const updateBtn = this.createButton(
                'packs.btn.update',
                'var(--accent, #3b7ef8)'
            );
            updateBtn.style.marginLeft = 'auto';
            updateBtn.addEventListener('click', () =>
                this.handleDownload(meta.id)
            );
            actions.appendChild(updateBtn);
        } else if (status === 'error') {
            const errMsg = document.createElement('span');
            errMsg.style.cssText = 'color:#ef4444; font-size:var(--text-xs);';
            errMsg.textContent = i18n.t('packs.status.error');
            actions.appendChild(errMsg);

            const retryBtn = this.createButton(
                'packs.btn.retry',
                'var(--accent, #3b7ef8)'
            );
            retryBtn.style.marginLeft = 'auto';
            retryBtn.addEventListener('click', () =>
                this.handleDownload(meta.id)
            );
            actions.appendChild(retryBtn);
        }

        card.appendChild(actions);
        return card;
    }

    private createButton(i18nKey: string, bg: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'btn-go';
        btn.style.cssText = `margin:0; padding:var(--space-2) var(--space-3); font-size:var(--text-xs); background:${bg};`;
        btn.textContent = i18n.t(i18nKey);
        return btn;
    }

    private renderFallbackList(container: Element): void {
        // When catalog is not loaded, show minimal info
        const fallback = document.createElement('div');
        fallback.style.cssText =
            'text-align:center; padding:var(--space-4); color:var(--text-3); font-size:var(--text-sm);';
        fallback.textContent = i18n.t('packs.error.catalogFailed');
        container.appendChild(fallback);
    }

    // ── Highlight ─────────────────────────────────────────────────────────────

    /**
     * Scrolls to a specific pack card and adds a temporary highlight animation.
     * Sets the container scroll position to bring the card into view, then
     * applies a glowing border for 2 seconds.
     */
    private scrollToPack(packId: string): void {
        const container = this.element?.querySelector('#packs-list');
        if (!container) return;

        const cards = container.querySelectorAll('.pack-card');
        const index = getAvailablePacks().findIndex((p) => p.id === packId);
        if (index < 0 || index >= cards.length) return;

        const card = cards[index] as HTMLElement;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.transition = 'box-shadow 0.3s';
        card.style.boxShadow = '0 0 12px 2px var(--accent, #3b7ef8)';
        setTimeout(() => {
            card.style.boxShadow = '';
        }, 2000);
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    private async handleBuy(packId: string): Promise<void> {
        void haptic('medium');

        const success = await iapService.purchasePack(packId);
        if (success) {
            packManager.onPurchaseCompleted(packId);
            this.renderPackList();
        } else {
            // Si l'achat "échoue" car déjà possédé, vérifier l'entitlement
            const owned = await iapService.isPackPurchased(packId);
            if (owned) {
                packManager.onPurchaseCompleted(packId);
                this.renderPackList();
            } else {
                showToast(i18n.t('packs.error.purchaseFailed'));
            }
        }
    }

    private async handleDownload(packId: string): Promise<void> {
        void haptic('medium');
        await packManager.downloadPack(packId, (progress) => {
            // Update progress bar in real-time
            const fill = this.element?.querySelector(
                `#pack-progress-${packId}`
            ) as HTMLElement;
            const pct = this.element?.querySelector(
                `#pack-pct-${packId}`
            ) as HTMLElement;
            if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
            if (pct) pct.textContent = `${Math.round(progress * 100)}%`;
        });
        this.renderPackList();
        this.updateStorageInfo();
    }

    private async handleDelete(packId: string): Promise<void> {
        void haptic('medium');
        await packManager.deletePack(packId);
        this.renderPackList();
        this.updateStorageInfo();
    }

    // ── Storage info ─────────────────────────────────────────────────────────

    private updateStorageInfo(): void {
        const valueEl = this.element?.querySelector('#packs-storage-value');
        if (!valueEl) return;

        // Afficher la taille totale des packs réellement présents sur le disque
        const packs = getAvailablePacks();
        let installedMB = 0;
        for (const meta of packs) {
            const ps = packManager.getPackState(meta.id);
            // v5.28.2 : Seuls 'installed' et 'update_available' occupent de l'espace disque.
            // 'purchased' signifie que le pack est disponible en streaming (0 MB local).
            if (
                ps &&
                (ps.status === 'installed' || ps.status === 'update_available')
            ) {
                installedMB += meta.sizeMB;
            }
        }

        // Compter aussi les packs en cours de téléchargement (taille estimée)
        let downloadingMB = 0;
        for (const meta of packs) {
            const ps = packManager.getPackState(meta.id);
            if (ps?.status === 'downloading') {
                downloadingMB += meta.sizeMB;
            }
        }

        if (installedMB > 0 || downloadingMB > 0) {
            const total = installedMB + downloadingMB;
            const suffix =
                downloadingMB > 0
                    ? ` (${i18n.t('packs.status.downloading').toLowerCase()}...)`
                    : '';
            valueEl.textContent = `${total} MB${suffix}`;
        } else {
            valueEl.textContent = i18n.t('packs.storageEmpty');
        }
    }
}
