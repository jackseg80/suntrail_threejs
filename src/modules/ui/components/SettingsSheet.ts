import { BaseComponent } from '../core/BaseComponent';
import {
    state,
    saveSettings,
    saveProStatus,
    type ThemePreference,
} from '../../state';
import { applyPreset, getGpuInfo, detectBestPreset } from '../../performance';
import { runBenchmark } from '../../benchmark';
import { updateHydrologyVisibility, refreshTerrain } from '../../terrain';
import { updateWeatherVisibility } from '../../weather';
import { ICON_CHECK, ICON_HELP, ICON_VIDEO } from '../icons';
import { showOnboarding } from '../../onboardingTutorial';
import type { Locale } from '../../../i18n/I18nService';
import { i18n } from '../../../i18n/I18nService';

import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';
import { iapService } from '../../iapService';
import { showToast } from '../../toast';
import { haptic } from '../../haptics';
import { showUpgradePrompt, isProActive } from '../../iap';
import { createTooltip, type TooltipHandle } from '../tooltip';
import { SharedAPIKeyComponent } from './SharedAPIKeyComponent';
import { STORAGE_KEYS } from '../../../constants/storage';
import { bindSettingsAccountSection } from './settings/SettingsAccountSection';
import { SettingsCategoryNavigation } from './settings/SettingsCategoryNavigation';
import templateHTML from '../templates/settings.html?raw';

const PRESET_MANAGED_SETTINGS = new Set<keyof typeof state>([
    'RESOLUTION',
    'RANGE',
    'SHADOWS',
    'SHOW_VEGETATION',
    'SHOW_SIGNPOSTS',
    'SHOW_BUILDINGS',
    'SHOW_HYDROLOGY',
    'VEGETATION_DENSITY',
    'SHOW_WEATHER',
    'WEATHER_DENSITY',
    'WEATHER_SPEED',
    'WEATHER_RAIN_OPACITY',
    'FOG_FAR',
]);

export class SettingsSheet extends BaseComponent {
    private settingTooltips: TooltipHandle[] = [];
    private categoryNavigation: SettingsCategoryNavigation | null = null;
    private advancedPageActive = false;
    private mainPageScrollTop = 0;
    constructor() {
        super('template-settings', 'sheet-container', templateHTML);
    }

    public render(): void {
        if (!this.element) return;

        // Account management (Web + Native — requis Play Store RGPD)
        bindSettingsAccountSection(this.element);
        this.categoryNavigation = new SettingsCategoryNavigation(
            this.element,
            () => this.enterAdvancedPage()
        );
        this.categoryNavigation.hydrate();
        this.addSubscription(
            sheetManager.registerBackHandler('settings', () =>
                this.exitAdvancedPage()
            )
        );

        // Close panel
        const closePanel = this.element.querySelector('#close-panel');
        closePanel?.setAttribute('aria-label', i18n.t('settings.aria.close'));
        closePanel?.addEventListener('click', () => {
            if (!this.exitAdvancedPage()) sheetManager.close();
        });

        const onPageLocaleChanged = () => this.updatePageHeader();
        const onSheetClosed = ({ id }: { id: string | null }) => {
            if (id === 'settings') this.resetAdvancedPage();
        };
        eventBus.on('localeChanged', onPageLocaleChanged);
        eventBus.on('sheetClosed', onSheetClosed);
        this.addSubscription(() => {
            eventBus.off('localeChanged', onPageLocaleChanged);
            eventBus.off('sheetClosed', onSheetClosed);
        });

        // Presets
        this.element.querySelectorAll('.preset-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                applyPreset((btn as HTMLElement).dataset.preset as any);
            });
        });

        // Batterie faible : verrouillage visuel des profils 3D + bandeau explicatif (v5.86)
        const updateBatteryLockUI = () => {
            if (!this.element) return;
            const isLow = state.IS_BATTERY_LOW;
            const banner = this.element.querySelector(
                '#battery-lock-banner'
            ) as HTMLElement;
            if (banner) banner.hidden = !isLow;
            this.element.querySelectorAll('.preset-btn').forEach((btn) => {
                const preset = (btn as HTMLElement).dataset.preset;
                if (preset && preset !== 'eco') {
                    btn.classList.toggle('battery-locked', isLow);
                    if (isLow) {
                        btn.setAttribute('aria-disabled', 'true');
                    } else {
                        btn.removeAttribute('aria-disabled');
                    }
                }
            });
        };
        updateBatteryLockUI();
        this.addSubscription(
            state.subscribe('IS_BATTERY_LOW', updateBatteryLockUI)
        );

        // Sliders
        this.bindSlider('res-slider', 'RESOLUTION', 'res-disp', refreshTerrain);
        this.bindSlider('range-slider', 'RANGE', 'range-disp', refreshTerrain);
        this.bindSlider(
            'exag-slider',
            'RELIEF_EXAGGERATION',
            'exag-disp',
            refreshTerrain
        );
        this.bindSlider(
            'veg-density-slider',
            'VEGETATION_DENSITY',
            'veg-density-disp',
            refreshTerrain
        );

        // Sub-options expand/collapse
        this.bindExpandToggle('veg-expand-btn', 'veg-suboptions');
        this.bindExpandToggle('weather-expand-btn', 'weather-suboptions');

        // Toggles
        this.bindToggle('hide-ui-on-move-toggle', 'HIDE_UI_ON_MOVE');
        this.bindToggle('stats-toggle', 'SHOW_STATS', (val: boolean) => {
            // setVisible(val) synchronise exactement l'état du toggle avec l'affichage
            state.vramPanel?.setVisible?.(val);
        });
        this.bindToggle('veg-toggle', 'SHOW_VEGETATION', refreshTerrain);
        this.bindToggle('hydro-toggle', 'SHOW_HYDROLOGY', (val: boolean) =>
            updateHydrologyVisibility(val)
        );
        this.bindToggle('weather-toggle', 'SHOW_WEATHER', (val: boolean) =>
            updateWeatherVisibility(val)
        );
        this.bindSlider(
            'weather-density-slider',
            'WEATHER_DENSITY',
            'weather-density-disp'
        );
        this.bindSlider(
            'weather-speed-slider',
            'WEATHER_SPEED',
            'weather-speed-disp'
        );
        this.bindSlider(
            'weather-opacity-slider',
            'WEATHER_RAIN_OPACITY',
            'weather-opacity-disp'
        );
        this.bindToggle('poi-toggle', 'SHOW_SIGNPOSTS', refreshTerrain);

        // Inclinomètre — feature Pro
        this.setupProFeatureToggle(
            'inclinometer-toggle',
            'SHOW_INCLINOMETER',
            'inclinometer',
            'row-inclinometer'
        );

        // Météo Avancée — feature Pro
        this.setupProFeatureToggle(
            'weather-pro-toggle',
            'SHOW_WEATHER_PRO',
            'weather_pro',
            'row-weather-pro'
        );

        // Bâtiments 3D — feature Pro (déjà existant, déplacé dans section PRO)
        this.setupProFeatureToggle(
            'buildings-toggle',
            'SHOW_BUILDINGS',
            'buildings_3d',
            'row-buildings',
            () => {
                refreshTerrain();
            }
        );

        this.bindToggle('shadow-toggle', 'SHADOWS', (val: boolean) => {
            if (state.sunLight) state.sunLight.castShadow = val;
        });

        // Bouton "Passer à Pro"
        const upgradeBtn = this.element.querySelector(
            '#btn-upgrade-pro'
        ) as HTMLButtonElement;
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', () => {
                if (!isProActive()) {
                    showUpgradePrompt('settings_pro_section');
                }
            });

            // Mettre à jour le texte du bouton selon le statut Pro
            this.addSubscription(
                state.subscribe('isPro', () => {
                    this.updateProButtonState(upgradeBtn);
                })
            );
            this.updateProButtonState(upgradeBtn);
        }

        // Subscribe to state changes to update UI
        const keysToSubscribe = [
            'RESOLUTION',
            'RANGE',
            'RELIEF_EXAGGERATION',
            'VEGETATION_DENSITY',
            'SHOW_STATS',
            'SHOW_VEGETATION',
            'SHOW_BUILDINGS',
            'SHOW_HYDROLOGY',
            'SHOW_SIGNPOSTS',
            'SHADOWS',
            'PERFORMANCE_PRESET',
            'WEATHER_DENSITY',
            'WEATHER_SPEED',
            'WEATHER_RAIN_OPACITY',
            'SHOW_INCLINOMETER',
            'SHOW_WEATHER_PRO',
        ];

        keysToSubscribe.forEach((key) => {
            this.addSubscription(
                state.subscribe(key, (value: any) => {
                    this.updateUIFromState(key, value);
                })
            );
        });

        // Benchmark button
        const benchBtn = this.element.querySelector(
            '#run-benchmark-btn'
        ) as HTMLButtonElement;
        if (benchBtn) {
            benchBtn.addEventListener('click', async () => {
                benchBtn.disabled = true;
                const originalText = benchBtn.textContent;
                benchBtn.textContent =
                    i18n.t('benchmark.running') || 'Optimisation...';
                void haptic('light');

                try {
                    const result = await runBenchmark();
                    applyPreset(result.recommendedPreset);
                    void haptic('success');
                    showToast(
                        i18n.t('benchmark.result', {
                            preset: result.recommendedPreset.toUpperCase(),
                        }) ||
                            `Profil ${result.recommendedPreset.toUpperCase()} appliqué.`
                    );
                } catch (e) {
                    showToast('Erreur benchmark');
                } finally {
                    benchBtn.disabled = false;
                    benchBtn.textContent = originalText;
                    this.updateBenchmarkResults();
                }
            });
        }

        // MapTiler API Key (SharedAPIKeyComponent)
        new SharedAPIKeyComponent('settings-maptiler-key-slot', () => {
            refreshTerrain();
        }).hydrate();

        // ORS Key binding
        this.bindORSKeyForm();

        // Theme selector
        this.bindThemeSelector();
        this.bindTraceColorSelector();

        // Language selector
        this.createLanguageSelector();
        const onLocaleChanged = () => {
            if (!this.element) return;
            bindSettingsAccountSection(this.element);
            this.updateLanguageButtons();
        };
        eventBus.on('localeChanged', onLocaleChanged);
        this.addSubscription(() =>
            eventBus.off('localeChanged', onLocaleChanged)
        );

        // Tutorial button
        this.createTutorialButton();

        // Hardware info (GPU/CPU/preset)
        this.createHardwareInfoSection();

        // ID Testeur (pour récupération récompense Closed Testing → Production)
        this.createTesterIDSection();

        // 7-tap easter egg → toggle Pro tester mode (RAM uniquement, non persisté)
        this.setupVersionTapEgg();

        // Initial UI update
        this.updateAllUI();
        this.updateBenchmarkResults();

        this.attachSettingTooltips();
    }

    private enterAdvancedPage(): void {
        if (!this.element || this.advancedPageActive) return;
        const advanced = this.element.querySelector<HTMLDetailsElement>(
            '#settings-developer-lab'
        );
        if (!advanced) return;

        this.mainPageScrollTop = this.element.scrollTop;
        this.advancedPageActive = true;
        advanced.open = true;
        this.element.classList.add('is-advanced-page');
        this.element.scrollTop = 0;
        this.updatePageHeader();
        window.setTimeout(() => advanced.focus({ preventScroll: true }), 50);
    }

    private exitAdvancedPage(): boolean {
        if (!this.element || !this.advancedPageActive) return false;
        this.advancedPageActive = false;
        this.element.classList.remove('is-advanced-page');
        this.updatePageHeader();
        this.element.scrollTop = this.mainPageScrollTop;
        this.element
            .querySelector<HTMLButtonElement>(
                '[data-settings-category="developer"]'
            )
            ?.focus({ preventScroll: true });
        return true;
    }

    private resetAdvancedPage(): void {
        if (!this.element) return;
        this.advancedPageActive = false;
        this.element.classList.remove('is-advanced-page');
        this.updatePageHeader();
    }

    private updatePageHeader(): void {
        if (!this.element) return;
        const title = this.element.querySelector<HTMLElement>('.sheet-title');
        const close = this.element.querySelector<HTMLElement>('#close-panel');
        if (title) {
            title.textContent = i18n.t(
                this.advancedPageActive
                    ? 'settings.section.advanced'
                    : 'settings.title'
            );
        }
        close?.setAttribute(
            'aria-label',
            i18n.t(
                this.advancedPageActive
                    ? 'settings.aria.back'
                    : 'settings.aria.close'
            )
        );
    }

    private attachSettingTooltips(): void {
        if (!this.element) return;
        this.settingTooltips.forEach((t) => t.dispose());
        this.settingTooltips = [];

        // Mapping from data-i18n label key to i18n tooltip key
        const tooltipMap: Record<string, string> = {
            'settings.label.resolution': 'settings.label.tooltipResolution',
            'settings.label.range': 'settings.label.tooltipRange',
            'settings.label.exaggeration': 'settings.label.tooltipExaggeration',
            'settings.label.vegDensity': 'settings.label.tooltipVegDensity',
            'weather.label.intensity': 'settings.label.tooltipWeatherDensity',
            'weather.label.speed': 'settings.label.tooltipWeatherSpeed',
            'weather.label.opacity': 'settings.label.tooltipWeatherOpacity',
            'settings.section.density': 'settings.label.tooltipVegDensity',
        };

        const labels = this.element.querySelectorAll(
            '.setting-label, [data-i18n]'
        );
        labels.forEach((el) => {
            const key = (el as HTMLElement).dataset.i18n;
            if (!key || !tooltipMap[key]) return;

            const infoIcon = document.createElement('span');
            infoIcon.textContent = 'ⓘ';
            infoIcon.style.cssText =
                'font-size:var(--text-xs);opacity:0.45;cursor:pointer;margin-left:3px;';
            el.appendChild(infoIcon);

            const content = document.createElement('div');
            content.innerHTML = i18n.t(tooltipMap[key]);
            this.settingTooltips.push(
                createTooltip(infoIcon, content, { trigger: 'click' })
            );
        });
    }

    public override dispose(): void {
        this.settingTooltips.forEach((t) => t.dispose());
        this.settingTooltips = [];
        this.categoryNavigation?.dispose();
        this.categoryNavigation = null;
        super.dispose();
    }

    private updateBenchmarkResults(): void {
        if (!this.element) return;
        const results = state.benchmarkResults;
        const area = this.element.querySelector(
            '#benchmark-results-area'
        ) as HTMLElement;
        if (!results || !area) return;

        area.hidden = false;
        const cpu = area.querySelector('#bench-cpu');
        const gpu = area.querySelector('#bench-gpu');
        const total = area.querySelector('#bench-total');

        if (cpu) cpu.textContent = results.cpuScore.toString();
        if (gpu) gpu.textContent = results.gpuScore.toString();
        if (total) total.textContent = results.totalScore.toString();
    }

    private bindSlider(
        id: string,
        stateKey: keyof typeof state,
        dispId: string,
        onChange?: () => void
    ) {
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
                this.markPerformancePresetCustom(stateKey);
                saveSettings();
                if (onChange) onChange();
            });
        }
    }

    private bindToggle(
        id: string,
        stateKey: keyof typeof state,
        onChange?: (val: boolean) => void
    ) {
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
                this.markPerformancePresetCustom(stateKey);
                saveSettings();
                if (onChange) onChange(toggle.checked);
            });
        }
    }

    private markPerformancePresetCustom(stateKey: keyof typeof state): void {
        if (
            PRESET_MANAGED_SETTINGS.has(stateKey) &&
            state.PERFORMANCE_PRESET !== 'custom'
        ) {
            applyPreset('custom');
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
                this.updateSlider(
                    'veg-density-slider',
                    'veg-density-disp',
                    value
                );
                break;
            case 'HIDE_UI_ON_MOVE':
                this.updateToggle('hide-ui-on-move-toggle', value);
                break;
            case 'SHOW_STATS':
                this.updateToggle('stats-toggle', value);
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
            case 'PERFORMANCE_PRESET':
                this.element.querySelectorAll('.preset-btn').forEach((btn) => {
                    if ((btn as HTMLElement).dataset.preset === value) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                {
                    const customStatus = this.element.querySelector(
                        '#preset-custom-status'
                    ) as HTMLElement | null;
                    if (customStatus) customStatus.hidden = value !== 'custom';
                }
                break;
            case 'WEATHER_DENSITY':
                this.updateSlider(
                    'weather-density-slider',
                    'weather-density-disp',
                    value
                );
                break;
            case 'WEATHER_SPEED':
                this.updateSlider(
                    'weather-speed-slider',
                    'weather-speed-disp',
                    value
                );
                break;
            case 'WEATHER_RAIN_OPACITY':
                this.updateSlider(
                    'weather-opacity-slider',
                    'weather-opacity-disp',
                    value
                );
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
        this.updateUIFromState(
            'RELIEF_EXAGGERATION',
            state.RELIEF_EXAGGERATION
        );
        this.updateUIFromState('VEGETATION_DENSITY', state.VEGETATION_DENSITY);
        this.updateUIFromState('HIDE_UI_ON_MOVE', state.HIDE_UI_ON_MOVE);
        this.updateUIFromState('SHOW_STATS', state.SHOW_STATS);
        this.updateUIFromState('SHOW_VEGETATION', state.SHOW_VEGETATION);
        this.updateUIFromState('SHOW_BUILDINGS', state.SHOW_BUILDINGS);
        this.updateUIFromState('SHOW_HYDROLOGY', state.SHOW_HYDROLOGY);
        this.updateUIFromState('SHOW_SIGNPOSTS', state.SHOW_SIGNPOSTS);
        this.updateUIFromState('SHADOWS', state.SHADOWS);
        this.updateUIFromState('WEATHER_DENSITY', state.WEATHER_DENSITY);
        this.updateUIFromState('WEATHER_SPEED', state.WEATHER_SPEED);
        this.updateUIFromState(
            'WEATHER_RAIN_OPACITY',
            state.WEATHER_RAIN_OPACITY
        );
        this.updateUIFromState('SHOW_INCLINOMETER', state.SHOW_INCLINOMETER);
        this.updateUIFromState('SHOW_WEATHER_PRO', state.SHOW_WEATHER_PRO);
        this.updateUIFromState('PERFORMANCE_PRESET', state.PERFORMANCE_PRESET);
    }

    private bindThemeSelector(): void {
        if (!this.element) return;
        const selector = this.element.querySelector('#theme-selector');
        if (!selector) return;

        const updateActive = () => {
            selector.querySelectorAll('.theme-btn').forEach((btn) => {
                btn.classList.toggle(
                    'active',
                    (btn as HTMLElement).dataset.theme === state.themePreference
                );
            });
        };

        selector.querySelectorAll('.theme-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.themePreference = (btn as HTMLElement).dataset
                    .theme as ThemePreference;
            });
        });

        this.addSubscription(state.subscribe('themePreference', updateActive));
        // Rafraîchir aussi à chaque ouverture de la sheet (couverture lazy-hydration)
        const onSheetOpened = ({ id }: { id: string }) => {
            if (id === 'settings') updateActive();
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.addSubscription(() => eventBus.off('sheetOpened', onSheetOpened));
        updateActive();
    }

    private bindTraceColorSelector(): void {
        if (!this.element) return;
        const selector = this.element.querySelector('#trace-color-selector');
        if (!selector) return;

        const updateActive = () => {
            selector.querySelectorAll('.trace-color-btn').forEach((btn) => {
                const el = btn as HTMLElement;
                const isActive =
                    el.dataset.color?.toLowerCase() ===
                    state.TRACE_COLOR.toLowerCase();
                el.classList.toggle('active', isActive);
                el.setAttribute('aria-pressed', String(isActive));
            });
        };

        selector.querySelectorAll('.trace-color-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const color = (btn as HTMLElement).dataset.color;
                if (!color || color === state.TRACE_COLOR) return;
                state.TRACE_COLOR = color;
                saveSettings();
                updateActive();
                void import('../../gpxLayers').then((m) =>
                    m.refreshTraceColors()
                );
            });
        });

        const onSheetOpened = ({ id }: { id: string }) => {
            if (id === 'settings') updateActive();
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.addSubscription(() => eventBus.off('sheetOpened', onSheetOpened));
        updateActive();
    }

    private createLanguageSelector(): void {
        if (!this.element) return;
        const panel = this.element.querySelector('#panel') || this.element;

        const section = document.createElement('div');
        section.className = 'settings-section settings-language-section';
        section.innerHTML = `
            <div class="setting-label" data-i18n="settings.section.language">${i18n.t('settings.section.language')}</div>
            <div class="language-grid" role="group" aria-label="${i18n.t('settings.section.language')}">
                <button type="button" class="language-btn" data-locale="fr">Français</button>
                <button type="button" class="language-btn" data-locale="de">Deutsch</button>
                <button type="button" class="language-btn" data-locale="it">Italiano</button>
                <button type="button" class="language-btn" data-locale="en">English</button>
            </div>
        `;
        panel.appendChild(section);

        section
            .querySelectorAll<HTMLButtonElement>('.language-btn')
            .forEach((button) => {
                button.addEventListener('click', () => {
                    i18n.setLocale(button.dataset.locale as Locale);
                    this.updateLanguageButtons();
                    saveSettings();
                });
            });
        this.updateLanguageButtons();
    }

    private updateLanguageButtons(): void {
        if (!this.element) return;
        const locale = i18n.getLocale();
        this.element
            .querySelectorAll<HTMLButtonElement>('.language-btn')
            .forEach((button) => {
                const active = button.dataset.locale === locale;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
    }

    private bindORSKeyForm(): void {
        if (!this.element) return;
        const form = this.element.querySelector(
            '#settings-ors-form'
        ) as HTMLFormElement;
        const input = this.element.querySelector(
            '#settings-ors-key'
        ) as HTMLInputElement;
        const saveBtn = this.element.querySelector(
            '#settings-save-ors-key'
        ) as HTMLButtonElement;
        if (!form || !input || !saveBtn) return;

        input.value = state.ORS_KEY || '';

        form.addEventListener('submit', (e) => {
            e.preventDefault();
        });

        saveBtn.addEventListener('click', () => {
            const key = input.value.trim();
            if (key && key.length > 10) {
                state.ORS_KEY = key;
                try {
                    localStorage.setItem(STORAGE_KEYS.ORS_KEY, key);
                } catch {
                    /* ignore */
                }
                void showToast(
                    i18n.t('routePlanner.toast.keySaved') ||
                        'Clé ORS enregistrée'
                );
            } else {
                void showToast(
                    i18n.t('routePlanner.toast.invalidKey') ||
                        'Clé invalide (minimum 10 caractères)'
                );
            }
        });
    }

    private createTesterIDSection(): void {
        if (!this.element) return;
        const valueEl = this.element.querySelector(
            '#tester-id-value'
        ) as HTMLElement;
        const copyBtn = this.element.querySelector(
            '#tester-id-copy'
        ) as HTMLButtonElement;
        if (!valueEl) return;

        void iapService.getAppUserID().then((id) => {
            valueEl.textContent = id || 'Non disponible (web)';
            if (!copyBtn) return;

            const originalLabel = copyBtn.textContent || 'Copier';
            copyBtn.addEventListener('click', () => {
                if (!id) return;
                void navigator.clipboard.writeText(id).then(() => {
                    copyBtn.innerHTML = `${ICON_CHECK} ${i18n.t('settings.advanced.testerIdCopied') || 'Copié'}`;
                    setTimeout(() => {
                        copyBtn.textContent = originalLabel;
                    }, 1500);
                });
            });
        });
    }

    private createTutorialButton(): void {
        if (!this.element) return;
        const panel = this.element.querySelector('#panel') || this.element;

        const section = document.createElement('div');
        section.className = 'settings-section settings-support-actions';

        section.innerHTML = `
            <button id="tutorial-btn" class="tutorial-help-btn" data-i18n="settings.tutorial.btn">
                ${ICON_HELP}<span>${i18n.t('settings.tutorial.btn')}</span>
            </button>
            <button id="youtube-btn" class="tutorial-help-btn" data-i18n="settings.tutorial.youtube">
                ${ICON_VIDEO}<span>${i18n.t('settings.tutorial.youtube')}</span>
            </button>
        `;
        panel.appendChild(section);

        section
            .querySelector('#tutorial-btn')
            ?.addEventListener('click', () => {
                void showOnboarding();
            });

        section.querySelector('#youtube-btn')?.addEventListener('click', () => {
            window.open('https://www.youtube.com/@SunTrail3D', '_blank');
        });
    }

    private createHardwareInfoSection(): void {
        if (!this.element) return;
        const gpuEl = this.element.querySelector('#hardware-gpu');
        const cpuEl = this.element.querySelector('#hardware-cpu');
        const presetEl = this.element.querySelector('#hardware-preset');
        if (!gpuEl && !cpuEl && !presetEl) return;

        const gpuInfo = getGpuInfo();
        const cores = navigator.hardwareConcurrency || '?';
        const detectedPreset = detectBestPreset();

        if (gpuEl) gpuEl.textContent = gpuInfo.renderer;
        if (cpuEl) cpuEl.textContent = cores.toString();
        if (presetEl) presetEl.textContent = detectedPreset;
    }

    /**
     * Easter egg : 7 taps sur le numéro de version → toggle Pro tester mode (RAM uniquement, non persisté).
     * Taps 4-6 : haptic light + clignotement. Tap 7 : haptic success + toast + couleur accent.
     */
    private setupVersionTapEgg(): void {
        const versionEl = this.element?.querySelector(
            '#settings-version'
        ) as HTMLElement | null;
        if (!versionEl) return;

        versionEl.textContent = `v${__APP_VERSION__}`;

        let tapCount = 0;
        let tapTimer: ReturnType<typeof setTimeout> | null = null;

        versionEl.addEventListener('click', () => {
            tapCount++;

            // Réinitialise le compteur après 3s d'inactivité
            if (tapTimer) clearTimeout(tapTimer);
            tapTimer = setTimeout(() => {
                tapCount = 0;
            }, 3000);

            if (tapCount >= 4 && tapCount < 7) {
                // Feedback discret sur les taps 4-6
                void haptic('light');
                versionEl.style.opacity = tapCount % 2 === 0 ? '1' : '0.2';
                setTimeout(() => {
                    versionEl.style.opacity = '0.5';
                }, 200);
            } else if (tapCount === 7) {
                // Toggle Pro au 7e tap (Debug uniquement, non persistant pour tests rapides)
                tapCount = 0;
                if (tapTimer) clearTimeout(tapTimer);

                state.isPro = !state.isPro;
                saveProStatus();

                if (state.isPro) {
                    state.SHOW_BUILDINGS = true;
                    state.SHOW_INCLINOMETER = true;
                    state.SHOW_WEATHER_PRO = true;
                    void haptic('success');
                    showToast('🔓 Mode Testeur : Pro activé (Session)', 3000);
                } else {
                    void haptic('warning');
                    showToast('🔒 Mode Testeur : Pro désactivé', 3000);
                }

                versionEl.style.color = isProActive() ? 'var(--accent)' : '';
                versionEl.style.opacity = isProActive() ? '0.9' : '0.5';
            }
        });
    }

    private bindExpandToggle(btnId: string, contentId: string): void {
        if (!this.element) return;
        const btn = this.element.querySelector(
            `#${btnId}`
        ) as HTMLButtonElement;
        const content = this.element.querySelector(
            `#${contentId}`
        ) as HTMLElement;
        if (!btn || !content) return;
        btn.addEventListener('click', () => {
            const isOpen = content.classList.toggle('open');
            btn.setAttribute('aria-expanded', String(isOpen));
        });
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

        const toggle = this.element.querySelector(
            `#${toggleId}`
        ) as HTMLInputElement;
        if (!toggle) return;

        const row = rowId ? this.element.querySelector(`#${rowId}`) : null;

        const updateVisuals = () => {
            const isPro = isProActive();
            toggle.checked = isPro && !!(state as any)[stateKey];
            if (row) {
                row.classList.toggle('pro-feature-locked', !isPro);
            }
        };

        // v5.54 : Plus de 'disabled' physique pour permettre le clic et l'upsell teaser
        updateVisuals();

        // Gérer le changement
        toggle.addEventListener('change', (_e) => {
            if (!isProActive()) {
                // Annuler visuellement le changement immédiat
                toggle.checked = false;
                showUpgradePrompt(upgradeFeatureKey);
                return;
            }
            (state as any)[stateKey] = toggle.checked;
            this.markPerformancePresetCustom(stateKey);
            saveSettings();
            if (onChange) onChange(toggle.checked);
        });

        // Gérer les clics sur la ligne entière (si rowId fourni)
        if (row) {
            row.addEventListener('click', (e) => {
                // Ne pas déclencher si on a cliqué directement sur le toggle (géré par listener change)
                if (
                    e.target === toggle ||
                    (e.target as HTMLElement).tagName === 'INPUT'
                )
                    return;

                if (!isProActive()) {
                    showUpgradePrompt(upgradeFeatureKey);
                    return;
                }
                // Toggle la valeur si on est Pro
                toggle.checked = !toggle.checked;
                (state as any)[stateKey] = toggle.checked;
                this.markPerformancePresetCustom(stateKey);
                saveSettings();
                if (onChange) onChange(toggle.checked);
            });
        }

        // Mettre à jour si isPro change
        this.addSubscription(
            state.subscribe('isPro', () => {
                if (!isProActive()) {
                    (state as any)[stateKey] = false;
                    saveSettings();
                    if (onChange) onChange(false);
                }
                updateVisuals();
            })
        );
    }

    /**
     * Met à jour l'état du bouton "Passer à Pro"
     */
    private updateProButtonState(btn: HTMLButtonElement): void {
        if (!btn) return;

        const description = this.element?.querySelector(
            '.settings-pro-description'
        );

        if (isProActive()) {
            btn.innerHTML = ICON_CHECK;
            const label = document.createElement('span');
            label.textContent = i18n.t('settings.pro.active');
            btn.appendChild(label);
            btn.classList.add('is-active');
            btn.disabled = true;
            if (description) {
                description.textContent = i18n.t(
                    'settings.pro.activeDescription'
                );
            }
        } else {
            btn.innerHTML =
                '<span data-i18n="settings.pro.cta">Découvrir Pro</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
            btn.classList.remove('is-active');
            btn.disabled = false;
            if (description) {
                description.textContent = i18n.t('settings.pro.description');
            }
        }
    }
}
