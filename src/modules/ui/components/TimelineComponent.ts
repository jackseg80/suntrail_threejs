import { state, isProActive } from '../../state';
import { updateSunPosition } from '../../sun';
import { haptic } from '../../haptics';
import { showToast } from '../../toast';
import { i18n } from '../../../i18n/I18nService';
import { worldToLngLat } from '../../geo';
import { showUpgradePrompt } from '../../iap';
import { attachDraggablePanel } from '../draggablePanel';
import SunCalc from 'suncalc';

export class TimelineComponent {
    private timeSlider: HTMLInputElement | null = null;
    private dateInput: HTMLInputElement | null = null;
    private subscriptions: Array<() => void> = [];
    private tlAzimuthEl: HTMLElement | null = null;
    private tlElevationEl: HTMLElement | null = null;
    private _dateTrap: HTMLElement | null = null;

    constructor() {
        // No hydration, just attach to existing DOM
        this.render();
    }

    public render(): void {
        // The elements are already in the DOM because WidgetsComponent hydrated them
        this.timeSlider = document.body.querySelector('#time-slider') as HTMLInputElement;
        this.dateInput = document.body.querySelector('#date-input') as HTMLInputElement;
        const toggleBtn = document.body.querySelector('#timeline-toggle-btn');
        const bottomBar = document.body.querySelector('#bottom-bar') as HTMLElement | null;

        if (this.timeSlider && bottomBar) {
            // ARIA: time slider attributes
            this.timeSlider.setAttribute('aria-label', 'Heure de simulation');
            this.timeSlider.setAttribute('aria-valuemin', this.timeSlider.min);
            this.timeSlider.setAttribute('aria-valuemax', this.timeSlider.max);
            this.timeSlider.setAttribute('aria-valuenow', this.timeSlider.value);

            let _renderTimer: ReturnType<typeof setTimeout> | null = null;

            // pointerdown : activer pour toute la durée du contact (pas seulement pendant le mouvement)
            // Sans ça, 150ms après l'arrêt du doigt isInteractingWithUI=false → idle mode →
            // renderer.render() non appelé → canvas WebGL Android WebView devient blanc.
            this.timeSlider.addEventListener('pointerdown', () => {
                if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
                state.isInteractingWithUI = true;
            });

            const onPointerRelease = () => {
                _renderTimer = setTimeout(() => { state.isInteractingWithUI = false; }, 150);
            };
            this.timeSlider.addEventListener('pointerup', onPointerRelease);
            this.timeSlider.addEventListener('pointercancel', onPointerRelease);

            this.timeSlider.addEventListener('input', () => {
                // isInteractingWithUI déjà true via pointerdown
                const mins = parseInt(this.timeSlider!.value);
                const newDate = new Date(state.simDate);
                newDate.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
                state.simDate = newDate;
                // ARIA: sync valuenow
                this.timeSlider!.setAttribute('aria-valuenow', this.timeSlider!.value);
            });
        }

        if (this.dateInput) {
            // Overlay trap : intercepte les clics non-Pro avant que le picker natif ne s'ouvre.
            // pointer-events:none sur l'input bloque le picker Android WebView de façon fiable ;
            // l'overlay (z-index supérieur) reçoit le tap et affiche le prompt IAP.
            const dateWrapper = document.createElement('div');
            dateWrapper.className = 'date-input-wrapper';
            this.dateInput.parentNode!.insertBefore(dateWrapper, this.dateInput);
            dateWrapper.appendChild(this.dateInput);
            const dateTrap = document.createElement('div');
            dateTrap.className = 'date-input-trap';
            dateTrap.addEventListener('click', () => showUpgradePrompt('solar_calendar'));
            dateWrapper.appendChild(dateTrap);
            this._dateTrap = dateTrap;

            // Initialiser l'aspect visuel du sélecteur de date selon isProActive
            this.syncDateInputLock();
            this.subscriptions.push(state.subscribe('isPro', () => this.syncDateInputLock()));
            this.subscriptions.push(state.subscribe('trialEnd', () => this.syncDateInputLock()));

            this.dateInput.addEventListener('change', (e) => {
                const d = new Date((e.target as HTMLInputElement).value);
                if (!isNaN(d.getTime())) {
                    // Gate Pro : seule la date du jour est accessible sans Pro (filet de sécurité)
                    if (!isProActive()) {
                        const today = new Date();
                        const isToday = d.getFullYear() === today.getFullYear() &&
                                        d.getMonth()    === today.getMonth()    &&
                                        d.getDate()     === today.getDate();
                        if (!isToday) {
                            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            (e.target as HTMLInputElement).value = todayStr;
                            showUpgradePrompt('solar_calendar');
                            return;
                        }
                    }
                    const newDate = new Date(state.simDate);
                    newDate.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    state.simDate = newDate;
                }
            });
        }

        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.setAttribute('aria-label', 'Lecture/Pause simulation solaire');
            playBtn.addEventListener('click', () => {
                state.isSunAnimating = !state.isSunAnimating;
            });
        }

        const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
        if (speedSelect) {
            speedSelect.addEventListener('change', () => {
                state.animationSpeed = parseFloat(speedSelect.value);
            });
        }

        // Toggle Drawer
        if (toggleBtn && bottomBar) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // En mode 2D, la simulation solaire n'est pas disponible, sauf en mode test pour valider l'UI
                if (state.IS_2D_MODE && !window.location.search.includes('mode=test')) {
                    showToast(i18n.t('solar.toast.notIn2D'));
                    return;
                }

                const isOpen = bottomBar.classList.toggle('is-open');
                toggleBtn.classList.toggle('active');
                document.body.classList.toggle('timeline-open', isOpen);
            });

            // Drag handle — swipe down to close
            this.attachSwipeGesture(bottomBar);

            // Masquage dynamique des widgets couverts quand la timebar est déplacée
            const OVERLAP_TARGETS_TL = [
                document.getElementById('top-pill-main'),
                document.getElementById('rec-status-widget'),
                document.getElementById('net-status-icon'),
                document.getElementById('sos-main-btn'),
                document.querySelector('.fab-stack') as HTMLElement | null,
            ];
            const OVERLAP_CLS_TL = 'widget-overlap-hidden';

            const checkTimelineOverlap = (): void => {
                const isOpen = bottomBar.classList.contains('is-open');
                const isCustomPos = bottomBar.classList.contains('panel-custom-pos');
                // body.timeline-custom-pos désactive la règle CSS statique et laisse
                // le contrôle dynamique (widget-overlap-hidden) gérer la visibilité des FABs
                document.body.classList.toggle('timeline-custom-pos', isOpen && isCustomPos);
                if (!isOpen || !isCustomPos) {
                    OVERLAP_TARGETS_TL.forEach(el => el?.classList.remove(OVERLAP_CLS_TL));
                    return;
                }
                const pr = bottomBar.getBoundingClientRect();
                OVERLAP_TARGETS_TL.forEach(el => {
                    if (!el) return;
                    const had = el.classList.contains(OVERLAP_CLS_TL);
                    if (had) el.classList.remove(OVERLAP_CLS_TL);
                    const r = el.getBoundingClientRect();
                    if (had) el.classList.add(OVERLAP_CLS_TL);
                    const overlaps = pr.right > r.left - 8 && pr.left < r.right + 8
                                  && pr.bottom > r.top - 8 && pr.top < r.bottom + 8;
                    el.classList.toggle(OVERLAP_CLS_TL, overlaps);
                });
            };

            window.addEventListener('pointermove', checkTimelineOverlap, { passive: true });
            new MutationObserver(checkTimelineOverlap).observe(bottomBar, {
                attributes: true, attributeFilter: ['class', 'style'],
            });
            this.subscriptions.push(() => {
                window.removeEventListener('pointermove', checkTimelineOverlap);
                document.body.classList.remove('timeline-custom-pos');
            });
        }

        // Solar info (azimuth + elevation) — Pro only, below slider
        if (this.timeSlider) {
            const solarInfo = document.createElement('div');
            solarInfo.id = 'timeline-solar-info';
            solarInfo.style.cssText = 'display:flex; justify-content:center; gap:20px; font-size:11px; color:var(--text-2); margin-top:4px;';
            const azSpan = document.createElement('span');
            azSpan.id = 'tl-azimuth';
            const elevSpan = document.createElement('span');
            elevSpan.id = 'tl-elevation';
            solarInfo.appendChild(azSpan);
            solarInfo.appendChild(elevSpan);
            this.timeSlider.parentNode?.appendChild(solarInfo);
            this.tlAzimuthEl = azSpan;
            this.tlElevationEl = elevSpan;
            const syncSolarVis = () => {
                solarInfo.style.display = isProActive() ? 'flex' : 'none';
            };
            syncSolarVis();
            this.subscriptions.push(state.subscribe('isPro', syncSolarVis));
        }

        // Initial sync
        this.syncUI();

        // Subscribe to state changes
        this.subscriptions.push(state.subscribe('simDate', () => {
            this.syncUI();
            const mins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
            updateSunPosition(mins);
            if (isProActive()) this.updateSolarInfo();
        }));

        this.subscriptions.push(state.subscribe('isSunAnimating', (val: boolean) => {
            if (playBtn) playBtn.textContent = val ? '⏸' : '▶';
        }));

        // Fermer la timeline automatiquement quand on bascule en mode 2D
        this.subscriptions.push(state.subscribe('IS_2D_MODE', (is2D: boolean) => {
            if (is2D && bottomBar && bottomBar.classList.contains('is-open')) {
                bottomBar.classList.remove('is-open');
                document.body.classList.remove('timeline-open');
                document.body.classList.remove('timeline-custom-pos');
                if (toggleBtn) toggleBtn.classList.remove('active');
            }
        }));
    }

    private syncUI() {
        if (this.dateInput) {
            const year = state.simDate.getFullYear();
            const month = String(state.simDate.getMonth() + 1).padStart(2, '0');
            const day = String(state.simDate.getDate()).padStart(2, '0');
            this.dateInput.value = `${year}-${month}-${day}`;
        }
        if (this.timeSlider && !state.isSunAnimating) {
            const val = (state.simDate.getHours() * 60 + state.simDate.getMinutes()).toString();
            this.timeSlider.value = val;
            // ARIA: sync valuenow
            this.timeSlider.setAttribute('aria-valuenow', val);
        }
    }

    private attachSwipeGesture(bottomBar: HTMLElement): void {
        // Inject drag handle if not already present
        if (!bottomBar.querySelector('.timeline-drag-handle')) {
            const handle = document.createElement('div');
            handle.className = 'timeline-drag-handle';
            handle.setAttribute('aria-hidden', 'true');
            handle.innerHTML = '<div class="sheet-drag-indicator"></div>';
            bottomBar.insertBefore(handle, bottomBar.firstChild);
        }

        const handle = bottomBar.querySelector<HTMLElement>('.timeline-drag-handle')!;

        // v5.19.1 : drag repositionnable + swipe dismiss via helper unifié
        const cleanup = attachDraggablePanel({
            panel: bottomBar,
            handle,
            customPosClass: 'panel-custom-pos',
            onDismiss: () => {
                void haptic('medium');
                bottomBar.classList.remove('is-open');
                document.body.classList.remove('timeline-open');
                document.body.classList.remove('timeline-custom-pos');
                const toggleBtn = document.getElementById('timeline-toggle-btn');
                if (toggleBtn) toggleBtn.classList.remove('active');
            },
        });
        this.subscriptions.push(cleanup);
    }

    private syncDateInputLock(): void {
        if (!this.dateInput) return;
        const locked = !isProActive();
        this.dateInput.classList.toggle('date-input-locked', locked);
        this._dateTrap?.classList.toggle('active', locked);
    }

    private updateSolarInfo(): void {
        if (!this.tlAzimuthEl || !this.tlElevationEl) return;

        let lat = 46.8182;
        let lon = 8.2275;

        if (state.hasLastClicked) {
            const gps = worldToLngLat(state.lastClickedCoords.x, state.lastClickedCoords.z, state.originTile);
            lat = gps.lat;
            lon = gps.lon;
        } else if (state.controls) {
            const gps = worldToLngLat(state.controls.target.x, state.controls.target.z, state.originTile);
            lat = gps.lat;
            lon = gps.lon;
        }

        const pos = SunCalc.getPosition(state.simDate, lat, lon);
        const elevDeg = Math.round(pos.altitude * (180 / Math.PI));
        const azDeg   = Math.round(((pos.azimuth * (180 / Math.PI)) + 180 + 360) % 360);

        this.tlAzimuthEl.textContent  = `↗ ${azDeg}°`;
        this.tlElevationEl.textContent = `▲ ${elevDeg}°`;
    }

    public dispose(): void {
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];
    }
}
