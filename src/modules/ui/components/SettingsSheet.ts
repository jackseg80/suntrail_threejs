import * as THREE from 'three';
import { BaseComponent } from '../core/BaseComponent';
import { state, saveSettings } from '../../state';
import { applyPreset, getGpuInfo, detectBestPreset } from '../../performance';
import { resetTerrain, updateVisibleTiles, updateHydrologyVisibility } from '../../terrain';
import { updateWeatherVisibility } from '../../weather';
import { i18n } from '../../../i18n/I18nService';
import { showOnboarding } from '../../onboardingTutorial';
import type { Locale } from '../../../i18n/I18nService';

import { sheetManager } from '../core/SheetManager';
import { iapService } from '../../iapService';
import { showToast } from '../../utils';
import { haptic } from '../../haptics';
import { showUpgradePrompt } from '../../iap';

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
        this.bindToggle('hydro-toggle', 'SHOW_HYDROLOGY', (val: boolean) => updateHydrologyVisibility(val));
        this.bindToggle('weather-toggle', 'SHOW_WEATHER', (val: boolean) => updateWeatherVisibility(val));
        this.bindSlider('weather-density-slider', 'WEATHER_DENSITY', 'weather-density-disp');
        this.bindSlider('weather-speed-slider', 'WEATHER_SPEED', 'weather-speed-disp');
        this.bindToggle('poi-toggle', 'SHOW_SIGNPOSTS', this.refreshTerrain);
        
        // Inclinomètre — feature Pro
        this.setupProFeatureToggle('inclinometer-toggle', 'SHOW_INCLINOMETER', 'inclinometer', 'row-inclinometer');
        
        // Météo Avancée — feature Pro
        this.setupProFeatureToggle('weather-pro-toggle', 'SHOW_WEATHER_PRO', 'weather_pro', 'row-weather-pro');
        
        // Bâtiments 3D — feature Pro (déjà existant, déplacé dans section PRO)
        this.setupProFeatureToggle('buildings-toggle', 'SHOW_BUILDINGS', 'buildings_3d', 'row-buildings', () => {
            this.refreshTerrain();
        });
        
        this.bindToggle('shadow-toggle', 'SHADOWS', (val: boolean) => {
            if (state.sunLight) state.sunLight.castShadow = val;
        });
        
        // Bouton "Passer à Pro"
        const upgradeBtn = this.element.querySelector('#btn-upgrade-pro') as HTMLButtonElement;
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', () => {
                if (!state.isPro) {
                    showUpgradePrompt('settings_pro_section');
                }
            });
            
            // Mettre à jour le texte du bouton selon le statut Pro
            this.addSubscription(state.subscribe('isPro', () => {
                this.updateProButtonState(upgradeBtn);
            }));
            this.updateProButtonState(upgradeBtn);
        }

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
            'isFollowingTrail', 'SHOW_TRAILS', 'SHOW_SLOPES', 'PERFORMANCE_PRESET',
            'WEATHER_DENSITY', 'WEATHER_SPEED', 'SHOW_INCLINOMETER', 'SHOW_WEATHER_PRO'
        ];

        keysToSubscribe.forEach(key => {
            this.addSubscription(state.subscribe(key, (value: any) => {
                this.updateUIFromState(key, value);
            }));
        });

        // Language selector
        this.createLanguageSelector();

        // ID Testeur (pour récupération récompense Closed Testing → Production)
        this.createTesterIDSection();

        // Tutorial button
        this.createTutorialButton();

        // Hardware info (GPU/CPU/preset)
        this.createHardwareInfoSection();

        // 7-tap easter egg → toggle Pro tester mode (RAM uniquement, non persisté)
        this.setupVersionTapEgg();

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
            case 'WEATHER_DENSITY':
                this.updateSlider('weather-density-slider', 'weather-density-disp', value);
                break;
            case 'WEATHER_SPEED':
                this.updateSlider('weather-speed-slider', 'weather-speed-disp', value);
                break;
            case 'SHOW_INCLINOMETER':
                this.updateToggle('inclinometer-toggle', value);
                break;
            case 'SHOW_WEATHER_PRO':
                this.updateToggle('weather-pro-toggle', value);
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
        this.updateUIFromState('WEATHER_DENSITY', state.WEATHER_DENSITY);
        this.updateUIFromState('WEATHER_SPEED', state.WEATHER_SPEED);
        this.updateUIFromState('SHOW_INCLINOMETER', state.SHOW_INCLINOMETER);
        this.updateUIFromState('SHOW_WEATHER_PRO', state.SHOW_WEATHER_PRO);
    }

    private createLanguageSelector(): void {
        if (!this.element) return;
        const panel = this.element.querySelector('#panel') || this.element;

        const section = document.createElement('div');
        section.className = 'settings-section';
        section.innerHTML = `
            <div class="setting-row" style="margin-top:8px;">
                <div class="setting-label" data-i18n="settings.section.language">${i18n.t('settings.section.language')}</div>
                <select id="lang-select" class="lang-select" aria-label="${i18n.t('settings.section.language')}">
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

    private createTesterIDSection(): void {
        if (!this.element) return;
        const panel = this.element.querySelector('#panel') || this.element;

        const section = document.createElement('div');
        section.className = 'settings-section';
        section.id = 'tester-id-section';
        section.innerHTML = `
            <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:6px">
                <div class="setting-label" style="font-size:var(--text-xs);color:var(--text-3)">
                    ID Testeur
                </div>
                <div style="display:flex;align-items:center;gap:8px;width:100%">
                    <code id="tester-id-value" style="
                        flex:1;font-size:10px;color:var(--text-2);
                        background:rgba(255,255,255,0.05);border-radius:var(--radius-sm);
                        padding:6px 10px;overflow:hidden;text-overflow:ellipsis;
                        white-space:nowrap;border:1px solid var(--border)
                    ">Chargement…</code>
                    <button id="tester-id-copy" style="
                        background:transparent;border:1px solid var(--border);
                        border-radius:var(--radius-sm);padding:6px 10px;
                        color:var(--text-2);font-size:var(--text-xs);cursor:pointer;
                        flex-shrink:0;white-space:nowrap
                    ">Copier</button>
                </div>
            </div>
        `;
        panel.appendChild(section);

        // Charger l'ID depuis RevenueCat (async)
        void iapService.getAppUserID().then(id => {
            const el = section.querySelector('#tester-id-value') as HTMLElement;
            if (el) el.textContent = id || 'Non disponible (web)';

            section.querySelector('#tester-id-copy')?.addEventListener('click', () => {
                if (!id) return;
                void navigator.clipboard.writeText(id).then(() => {
                    const btn = section.querySelector('#tester-id-copy') as HTMLButtonElement;
                    if (btn) { btn.textContent = '✓ Copié'; setTimeout(() => { btn.textContent = 'Copier'; }, 1500); }
                });
            });
        });
    }

    private createTutorialButton(): void {
        if (!this.element) return;
        const panel = this.element.querySelector('#panel') || this.element;

        const section = document.createElement('div');
        section.className = 'settings-section';
        section.innerHTML = `
            <style>
                .tutorial-help-btn {
                    width: 100%;
                    padding: 12px 16px;
                    background: transparent;
                    border: 1px solid var(--border, rgba(255,255,255,0.1));
                    border-radius: var(--radius-md, 10px);
                    color: var(--text-2, rgba(255,255,255,0.75));
                    font-size: var(--text-sm, 0.85rem);
                    cursor: pointer;
                    text-align: center;
                    transition: opacity 0.15s;
                }
                .tutorial-help-btn:hover { opacity: 0.8; }
                .tutorial-help-btn:active { opacity: 0.7; }
            </style>
            <button id="tutorial-btn" class="tutorial-help-btn" data-i18n="settings.tutorial.btn">
                ${i18n.t('settings.tutorial.btn')}
            </button>
        `;
        panel.appendChild(section);

        section.querySelector('#tutorial-btn')?.addEventListener('click', () => {
            void showOnboarding();
        });
    }

    private createHardwareInfoSection(): void {
        if (!this.element) return;
        const panel = this.element.querySelector('#panel') || this.element;

        const gpuInfo = getGpuInfo();
        const cores = navigator.hardwareConcurrency || '?';
        const detectedPreset = detectBestPreset();

        const section = document.createElement('div');
        section.className = 'settings-section';
        section.innerHTML = `
            <div style="font-size:10px;color:var(--text-3);opacity:0.6;line-height:1.6;padding:4px 0">
                <div><b>GPU</b> : ${gpuInfo.renderer}</div>
                <div><b>CPU</b> : ${cores} cores</div>
                <div><b>Preset détecté</b> : ${detectedPreset}</div>
            </div>
        `;
        panel.appendChild(section);
    }

    /**
     * Easter egg : 7 taps sur le numéro de version → bascule mode Pro testeur (RAM uniquement, non persisté).
     * Taps 4-6 : haptic light + clignotement. Tap 7 : haptic success + toast + couleur accent.
     */
    private setupVersionTapEgg(): void {
        const versionEl = this.element?.querySelector('#settings-version') as HTMLElement | null;
        if (!versionEl) return;

        let tapCount = 0;
        let tapTimer: ReturnType<typeof setTimeout> | null = null;

        versionEl.addEventListener('click', () => {
            tapCount++;

            // Réinitialise le compteur après 3s d'inactivité
            if (tapTimer) clearTimeout(tapTimer);
            tapTimer = setTimeout(() => { tapCount = 0; }, 3000);

            if (tapCount >= 4 && tapCount < 7) {
                // Feedback discret sur les taps 4-6
                void haptic('light');
                versionEl.style.opacity = tapCount % 2 === 0 ? '1' : '0.2';
                setTimeout(() => { versionEl.style.opacity = '0.5'; }, 200);
            } else if (tapCount === 7) {
                // Toggle Pro au 7e tap
                tapCount = 0;
                if (tapTimer) clearTimeout(tapTimer);
                state.isPro = !state.isPro;
                void haptic('success');
                const msg = state.isPro
                    ? '🔓 Mode testeur Pro activé (RAM — non persisté)'
                    : '🔒 Mode testeur Pro désactivé';
                showToast(msg, 3000);
                versionEl.style.color = state.isPro ? 'var(--accent)' : '';
                versionEl.style.opacity = state.isPro ? '0.9' : '0.5';
            }
        });
    }

    private refreshTerrain = () => {
        resetTerrain();
        updateVisibleTiles();
    }

    /**
     * Configure un toggle de feature PRO avec protection
     * @param toggleId ID du toggle input
     * @param stateKey Clé dans l'objet state
     * @param upgradeFeatureKey Clé pour showUpgradePrompt
     * @param rowId ID optionnel de la ligne parente pour gérer les clics
     * @param onChange Callback optionnel quand la valeur change (et que Pro)
     */
    private setupProFeatureToggle(
        toggleId: string, 
        stateKey: keyof typeof state, 
        upgradeFeatureKey: string,
        rowId?: string,
        onChange?: (val: boolean) => void
    ): void {
        if (!this.element) return;
        
        const toggle = this.element.querySelector(`#${toggleId}`) as HTMLInputElement;
        if (!toggle) return;
        
        // Initialiser : désactivé et décoché pour les utilisateurs gratuits
        toggle.disabled = !state.isPro;
        toggle.checked = state.isPro && !!(state as any)[stateKey];
        
        // Gérer le changement
        toggle.addEventListener('change', () => {
            if (!state.isPro) {
                toggle.checked = false;
                showUpgradePrompt(upgradeFeatureKey);
                return;
            }
            (state as any)[stateKey] = toggle.checked;
            saveSettings();
            if (onChange) onChange(toggle.checked);
        });
        
        // Gérer les clics sur la ligne entière (si rowId fourni)
        if (rowId) {
            const row = this.element.querySelector(`#${rowId}`);
            row?.addEventListener('click', (e) => {
                // Ne pas déclencher si on a cliqué directement sur le toggle
                if (e.target === toggle || (e.target as HTMLElement).tagName === 'INPUT') return;
                
                if (!state.isPro) {
                    showUpgradePrompt(upgradeFeatureKey);
                    return;
                }
                // Toggle la valeur si on est Pro
                toggle.checked = !toggle.checked;
                (state as any)[stateKey] = toggle.checked;
                saveSettings();
                if (onChange) onChange(toggle.checked);
            });
        }
        
        // Mettre à jour si isPro change
        this.addSubscription(state.subscribe('isPro', () => {
            toggle.disabled = !state.isPro;
            if (!state.isPro) {
                toggle.checked = false;
                (state as any)[stateKey] = false;
                saveSettings();
                if (onChange) onChange(false);
            } else {
                // Restaurer l'état sauvegardé quand on passe Pro
                toggle.checked = !!(state as any)[stateKey];
            }
        }));
    }
    
    /**
     * Met à jour l'état du bouton "Passer à Pro"
     */
    private updateProButtonState(btn: HTMLButtonElement): void {
        if (!btn) return;
        
        if (state.isPro) {
            btn.innerHTML = '<span>✓</span><span data-i18n="settings.pro.active">Pro Actif</span>';
            btn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
            btn.style.cursor = 'default';
            btn.disabled = true;
        } else {
            btn.innerHTML = '<span>🔓</span><span data-i18n="settings.pro.cta">Passer à Pro</span>';
            btn.style.background = 'linear-gradient(135deg, var(--gold) 0%, #ffb700 100%)';
            btn.style.cursor = 'pointer';
            btn.disabled = false;
        }
    }
}
