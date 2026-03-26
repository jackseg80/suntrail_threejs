import { BaseComponent } from '../core/BaseComponent';
import { state, saveSettings } from '../../state';
import { resetTerrain, updateVisibleTiles, updateSlopeVisibility } from '../../terrain';
import { sheetManager } from '../core/SheetManager';

export class LayersSheet extends BaseComponent {
    constructor() {
        super('template-layers', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeBtn = this.element.querySelector('#close-layers');
        closeBtn?.setAttribute('aria-label', 'Fermer les calques');
        closeBtn?.addEventListener('click', () => sheetManager.close());

        const layerItems = this.element.querySelectorAll('.layer-item');
        // ARIA: layer grid acts as a listbox
        const layerGrid = this.element.querySelector('.layers-grid, .lyr-grid');
        layerGrid?.setAttribute('role', 'listbox');

        layerItems.forEach(item => {
            item.setAttribute('role', 'option');
            item.addEventListener('click', () => {
                const source = (item as HTMLElement).dataset.source;
                if (source) {
                    state.MAP_SOURCE = source;
                    state.hasManualSource = true;
                    saveSettings();
                    this.refreshTerrain();
                    this.updateActiveLayer();
                }
            });
        });

        const trailsToggle = this.element.querySelector('#layers-trails-toggle') as HTMLInputElement;
        if (trailsToggle) {
            trailsToggle.checked = state.SHOW_TRAILS;
            // ARIA: toggle as switch
            trailsToggle.setAttribute('role', 'switch');
            trailsToggle.setAttribute('aria-checked', String(trailsToggle.checked));

            trailsToggle.addEventListener('change', (e) => {
                state.SHOW_TRAILS = (e.target as HTMLInputElement).checked;
                trailsToggle.setAttribute('aria-checked', String((e.target as HTMLInputElement).checked));
                saveSettings();
                this.refreshTerrain();
            });
        }

        const slopesToggle = this.element.querySelector('#layers-slopes-toggle') as HTMLInputElement;
        if (slopesToggle) {
            slopesToggle.checked = state.SHOW_SLOPES;
            // ARIA: toggle as switch
            slopesToggle.setAttribute('role', 'switch');
            slopesToggle.setAttribute('aria-checked', String(slopesToggle.checked));

            slopesToggle.addEventListener('change', (e) => {
                state.SHOW_SLOPES = (e.target as HTMLInputElement).checked;
                slopesToggle.setAttribute('aria-checked', String((e.target as HTMLInputElement).checked));
                updateSlopeVisibility(state.SHOW_SLOPES);
                saveSettings();
            });
        }

        this.addSubscription(state.subscribe('MAP_SOURCE', () => this.updateActiveLayer()));
        this.addSubscription(state.subscribe('SHOW_TRAILS', (val: boolean) => {
            if (trailsToggle) {
                trailsToggle.checked = val;
                trailsToggle.setAttribute('aria-checked', String(val));
            }
        }));
        this.addSubscription(state.subscribe('SHOW_SLOPES', (val: boolean) => {
            if (slopesToggle) {
                slopesToggle.checked = val;
                slopesToggle.setAttribute('aria-checked', String(val));
            }
        }));

        this.addSubscription(state.subscribe('ZOOM', () => this.updateLODAvailability()));

        this.updateActiveLayer();
        this.updateLODAvailability();
    }

    private updateLODAvailability() {
        if (!this.element) return;
        const MIN_DATA_LOD = 11;
        const isAvailable = state.ZOOM >= MIN_DATA_LOD;

        const rows = ['trails', 'slopes'];
        rows.forEach(type => {
            const row = this.element?.querySelector(`#row-${type}`) as HTMLElement;
            const toggle = this.element?.querySelector(`#layers-${type}-toggle`) as HTMLInputElement;
            const warning = this.element?.querySelector(`#row-${type} .lod-warning`) as HTMLElement;
            const infoIcon = this.element?.querySelector(`#row-${type} .info-icon`) as HTMLElement;

            if (row && toggle && warning && infoIcon) {
                if (isAvailable) {
                    row.classList.remove('lyr-row-unavailable');
                    toggle.disabled = false;
                    warning.style.display = 'none';
                    infoIcon.style.display = 'none';
                } else {
                    row.classList.add('lyr-row-unavailable');
                    toggle.disabled = true;
                    warning.style.display = 'block';
                    infoIcon.style.display = 'block';
                }
            }
        });
    }

    private updateActiveLayer() {
        if (!this.element) return;
        this.element.querySelectorAll('.layer-item').forEach(item => {
            const isActive = (item as HTMLElement).dataset.source === state.MAP_SOURCE;
            if (isActive) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
            // ARIA: sync aria-selected with active state
            item.setAttribute('aria-selected', String(isActive));
        });
    }

    private refreshTerrain() {
        resetTerrain();
        updateVisibleTiles();
    }
}
