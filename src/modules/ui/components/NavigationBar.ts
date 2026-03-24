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

                this.setActiveTab(tabId);

                if (tabId === 'map') {
                    sheetManager.open('layers');
                } else {
                    sheetManager.open(tabId);
                }
            };
            
            tab.addEventListener('click', onClick);
            this.addSubscription(() => tab.removeEventListener('click', onClick));
        });

        // Listen for overlay clicks to sync the active tab when a sheet is closed via overlay
        const overlay = document.getElementById('sheet-overlay');
        if (overlay) {
            const onOverlayClick = () => {
                this.setActiveTab('map');
            };
            overlay.addEventListener('click', onOverlayClick);
            this.addSubscription(() => overlay.removeEventListener('click', onOverlayClick));
        }
    }

    private setActiveTab(tabId: string): void {
        if (!this.element) return;
        
        const tabs = this.element.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }
}
