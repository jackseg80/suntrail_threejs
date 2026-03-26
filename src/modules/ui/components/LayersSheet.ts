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
        closeBtn?.addEventListener('click', () => sheetManager.close());

        const layerItems = this.element.querySelectorAll('.layer-item');
        layerItems.forEach(item => {
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
            trailsToggle.addEventListener('change', (e) => {
                state.SHOW_TRAILS = (e.target as HTMLInputElement).checked;
                saveSettings();
                this.refreshTerrain();
            });
        }

        const slopesToggle = this.element.querySelector('#layers-slopes-toggle') as HTMLInputElement;
        if (slopesToggle) {
            slopesToggle.checked = state.SHOW_SLOPES;
            slopesToggle.addEventListener('change', (e) => {
                state.SHOW_SLOPES = (e.target as HTMLInputElement).checked;
                updateSlopeVisibility(state.SHOW_SLOPES);
                saveSettings();
            });
        }

        this.addSubscription(state.subscribe('MAP_SOURCE', () => this.updateActiveLayer()));
        this.addSubscription(state.subscribe('SHOW_TRAILS', (val: boolean) => {
            if (trailsToggle) trailsToggle.checked = val;
        }));
        this.addSubscription(state.subscribe('SHOW_SLOPES', (val: boolean) => {
            if (slopesToggle) slopesToggle.checked = val;
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
            if ((item as HTMLElement).dataset.source === state.MAP_SOURCE) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    private refreshTerrain() {
        resetTerrain();
        updateVisibleTiles();
    }
}
