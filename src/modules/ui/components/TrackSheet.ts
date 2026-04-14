import { BaseComponent } from '../core/BaseComponent';
import { state, isProActive } from '../../state';
import { showToast } from '../../toast';
import { startLocationTracking, isWatchActive } from '../../location';
import { sheetManager } from '../core/SheetManager';
import { showUpgradePrompt } from '../../iap';
import { haptic } from '../../haptics';
import { i18n } from '../../../i18n/I18nService';
import gpxParser from 'gpxparser';
import { startRecordingService, stopRecordingService, clearInterruptedRecording } from '../../foregroundService';
import { nativeGPSService } from '../../nativeGPSService';
import { updateVisibleTiles, addGPXLayer, removeGPXLayer, toggleGPXLayer, updateRecordedTrackMesh } from '../../terrain';
import { lngLatToTile, lngLatToWorld } from '../../geo';
import { requestGPSDisclosure } from '../../gpsDisclosure';
import { updateElevationProfile } from '../../profile';
import { eventBus } from '../../eventBus';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { calculateTrackStats } from '../../geoStats';
import { getPlaceName } from '../../geocodingService';

export class TrackSheet extends BaseComponent {
    constructor() {
        super('template-track', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        // --- Empty state ---
        this.createEmptyState();
        this.updateEmptyState();

        // --- Layers list container ---
        this.createLayersListContainer();
        this.renderLayersList();

        const closeBtn = document.getElementById('close-track');
        closeBtn?.setAttribute('aria-label', i18n.t('track.aria.close'));
        closeBtn?.addEventListener('click', () => {
            sheetManager.close();
        });

        const recBtn = document.getElementById('rec-btn-sheet') as HTMLButtonElement;
        recBtn?.setAttribute('aria-label', i18n.t('track.aria.rec'));
        recBtn?.addEventListener('click', async () => {
            state.isRecording = !state.isRecording;
            this.updateRecUI();
            
            if (state.isRecording) {
                // Prominent Disclosure GPS (Play Store requirement)
                const allowed = await requestGPSDisclosure();
                if (!allowed) {
                    state.isRecording = false;
                    this.updateRecUI();
                    return;
                }
                // Vérifier / demander la permission GPS au niveau OS (Android/iOS uniquement)
                if (Capacitor.isNativePlatform()) {
                    let perms = await Geolocation.checkPermissions();
                    if (perms.location !== 'granted') {
                        perms = await Geolocation.requestPermissions({ permissions: ['location'] });
                    }
                    if (perms.location !== 'granted') {
                        state.isRecording = false;
                        this.updateRecUI();
                        showToast(i18n.t('gps.toast.permissionDenied'));
                        return;
                    }
                }
                // v5.26.0: Demander l'exemption des optimisations batterie pour éviter le kill lors des photos
                if (Capacitor.isNativePlatform()) {
                    await nativeGPSService.requestBatteryOptimizationExemption();
                }

                showToast(i18n.t('track.toast.recStarted'));
                if (!isProActive()) {
                    setTimeout(() => showToast(i18n.t('track.toast.freeLimit')), 1500);
                }
                
                // v5.24: Single Source of Truth - le natif est la seule source d'enregistrement
                
                // Démarrer le service natif (natif Android = source de vérité pour les points GPS)
                await nativeGPSService.startCourse(state.originTile);
                // Récupérer le vrai courseId généré par le natif (fix race condition)
                const nativeCourse = await nativeGPSService.getCurrentCourse();
                if (nativeCourse?.courseId) {
                    state.currentCourseId = nativeCourse.courseId;
                }
                
                await startRecordingService(state.originTile);   // Foreground Service Android
                if (!state.isFollowingUser) await startLocationTracking();
                
                // Les points seront ajoutés automatiquement via les événements natifs (onNewPoints)
                // On initialise recordedPoints vide - le mesh sera mis à jour quand les premiers points arriveront
                state.recordedPoints = [];
            } else {
                // v5.28.1: Processus d'arrêt unifié et sécurisé
                try {
                    // 1. Arrêt unifié (récupération finale + stop native + cleanup local)
                    await nativeGPSService.stopCourse();
                    await stopRecordingService();
                    
                    // 2. Préparer le nom suggéré (Région + Date)
                    let suggestedName = "";
                    if (state.recordedPoints.length >= 2) {
                        const startPt = state.recordedPoints[0];
                        const place = await getPlaceName(startPt.lat, startPt.lon);
                        const dateStr = new Date().toISOString().slice(0, 10);
                        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
                        
                        if (place) {
                            suggestedName = `SunTrail_${place}_${dateStr}_${timeStr}`;
                        } else {
                            suggestedName = `SunTrail_${dateStr}_${timeStr}`;
                        }
                    }

                    // 3. Sauvegarde SYSTÉMATIQUE (si points suffisants)
                    let savedInternal = false;
                    if (state.recordedPoints.length >= 2) {
                        if (isProActive()) {
                            // Demander le nom final à l'utilisateur Pro
                            const finalName = await this.showSaveTrackPrompt(suggestedName);
                            const nameToUse = finalName || suggestedName;
                            savedInternal = await this.saveRecordedGPXInternal(nameToUse); // Layer en mémoire
                            await this.saveGPXToFile(nameToUse);           // Fichier GPX (Documents)
                        } else {
                            // Utilisateur Free : Pas de prompt, sauvegarde directe éphémère
                            savedInternal = await this.saveRecordedGPXInternal(suggestedName);
                            await this.saveGPXToFile(suggestedName); // Sauve dans Cache mais message "éphémère"
                        }
                    }

                    if (state.recordedPoints.length >= 2) {
                        showToast(i18n.t('track.toast.recStopped'));
                    } else {
                        showToast(i18n.t('track.toast.tooShort'));
                    }

                    // 4. Vider la mémoire seulement si sauvegarde réussie ou trop court
                    if (savedInternal || state.recordedPoints.length < 2) {
                        state.recordedPoints = [];
                    } else {
                        console.error('[TrackSheet] Sauvegarde échouée, points conservés.');
                        showToast('⚠️ Erreur sauvegarde, tracé conservé');
                    }

                } catch (e) {
                    console.error('[TrackSheet] Erreur lors du STOP:', e);
                    showToast('⚠️ Erreur lors de l\'arrêt');
                }
            }
        });

        const importBtn = document.getElementById('import-gpx-sheet');
        importBtn?.setAttribute('aria-label', i18n.t('track.aria.import'));
        const gpxUpload = document.getElementById('gpx-upload') as HTMLInputElement;
        
        // Enable multi-file selection
        if (gpxUpload) gpxUpload.setAttribute('multiple', '');

        importBtn?.addEventListener('click', () => {
            gpxUpload?.click();
        });

        gpxUpload?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files || files.length === 0) return;
            importBtn?.classList.add('btn-loading');
            importBtn?.setAttribute('aria-busy', 'true');
            
            const promises: Promise<void>[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                promises.push(new Promise<void>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        try {
                            await this.handleGPX(ev.target!.result as string, file.name);
                        } catch (_e) { /* handled inside */ }
                        resolve();
                    };
                    reader.onerror = () => resolve();
                    reader.readAsText(file);
                }));
            }
            
            Promise.all(promises).then(() => {
                importBtn?.classList.remove('btn-loading');
                importBtn?.removeAttribute('aria-busy');
                // Reset the input so re-importing the same file works
                if (gpxUpload) gpxUpload.value = '';
            });
        });

        this.addSubscription(state.subscribe('isRecording', () => this.updateRecUI()));
        this.addSubscription(state.subscribe('isPro', () => this.updateRecUI()));
        this.addSubscription(state.subscribe('trialEnd', () => this.updateRecUI()));
        this.addSubscription(state.subscribe('recordedPoints', () => {
            this.updateStats();
            this.updateEmptyState();
        }));
        this.addSubscription(state.subscribe('gpxLayers', () => {
            this.renderLayersList();
            this.updateEmptyState();
        }));
        
        this.updateRecUI();
        this.updateStats();

        // Écouter la récupération d'un enregistrement interrompu (v5.19.1)
        eventBus.on('recordingRecovered', () => this.showRecoveryPrompt());
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
        this.addSubscription(state.subscribe('trialEnd', updateUpsellVisibility));
    }

    private async showSaveTrackPrompt(suggestedName: string): Promise<string | null> {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'rec-save-overlay';
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 9500;
                display: flex; align-items: center; justify-content: center;
                background: rgba(0,0,0,0.6);
            `;
            const panel = document.createElement('div');
            panel.style.cssText = `
                background: var(--glass-bg, rgba(30,30,50,0.95));
                backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border-radius: var(--radius-xl, 20px);
                padding: var(--space-4, 24px);
                max-width: 340px; width: 90%;
                color: var(--text-1, #fff);
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                border: 1px solid rgba(255,255,255,0.1);
            `;

            panel.innerHTML = `
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
            `;
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            const input = document.getElementById('rec-save-name') as HTMLInputElement;
            input?.focus();
            input?.select();

            document.getElementById('rec-save-confirm')?.addEventListener('click', () => {
                const name = input.value.trim() || suggestedName;
                overlay.remove();
                resolve(name);
            });

            document.getElementById('rec-save-cancel')?.addEventListener('click', () => {
                overlay.remove();
                resolve(null);
            });

            // Handle Enter key
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const name = input.value.trim() || suggestedName;
                    overlay.remove();
                    resolve(name);
                }
            });
        });
    }

    /** Affiche un prompt pour restaurer ou supprimer les points récupérés après un crash. */
    private showRecoveryPrompt(): void {
        const pts = state.recoveredPoints;
        if (!pts || pts.length < 2) return;

        const overlay = document.createElement('div');
        overlay.className = 'rec-recovery-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9500;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.5);
        `;
        const panel = document.createElement('div');
        panel.style.cssText = `
            background: var(--glass-bg, rgba(30,30,50,0.92));
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border-radius: var(--radius-xl, 16px);
            padding: var(--space-4, 20px);
            max-width: 320px; width: 90%;
            color: var(--text-1, #fff);
            text-align: center;
        `;

        const mins = pts.length > 0
            ? Math.round((pts[pts.length - 1].timestamp - pts[0].timestamp) / 60000)
            : 0;

        panel.innerHTML = `
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
        `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        document.getElementById('rec-recovery-restore')?.addEventListener('click', async () => {
            // Injecter les points récupérés dans state et sauvegarder comme layer GPX + fichier
            state.recordedPoints = pts.map(p => ({ lat: p.lat, lon: p.lon, alt: p.alt, timestamp: p.timestamp }));
            await this.saveRecordedGPXInternal();  // Layer en mémoire
            await this.saveGPXToFile();            // Fichier GPX
            state.recordedPoints = [];
            state.recoveredPoints = null;
            clearInterruptedRecording();
            void stopRecordingService();
            overlay.remove();
            void haptic('success');
            showToast(i18n.t('track.recovery.restored', { count: String(pts.length) }));
        });

        document.getElementById('rec-recovery-discard')?.addEventListener('click', () => {
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
        // Insert layers list container right after the track-stats section
        const container = document.createElement('div');
        container.id = 'gpx-layers-list';
        container.className = 'gpx-layers-list';
        container.style.display = 'none';
        // Insert after track-actions (which contains the buttons)
        const trackActions = this.element.querySelector('.track-actions');
        if (trackActions && trackActions.nextSibling) {
            this.element.insertBefore(container, trackActions.nextSibling);
        } else {
            this.element.appendChild(container);
        }
    }

    public renderLayersList(): void {
        const container = document.getElementById('gpx-layers-list');
        if (!container) return;

        const layers = state.gpxLayers;
        if (layers.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <div class="gpx-layers-header" data-i18n="track.imported.title">${i18n.t('track.imported.title')}</div>
            ${layers.map(layer => {
                const truncName = layer.name.length > 20 ? layer.name.slice(0, 20) + '...' : layer.name;
                const isActive = state.activeGPXLayerId === layer.id;
                return `
                <div class="gpx-layer-item${isActive ? ' active' : ''}" data-layer-id="${layer.id}">
                    <span class="gpx-layer-dot" style="background:${layer.color}"></span>
                    <div class="gpx-layer-info">
                        <span class="gpx-layer-name">${truncName}</span>
                        <span class="gpx-layer-stats">${layer.stats.distance.toFixed(2)} km · D+ ${Math.round(layer.stats.dPlus)} m · D- ${Math.round(layer.stats.dMinus)} m</span>
                    </div>
                    <button class="gpx-layer-profile" data-action="profile" data-id="${layer.id}"
                            aria-label="${i18n.t('track.imported.showProfile')}"
                            title="${i18n.t('track.imported.showProfile')}">
                        📈
                    </button>
                    <button class="gpx-layer-toggle" data-action="toggle" data-id="${layer.id}" 
                            aria-label="${i18n.t('track.imported.toggleVisible')}"
                            title="${i18n.t('track.imported.toggleVisible')}">
                        ${layer.visible ? '👁' : '🚫'}
                    </button>
                    ${isProActive() ? `<button class="gpx-layer-export" data-action="export" data-id="${layer.id}"
                            aria-label="${i18n.t('track.imported.export') || 'Exporter GPX'}"
                            title="${i18n.t('track.imported.export') || 'Exporter GPX'}">💾</button>` : ''}
                    <button class="gpx-layer-remove" data-action="remove" data-id="${layer.id}"
                            aria-label="${i18n.t('track.imported.remove')}"
                            title="${i18n.t('track.imported.remove')}">×</button>
                </div>`;
            }).join('')}`;

        // Bind events
        container.querySelectorAll('.gpx-layer-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                // Don't activate if clicking a button
                if (target.closest('[data-action]')) return;
                const layerId = (item as HTMLElement).dataset.layerId;
                if (!layerId) return;
                state.activeGPXLayerId = layerId;
                updateElevationProfile(layerId);
                // FlyTo
                const layer = state.gpxLayers.find(l => l.id === layerId);
                if (layer && layer.rawData?.tracks?.[0]?.points?.length > 0) {
                    // Always derive from raw lat/lon using CURRENT originTile
                    // so coords are correct regardless of any origin shifts that happened
                    const rawPts = layer.rawData.tracks[0].points as any[];
                    const lats = rawPts.map(p => p.lat as number);
                    const lons = rawPts.map(p => p.lon as number);
                    const eles = rawPts.map(p => (p.ele as number) || 0);
                    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
                    const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;
                    const avgEle = eles.reduce((s, v) => s + v, 0) / eles.length;
                    const worldPos = lngLatToWorld(centerLon, centerLat, state.originTile);
                    const targetElevation = avgEle * state.RELIEF_EXAGGERATION;
                    // Use spread from stored points for distance (they're correct after origin-shift updates)
                    const xs = layer.points.map(p => p.x);
                    const zs = layer.points.map(p => p.z);
                    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
                    const viewDistance = Math.max(spread * 1.5, 3000);
                    eventBus.emit('flyTo', { worldX: worldPos.x, worldZ: worldPos.z, targetElevation, targetDistance: viewDistance });
                }
                this.renderLayersList();
            });
        });

        container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (id) {
                    toggleGPXLayer(id);
                    this.renderLayersList();
                }
            });
        });

        container.querySelectorAll('[data-action="export"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!isProActive()) {
                    showUpgradePrompt('export_gpx');
                    return;
                }
                const id = (btn as HTMLElement).dataset.id;
                if (!id) return;
                const layer = state.gpxLayers.find(l => l.id === id);
                if (!layer || !layer.rawData) return;
                
                // Générer le GPX depuis les données brutes
                const gpxString = this.buildGPXStringFromLayer(layer);
                const filename = `suntrail-export-${new Date().toISOString().slice(0, 10)}-${Date.now()}.gpx`;
                
                if (Capacitor.isNativePlatform()) {
                    try {
                        // Sauvegarder dans Documents pour qu'il soit accessible
                        const result = await Filesystem.writeFile({
                            path: filename,
                            data: gpxString,
                            directory: Directory.Documents,
                            encoding: Encoding.UTF8,
                        });
                        const shortName = result.uri.split('/').pop();
                        showToast(`GPX exporté : ${shortName}`);
                        void haptic('success');
                    } catch (e) {
                        console.error('[TrackSheet] Export GPX failed:', e);
                        showToast('Erreur export GPX');
                    }
                } else {
                    // PWA: téléchargement
                    const blob = new Blob([gpxString], { type: 'application/gpx+xml' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    link.click();
                    URL.revokeObjectURL(url);
                    showToast('GPX téléchargé');
                }
            });
        });

        container.querySelectorAll('[data-action="remove"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (id) {
                    removeGPXLayer(id);
                }
            });
        });

        container.querySelectorAll('[data-action="profile"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (id) {
                    state.activeGPXLayerId = id;
                    updateElevationProfile(id);
                    this.renderLayersList();
                }
            });
        });
    }

    private updateEmptyState(): void {
        const emptyEl = document.getElementById('track-empty-state');
        const statsEl = this.element?.querySelector('.track-stats') as HTMLElement | null;
        if (!emptyEl) return;

        const hasData = state.gpxLayers.length > 0 || state.recordedPoints.length > 0;
        emptyEl.style.display = hasData ? 'none' : 'flex';
        if (statsEl) statsEl.style.display = hasData ? '' : 'none';
    }

    private updateRecUI() {
        const recBtn = document.getElementById('rec-btn-sheet') as HTMLButtonElement;
        const navTab = document.querySelector('.nav-tab[data-tab="track"]');
        if (!recBtn) return;
        
        if (state.isRecording) {
            recBtn.classList.add('active');
            recBtn.innerHTML = `
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="trk-rec-icon">
                    <rect x="2" y="2" width="6" height="6" rx="1" fill="white"/>
                </svg> ${i18n.t('track.btn.stop')}`;
            navTab?.classList.add('has-notif');
            
            // Upsell Pro permanent pendant l'enregistrement pour les gratuits
            if (!isProActive()) {
                this.showRecordingUpsell();
            } else {
                document.getElementById('rec-recording-upsell')?.remove();
            }
        } else {
            recBtn.classList.remove('active');
            recBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" class="trk-rec-icon">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.3"/>
                    <circle cx="6" cy="6" r="3" fill="currentColor"/>
                </svg> ${i18n.t('track.btn.rec')}`;
            navTab?.classList.remove('has-notif');
            document.getElementById('rec-recording-upsell')?.remove();
        }
    }

    /** Bannière PRO visible en permanence pendant le REC pour les gratuits */
    private showRecordingUpsell(): void {
        if (document.getElementById('rec-recording-upsell')) return;
        
        const banner = document.createElement('div');
        banner.id = 'rec-recording-upsell';
        banner.className = 'rec-upsell-banner';
        banner.style.cssText = 'display:flex; flex-direction:column; gap:var(--space-2); padding:var(--space-3); margin:var(--space-3) 0; background:rgba(255,215,0,0.08); border:1px solid var(--gold); border-radius:var(--radius-md); font-size:12px; color:var(--text-1);';
        
        const title = document.createElement('div');
        title.style.cssText = 'display:flex; align-items:center; gap:8px; font-weight:700; color:var(--gold);';
        title.innerHTML = `<span>✨</span> <span>SunTrail PRO</span>`;
        
        const text = document.createElement('p');
        text.style.cssText = 'margin:0; opacity:0.9; font-size:11px; line-height:1.4;';
        text.textContent = i18n.t('track.upsell.postRec'); // On réutilise cette clé qui parle du passage Pro
        
        const proBtn = document.createElement('button');
        proBtn.className = 'btn-go';
        proBtn.style.cssText = 'padding:6px; font-size:11px; margin-top:4px; width:100%;';
        proBtn.textContent = i18n.t('upgrade.trial.cta') || 'Essayer Pro';
        proBtn.onclick = () => sheetManager.open('upgrade-sheet');
        
        banner.appendChild(title);
        banner.appendChild(text);
        banner.appendChild(proBtn);
        
        // Insérer avant les stats
        const stats = this.element?.querySelector('.track-stats');
        if (stats) {
            stats.parentNode?.insertBefore(banner, stats);
        } else {
            this.element?.appendChild(banner);
        }
    }

    private updateStats() {
        if (!this.element) return;
        
        const distEl = document.getElementById('track-dist');
        const pointsEl = document.getElementById('track-points');
        const dplusEl = document.getElementById('track-dplus');
        const dminusEl = document.getElementById('track-dminus');

        // ARIA: stats are live regions
        distEl?.setAttribute('aria-live', 'polite');
        pointsEl?.setAttribute('aria-live', 'polite');
        dplusEl?.setAttribute('aria-live', 'polite');
        dminusEl?.setAttribute('aria-live', 'polite');

        if (pointsEl) pointsEl.textContent = state.recordedPoints.length.toString();
        
        if (state.recordedPoints.length < 2) {
            if (distEl) distEl.innerHTML = `0.0 <span class="trk-stat-unit">km</span>`;
            if (dplusEl) dplusEl.innerHTML = `+0 <span class="trk-stat-unit-plain">m</span>`;
            if (dminusEl) dminusEl.innerHTML = `−0 <span class="trk-stat-unit-plain">m</span>`;
            return;
        }

        const stats = calculateTrackStats(state.recordedPoints);

        if (distEl) distEl.innerHTML = `${stats.distance.toFixed(2)} <span class="trk-stat-unit">km</span>`;
        if (dplusEl) dplusEl.innerHTML = `+${Math.round(stats.dPlus)} <span class="trk-stat-unit-plain">m</span>`;
        if (dminusEl) dminusEl.innerHTML = `−${Math.round(stats.dMinus)} <span class="trk-stat-unit-plain">m</span>`;
    }

    private showPostRecUpsell(): void {
        // Supprimer la bannière existante si déjà affichée
        document.getElementById('rec-upsell-banner')?.remove();
        const banner = document.createElement('div');
        banner.id = 'rec-upsell-banner';
        banner.className = 'rec-upsell-banner';
        banner.style.cssText = 'display:flex; align-items:center; gap:var(--space-2); padding:var(--space-3); margin-top:var(--space-3); background:rgba(var(--accent-rgb,59,126,248),0.12); border:1px solid rgba(var(--accent-rgb,59,126,248),0.3); border-radius:var(--radius-md); font-size:12px; color:var(--text-2);';
        const text = document.createElement('span');
        text.style.cssText = 'flex:1; min-width:0; overflow-wrap:break-word; word-break:break-word;';
        text.textContent = i18n.t('track.upsell.postRec');
        const proBtn = document.createElement('button');
        proBtn.className = 'btn-go solar-upsell-btn';
        proBtn.style.cssText = 'flex-shrink:0; font-size:11px; padding:4px 10px;';
        proBtn.textContent = i18n.t('track.upsell.proBtn');
        proBtn.onclick = () => showUpgradePrompt('rec_stats');
        
        banner.appendChild(text);
        banner.appendChild(proBtn);

        if (isProActive()) {
            const closeBtn = document.createElement('button');
            closeBtn.setAttribute('aria-label', i18n.t('common.close'));
            closeBtn.style.cssText = 'flex-shrink:0; background:none; border:none; color:var(--text-3); cursor:pointer; font-size:16px; line-height:1; padding:0 4px;';
            closeBtn.textContent = '×';
            closeBtn.onclick = () => banner.remove();
            banner.appendChild(closeBtn);
        }

        this.element?.appendChild(banner);
    }

    private buildGPXString(customName?: string): string {
        const date = new Date().toLocaleDateString();
        const trackName = customName || `SunTrail Recorded Track - ${date}`;
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${trackName}</name>
    <trkseg>`;
        // ✅ Dédoublonnage par timestamp avant export (sécurité double)
        const uniquePoints = [...new Map(state.recordedPoints.map(p => [p.timestamp, p])).values()];
        uniquePoints.forEach(p => {
            gpx += `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${p.alt.toFixed(1)}</ele>
        <time>${new Date(p.timestamp).toISOString()}</time>
      </trkpt>`;
        });
        gpx += `
    </trkseg>
  </trk>
</gpx>`;
        return gpx;
    }

    /**
     * Génère un GPX à partir d'une couche existante (pour export).
     */
    private buildGPXStringFromLayer(layer: any): string {
        const date = new Date().toLocaleDateString();
        const trackName = layer.name || `SunTrail Track - ${date}`;
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${trackName}</name>
    <trkseg>`;
        
        const points = layer.rawData?.tracks?.[0]?.points || [];
        points.forEach((p: any) => {
            const ele = p.ele !== undefined ? p.ele : (p.alt !== undefined ? p.alt : 0);
            const time = p.time || new Date().toISOString();
            gpx += `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${ele.toFixed(1)}</ele>
        <time>${time}</time>
      </trkpt>`;
        });
        gpx += `
    </trkseg>
  </trk>
</gpx>`;
        return gpx;
    }

    /**
     * Sauvegarde le tracé enregistré comme layer visible dans l'app (sans gate Pro).
     * Appelé systématiquement au STOP et à l'auto-stop — garantit zéro perte de données.
     */
    async saveRecordedGPXInternal(customName?: string): Promise<boolean> {
        if (state.recordedPoints.length < 2) {
            showToast(i18n.t('track.toast.tooShort'));
            return false;
        }
        try {
            const gpxString = this.buildGPXString(customName);
            const parser = new gpxParser();
            parser.parse(gpxString);
            if (!parser.tracks?.length) {
                return false;
            }
            const date = new Date().toLocaleDateString();
            const name = customName || `SunTrail REC ${date}`;
            addGPXLayer(parser, name);
            void haptic('success');
            return true;
        } catch (e) {
            console.error('[TrackSheet] saveRecordedGPXInternal failed:', e);
            return false;
        }
    }

    /**
     * Sauvegarde automatique du GPX après REC (tous utilisateurs).
     * - Non-Pro: sauvegarde dans Cache (pas visible facilement mais persiste)
     * - Pro: sauvegarde dans Documents (visible par utilisateur)
     */
    async saveGPXToFile(customName?: string): Promise<void> {
        if (state.recordedPoints.length < 2) {
            return;
        }
        const gpx = this.buildGPXString(customName);
        
        // Nettoyer le nom pour le système de fichiers
        const sanitizedName = (customName || `suntrail-${new Date().toISOString().slice(0, 10)}`)
            .replace(/[/\\?%*:|"<>]/g, '-')
            .replace(/\s+/g, '_');
            
        const filename = `${sanitizedName}-${Date.now()}.gpx`;

        if (Capacitor.isNativePlatform()) {
            try {
                // Non-Pro: Cache (persiste après fermeture app, accessible via "Tracés importés")
                // Pro: Documents (visible dans gestionnaire fichiers)
                const directory = isProActive() ? Directory.Documents : Directory.Cache;
                
                // Créer le répertoire s'il n'existe pas
                try {
                    await Filesystem.mkdir({
                        path: '',
                        directory: directory,
                        recursive: true
                    });
                } catch (e) {
                    // Le répertoire existe probablement déjà
                }
                
                const result = await Filesystem.writeFile({
                    path: filename,
                    data: gpx,
                    directory: directory,
                    encoding: Encoding.UTF8,
                });
                const shortName = result.uri.split('/').pop();
                
                if (isProActive()) {
                    showToast(`GPX sauvegardé : ${shortName}`);
                } else {
                    showToast(i18n.t('track.toast.savedInternal') || `GPX sauvegardé (dans l'app) : ${shortName}`);
                }
            } catch (e) {
                console.error('[TrackSheet] saveGPXToFile failed:', e);
                showToast('Erreur GPX: ' + (e as Error).message);
            }
        } else {
            // PWA: téléchargement automatique
            const blob = new Blob([gpx], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            showToast(i18n.t('track.toast.exported'));
        }
    }

    /**
     * Export GPX manuel — bouton "Exporter" (Pro-only file download).
     * Conservé pour tout appelant externe futur.
     */
    async exportRecordedGPX() {
        if (state.recordedPoints.length < 2) {
            showToast(i18n.t('track.toast.tooShort'));
            return;
        }
        if (!isProActive()) {
            showUpgradePrompt('export_gpx');
            return;
        }
        await this.saveGPXToFile();
    }

    private async handleGPX(xml: string, fileName: string = 'track.gpx') {
        try {
            const gpx = new gpxParser(); 
            gpx.parse(xml);
            if (!gpx.tracks?.length) {
                void haptic('warning');
                return;
            }

            // Gate Freemium : 1 tracé max pour les utilisateurs gratuits
            if (!isProActive() && state.gpxLayers.length >= 1) {
                showUpgradePrompt('multi_gpx');
                void haptic('warning');
                return;
            }
            
            const startPt = gpx.tracks[0].points[0];
            
            // Only recenter map on first import
            if (state.gpxLayers.length === 0) {
                state.TARGET_LAT = startPt.lat; 
                state.TARGET_LON = startPt.lon;
                state.ZOOM = 13; 
                state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
                await updateVisibleTiles();
            }
            
            const name = fileName.replace(/\.gpx$/i, '');
            addGPXLayer(gpx, name);
            void haptic('success');
        } catch (e) {
            void haptic('warning');
            throw e;
        }
    }
}
