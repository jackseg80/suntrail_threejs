import * as THREE from 'three';
import { BaseComponent } from '../core/BaseComponent';
import { state, saveSettings } from '../../state';
import { applyPreset } from '../../performance';
import { resetTerrain, updateVisibleTiles, updateHydrologyVisibility } from '../../terrain';
import { updateWeatherVisibility } from '../../weather';
import { deleteTerrainCache, downloadOfflineZone, setPMTilesSource } from '../../tileLoader';
import { SharedAPIKeyComponent } from './SharedAPIKeyComponent';
import { i18n } from '../../../i18n/I18nService';
import type { Locale } from '../../../i18n/I18nService';

import { sheetManager } from '../core/SheetManager';

export class SettingsSheet extends BaseComponent {
    constructor() {
        super('template-settings', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        // Close panel
        const closePanel = this.element.querySelector('#close-panel');
        closePanel?.setAttribute('aria-label', i18n.t('settings.aria.close'));
        closePanel?.addEventListener('click', () => sheetManager.close());

        // Presets
        this.element.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                applyPreset((btn as HTMLElement).dataset.preset as any);
            });
        });

        // Sliders
        this.bindSlider('res-slider', 'RESOLUTION', 'res-disp', this.refreshTerrain);
        this.bindSlider('range-slider', 'RANGE', 'range-disp', this.refreshTerrain);
        this.bindSlider('exag-slider', 'RELIEF_EXAGGERATION', 'exag-disp', this.refreshTerrain);
        this.bindSlider('veg-density-slider', 'VEGETATION_DENSITY', 'veg-density-disp', this.refreshTerrain);
        this.bindSlider('load-speed-slider', 'LOAD_DELAY_FACTOR', 'load-speed-disp');

        // Toggles
        this.bindToggle('energy-saver-toggle', 'ENERGY_SAVER');
        this.bindToggle('stats-toggle', 'SHOW_STATS', (val: boolean) => {
            // setVisible(val) synchronise exactement l'état du toggle avec l'affichage
            state.vramPanel?.setVisible?.(val);
        });
        this.bindToggle('debug-toggle', 'SHOW_DEBUG', (val: boolean) => {
            const zoomInd = document.getElementById('zoom-indicator');
            const compass = document.getElementById('compass-canvas');
            if (zoomInd) zoomInd.style.display = val ? 'block' : 'none';
            if (compass) compass.style.display = val ? 'block' : 'none';
        });
        this.bindToggle('veg-toggle', 'SHOW_VEGETATION', this.refreshTerrain);
        this.bindToggle('buildings-toggle', 'SHOW_BUILDINGS', this.refreshTerrain);
        this.bindToggle('hydro-toggle', 'SHOW_HYDROLOGY', (val: boolean) => updateHydrologyVisibility(val));
        this.bindToggle('weather-toggle', 'SHOW_WEATHER', (val: boolean) => updateWeatherVisibility(val));
        this.bindToggle('poi-toggle', 'SHOW_SIGNPOSTS', this.refreshTerrain);
        this.bindToggle('shadow-toggle', 'SHADOWS', (val: boolean) => {
            if (state.sunLight) state.sunLight.castShadow = val;
        });

        // Fog
        const fogSlider = this.element.querySelector('#fog-slider') as HTMLInputElement;
        if (fogSlider) {
            // ARIA: fog slider attributes
            fogSlider.setAttribute('aria-label', 'FOG_FAR');
            fogSlider.setAttribute('aria-valuemin', fogSlider.min);
            fogSlider.setAttribute('aria-valuemax', fogSlider.max);
            fogSlider.setAttribute('aria-valuenow', fogSlider.value);

            fogSlider.addEventListener('input', (e) => {
                state.FOG_FAR = parseFloat((e.target as HTMLInputElement).value) * 1000;
                // ARIA: sync valuenow
                fogSlider.setAttribute('aria-valuenow', (e.target as HTMLInputElement).value);
                if (state.scene?.fog && state.scene.fog instanceof THREE.Fog) {
                    state.scene.fog.far = state.FOG_FAR;
                }
            });
            fogSlider.addEventListener('change', () => saveSettings());
        }

        // API Key (shared component)
        new SharedAPIKeyComponent('settings-api-key-slot', this.refreshTerrain).hydrate();

        // Storage
        const clearCacheBtn = this.element.querySelector('#clear-cache-btn');
        clearCacheBtn?.addEventListener('click', deleteTerrainCache);

        const downloadZoneBtn = this.element.querySelector('#download-zone-btn');
        downloadZoneBtn?.addEventListener('click', async () => {
            if (!downloadZoneBtn) return;
            downloadZoneBtn.setAttribute('disabled', 'true');
            await downloadOfflineZone(state.TARGET_LAT, state.TARGET_LON, (done, total) => {
                const span = downloadZoneBtn.querySelector('span');
                if (span) span.textContent = i18n.t('connectivity.download.progress', { percent: Math.round(done/total*100).toString() });
            });
            downloadZoneBtn.removeAttribute('disabled');
            const span = downloadZoneBtn.querySelector('span');
            if (span) span.textContent = i18n.t('connectivity.download.done');
        });

        // PMTiles
        const pmtilesBtn = this.element.querySelector('#pmtiles-btn');
        const pmtilesUpload = this.element.querySelector('#pmtiles-upload') as HTMLInputElement;
        pmtilesBtn?.addEventListener('click', () => pmtilesUpload?.click());
        pmtilesUpload?.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                await setPMTilesSource(file);
                this.refreshTerrain();
            }
        });

        // Trail follow
        const trailFollowToggle = this.element.querySelector('#trail-follow-toggle') as HTMLInputElement;
        if (trailFollowToggle) {
            // ARIA: toggle as switch
            trailFollowToggle.setAttribute('role', 'switch');
            trailFollowToggle.setAttribute('aria-checked', String(trailFollowToggle.checked));

            trailFollowToggle.addEventListener('change', (e) => {
                state.isFollowingTrail = (e.target as HTMLInputElement).checked;
                // ARIA: sync aria-checked
                trailFollowToggle.setAttribute('aria-checked', String((e.target as HTMLInputElement).checked));
            });
        }

        // Subscribe to state changes to update UI
        const keysToSubscribe = [
            'RESOLUTION', 'RANGE', 'RELIEF_EXAGGERATION', 'VEGETATION_DENSITY',
            'FOG_FAR', 'ENERGY_SAVER',
            'SHOW_STATS', 'SHOW_DEBUG', 'SHOW_VEGETATION', 'SHOW_BUILDINGS',
            'SHOW_HYDROLOGY', 'SHOW_SIGNPOSTS', 'SHADOWS', 'LOAD_DELAY_FACTOR',
            'isFollowingTrail', 'SHOW_TRAILS', 'SHOW_SLOPES', 'PERFORMANCE_PRESET'
        ];

        keysToSubscribe.forEach(key => {
            this.addSubscription(state.subscribe(key, (value: any) => {
                this.updateUIFromState(key, value);
            }));
        });

        // Language selector
        this.createLanguageSelector();

        // Initial UI update
        this.updateAllUI();
    }



    private bindSlider(id: string, stateKey: keyof typeof state, dispId: string, onChange?: () => void) {
        if (!this.element) return;
        const slider = this.element.querySelector(`#${id}`) as HTMLInputElement;
        const disp = this.element.querySelector(`#${dispId}`);
        if (slider) {
            // ARIA: slider attributes
            slider.setAttribute('aria-label', stateKey);
            slider.setAttribute('aria-valuemin', slider.min);
            slider.setAttribute('aria-valuemax', slider.max);
            slider.setAttribute('aria-valuenow', slider.value);

            slider.addEventListener('input', () => {
                (state as any)[stateKey] = parseFloat(slider.value);
                if (disp) disp.textContent = slider.value;
                // ARIA: sync valuenow
                slider.setAttribute('aria-valuenow', slider.value);
            });
            slider.addEventListener('change', () => {
                saveSettings();
                if (onChange) onChange();
            });
        }
    }

    private bindToggle(id: string, stateKey: keyof typeof state, onChange?: (val: boolean) => void) {
        if (!this.element) return;
        const toggle = this.element.querySelector(`#${id}`) as HTMLInputElement;
        if (toggle) {
            // ARIA: toggle as switch
            toggle.setAttribute('role', 'switch');
            toggle.setAttribute('aria-checked', String(toggle.checked));

            toggle.addEventListener('change', () => {
                (state as any)[stateKey] = toggle.checked;
                // ARIA: sync aria-checked
                toggle.setAttribute('aria-checked', String(toggle.checked));
                saveSettings();
                if (onChange) onChange(toggle.checked);
            });
        }
    }

    private updateUIFromState(key: string, value: any) {
        if (!this.element) return;

        switch (key) {
            case 'RESOLUTION':
                this.updateSlider('res-slider', 'res-disp', value);
                break;
            case 'RANGE':
                this.updateSlider('range-slider', 'range-disp', value);
                break;
            case 'RELIEF_EXAGGERATION':
                this.updateSlider('exag-slider', 'exag-disp', value);
                break;
            case 'VEGETATION_DENSITY':
                this.updateSlider('veg-density-slider', 'veg-density-disp', value);
                break;
            case 'FOG_FAR':
                const fogSlider = this.element.querySelector('#fog-slider') as HTMLInputElement;
                if (fogSlider) fogSlider.value = (value / 1000).toString();
                break;
            case 'ENERGY_SAVER':
                this.updateToggle('energy-saver-toggle', value);
                break;
            case 'SHOW_STATS':
                this.updateToggle('stats-toggle', value);
                break;
            case 'SHOW_DEBUG':
                this.updateToggle('debug-toggle', value);
                break;
            case 'SHOW_VEGETATION':
                this.updateToggle('veg-toggle', value);
                break;
            case 'SHOW_BUILDINGS':
                this.updateToggle('buildings-toggle', value);
                break;
            case 'SHOW_HYDROLOGY':
                this.updateToggle('hydro-toggle', value);
                break;
            case 'SHOW_SIGNPOSTS':
                this.updateToggle('poi-toggle', value);
                break;
            case 'SHADOWS':
                this.updateToggle('shadow-toggle', value);
                break;
            case 'LOAD_DELAY_FACTOR':
                this.updateSlider('load-speed-slider', 'load-speed-disp', value);
                break;
            case 'isFollowingTrail':
                this.updateToggle('trail-follow-toggle', value);
                break;
            case 'SHOW_TRAILS':
                const trailsToggle = document.getElementById('trails-toggle') as HTMLInputElement;
                if (trailsToggle) trailsToggle.checked = value;
                break;
            case 'SHOW_SLOPES':
                const slopesToggle = document.getElementById('slopes-toggle') as HTMLInputElement;
                if (slopesToggle) slopesToggle.checked = value;
                break;
            case 'PERFORMANCE_PRESET':
                this.element.querySelectorAll('.preset-btn').forEach(btn => {
                    if ((btn as HTMLElement).dataset.preset === value) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                break;
        }
    }

    private updateSlider(id: string, dispId: string, value: number) {
        if (!this.element) return;
        const slider = this.element.querySelector(`#${id}`) as HTMLInputElement;
        const disp = this.element.querySelector(`#${dispId}`);
        if (slider) {
            slider.value = value.toString();
            // ARIA: sync valuenow
            slider.setAttribute('aria-valuenow', value.toString());
        }
        if (disp) disp.textContent = value.toString();
    }

    private updateToggle(id: string, value: boolean) {
        if (!this.element) return;
        const toggle = this.element.querySelector(`#${id}`) as HTMLInputElement;
        if (toggle) {
            toggle.checked = value;
            // ARIA: sync aria-checked
            toggle.setAttribute('aria-checked', String(value));
        }
    }

    private updateAllUI() {
        this.updateUIFromState('RESOLUTION', state.RESOLUTION);
        this.updateUIFromState('RANGE', state.RANGE);
        this.updateUIFromState('RELIEF_EXAGGERATION', state.RELIEF_EXAGGERATION);
        this.updateUIFromState('VEGETATION_DENSITY', state.VEGETATION_DENSITY);
        this.updateUIFromState('FOG_FAR', state.FOG_FAR);
        this.updateUIFromState('ENERGY_SAVER', state.ENERGY_SAVER);
        this.updateUIFromState('SHOW_STATS', state.SHOW_STATS);
        this.updateUIFromState('SHOW_DEBUG', state.SHOW_DEBUG);
        this.updateUIFromState('SHOW_VEGETATION', state.SHOW_VEGETATION);
        this.updateUIFromState('SHOW_BUILDINGS', state.SHOW_BUILDINGS);
        this.updateUIFromState('SHOW_HYDROLOGY', state.SHOW_HYDROLOGY);
        this.updateUIFromState('SHOW_SIGNPOSTS', state.SHOW_SIGNPOSTS);
        this.updateUIFromState('SHADOWS', state.SHADOWS);
        this.updateUIFromState('LOAD_DELAY_FACTOR', state.LOAD_DELAY_FACTOR);
        this.updateUIFromState('isFollowingTrail', state.isFollowingTrail);
        this.updateUIFromState('SHOW_TRAILS', state.SHOW_TRAILS);
        this.updateUIFromState('SHOW_SLOPES', state.SHOW_SLOPES);
    }

    private createLanguageSelector(): void {
        if (!this.element) return;
        const panel = this.element.querySelector('#panel') || this.element;

        const section = document.createElement('div');
        section.className = 'settings-section';
        section.innerHTML = `
            <div class="setting-row" style="margin-top:8px;">
                <div class="setting-label" data-i18n="settings.section.language">${i18n.t('settings.section.language')}</div>
                <select id="lang-select" class="lang-select">
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="it">Italiano</option>
                    <option value="en">English</option>
                </select>
            </div>
        `;
        panel.appendChild(section);

        const langSelect = section.querySelector('#lang-select') as HTMLSelectElement;
        if (langSelect) {
            langSelect.value = i18n.getLocale();
            langSelect.addEventListener('change', () => {
                i18n.setLocale(langSelect.value as Locale);
                saveSettings();
            });
        }
    }

    private refreshTerrain = () => {
        resetTerrain();
        updateVisibleTiles();
    }
}
