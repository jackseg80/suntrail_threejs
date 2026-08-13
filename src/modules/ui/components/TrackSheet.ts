import { BaseComponent } from '../core/BaseComponent';
import { state, isProActive } from '../../state';
import { showToast } from '../../toast';
import { startLocationTracking, isWatchActive } from '../../location';
import { sheetManager } from '../core/SheetManager';
import { showUpgradePrompt } from '../../iap';
import { haptic } from '../../haptics';
import { i18n } from '../../../i18n/I18nService';
import {
    clearInterruptedRecording,
    stopRecordingService,
} from '../../foregroundService';
import {
    removeGPXLayer,
    toggleGPXLayer,
    addGPXLayer,
    activateGPXLayer,
    hideAllGPXLayers,
    showOnlyGPXLayer,
    updateRecordedTrackMesh,
} from '../../gpxLayers';
import { updateElevationProfile, closeElevationProfile } from '../../profile';
import { eventBus } from '../../eventBus';
import { Capacitor } from '@capacitor/core';
import { calculateTrackStats } from '../../geoStats';
import { ICON_CLOSE, ICON_LOCK } from '../icons';
import { recordingService } from '../../recordingService';
import { gpxService } from '../../gpxService';
import { fmtDuration } from '../../utils';
import {
    loadHistory,
    removeFromHistory,
    updateHistoryEntryLocation,
    type GPXHistoryEntry,
} from '../../gpxHistoryService';
import { lngLatToWorld, getCountryCode, COUNTRY_NAMES } from '../../geo';
import { getPlaceName } from '../../geocodingService';
import { createTooltip, type TooltipHandle } from '../tooltip';
import { confirmDialog } from '../confirmDialog';
import { guidanceForegroundService } from '../../guidance/GuidanceForegroundService';
import templateHTML from '../templates/track.html?raw';
import { preparedRouteService } from '../../preparedRoutes/preparedRouteService';
import { releaseFlags } from '../../releaseFlags';
import { setRoutePlanningMode } from '../../routeManager';
import {
    buildRouteReadinessReport,
    type ReadinessSectionStatus,
} from '../../readiness/routeReadiness';
import { routeCorridorReadinessService } from '../../readiness/routeCorridorReadiness';
import {
    buildRouteCorridorPlan,
    CorridorPlanningError,
    type RouteCorridorPlanV1,
} from '../../readiness/routeCorridor';
import {
    createRouteCorridorInstallService,
    type RouteCorridorInstallResult,
} from '../../readiness/routeCorridorInstall';
import type { CorridorDownloadProgress } from '../../readiness/routeCorridorDownload';
import { getRouteCorridorPreflight } from '../../readiness/routeCorridorPreflight';

const pendingGeocode = new Set<string>();

interface CorridorDownloadUIState {
    controller: AbortController;
    progress: CorridorDownloadProgress;
}

function formatMegabytes(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1);
}

function escapeText(value: string): string {
    return value.replace(
        /[&<>'"]/g,
        (char) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;',
            })[char] ?? char
    );
}

function renderReadinessStatus(
    section: string,
    status: ReadinessSectionStatus
): string {
    const statusKey =
        section === 'offline' && status === 'available'
            ? 'readiness.status.measured'
            : `readiness.status.${status}`;
    return `<span class="prepared-readiness-status" data-status="${status}">
        ${escapeText(i18n.t(`readiness.sections.${section}`))}
        <b>${escapeText(i18n.t(statusKey))}</b>
    </span>`;
}

export class TrackSheet extends BaseComponent {
    private statTooltips: TooltipHandle[] = [];
    private readonly corridorDownloads = new Map<
        string,
        CorridorDownloadUIState
    >();
    constructor() {
        super('template-track', 'sheet-container', templateHTML);
    }

    private disposeStatTooltips(): void {
        for (const t of this.statTooltips) t.dispose();
        this.statTooltips = [];
    }

    private attachStatTooltip(labelEl: Element, htmlContent: string): void {
        const wrapper = document.createElement('span');
        wrapper.className = 'touch-hit-target';
        const info = document.createElement('span');
        info.textContent = 'ⓘ';
        info.style.cssText =
            'font-size:var(--text-xs);opacity:0.45;cursor:pointer;';
        info.setAttribute('role', 'button');
        info.setAttribute('tabindex', '0');
        info.setAttribute('aria-label', i18n.t('ui.aria.info') || 'Info');
        wrapper.appendChild(info);
        labelEl.appendChild(wrapper);
        const content = document.createElement('div');
        content.innerHTML = htmlContent;
        this.statTooltips.push(
            createTooltip(info, content, { trigger: 'click' })
        );
    }

    public override dispose(): void {
        this.disposeStatTooltips();
        super.dispose();
    }

    private attachStatTooltips(): void {
        if (!this.element) return;
        this.disposeStatTooltips();

        const labelMap: Record<string, string> = {
            'track.stats.dplus': i18n.t('track.stats.tooltipDplus'),
            'track.stats.dminus': i18n.t('track.stats.tooltipDminus'),
            'track.stats.duration': i18n.t('track.stats.tooltipDuration'),
            'track.stats.points': i18n.t('track.stats.tooltipPoints'),
        };

        const labels = this.element.querySelectorAll('.stat-card-label');
        labels.forEach((label) => {
            const key = (label as HTMLElement).dataset.i18n;
            if (key && labelMap[key]) {
                this.attachStatTooltip(label, labelMap[key]);
            }
        });
    }

    public render(): void {
        if (!this.element) return;

        // --- Empty state ---
        this.createEmptyState();
        this.updateEmptyState();

        // --- Unified track list container ---
        this.createLayersListContainer();
        this.renderPreparedRoutes();
        this.syncDestination(
            document.body.dataset.trackDestination === 'library'
                ? 'library'
                : 'outing'
        );

        const closeBtn = document.getElementById('close-track');
        closeBtn?.setAttribute('aria-label', i18n.t('track.aria.close'));
        closeBtn?.addEventListener('click', () => {
            sheetManager.close();
        });

        this.attachStatTooltips();

        const recBtn = document.getElementById(
            'rec-btn-sheet'
        ) as HTMLButtonElement;
        recBtn?.setAttribute('aria-label', i18n.t('track.aria.rec'));
        let _saving = false;
        recBtn?.addEventListener('click', async () => {
            if (_saving || recBtn.disabled) return;
            if (!state.isRecording) {
                // START
                await recordingService.toggleRecording();
            } else {
                // STOP — feedback visuel immédiat (loading state)
                _saving = true;
                recBtn.classList.add('btn-loading');
                recBtn.setAttribute('aria-busy', 'true');
                recBtn.disabled = true;
                try {
                    if (state.recordedPoints.length >= 2 && isProActive()) {
                        const suggestedName =
                            await recordingService.generateSuggestedName();
                        const finalName =
                            await this.showSaveTrackPrompt(suggestedName);
                        if (finalName !== null) {
                            await recordingService.stopRecording(
                                finalName || suggestedName
                            );
                        } else {
                            await recordingService.stopRecording();
                        }
                    } else {
                        // Pour les Free ou tracés trop courts, stop direct
                        await recordingService.stopRecording();
                    }
                } finally {
                    _saving = false;
                    recBtn.classList.remove('btn-loading');
                    recBtn.removeAttribute('aria-busy');
                    recBtn.disabled = false;
                }
            }
        });

        const importBtn = document.getElementById('import-gpx-sheet');
        importBtn?.setAttribute('aria-label', i18n.t('track.aria.import'));
        const gpxUpload = document.getElementById(
            'gpx-upload'
        ) as HTMLInputElement;

        // Enable multi-file selection
        if (gpxUpload) gpxUpload.setAttribute('multiple', '');

        importBtn?.addEventListener('click', () => {
            gpxUpload?.click();
        });

        document
            .getElementById('prepared-create-btn')
            ?.addEventListener('click', () => {
                sheetManager.close();
                setRoutePlanningMode(true, { announceHint: false });
                document
                    .getElementById('route-settings')
                    ?.classList.remove('hidden');
            });

        gpxUpload?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files || files.length === 0) return;
            importBtn?.classList.add('btn-loading');
            importBtn?.setAttribute('aria-busy', 'true');

            const promises: Promise<void>[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                promises.push(
                    new Promise<void>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                            try {
                                await gpxService.handleGPXImport(
                                    ev.target!.result as string,
                                    file.name
                                );
                            } catch (e) {
                                console.error('[GPX] Import error:', e);
                                const { showToast } =
                                    await import('../../toast');
                                void showToast(
                                    i18n.t('gpx.importError') ||
                                        "Erreur lors de l'import GPX"
                                );
                            }
                            resolve();
                        };
                        reader.onerror = () => resolve();
                        reader.readAsText(file);
                    })
                );
            }

            Promise.all(promises).then(() => {
                importBtn?.classList.remove('btn-loading');
                importBtn?.removeAttribute('aria-busy');
                // Reset the input so re-importing the same file works
                if (gpxUpload) gpxUpload.value = '';
            });
        });

        // Bouton "Essayer Pro" du banner — attaché une fois à l'init
        const upsellBtn = document.getElementById('rec-upsell-btn');
        upsellBtn?.addEventListener('click', () =>
            sheetManager.open('upgrade-sheet')
        );

        this.addSubscription(
            state.subscribe('isRecording', () => this.updateRecUI())
        );
        this.addSubscription(
            state.subscribe('isPro', () => this.updateRecUI())
        );
        this.addSubscription(
            state.subscribe('trialEnd', () => this.updateRecUI())
        );
        this.addSubscription(
            state.subscribe('recordedPoints', () => {
                if (this.element?.classList.contains('is-open')) {
                    this.updateStats();
                    this.updateEmptyState();
                }
            })
        );
        this.addSubscription(
            state.subscribe('gpxLayers', () => {
                this.renderUnifiedTrackList();
                this.updateStats();
                this.updateEmptyState();
            })
        );

        // v5.29.43 : Mettre à jour les tuiles de stats quand on change de calque actif
        this.addSubscription(
            state.subscribe('activeGPXLayerId', () => {
                this.updateStats();
            })
        );

        this.updateRecUI();
        this.updateStats();

        const onSheetOpened = ({ id }: { id: string }) => {
            if (id !== 'track') return;
            this.updateStats();
            this.updateEmptyState();
            this.renderUnifiedTrackList();
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.addSubscription(() => eventBus.off('sheetOpened', onSheetOpened));

        // Écouter la récupération d'un enregistrement interrompu (v5.19.1)
        const onRecovered = () => this.showRecoveryPrompt();
        eventBus.on('recordingRecovered', onRecovered);
        this.addSubscription(() =>
            eventBus.off('recordingRecovered', onRecovered)
        );

        // Écouter les mises à jour de localisation dans l'historique
        const onHistoryUpdated = () => this.renderUnifiedTrackList();
        eventBus.on('gpxHistoryUpdated', onHistoryUpdated);
        this.addSubscription(() =>
            eventBus.off('gpxHistoryUpdated', onHistoryUpdated)
        );

        const onPreparedRoutesUpdated = () => this.renderPreparedRoutes();
        eventBus.on('preparedRoutesUpdated', onPreparedRoutesUpdated);
        this.addSubscription(() =>
            eventBus.off('preparedRoutesUpdated', onPreparedRoutesUpdated)
        );

        const onLocaleChanged = () => {
            if (!this.element) return;
            i18n.applyToDOM(this.element);
            this.attachStatTooltips();
            this.renderPreparedRoutes();
            this.renderUnifiedTrackList();
            this.updateRecUI();
            this.syncDestination(
                document.body.dataset.trackDestination === 'library'
                    ? 'library'
                    : 'outing'
            );
        };
        eventBus.on('localeChanged', onLocaleChanged);
        this.addSubscription(() =>
            eventBus.off('localeChanged', onLocaleChanged)
        );

        const onDestinationChanged = ({
            destination,
        }: {
            destination: 'outing' | 'library';
        }) => this.syncDestination(destination);
        eventBus.on('trackDestinationChanged', onDestinationChanged);
        this.addSubscription(() =>
            eventBus.off('trackDestinationChanged', onDestinationChanged)
        );

        // Recovery peut avoir été détectée avant que cette sheet soit rendue (timing main.ts)
        if (state.recoveredPoints && state.recoveredPoints.length >= 2) {
            this.showRecoveryPrompt();
        }
        // Reprise transparente (service natif toujours actif au démarrage) :
        // main.ts a déjà mis state.isRecording=true et rempli recordedPoints.
        // Ici on redessine le mesh 3D et on s'assure que le watch GPS JS est actif.
        if (state.isRecording && state.recordedPoints.length > 0) {
            updateRecordedTrackMesh();
            if (Capacitor.isNativePlatform() && !isWatchActive()) {
                void startLocationTracking();
            }
        }

        // v5.28.25 : Encart PRO permanent pour les gratuits (même au 1er lancement)
        const updateUpsellVisibility = () => {
            const banner = document.getElementById('rec-upsell-banner');
            if (isProActive()) {
                banner?.remove();
            } else if (!banner) {
                this.showPostRecUpsell();
            }
        };

        updateUpsellVisibility();

        // S'abonner aux changements de statut PRO pour masquer l'encart dynamiquement
        this.addSubscription(state.subscribe('isPro', updateUpsellVisibility));
        this.addSubscription(
            state.subscribe('trialEnd', updateUpsellVisibility)
        );
    }

    private createGlassModal(
        innerHTML: string,
        width = '340px'
    ): HTMLDivElement {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);';
        const panel = document.createElement('div');
        panel.style.cssText = `
            background: var(--glass-bg, rgba(30,30,50,0.95));
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border-radius: var(--radius-xl, 20px);
            padding: var(--space-4, 24px);
            max-width: ${width}; width: 90%;
            color: var(--text-1, #fff);
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.1);
        `;
        panel.innerHTML = innerHTML;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        return overlay;
    }

    private async showSaveTrackPrompt(
        suggestedName: string
    ): Promise<string | null> {
        return new Promise((resolve) => {
            const overlay = this.createGlassModal(`
                <div style="font-size:var(--text-lg,18px);font-weight:700;margin-bottom:var(--space-2,12px)">
                    ${i18n.t('track.save.title') || 'Enregistrer le tracé'}
                </div>
                <div style="font-size:var(--text-sm,14px);margin-bottom:var(--space-4,20px);opacity:0.85">
                    ${isProActive() ? i18n.t('track.save.body') : "<b>Tracé éphémère</b> : il sera perdu à la fermeture de l'app. Nommez-le pour l'afficher :"}
                </div>
                <input type="text" id="rec-save-name" value="${suggestedName}" style="
                    width: 100%; padding: 12px; margin-bottom: 24px;
                    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 12px; color: #fff; font-size: 15px; outline: none;
                ">
                <div style="display:flex;gap:var(--space-2,12px);justify-content:center">
                    <button id="rec-save-confirm" style="
                        flex: 1; padding:12px; border:none; border-radius:12px;
                        background:var(--accent,#4f8cff); color:#fff; font-weight:600; cursor:pointer;
                    ">${i18n.t('common.save') || 'Enregistrer'}</button>
                    <button id="rec-save-cancel" style="
                        flex: 1; padding:12px; border:1px solid rgba(255,255,255,0.2); border-radius:12px;
                        background:transparent; color:var(--text-2,#a0a4bc); font-weight:600; cursor:pointer;
                    ">${i18n.t('common.cancel') || 'Annuler'}</button>
                </div>
            `);

            const input = document.getElementById(
                'rec-save-name'
            ) as HTMLInputElement;
            input?.focus();
            input?.select();

            const dismiss = (value: string | null) => {
                overlay.remove();
                document.removeEventListener('keydown', onEscape);
                resolve(value);
            };

            document
                .getElementById('rec-save-confirm')
                ?.addEventListener('click', () => {
                    const name = input.value.trim() || suggestedName;
                    dismiss(name);
                });

            document
                .getElementById('rec-save-cancel')
                ?.addEventListener('click', () => {
                    dismiss(null);
                });

            // Clic sur le fond = annuler
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) dismiss(null);
            });

            // Touche Escape = annuler
            const onEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') dismiss(null);
            };
            document.addEventListener('keydown', onEscape);

            // Handle Enter key
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const name = input.value.trim() || suggestedName;
                    dismiss(name);
                }
            });
        });
    }

    private async showDraftReplacementPrompt(
        incomingName: string
    ): Promise<'save' | 'replace' | 'cancel'> {
        return new Promise((resolve) => {
            const canSave =
                !!state.routeComputation && state.routeWaypoints.length >= 2;
            const overlay = this.createGlassModal(`
                <div style="font-size:var(--text-lg,18px);font-weight:700;margin-bottom:var(--space-2,12px)">
                    ${escapeText(i18n.t('preparedRoutes.draftConflict.title'))}
                </div>
                <div style="font-size:var(--text-sm,14px);margin-bottom:var(--space-4,20px);opacity:0.85;line-height:1.45">
                    ${escapeText(i18n.t('preparedRoutes.draftConflict.body', { name: incomingName }))}
                </div>
                <div class="prepared-draft-conflict-actions">
                    <button id="prepared-draft-save" ${canSave ? '' : 'disabled'}>${escapeText(i18n.t('preparedRoutes.draftConflict.save'))}</button>
                    <button id="prepared-draft-replace">${escapeText(i18n.t('preparedRoutes.draftConflict.replace'))}</button>
                    <button id="prepared-draft-cancel">${escapeText(i18n.t('common.cancel'))}</button>
                </div>
            `);

            const dismiss = (choice: 'save' | 'replace' | 'cancel') => {
                overlay.remove();
                document.removeEventListener('keydown', onEscape);
                resolve(choice);
            };
            const onEscape = (event: KeyboardEvent) => {
                if (event.key === 'Escape') dismiss('cancel');
            };

            overlay
                .querySelector('#prepared-draft-save')
                ?.addEventListener('click', () => dismiss('save'));
            overlay
                .querySelector('#prepared-draft-replace')
                ?.addEventListener('click', () => dismiss('replace'));
            overlay
                .querySelector('#prepared-draft-cancel')
                ?.addEventListener('click', () => dismiss('cancel'));
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) dismiss('cancel');
            });
            document.addEventListener('keydown', onEscape);
        });
    }

    private async protectCurrentDraft(incomingName: string): Promise<boolean> {
        const hasDirtyDraft =
            state.routeDraftDirty &&
            (state.routeWaypoints.length > 0 || !!state.routeComputation);
        if (!hasDirtyDraft) return true;

        const choice = await this.showDraftReplacementPrompt(incomingName);
        if (choice === 'cancel') return false;
        if (choice === 'save') {
            try {
                await preparedRouteService.saveCurrentDraft();
                showToast(i18n.t('preparedRoutes.toast.saved'));
            } catch {
                showToast(
                    i18n.t(
                        state.routeComputation
                            ? 'preparedRoutes.error.storage'
                            : 'preparedRoutes.error.notReady'
                    )
                );
                return false;
            }
        }
        return true;
    }

    /** Affiche un prompt pour restaurer ou supprimer les points récupérés après un crash. */
    private showRecoveryPrompt(): void {
        const pts = state.recoveredPoints;
        if (!pts || pts.length < 2) return;

        const mins =
            pts.length > 0
                ? Math.round(
                      (pts[pts.length - 1].timestamp - pts[0].timestamp) / 60000
                  )
                : 0;

        const overlay = this.createGlassModal(
            `
            <div style="font-size:var(--text-lg,18px);font-weight:700;margin-bottom:var(--space-2,8px)">
                ${i18n.t('track.recovery.title')}
            </div>
            <div style="font-size:var(--text-sm,14px);margin-bottom:var(--space-3,12px);opacity:0.85">
                ${i18n.t('track.recovery.body', { count: String(pts.length), mins: String(mins) })}
            </div>
            <div style="display:flex;gap:var(--space-2,8px);justify-content:center">
                <button id="rec-recovery-restore" style="
                    padding:10px 20px;border:none;border-radius:var(--radius-sm,8px);
                    background:var(--accent,#4f8cff);color:#fff;font-weight:600;cursor:pointer;
                ">${i18n.t('track.recovery.restore')}</button>
                <button id="rec-recovery-discard" style="
                    padding:10px 20px;border:1px solid rgba(255,255,255,0.2);border-radius:var(--radius-sm,8px);
                    background:transparent;color:var(--text-2,#a0a4bc);font-weight:600;cursor:pointer;
                ">${i18n.t('track.recovery.discard')}</button>
            </div>
        `,
            '320px'
        );

        document
            .getElementById('rec-recovery-restore')
            ?.addEventListener('click', async () => {
                // Injecter les points récupérés dans state et sauvegarder
                state.recordedPoints = pts.map((p) => ({
                    lat: p.lat,
                    lon: p.lon,
                    alt: p.alt,
                    timestamp: p.timestamp,
                }));
                const suggestedName =
                    await recordingService.generateSuggestedName();
                await recordingService.saveCurrentRecording(suggestedName);

                state.recordedPoints = [];
                updateRecordedTrackMesh();
                state.recoveredPoints = null;
                clearInterruptedRecording();
                void stopRecordingService();
                overlay.remove();
                void haptic('success');
                showToast(
                    i18n.t('track.recovery.restored', {
                        count: String(pts.length),
                    })
                );
            });

        document
            .getElementById('rec-recovery-discard')
            ?.addEventListener('click', () => {
                state.recoveredPoints = null;
                clearInterruptedRecording();
                void stopRecordingService();
                overlay.remove();
                showToast(i18n.t('track.recovery.discarded'));
            });
    }

    private createEmptyState(): void {
        if (!this.element) return;
        // this.element IS the #track div (first child of template-track)
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.classList.add('track-outing-only');
        emptyDiv.id = 'track-empty-state';
        emptyDiv.innerHTML = `
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 17l4-8 4 5 3-3 4 6"/>
                <circle cx="19" cy="5" r="2"/>
            </svg>
            <p class="empty-state-title" data-i18n="track.empty.title">${i18n.t('track.empty.title')}</p>
            <p class="empty-state-subtitle" data-i18n="track.empty.subtitle">${i18n.t('track.empty.subtitle')}</p>`;
        this.element.appendChild(emptyDiv);
    }

    private createLayersListContainer(): void {
        if (!this.element) return;
        const container = document.createElement('div');
        container.id = 'gpx-layers-list';
        container.className = 'gpx-layers-list';
        container.style.display = 'none';
        const anchor = this.element.querySelector('#outing-tracks-anchor');
        (anchor ?? this.element).appendChild(container);
    }

    private syncDestination(destination: 'outing' | 'library'): void {
        if (!this.element) return;
        document.body.dataset.trackDestination = destination;
        const isLibrary = destination === 'library';
        this.element
            .querySelectorAll<HTMLElement>('.track-outing-only')
            .forEach((item) => {
                item.hidden = isLibrary;
            });
        const preparedSection = document.getElementById(
            'prepared-routes-section'
        );
        if (preparedSection) preparedSection.hidden = !isLibrary;
        const legacyList = document.getElementById('gpx-layers-list');
        const destinationAnchor = this.element.querySelector(
            isLibrary ? '#legacy-tracks-anchor' : '#outing-tracks-anchor'
        );
        if (legacyList && destinationAnchor) {
            destinationAnchor.appendChild(legacyList);
            legacyList.hidden = false;
        }
        // Le contenu dépend de la destination : Sortie ne montre que les
        // traces chargées, Bibliothèque montre aussi l'historique local. Sans
        // ce rendu immédiat, l'écran conservait le filtre précédent jusqu'au
        // retour tardif d'un géocodage réseau.
        this.renderUnifiedTrackList();
        const title = this.element.querySelector('.sheet-title');
        if (title) {
            title.textContent = i18n.t(
                isLibrary ? 'nav.tab.library' : 'nav.tab.outing'
            );
        }
        if (isLibrary) this.renderPreparedRoutes();
        else this.updateEmptyState();
    }

    private renderPreparedRoutes(): void {
        const container = document.getElementById('prepared-routes-list');
        const empty = document.getElementById('prepared-routes-empty');
        const error = document.getElementById('prepared-storage-error');
        if (!container || !empty || !error) return;
        if (!releaseFlags.isEnabled('preparedRoutes')) {
            container.innerHTML = '';
            empty.hidden = true;
            error.hidden = false;
            error.textContent = i18n.t('preparedRoutes.status.disabled');
            return;
        }
        const storageError = preparedRouteService.getLastError();
        error.hidden = !storageError;
        error.textContent = storageError
            ? i18n.t(`preparedRoutes.error.${storageError.code}`) ||
              storageError.message
            : '';
        const routes = state.preparedRoutes;
        empty.hidden = routes.length > 0;
        container.innerHTML = routes
            .map((route) => {
                const difficulty = route.stats.technicalDifficulty;
                const difficultyText = difficulty.sacLevel
                    ? `${difficulty.status === 'partial' ? '≈ ' : ''}T${difficulty.sacLevel} · ${difficulty.coveragePercent}%`
                    : i18n.t('preparedRoutes.difficulty.unknown');
                const margin = route.stats.light.daylightMarginMinutes;
                const light =
                    margin === null
                        ? i18n.t('preparedRoutes.light.chooseStart')
                        : margin >= 0
                          ? `+${margin} min`
                          : `${margin} min`;
                const warning =
                    route.guidanceQuality === 'approximate'
                        ? `<p class="prepared-route-warning">${escapeText(i18n.t('preparedRoutes.quality.approximateWarning'))}</p>`
                        : '';
                const readiness = releaseFlags.isEnabled('routeReadiness')
                    ? buildRouteReadinessReport(route, {
                          offline:
                              routeCorridorReadinessService.getInput(route),
                      })
                    : null;
                const readinessSignals = readiness
                    ? [
                          ...readiness.sections.route.signals.filter(
                              (signal) =>
                                  signal.code !==
                                  'readiness.route.guidance-approximate'
                          ),
                          ...readiness.sections.light.signals,
                          ...readiness.sections.offline.signals,
                      ]
                    : [];
                const readinessMarkup = readiness
                    ? `<section class="prepared-readiness" aria-label="${escapeText(i18n.t('readiness.title'))}">
                        <strong>${escapeText(i18n.t('readiness.title'))}</strong>
                        <div class="prepared-readiness-statuses">
                            ${renderReadinessStatus('route', readiness.sections.route.status)}
                            ${renderReadinessStatus('light', readiness.sections.light.status)}
                            ${renderReadinessStatus('offline', readiness.sections.offline.status)}
                            ${renderReadinessStatus('conditions', readiness.sections.conditions.status)}
                            ${renderReadinessStatus('device', readiness.sections.device.status)}
                        </div>
                        ${
                            readiness.sections.offline.data
                                ? `<p class="prepared-readiness-coverage">${escapeText(
                                      i18n.t('readiness.offline.coverage', {
                                          percent: String(
                                              readiness.sections.offline.data
                                                  .coveragePercent
                                          ),
                                          covered: String(
                                              readiness.sections.offline.data
                                                  .coveredTileCount
                                          ),
                                          required: String(
                                              readiness.sections.offline.data
                                                  .requiredTileCount
                                          ),
                                      })
                                  )}</p>`
                                : ''
                        }
                        ${
                            readinessSignals.length > 0
                                ? `<ul>${readinessSignals
                                      .map(
                                          (signal) =>
                                              `<li data-severity="${signal.severity}">${escapeText(i18n.t(signal.code))}</li>`
                                      )
                                      .join('')}</ul>`
                                : ''
                        }
                        <small>${escapeText(i18n.t('readiness.networkOptional'))}</small>
                    </section>`
                    : '';
                const corridorMarkup = this.renderCorridorControl(route.id);
                return `<article class="prepared-route-card" data-route-id="${route.id}">
                    <div class="prepared-route-card-main">
                        <strong>${escapeText(route.name)}</strong>
                        <span>${route.stats.distance.toFixed(1)} km · D+ ${Math.round(route.stats.ascent)} m · ${difficultyText}</span>
                        <span>${i18n.t(`preparedRoutes.effort.${route.stats.effort.level}`)} · ETA ${route.stats.light.etaAt ? new Date(route.stats.light.etaAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} · ${light}</span>
                        ${warning}
                        ${readinessMarkup}
                        ${corridorMarkup}
                    </div>
                    <div class="prepared-route-actions">
                        ${releaseFlags.isEnabled('guidanceForeground') ? `<button type="button" data-route-action="guidance" data-route-id="${route.id}" class="prepared-route-guidance">${i18n.t('guidance.actions.start')}</button>` : ''}
                        <button type="button" data-route-action="open" data-route-id="${route.id}">${i18n.t('preparedRoutes.actions.open')}</button>
                        <button type="button" data-route-action="favorite" data-route-id="${route.id}" aria-label="${i18n.t('preparedRoutes.actions.favorite')}" aria-pressed="${route.favorite}">${route.favorite ? '★' : '☆'}</button>
                        <button type="button" data-route-action="duplicate" data-route-id="${route.id}" aria-label="${i18n.t('preparedRoutes.actions.duplicate')}">⧉</button>
                        <button type="button" data-route-action="delete" data-route-id="${route.id}" aria-label="${i18n.t('preparedRoutes.actions.delete')}">${ICON_CLOSE}</button>
                    </div>
                </article>`;
            })
            .join('');
        for (const route of routes) {
            if (
                releaseFlags.isEnabled('routeReadiness') &&
                routeCorridorReadinessService.shouldMeasure(route)
            ) {
                void routeCorridorReadinessService
                    .measure(route)
                    .then((changed) => {
                        if (changed && this.element?.isConnected) {
                            this.renderPreparedRoutes();
                        }
                    });
            }
        }
        container
            .querySelectorAll<HTMLButtonElement>('[data-route-action]')
            .forEach((button) => {
                button.addEventListener('click', async () => {
                    const id = button.dataset.routeId;
                    const action = button.dataset.routeAction;
                    if (!id || !action) return;
                    if (action === 'corridor') {
                        const active = this.corridorDownloads.get(id);
                        if (active) {
                            active.controller.abort();
                            button.disabled = true;
                            return;
                        }
                        button.disabled = true;
                        try {
                            await this.startCorridorDownload(id);
                        } finally {
                            button.disabled = false;
                        }
                        return;
                    }
                    button.disabled = true;
                    try {
                        if (action === 'guidance') {
                            const target = state.preparedRoutes.find(
                                (route) => route.id === id
                            );
                            if (!target) {
                                showToast(
                                    i18n.t('preparedRoutes.error.notFound')
                                );
                                return;
                            }
                            if (target.guidanceQuality === 'not-ready') {
                                showToast(i18n.t('guidance.error.notReady'));
                                return;
                            }
                            if (
                                target.guidanceQuality === 'approximate' &&
                                !(await confirmDialog(
                                    i18n.t('guidance.confirm.approximate'),
                                    {
                                        confirmText: i18n.t(
                                            'guidance.actions.startAnyway'
                                        ),
                                    }
                                ))
                            ) {
                                return;
                            }
                            if (
                                !(await this.protectCurrentDraft(target.name))
                            ) {
                                return;
                            }
                            await preparedRouteService.load(id);
                            const started =
                                await guidanceForegroundService.start(target, {
                                    approximateConfirmed:
                                        target.guidanceQuality ===
                                        'approximate',
                                });
                            if (!started) {
                                showToast(i18n.t('guidance.error.gps'));
                                return;
                            }
                            sheetManager.close();
                            setRoutePlanningMode(false, {
                                announceHint: false,
                            });
                        } else if (action === 'open') {
                            const target = state.preparedRoutes.find(
                                (route) => route.id === id
                            );
                            if (
                                !(await this.protectCurrentDraft(
                                    target?.name || id
                                ))
                            ) {
                                return;
                            }
                            await preparedRouteService.load(id);
                            sheetManager.close();
                            setRoutePlanningMode(true, {
                                announceHint: false,
                            });
                            updateElevationProfile(
                                state.activeGPXLayerId ?? undefined
                            );
                        } else if (action === 'favorite') {
                            await preparedRouteService.toggleFavorite(id);
                        } else if (action === 'duplicate') {
                            await preparedRouteService.duplicate(id);
                            showToast(
                                i18n.t('preparedRoutes.toast.duplicated')
                            );
                        } else if (
                            action === 'delete' &&
                            (await confirmDialog(
                                i18n.t('preparedRoutes.confirm.delete'),
                                { danger: true }
                            ))
                        ) {
                            await preparedRouteService.delete(id);
                            showToast(i18n.t('preparedRoutes.toast.deleted'));
                        }
                    } catch {
                        showToast(i18n.t('preparedRoutes.error.storage'));
                    } finally {
                        button.disabled = false;
                    }
                });
            });
    }

    private renderCorridorControl(routeId: string): string {
        if (!releaseFlags.isEnabled('routeCorridor')) return '';
        const active = this.corridorDownloads.get(routeId);
        if (active) {
            const percent =
                active.progress.totalResourceCount === 0
                    ? 0
                    : Math.round(
                          (active.progress.processedResourceCount /
                              active.progress.totalResourceCount) *
                              100
                      );
            return `<div class="prepared-corridor" data-corridor-route-id="${routeId}">
                <div class="prepared-corridor-progress">
                    <progress value="${active.progress.processedResourceCount}" max="${Math.max(1, active.progress.totalResourceCount)}"></progress>
                    <span>${escapeText(i18n.t('readiness.corridor.progress', { percent: String(percent) }))}</span>
                </div>
                <button type="button" data-route-action="corridor" data-route-id="${routeId}" class="prepared-corridor-cancel">${escapeText(i18n.t('readiness.corridor.cancel'))}</button>
            </div>`;
        }
        const radiusControl = isProActive()
            ? `<label>${escapeText(i18n.t('readiness.corridor.radius'))}
                <select data-corridor-radius data-route-id="${routeId}" aria-label="${escapeText(i18n.t('readiness.corridor.radius'))}">
                    <option value="500">0,5 km</option>
                    <option value="1000" selected>1 km</option>
                    <option value="2000">2 km</option>
                </select>
            </label>`
            : `<span>${escapeText(i18n.t('readiness.corridor.freeRadius'))}</span>`;
        return `<div class="prepared-corridor" data-corridor-route-id="${routeId}">
            ${radiusControl}
            <button type="button" data-route-action="corridor" data-route-id="${routeId}" class="prepared-corridor-download">${escapeText(i18n.t('readiness.corridor.download'))}</button>
        </div>`;
    }

    private async startCorridorDownload(routeId: string): Promise<void> {
        const route = state.preparedRoutes.find((item) => item.id === routeId);
        if (!route) {
            showToast(i18n.t('preparedRoutes.error.notFound'));
            return;
        }
        if (this.corridorDownloads.size > 0) {
            showToast(i18n.t('readiness.corridor.busy'));
            return;
        }
        const radiusElement = this.element?.querySelector<HTMLSelectElement>(
            `[data-corridor-radius][data-route-id="${routeId}"]`
        );
        const radius = Number(radiusElement?.value ?? 1_000) as
            500 | 1_000 | 2_000;
        let plan: RouteCorridorPlanV1;
        try {
            plan = buildRouteCorridorPlan(route, { radiusMeters: radius });
        } catch (error) {
            const code =
                error instanceof CorridorPlanningError
                    ? error.code
                    : 'invalid-geometry';
            showToast(i18n.t(`readiness.offline.${code}`));
            return;
        }
        const preflight = await getRouteCorridorPreflight(plan, {
            networkAvailable:
                state.isNetworkAvailable === true && !state.IS_OFFLINE,
            connectionType: state.connectionType,
        });
        if (
            preflight.requiresCellularConfirmation &&
            !(await confirmDialog(
                i18n.t('readiness.corridor.confirmCellular', {
                    size: formatMegabytes(preflight.estimatedSizeBytes),
                }),
                { confirmText: i18n.t('readiness.corridor.continue') }
            ))
        ) {
            return;
        }
        if (
            preflight.quotaStatus === 'insufficient' &&
            !(await confirmDialog(
                i18n.t('readiness.corridor.confirmQuota', {
                    required: formatMegabytes(preflight.estimatedSizeBytes),
                    available: formatMegabytes(preflight.availableBytes ?? 0),
                }),
                { confirmText: i18n.t('readiness.corridor.continue') }
            ))
        ) {
            return;
        }

        let installService: ReturnType<
            typeof createRouteCorridorInstallService
        >;
        try {
            installService = createRouteCorridorInstallService();
        } catch {
            showToast(i18n.t('readiness.corridor.result.error'));
            return;
        }
        const controller = new AbortController();
        const initialProgress: CorridorDownloadProgress = {
            processedResourceCount: 0,
            successfulResourceCount: 0,
            failedResourceCount: 0,
            totalResourceCount: 0,
            sizeBytes: 0,
        };
        this.corridorDownloads.set(routeId, {
            controller,
            progress: initialProgress,
        });
        this.renderPreparedRoutes();
        let result: RouteCorridorInstallResult;
        let transferStarted = false;
        const install = async (replaceFree: boolean) => {
            transferStarted = true;
            return installService.install(plan, {
                isPro: isProActive(),
                replaceFree,
                signal: controller.signal,
                networkAllowed: preflight.networkAllowed,
                onProgress: (progress) =>
                    this.updateCorridorProgress(routeId, progress),
            });
        };
        try {
            result = await install(false);
            if (result.status === 'replacement-required') {
                transferStarted = false;
                if (
                    !(await confirmDialog(
                        i18n.t('readiness.corridor.confirmReplace'),
                        {
                            confirmText: i18n.t('readiness.corridor.replace'),
                        }
                    ))
                ) {
                    return;
                }
                result = await install(true);
            }
            showToast(i18n.t(`readiness.corridor.result.${result.status}`));
        } catch {
            showToast(i18n.t('readiness.corridor.result.error'));
        } finally {
            this.corridorDownloads.delete(routeId);
            if (transferStarted) {
                routeCorridorReadinessService.invalidate(routeId);
                await routeCorridorReadinessService.measure(route);
            }
            if (this.element?.isConnected) this.renderPreparedRoutes();
        }
    }

    private updateCorridorProgress(
        routeId: string,
        progress: CorridorDownloadProgress
    ): void {
        const active = this.corridorDownloads.get(routeId);
        if (!active) return;
        active.progress = progress;
        const host = [
            ...this.element!.querySelectorAll<HTMLElement>(
                '[data-corridor-route-id]'
            ),
        ].find((element) => element.dataset.corridorRouteId === routeId);
        const progressElement = host?.querySelector('progress');
        if (progressElement) {
            progressElement.max = Math.max(1, progress.totalResourceCount);
            progressElement.value = progress.processedResourceCount;
        }
        const percent =
            progress.totalResourceCount === 0
                ? 0
                : Math.round(
                      (progress.processedResourceCount /
                          progress.totalResourceCount) *
                          100
                  );
        const label = host?.querySelector('.prepared-corridor-progress span');
        if (label) {
            label.textContent = i18n.t('readiness.corridor.progress', {
                percent: String(percent),
            });
        }
    }

    private renderMiniMap(
        entry: GPXHistoryEntry,
        canvas: HTMLCanvasElement
    ): void {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 100;
        const h = canvas.clientHeight || 70;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = 'var(--surface-subtle, #1a1a2e)';
        ctx.fillRect(0, 0, w, h);

        // Grid pattern fallback
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x < w; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 12) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Try loading tile (OpenTopoMap) — non-blocking
        const bounds = entry.bounds;
        const padding = 1.15;
        const latExtent = (bounds.maxLat - bounds.minLat) * padding;
        const lonExtent = (bounds.maxLon - bounds.minLon) * padding;
        const extent = Math.max(latExtent, lonExtent);
        const zoom = Math.min(
            14,
            Math.max(6, Math.floor(Math.log2(360 / extent)))
        );
        const centerLat = entry.centerLat;
        const centerLon = entry.centerLon;
        const tileCount = Math.pow(2, zoom);
        const tileX = ((centerLon + 180) / 360) * tileCount;
        const tileY =
            ((1 -
                Math.log(
                    Math.tan((centerLat * Math.PI) / 180) +
                        1 / Math.cos((centerLat * Math.PI) / 180)
                ) /
                    Math.PI) /
                2) *
            tileCount;
        const tx = Math.floor(tileX);
        const ty = Math.floor(tileY);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            this.drawPolylineOnCanvas(ctx, entry, w, h);
        };
        img.onerror = () => {
            this.drawPolylineOnCanvas(ctx, entry, w, h);
        };
        img.src = `https://tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
    }

    private drawPolylineOnCanvas(
        ctx: CanvasRenderingContext2D,
        entry: GPXHistoryEntry,
        w: number,
        h: number
    ): void {
        const pts = entry.simplifiedPoints;
        if (pts.length < 2) return;

        const bounds = entry.bounds;
        const pad = 0.08;
        const latRange = bounds.maxLat - bounds.minLat || 0.01;
        const lonRange = bounds.maxLon - bounds.minLon || 0.01;

        const toX = (lon: number) =>
            ((lon - bounds.minLon) / lonRange) * (1 - 2 * pad) * w + pad * w;
        const toY = (lat: number) =>
            h -
            (((lat - bounds.minLat) / latRange) * (1 - 2 * pad) * h + pad * h);

        ctx.beginPath();
        ctx.moveTo(toX(pts[0].lon), toY(pts[0].lat));
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(toX(pts[i].lon), toY(pts[i].lat));
        }
        ctx.strokeStyle = entry.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Start dot
        ctx.beginPath();
        ctx.arc(toX(pts[0].lon), toY(pts[0].lat), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();

        // End dot
        ctx.beginPath();
        ctx.arc(
            toX(pts[pts.length - 1].lon),
            toY(pts[pts.length - 1].lat),
            3,
            0,
            Math.PI * 2
        );
        ctx.fillStyle = '#ef4444';
        ctx.fill();
    }

    private async loadHistoryEntry(entry: GPXHistoryEntry): Promise<void> {
        const pts = entry.simplifiedPoints;
        if (pts.length < 2) return;

        const points = pts.map((p, i) => ({
            lat: p.lat,
            lon: p.lon,
            ele: p.ele,
            time: new Date(entry.timestamp + i * 1000).toISOString(),
        }));

        const rawData = {
            tracks: [
                {
                    name: entry.name,
                    points,
                },
            ],
        };

        try {
            addGPXLayer(rawData, entry.name, {
                source: entry.source,
                forceVisible: true,
                id: entry.id,
            });
        } catch (e) {
            console.error('[History] Failed to load entry:', e);
            showToast(i18n.t('gpx.importError') || 'Erreur lors du chargement');
        }
    }

    public renderUnifiedTrackList(): void {
        const container = document.getElementById('gpx-layers-list');
        if (!container) return;

        const isLibrary = document.body.dataset.trackDestination === 'library';
        const history = loadHistory();

        // Lazy geocoding for entries missing locationName
        for (const entry of history) {
            if (
                !entry.locationName &&
                !entry.countryName &&
                !pendingGeocode.has(entry.id)
            ) {
                pendingGeocode.add(entry.id);
                const countryCode = getCountryCode(
                    entry.centerLat,
                    entry.centerLon
                );
                const country = countryCode
                    ? COUNTRY_NAMES[countryCode] || countryCode
                    : '';
                if (country) {
                    updateHistoryEntryLocation(entry.id, country);
                }
                getPlaceName(entry.centerLat, entry.centerLon)
                    .then((loc) => {
                        if (loc) {
                            updateHistoryEntryLocation(entry.id, loc);
                        }
                    })
                    .catch(() => {})
                    .finally(() => {
                        pendingGeocode.delete(entry.id);
                        if (document.getElementById('gpx-layers-list')) {
                            this.renderUnifiedTrackList();
                        }
                    });
            }
        }

        const loadedLayers = state.gpxLayers;
        const manualRoutes = loadedLayers.filter((l) => l.isManualRoute);
        const nonManualLoaded = loadedLayers.filter((l) => !l.isManualRoute);
        const hasImportedGpx = nonManualLoaded.length > 0;

        // Build a merged list: history entries first (with their loaded state), then manual routes
        interface UnifiedRow {
            type: 'history' | 'manual';
            id: string;
            name: string;
            color: string;
            stats: {
                distance: number;
                dPlus: number;
                dMinus: number;
                pointCount: number;
                estimatedTime?: number;
            };
            isLoaded: boolean;
            isLocked: boolean;
            visible: boolean;
            isActive: boolean;
            isProfileActive: boolean;
            entry?: GPXHistoryEntry;
            entryIndex?: number;
        }

        const mergedRows: UnifiedRow[] = [];
        const seenIds = new Set<string>();

        // History entries
        for (let i = 0; i < history.length; i++) {
            const entry = history[i];
            const loadedLayer = loadedLayers.find((l) => l.id === entry.id);
            const isLoaded = !!loadedLayer;
            const isFirstOrPro =
                isProActive() ||
                !hasImportedGpx ||
                (loadedLayer && nonManualLoaded.indexOf(loadedLayer) === 0);
            const isLocked = !isFirstOrPro && !isLoaded;

            mergedRows.push({
                type: 'history',
                id: entry.id,
                name: entry.name,
                color: loadedLayer ? loadedLayer.color : entry.color,
                stats: loadedLayer ? loadedLayer.stats : entry.stats,
                isLoaded,
                isLocked,
                visible: loadedLayer ? loadedLayer.visible : false,
                isActive: !!loadedLayer && state.activeGPXLayerId === entry.id,
                isProfileActive:
                    !!loadedLayer &&
                    state.activeGPXLayerId === entry.id &&
                    !!document
                        .getElementById('elevation-profile')
                        ?.classList.contains('is-open'),
                entry,
                entryIndex: i,
            });
            seenIds.add(entry.id);
        }

        // Loaded non-manual layers NOT in history (fresh imports before page reload, edge case)
        for (const layer of nonManualLoaded) {
            if (!seenIds.has(layer.id)) {
                mergedRows.push({
                    type: 'history',
                    id: layer.id,
                    name: layer.name,
                    color: layer.color,
                    stats: layer.stats,
                    isLoaded: true,
                    isLocked:
                        !isProActive() && nonManualLoaded.indexOf(layer) > 0,
                    visible: layer.visible,
                    isActive: state.activeGPXLayerId === layer.id,
                    isProfileActive:
                        state.activeGPXLayerId === layer.id &&
                        !!document
                            .getElementById('elevation-profile')
                            ?.classList.contains('is-open'),
                });
            }
        }

        // Manual routes
        for (let i = 0; i < manualRoutes.length; i++) {
            const layer = manualRoutes[i];
            mergedRows.push({
                type: 'manual',
                id: layer.id,
                name: layer.name,
                color: layer.color,
                stats: layer.stats,
                isLoaded: true,
                isLocked: false,
                visible: layer.visible,
                isActive: state.activeGPXLayerId === layer.id,
                isProfileActive:
                    state.activeGPXLayerId === layer.id &&
                    !!document
                        .getElementById('elevation-profile')
                        ?.classList.contains('is-open'),
            });
        }

        // Sortie manages the traces currently loaded for the outing. The local
        // catalogue (including unloaded GPX history) belongs to Bibliothèque.
        // The same loaded trace is intentionally reachable from both contexts,
        // but it is never duplicated in storage.
        const displayedRows = isLibrary
            ? mergedRows
            : mergedRows.filter((row) => row.isLoaded);

        const visibleLayers = loadedLayers.filter((layer) => layer.visible);
        const recVisible =
            (state.isRecording || state.recordedPoints.length >= 2) &&
            state.recordedMesh?.visible !== false;
        const visibleCount = visibleLayers.length + (recVisible ? 1 : 0);
        const activeLayer = loadedLayers.find(
            (layer) => layer.id === state.activeGPXLayerId
        );

        if (displayedRows.length === 0 && !recVisible) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        const activeLabel = activeLayer
            ? i18n.t(
                  activeLayer.visible
                      ? 'track.layers.viewed'
                      : 'track.layers.viewedHidden',
                  { name: activeLayer.name }
              )
            : i18n.t('track.layers.noViewed');
        let html = `<div class="track-layers-overview" role="status">
            <div class="track-layers-overview-copy">
                <strong>${escapeText(i18n.t('track.layers.visibleCount', { count: String(visibleCount) }))}</strong>
                <span>${escapeText(activeLabel)}</span>
                ${recVisible ? `<span class="track-layers-rec">${escapeText(i18n.t('track.layers.recIndependent'))}</span>` : ''}
            </div>
            <div class="track-layers-overview-actions">
                <button type="button" data-layer-overview-action="only" ${activeLayer ? '' : 'disabled'}>${escapeText(i18n.t('track.layers.hideOthers'))}</button>
                <button type="button" data-layer-overview-action="hide-all" ${visibleLayers.length > 0 ? '' : 'disabled'}>${escapeText(i18n.t('track.layers.hideAll'))}</button>
            </div>
        </div>`;
        if (!isLibrary && displayedRows.length > 0) {
            html += `<div class="gpx-layers-header">${escapeText(i18n.t('track.layers.loadedTitle'))}</div>`;
        }
        let inManualSection = false;
        const entryMap = new Map<number, GPXHistoryEntry>();

        for (let i = 0; i < displayedRows.length; i++) {
            const row = displayedRows[i];

            if (row.type === 'manual' && !inManualSection) {
                inManualSection = true;
                html += `<div class="gpx-layers-header" style="margin-top:var(--space-3)">${i18n.t('track.manual.title') || 'Itinéraire planifié'}</div>`;
            }

            const duration = row.stats.estimatedTime
                ? fmtDuration(row.stats.estimatedTime)
                : '—';
            const truncName =
                row.name.length > 20 ? row.name.slice(0, 20) + '...' : row.name;
            const layerClass = row.isActive ? ' active' : '';
            const lockedClass = row.isLocked ? ' gpx-layer-locked' : '';

            if (row.type === 'manual') {
                // Manual route: color dot, no mini-map
                html += `
                <div class="gpx-layer-item${layerClass}${lockedClass}" data-layer-id="${row.id}" data-row-idx="${i}">
                    <span class="gpx-layer-dot" style="background:${row.color}"></span>
                    <div class="gpx-layer-info">
                        <span class="gpx-layer-name">${truncName}</span>
                        <span class="gpx-layer-stats">${row.stats.distance.toFixed(2)} km · D+ ${Math.round(row.stats.dPlus)} m · D− ${Math.round(row.stats.dMinus)} m · <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:text-top"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${duration}</span>
                    </div>
                    <button class="gpx-layer-toggle" data-action="toggle" data-id="${row.id}" data-visible="${row.visible}"
                            aria-label="${i18n.t('track.imported.toggleVisible')}" title="${i18n.t('track.imported.toggleVisible')}">
                        ${
                            row.visible
                                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
                                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
                        }
                    </button>
                    <button class="gpx-layer-profile${row.isProfileActive ? ' profile-active' : ''}" data-action="profile" data-id="${row.id}"
                            aria-label="${i18n.t('track.imported.showProfile')}" title="${i18n.t('track.imported.showProfile')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="${row.isProfileActive ? 'var(--accent)' : 'none'}" stroke="${row.isProfileActive ? 'var(--accent)' : 'currentColor'}" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    </button>
                    <button class="gpx-layer-remove" data-action="remove" data-id="${row.id}" aria-label="${i18n.t('track.imported.remove')}" title="${i18n.t('track.imported.remove')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>`;
            } else {
                // History entry: mini-map instead of color dot
                entryMap.set(
                    i,
                    row.entry || history.find((e) => e.id === row.id)!
                );
                const locName =
                    row.entry?.locationName || row.entry?.countryName || '';
                const countrySuffix =
                    row.entry?.locationName && row.entry?.countryName
                        ? ` (${row.entry.countryName})`
                        : '';
                const dateStr = new Date(
                    row.entry?.timestamp || Date.now()
                ).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                });
                const subInfo = locName
                    ? `${locName}${countrySuffix} · ${dateStr}`
                    : dateStr;
                const loadedRemovalKey = isLibrary
                    ? 'track.imported.remove'
                    : 'track.imported.unload';
                html += `
                <div class="gpx-layer-item${layerClass}${lockedClass}" data-layer-id="${row.id}" data-row-idx="${i}" style="${row.isLocked ? 'opacity:0.5;' : ''}">
                    <canvas class="gpx-layer-minimap" data-history-idx="${row.entryIndex ?? i}" width="120" height="84"></canvas>
                    <div class="gpx-layer-info">
                        <span class="gpx-layer-name">${row.isLocked ? ICON_LOCK + ' ' : ''}${truncName}</span>
                        <span class="gpx-layer-location">${subInfo}</span>
                        <span class="gpx-layer-stats">${row.stats.distance.toFixed(2)} km · D+ ${Math.round(row.stats.dPlus)} m · D− ${Math.round(row.stats.dMinus)} m · <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:text-top"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${duration}</span>
                    </div>
                    <button class="gpx-layer-profile${row.isProfileActive ? ' profile-active' : ''}" data-action="profile" data-id="${row.id}"
                            aria-label="${i18n.t('track.imported.showProfile')}" title="${i18n.t('track.imported.showProfile')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="${row.isProfileActive ? 'var(--accent)' : 'none'}" stroke="${row.isProfileActive ? 'var(--accent)' : 'currentColor'}" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    </button>
                    ${
                        row.isLoaded
                            ? `
                    <button class="gpx-layer-toggle" data-action="toggle" data-id="${row.id}" data-visible="${row.visible}"
                            aria-label="${i18n.t('track.imported.toggleVisible')}" title="${i18n.t('track.imported.toggleVisible')}">
                        ${
                            row.visible
                                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
                                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
                        }
                    </button>
                    <button class="gpx-layer-export" data-action="export" data-id="${row.id}"
                            aria-label="${i18n.t('track.imported.export') || 'Exporter GPX'}" title="${i18n.t('track.imported.export') || 'Exporter GPX'}"
                            style="${row.isLocked ? 'color:var(--gold);' : ''}">
                        ${row.isLocked ? ICON_LOCK : ''}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </button>
                    `
                            : ''
                    }
                    <button class="gpx-layer-prepare" data-action="${row.isLoaded ? 'prepare-draft' : 'legacy-convert'}" data-id="${row.id}"
                            aria-label="${row.isLoaded ? i18n.t('preparedRoutes.actions.prepareGPX') : i18n.t('preparedRoutes.actions.convertLegacy')}"
                            title="${row.isLoaded ? i18n.t('preparedRoutes.actions.prepareGPX') : i18n.t('preparedRoutes.actions.convertLegacy')}">✎</button>
                    <button class="gpx-layer-remove" data-action="${row.isLoaded ? 'remove' : 'history-remove'}" data-id="${row.id}"
                            aria-label="${row.isLoaded ? i18n.t(loadedRemovalKey) : i18n.t('track.history.remove')}"
                            title="${row.isLoaded ? i18n.t(loadedRemovalKey) : i18n.t('track.history.remove')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>`;
            }
        }

        container.innerHTML = html;

        container
            .querySelector('[data-layer-overview-action="only"]')
            ?.addEventListener('click', () => {
                if (!state.activeGPXLayerId) return;
                showOnlyGPXLayer(state.activeGPXLayerId);
                updateElevationProfile(state.activeGPXLayerId);
                this.renderUnifiedTrackList();
            });
        container
            .querySelector('[data-layer-overview-action="hide-all"]')
            ?.addEventListener('click', () => {
                hideAllGPXLayers();
                this.renderUnifiedTrackList();
                this.updateStats();
            });

        // Bind row clicks: load (if history + not loaded) or select (if loaded)
        container.querySelectorAll('.gpx-layer-item').forEach((item) => {
            const rowIdx = parseInt(
                (item as HTMLElement).dataset.rowIdx || '-1'
            );
            if (rowIdx < 0 || rowIdx >= displayedRows.length) return;
            const row = displayedRows[rowIdx];

            item.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('[data-action]')) return;

                if (row.type === 'history' && !row.isLoaded) {
                    // Load from history, then select
                    if (!isProActive() && hasImportedGpx) {
                        showUpgradePrompt('multi_gpx');
                        return;
                    }
                    if (state.gpxLayers.length >= 10) {
                        showToast(
                            i18n.t('gpx.limitPro') ||
                                'Maximum 10 tracks reached'
                        );
                        return;
                    }
                    if (row.entry) this.loadHistoryEntry(row.entry);
                } else if (row.isLoaded) {
                    // Select loaded layer
                    const layer = state.gpxLayers.find((l) => l.id === row.id);
                    if (!layer) return;
                    activateGPXLayer(row.id);
                    updateElevationProfile(row.id);
                    if (state.originTile && row.entry) {
                        const e = row.entry;
                        const wpos = lngLatToWorld(
                            e.centerLon,
                            e.centerLat,
                            state.originTile
                        );
                        const span = Math.max(
                            (e.bounds.maxLat - e.bounds.minLat) * 111320,
                            (e.bounds.maxLon - e.bounds.minLon) *
                                111320 *
                                Math.cos((e.centerLat * Math.PI) / 180)
                        );
                        eventBus.emit('flyTo', {
                            worldX: wpos.x,
                            worldZ: wpos.z,
                            targetElevation: 0,
                            targetDistance: Math.max(span * 1.5, 3000),
                        });
                    }
                    this.renderUnifiedTrackList();
                }
            });
        });

        // Profile buttons (toggle open/close)
        container.querySelectorAll('[data-action="profile"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (!id) return;
                const row = displayedRows.find((r) => r.id === id);
                if (!row) return;

                if (!row.isLoaded && row.type === 'history') {
                    if (!isProActive() && hasImportedGpx) {
                        showUpgradePrompt('multi_gpx');
                        return;
                    }
                    if (state.gpxLayers.length >= 10) {
                        showToast(
                            i18n.t('gpx.limitPro') ||
                                'Maximum 10 tracks reached'
                        );
                        return;
                    }
                    if (row.entry) this.loadHistoryEntry(row.entry);
                    return;
                }

                if (row.isLocked) {
                    showUpgradePrompt('multi_gpx');
                    return;
                }

                const panelOpen = !!document
                    .getElementById('elevation-profile')
                    ?.classList.contains('is-open');
                const isSameTrack = state.activeGPXLayerId === id;

                if (panelOpen && isSameTrack) {
                    closeElevationProfile();
                } else {
                    state.activeGPXLayerId = id;
                    updateElevationProfile(id);
                }
                this.renderUnifiedTrackList();
            });
        });

        // Toggle visibility
        container.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (!id) return;
                const row = displayedRows.find((r) => r.id === id);
                if (row?.isLocked) {
                    showUpgradePrompt('multi_gpx');
                    return;
                }
                if (id) {
                    toggleGPXLayer(id);
                    this.renderUnifiedTrackList();
                }
            });
        });

        // Export
        container.querySelectorAll('[data-action="export"]').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (!id) return;
                const row = displayedRows.find((r) => r.id === id);
                if (row?.isLocked) {
                    showUpgradePrompt('export_gpx');
                    return;
                }
                const layerToExport = state.gpxLayers.find((l) => l.id === id);
                if (!layerToExport || !layerToExport.rawData) return;
                const gpxString =
                    gpxService.buildGPXStringFromLayer(layerToExport);
                try {
                    await recordingService.saveToFile(
                        layerToExport.name,
                        gpxString
                    );
                    showToast(i18n.t('track.toast.exported'));
                } catch {
                    showToast(i18n.t('track.toast.exportError'));
                }
            });
        });

        // Remove (loaded layers) or history-remove (history entries)
        container
            .querySelectorAll('[data-action="prepare-draft"]')
            .forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = (btn as HTMLElement).dataset.id;
                    const layer = state.gpxLayers.find(
                        (candidate) => candidate.id === id
                    );
                    if (!layer) return;
                    const alreadyPrepared =
                        state.routeDraftSourceLayerId === layer.id &&
                        state.routeComputation?.routingSource === 'gpx';
                    if (
                        !alreadyPrepared &&
                        !(await this.protectCurrentDraft(layer.name))
                    ) {
                        return;
                    }
                    try {
                        activateGPXLayer(layer.id);
                        preparedRouteService.prepareGPXLayerAsDraft(layer);
                        sheetManager.close();
                        setRoutePlanningMode(true, { announceHint: false });
                        showToast(i18n.t('preparedRoutes.toast.gpxPrepared'));
                    } catch {
                        showToast(i18n.t('preparedRoutes.error.notReady'));
                    }
                });
            });
        container
            .querySelectorAll('[data-action="legacy-convert"]')
            .forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = (btn as HTMLElement).dataset.id;
                    const entry = history.find(
                        (candidate) => candidate.id === id
                    );
                    if (!entry) {
                        return;
                    }
                    const confirmed = await confirmDialog(
                        i18n.t('preparedRoutes.confirm.convertLegacy')
                    );
                    if (!confirmed) {
                        return;
                    }
                    try {
                        await preparedRouteService.convertLegacy(entry);
                        showToast(
                            i18n.t('preparedRoutes.toast.legacyConverted')
                        );
                    } catch {
                        showToast(i18n.t('preparedRoutes.error.storage'));
                    }
                });
            });

        container.querySelectorAll('[data-action="remove"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (id) {
                    // Sortie unloads a trace from the current outing. Only the
                    // library is allowed to delete its persisted GPX history.
                    if (isLibrary) removeFromHistory(id);
                    removeGPXLayer(id);
                    if (isLibrary) state.gpxHistory = loadHistory();
                    this.renderUnifiedTrackList();
                }
            });
        });
        container
            .querySelectorAll('[data-action="history-remove"]')
            .forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = (btn as HTMLElement).dataset.id;
                    if (id) {
                        removeFromHistory(id);
                        state.gpxHistory = loadHistory();
                        this.renderUnifiedTrackList();
                    }
                });
            });

        // Render mini-maps
        requestAnimationFrame(() => {
            container
                .querySelectorAll<HTMLCanvasElement>('.gpx-layer-minimap')
                .forEach((canvas) => {
                    const hIdx = parseInt(canvas.dataset.historyIdx || '-1');
                    const entry = entryMap.get(hIdx);
                    if (!entry) {
                        const entryById = history.find(
                            (e) =>
                                e.id ===
                                (
                                    canvas.closest(
                                        '[data-layer-id]'
                                    ) as HTMLElement
                                )?.dataset.layerId
                        );
                        if (entryById) this.renderMiniMap(entryById, canvas);
                    } else {
                        this.renderMiniMap(entry, canvas);
                    }
                });
        });
    }
    private updateEmptyState(): void {
        const emptyEl = document.getElementById('track-empty-state');
        const statsEl = this.element?.querySelector(
            '.track-stats'
        ) as HTMLElement | null;
        if (!emptyEl) return;

        const hasData =
            state.gpxLayers.length > 0 || state.recordedPoints.length > 0;
        emptyEl.style.display = hasData ? 'none' : 'flex';
        if (statsEl) statsEl.style.display = hasData ? '' : 'none';
    }
    private updateRecUI() {
        const recBtn = document.getElementById(
            'rec-btn-sheet'
        ) as HTMLButtonElement;
        const navTab = document.querySelector('.nav-tab[data-tab="track"]');
        if (!recBtn) return;

        const label = recBtn.querySelector(
            '.trk-rec-label'
        ) as HTMLElement | null;
        const trackEl = document.getElementById('track');

        if (state.isRecording) {
            recBtn.classList.add('active');
            if (label) label.textContent = i18n.t('track.btn.stop');
            navTab?.classList.add('has-notif');
            trackEl?.classList.add('recording');
            trackEl?.classList.toggle('is-pro', isProActive());
        } else {
            recBtn.classList.remove('active');
            if (label) label.textContent = i18n.t('track.btn.rec');
            navTab?.classList.remove('has-notif');
            trackEl?.classList.remove('recording');
            trackEl?.classList.remove('is-pro');
        }
        this.renderUnifiedTrackList();
    }

    private updateStats() {
        if (!this.element) return;

        const distEl = document.getElementById('track-dist');
        const pointsEl = document.getElementById('track-points');
        const dplusEl = document.getElementById('track-dplus');
        const dminusEl = document.getElementById('track-dminus');
        const durationEl = document.getElementById('track-duration');
        const contextEl = document.getElementById('track-stats-context');

        // ARIA: stats are live regions
        distEl?.setAttribute('aria-live', 'polite');
        pointsEl?.setAttribute('aria-live', 'polite');
        dplusEl?.setAttribute('aria-live', 'polite');
        dminusEl?.setAttribute('aria-live', 'polite');
        durationEl?.setAttribute('aria-live', 'polite');

        // v5.29.41 : Priorité à l'affichage du calque actif si on n'enregistre pas
        if (!state.isRecording && state.activeGPXLayerId) {
            const activeLayer = state.gpxLayers.find(
                (l) => l.id === state.activeGPXLayerId
            );
            if (activeLayer) {
                if (contextEl) {
                    contextEl.textContent = i18n.t(
                        'track.statsContext.viewed',
                        { name: activeLayer.name }
                    );
                }
                const s = activeLayer.stats;
                if (distEl)
                    distEl.innerHTML = `${s.distance.toFixed(2)} <span class="trk-stat-unit">km</span>`;
                if (dplusEl)
                    dplusEl.innerHTML = `+${Math.round(s.dPlus)} <span class="trk-stat-unit-plain">m</span>`;
                if (dminusEl)
                    dminusEl.innerHTML = `−${Math.round(s.dMinus)} <span class="trk-stat-unit-plain">m</span>`;
                if (pointsEl) pointsEl.textContent = s.pointCount.toString();
                if (durationEl)
                    durationEl.textContent = s.estimatedTime
                        ? fmtDuration(s.estimatedTime)
                        : '—';
                return;
            }
        }

        // Sinon, affichage des stats de l'enregistrement en cours
        if (contextEl) {
            contextEl.textContent = state.isRecording
                ? i18n.t('track.statsContext.recording')
                : state.recordedPoints.length >= 2
                  ? i18n.t('track.statsContext.recorded')
                  : i18n.t('track.statsContext.none');
        }
        if (pointsEl)
            pointsEl.textContent = state.recordedPoints.length.toString();

        if (state.recordedPoints.length < 2) {
            if (distEl)
                distEl.innerHTML = `0.0 <span class="trk-stat-unit">km</span>`;
            if (dplusEl)
                dplusEl.innerHTML = `+0 <span class="trk-stat-unit-plain">m</span>`;
            if (dminusEl)
                dminusEl.innerHTML = `−0 <span class="trk-stat-unit-plain">m</span>`;
            if (durationEl) durationEl.textContent = '—';
            return;
        }

        const stats = calculateTrackStats(state.recordedPoints);

        if (distEl)
            distEl.innerHTML = `${stats.distance.toFixed(2)} <span class="trk-stat-unit">km</span>`;
        if (dplusEl)
            dplusEl.innerHTML = `+${Math.round(stats.dPlus)} <span class="trk-stat-unit-plain">m</span>`;
        if (dminusEl)
            dminusEl.innerHTML = `−${Math.round(stats.dMinus)} <span class="trk-stat-unit-plain">m</span>`;
        if (durationEl)
            durationEl.textContent = stats.estimatedTime
                ? fmtDuration(stats.estimatedTime)
                : '—';
    }

    private showPostRecUpsell(): void {
        document.getElementById('rec-upsell-banner')?.remove();
        const banner = document.createElement('div');
        banner.id = 'rec-upsell-banner';
        banner.className = 'rec-upsell-banner';
        banner.style.cssText =
            'display:flex; align-items:center; gap:var(--space-2); padding:var(--space-3); margin-top:var(--space-3); background:rgba(var(--accent-rgb,59,126,248),0.12); border:1px solid rgba(var(--accent-rgb,59,126,248),0.3); border-radius:var(--radius-md); font-size:12px; color:var(--text-2);';

        const text = document.createElement('span');
        text.style.cssText =
            'flex:1; min-width:0; overflow-wrap:break-word; word-break:break-word;';
        text.textContent = i18n.t('track.upsell.postRec');

        const proBtn = document.createElement('button');
        proBtn.className = 'btn-go solar-upsell-btn';
        proBtn.style.cssText =
            'flex-shrink:0; font-size:11px; padding:4px 10px;';
        proBtn.textContent = i18n.t('track.upsell.proBtn');
        proBtn.onclick = () => showUpgradePrompt('rec_stats');

        banner.appendChild(text);
        banner.appendChild(proBtn);

        if (isProActive()) {
            const closeBtn = document.createElement('button');
            closeBtn.setAttribute('aria-label', i18n.t('common.close'));
            closeBtn.style.cssText =
                'flex-shrink:0; background:none; border:none; color:var(--text-3); cursor:pointer; font-size:16px; line-height:1; padding:0 4px;';
            closeBtn.innerHTML = ICON_CLOSE;
            closeBtn.onclick = () => banner.remove();
            banner.appendChild(closeBtn);
        }

        this.element?.appendChild(banner);
    }
}
