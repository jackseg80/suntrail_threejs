import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';
import { i18n } from '../../../i18n/I18nService';
import { state } from '../../state';
import { rebuildActiveTiles, updateVisibleTiles } from '../../terrain';
import { haptic } from '../../haptics';

export class NavigationBar extends BaseComponent {
    constructor() {
        super('template-nav-bar', 'nav-bar');
    }

    public render(): void {
        if (!this.element) return;

        // ARIA: nav container is a tablist
        this.element.setAttribute('role', 'tablist');

        const tabs = this.element.querySelectorAll('.nav-tab');
        
        tabs.forEach(tab => {
            // ARIA: each tab has role=tab and initial aria-selected
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', 'false');
            const onClick = () => {
                const tabId = tab.getAttribute('data-tab');
                if (!tabId) return;

                void haptic('light');
                if (sheetManager.getActiveSheetId() === tabId) {
                    sheetManager.close();
                    this.setActiveTab(null);
                } else {
                    sheetManager.open(tabId);
                    this.setActiveTab(tabId);
                }
            };
            
            tab.addEventListener('click', onClick);
            this.addSubscription(() => tab.removeEventListener('click', onClick));
        });

        // Bouton 2D/3D — toggle direct (ne passe pas par SheetManager)
        // Le bouton est dans la FAB stack (hors template nav-bar, v5.14.1)
        const modeToggle = document.querySelector('#nav-2d-toggle');
        if (modeToggle) {
            const syncToggleVisual = () => {
                const is2D = state.IS_2D_MODE;
                const label = modeToggle.querySelector('.nav-mode-label');
                if (label) label.textContent = is2D ? '2D' : '3D';
                modeToggle.setAttribute('aria-pressed', String(is2D));
                if (is2D) {
                    modeToggle.classList.add('active');
                } else {
                    modeToggle.classList.remove('active');
                }
            };

            const onModeToggleClick = () => {
                void haptic('light');
                const newMode = !state.IS_2D_MODE;
                state.IS_2D_MODE = newMode;
                state.isTiltTransitioning = true; // animation douce du tilt
                document.body.classList.toggle('mode-2d', newMode);
                syncToggleVisual();
                // Décaler le rebuild pour ne pas bloquer l'animation de tilt
                setTimeout(() => {
                    rebuildActiveTiles();
                    updateVisibleTiles();
                }, 150);
            };

            modeToggle.addEventListener('click', onModeToggleClick);
            this.addSubscription(() => modeToggle.removeEventListener('click', onModeToggleClick));

            // Sync réactif si IS_2D_MODE change depuis ailleurs (applyPreset eco)
            const unsubIS2D = state.subscribe('IS_2D_MODE', syncToggleVisual);
            this.addSubscription(unsubIS2D);

            // --- FORÇAGE 2D en LOD ≤ 10 ---
            // Au LOD 6-10 les tuiles sont déjà fetchées sans élévation (fetchAs2D=true dans terrain.ts).
            // La 3D n'a donc aucun sens : on verrouille le bouton et on force IS_2D_MODE=true.
            // Quand l'utilisateur zoome au-delà de LOD 10, on restaure son mode précédent.
            let _modeBeforeLowZoom: boolean | null = null;

            const syncLowZoomState = () => {
                const btn = modeToggle as HTMLButtonElement;
                const isLowZoom = state.ZOOM <= 10;

                if (isLowZoom && !btn.disabled) {
                    // → Entrée zone LOD ≤ 10 : mémoriser + forcer 2D
                    _modeBeforeLowZoom = state.IS_2D_MODE;
                    btn.disabled = true;
                    if (!state.IS_2D_MODE) {
                        state.IS_2D_MODE = true;
                        rebuildActiveTiles();
                        updateVisibleTiles();
                    }
                    // Toujours synchroniser la classe CSS mode-2d même si IS_2D_MODE
                    // était déjà true depuis localStorage (classe absente au démarrage sinon)
                    document.body.classList.add('mode-2d');
                    syncToggleVisual();
                } else if (!isLowZoom && btn.disabled) {
                    // → Sortie zone LOD ≤ 10 : restaurer le mode précédent
                    btn.disabled = false;
                    const previousMode = _modeBeforeLowZoom ?? false;
                    _modeBeforeLowZoom = null;
                    if (previousMode !== state.IS_2D_MODE) {
                        state.IS_2D_MODE = previousMode;
                        document.body.classList.toggle('mode-2d', previousMode);
                        rebuildActiveTiles();
                        updateVisibleTiles();
                    }
                    syncToggleVisual();
                }
            };

            const unsubZoom = state.subscribe('ZOOM', syncLowZoomState);
            this.addSubscription(unsubZoom);

            syncToggleVisual();
            syncLowZoomState(); // état initial (ex: démarrage en LOD 6)
        }

        // Listen for overlay clicks to sync the active tab
        const overlay = document.getElementById('sheet-overlay');
        if (overlay) {
            const onOverlayClick = () => this.setActiveTab(null);
            overlay.addEventListener('click', onOverlayClick);
            this.addSubscription(() => overlay.removeEventListener('click', onOverlayClick));
        }

        // Subscribe to sheet events for syncing active tab
        const onSheetOpened = ({ id }: { id: string }) => this.syncActiveTab(id);
        const onSheetClosed = ({ id }: { id: string | null }) => this.syncActiveTab(id);
        
        eventBus.on('sheetOpened', onSheetOpened);
        eventBus.on('sheetClosed', onSheetClosed);
        
        this.addSubscription(() => {
            eventBus.off('sheetOpened', onSheetOpened);
            eventBus.off('sheetClosed', onSheetClosed);
        });

        // Update tab labels on locale change
        const onLocaleChanged = () => this.updateTabLabels();
        eventBus.on('localeChanged', onLocaleChanged);
        this.addSubscription(() => eventBus.off('localeChanged', onLocaleChanged));

        // Set initial labels and state
        this.updateTabLabels();
        this.syncActiveTab(sheetManager.getActiveSheetId());
    }

    private updateTabLabels(): void {
        if (!this.element) return;
        const tabs = this.element.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            const tabId = tab.getAttribute('data-tab');
            if (!tabId) return;
            const labelEl = tab.querySelector('.nav-label');
            if (labelEl) {
                labelEl.textContent = i18n.t(`nav.tab.${tabId}`);
            }
            tab.setAttribute('aria-label', i18n.t(`nav.tab.${tabId}`));
        });
    }

    private syncActiveTab(activeId: string | null): void {
        this.setActiveTab(activeId);
    }

    private setActiveTab(tabId: string | null): void {
        if (!this.element) return;
        
        const tabs = this.element.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            // Skip mode toggle — its active state is managed independently
            if (tab.id === 'nav-2d-toggle') return;
            const isActive = !!(tabId && tab.getAttribute('data-tab') === tabId);
            if (isActive) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
            // ARIA: sync aria-selected with active state
            tab.setAttribute('aria-selected', String(isActive));
        });
    }
}
