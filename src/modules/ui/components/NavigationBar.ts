import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';

export class NavigationBar extends BaseComponent {
    constructor() {
        super('template-nav-bar', 'nav-bar');
    }

    public render(): void {
        if (!this.element) return;

        const tabs = this.element.querySelectorAll('.nav-tab');
        
        tabs.forEach(tab => {
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

        // Set initial state
        this.syncActiveTab(sheetManager.getActiveSheetId());
    }

    private syncActiveTab(activeId: string | null): void {
        this.setActiveTab(activeId);
    }

    private setActiveTab(tabId: string | null): void {
        if (!this.element) return;
        
        const tabs = this.element.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            if (tabId && tab.getAttribute('data-tab') === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }
}
