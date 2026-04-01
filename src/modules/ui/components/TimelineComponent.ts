import { state } from '../../state';
import { updateSunPosition } from '../../sun';
import { haptic } from '../../haptics';
import { showToast } from '../../utils';
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

    constructor() {
        // No hydration, just attach to existing DOM
        this.render();
    }

    public render(): void {
        // The elements are already in the DOM because WidgetsComponent hydrated them
        this.timeSlider = document.getElementById('time-slider') as HTMLInputElement;
        this.dateInput = document.getElementById('date-input') as HTMLInputElement;

        if (this.timeSlider) {
            // ARIA: time slider attributes
            this.timeSlider.setAttribute('aria-label', 'Heure de simulation');
            this.timeSlider.setAttribute('aria-valuemin', this.timeSlider.min);
            this.timeSlider.setAttribute('aria-valuemax', this.timeSlider.max);
            this.timeSlider.setAttribute('aria-valuenow', this.timeSlider.value);

            // Timer pour désactiver le flag après la fin du drag
            let _renderTimer: ReturnType<typeof setTimeout> | null = null;

            this.timeSlider.addEventListener('input', () => {
                // Forcer le render loop à rester actif pendant le drag
                // (sans ça, la scène ne se met pas à jour car needsUpdate = false)
                state.isInteractingWithUI = true;
                if (_renderTimer) clearTimeout(_renderTimer);
                _renderTimer = setTimeout(() => {
                    state.isInteractingWithUI = false;
                }, 150);

                const mins = parseInt(this.timeSlider!.value);
                const newDate = new Date(state.simDate);
                newDate.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
                state.simDate = newDate;
                // ARIA: sync valuenow
                this.timeSlider!.setAttribute('aria-valuenow', this.timeSlider!.value);
            });
        }

        if (this.dateInput) {
            // Initialiser l'aspect visuel du sélecteur de date selon isPro
            this.syncDateInputLock();
            this.subscriptions.push(state.subscribe('isPro', () => this.syncDateInputLock()));

            this.dateInput.addEventListener('change', (e) => {
                const d = new Date((e.target as HTMLInputElement).value);
                if (!isNaN(d.getTime())) {
                    // Gate Pro : seule la date du jour est accessible sans Pro
                    if (!state.isPro) {
                        const today = new Date();
                        const isToday = d.getFullYear() === today.getFullYear() &&
                                        d.getMonth()    === today.getMonth()    &&
                                        d.getDate()     === today.getDate();
                        if (!isToday) {
                            // Réinitialiser l'input à aujourd'hui
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
        const toggleBtn = document.getElementById('timeline-toggle-btn');
        const bottomBar = document.getElementById('bottom-bar');
        if (toggleBtn && bottomBar) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // En mode 2D, la simulation solaire n'est pas disponible (relief plat = ombres fausses)
                // Utilise state.IS_2D_MODE (source de vérité) plutôt que la classe CSS
                // qui peut être absente au démarrage si IS_2D_MODE=true persisté depuis localStorage
                if (state.IS_2D_MODE) {
                    showToast(i18n.t('timeline.requires3D'));
                    return;
                }
                const isOpen = bottomBar.classList.toggle('is-open');
                toggleBtn.classList.toggle('active');
                document.body.classList.toggle('timeline-open', isOpen);
            });

            // Drag handle — swipe down to close
            this.attachSwipeGesture(bottomBar);
        }

        // Hint upsell sous le sélecteur de date — visible uniquement pour les users gratuits
        if (this.dateInput) {
            const hint = document.createElement('div');
            hint.id = 'timeline-upsell-hint';
            hint.style.cssText = 'font-size:10px; color:var(--text-3); text-align:center; margin-top:4px; opacity:0.7; letter-spacing:0.3px; cursor:pointer;';
            hint.textContent = i18n.t('upsell.timeline');
            hint.addEventListener('click', () => showUpgradePrompt('solar_calendar'));
            this.dateInput.parentNode?.appendChild(hint);
            const syncHint = () => { hint.style.display = state.isPro ? 'none' : 'block'; };
            syncHint();
            this.subscriptions.push(state.subscribe('isPro', syncHint));
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
                solarInfo.style.display = state.isPro ? 'flex' : 'none';
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
            if (state.isPro) this.updateSolarInfo();
        }));

        this.subscriptions.push(state.subscribe('isSunAnimating', (val: boolean) => {
            if (playBtn) playBtn.textContent = val ? '⏸' : '▶';
        }));

        // Fermer la timeline automatiquement quand on bascule en mode 2D
        this.subscriptions.push(state.subscribe('IS_2D_MODE', (is2D: boolean) => {
            if (is2D && bottomBar && bottomBar.classList.contains('is-open')) {
                bottomBar.classList.remove('is-open');
                document.body.classList.remove('timeline-open');
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
                const toggleBtn = document.getElementById('timeline-toggle-btn');
                if (toggleBtn) toggleBtn.classList.remove('active');
            },
        });
        this.subscriptions.push(cleanup);
    }

    private syncDateInputLock(): void {
        if (!this.dateInput) return;
        if (state.isPro) {
            this.dateInput.removeAttribute('title');
            this.dateInput.style.opacity = '';
        } else {
            this.dateInput.title = i18n.t('upsell.timeline');
            // Légère opacité pour signaler visuellement la limitation
            this.dateInput.style.opacity = '0.7';
        }
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
