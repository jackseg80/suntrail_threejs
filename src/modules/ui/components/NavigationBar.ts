import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';

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

        // Global sync for "X" buttons or map clicks closing the sheet
        const syncInterval = setInterval(() => {
            const activeId = sheetManager.getActiveSheetId();
            const currentActiveTab = this.element?.querySelector('.nav-tab.active')?.getAttribute('data-tab');
            if (activeId !== currentActiveTab) {
                this.setActiveTab(activeId);
            }
        }, 300);
        this.addSubscription(() => clearInterval(syncInterval));
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
