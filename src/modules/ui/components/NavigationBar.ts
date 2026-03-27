import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';
import { i18n } from '../../../i18n/I18nService';

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
