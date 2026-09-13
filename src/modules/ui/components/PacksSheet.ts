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

        // Back to Connectivity when opened from there, otherwise close.
        const closeBtn = this.element.querySelector('#close-packs');
        const syncNavigationControl = () => {
            closeBtn?.setAttribute(
                'aria-label',
                i18n.t(
                    sheetManager.canGoBack()
                        ? 'packs.aria.back'
                        : 'packs.aria.close'
                )
            );
        };
        syncNavigationControl();
        closeBtn?.addEventListener('click', () => sheetManager.back());

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
            if (id === 'packs') syncNavigationControl();
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
            syncNavigationControl();
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

        // Header: flag + name + size
        const flag =
            countryCodeToFlag(meta.regionCheck) || packIdToFlag(meta.id);
        const name = meta.name[lang] || meta.name['en'] || meta.id;

        const header = document.createElement('div');
        header.className = 'pack-card-header';
        header.innerHTML = `
            <div class="pack-card-identity">
                <span class="pack-card-flag" aria-hidden="true">${flag}</span>
                <div class="pack-card-copy">
                    <div class="pack-card-name">${name}</div>
                    <div class="pack-card-detail">${i18n.t('packs.detailRange', { min: String(meta.lodRange.min), max: String(meta.lodRange.max) })}</div>
                </div>
            </div>
            <div class="pack-card-size">${meta.sizeMB} MB</div>
        `;
        card.appendChild(header);

        // Description
        const descKey = `packs.description.${meta.id}`;
        const desc = document.createElement('div');
        desc.className = 'pack-card-description';
        desc.textContent = i18n.t(descKey);
        card.appendChild(desc);

        // Status & action button
        const actions = document.createElement('div');
        actions.className = 'pack-card-actions';

        if (status === 'not_purchased') {
            const buyBtn = this.createButton('packs.btn.buy');
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
            badge.className = 'pack-status pack-status--online';
            badge.textContent = i18n.t('packs.status.online');
            actions.appendChild(badge);

            // Bouton download pour mode offline
            const dlBtn = this.createButton('packs.btn.download');
            dlBtn.classList.add('pack-action--end');
            dlBtn.addEventListener('click', () => this.handleDownload(meta.id));
            actions.appendChild(dlBtn);
        } else if (status === 'downloading') {
            // Progress bar
            const progress = ps?.downloadProgress ?? 0;
            const bar = document.createElement('div');
            bar.className = 'pack-progress';
            const fill = document.createElement('div');
            fill.id = `pack-progress-${meta.id}`;
            fill.className = 'pack-progress-fill';
            fill.style.width = `${Math.round(progress * 100)}%`;
            bar.appendChild(fill);
            actions.appendChild(bar);

            const pct = document.createElement('span');
            pct.id = `pack-pct-${meta.id}`;
            pct.className = 'pack-progress-value';
            pct.textContent = `${Math.round(progress * 100)}%`;
            actions.appendChild(pct);

            const cancelBtn = this.createButton('packs.btn.cancel', 'danger');
            cancelBtn.classList.add('pack-action--compact');
            cancelBtn.addEventListener('click', () =>
                packManager.cancelDownload(meta.id)
            );
            actions.appendChild(cancelBtn);
        } else if (status === 'installed') {
            const badge = document.createElement('span');
            badge.className = 'pack-status pack-status--installed';
            badge.textContent = `\u2713 ${i18n.t('packs.status.installed')}`;
            actions.appendChild(badge);

            const delBtn = this.createButton('packs.btn.delete', 'danger');
            delBtn.classList.add('pack-action--end');
            delBtn.addEventListener('click', () => this.handleDelete(meta.id));
            actions.appendChild(delBtn);
        } else if (status === 'update_available') {
            const badge = document.createElement('span');
            badge.className = 'pack-status pack-status--update';
            badge.textContent = i18n.t('packs.status.updateAvailable');
            actions.appendChild(badge);

            const updateBtn = this.createButton('packs.btn.update');
            updateBtn.classList.add('pack-action--end');
            updateBtn.addEventListener('click', () =>
                this.handleDownload(meta.id)
            );
            actions.appendChild(updateBtn);
        } else if (status === 'error') {
            const errMsg = document.createElement('span');
            errMsg.className = 'pack-status pack-status--error';
            errMsg.textContent = i18n.t('packs.status.error');
            actions.appendChild(errMsg);

            const retryBtn = this.createButton('packs.btn.retry');
            retryBtn.classList.add('pack-action--end');
            retryBtn.addEventListener('click', () =>
                this.handleDownload(meta.id)
            );
            actions.appendChild(retryBtn);
        }

        card.appendChild(actions);
        return card;
    }

    private createButton(
        i18nKey: string,
        variant: 'primary' | 'danger' = 'primary'
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pack-action pack-action--${variant}`;
        btn.textContent = i18n.t(i18nKey);
        return btn;
    }

    private renderFallbackList(container: Element): void {
        // When catalog is not loaded, show minimal info
        const fallback = document.createElement('div');
        fallback.className = 'packs-empty-state';
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
        card.classList.add('is-highlighted');
        setTimeout(() => {
            card.classList.remove('is-highlighted');
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
