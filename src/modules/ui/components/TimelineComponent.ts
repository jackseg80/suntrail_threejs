import { state, isProActive } from '../../state';
import { updateSunPosition } from '../../sun';
import { showToast } from '../../toast';
import { i18n } from '../../../i18n/I18nService';
import { worldToLngLat } from '../../geo';
import { showUpgradePrompt } from '../../iap';
import { ICON_LOCK, ICON_PAUSE, ICON_PLAY } from '../icons';
import SunCalc from '../../suncalcCompat';

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
        this.timeSlider = document.body.querySelector(
            '#time-slider'
        ) as HTMLInputElement;
        this.dateInput = document.body.querySelector(
            '#date-input'
        ) as HTMLInputElement;
        const toggleBtn = document.body.querySelector('#timeline-toggle-btn');
        const bottomBar = document.body.querySelector(
            '#bottom-bar'
        ) as HTMLElement | null;

        if (this.timeSlider && bottomBar) {
            // ARIA: time slider attributes
            this.timeSlider.setAttribute('aria-label', i18n.t('timeline.time'));
            this.timeSlider.setAttribute('aria-valuemin', this.timeSlider.min);
            this.timeSlider.setAttribute('aria-valuemax', this.timeSlider.max);
            this.timeSlider.setAttribute(
                'aria-valuenow',
                this.timeSlider.value
            );

            let _renderTimer: ReturnType<typeof setTimeout> | null = null;

            // pointerdown : activer pour toute la durée du contact (pas seulement pendant le mouvement)
            // Sans ça, 150ms après l'arrêt du doigt isInteractingWithUI=false → idle mode →
            // renderer.render() non appelé → canvas WebGL Android WebView devient blanc.
            this.timeSlider.addEventListener('pointerdown', () => {
                if (_renderTimer) {
                    clearTimeout(_renderTimer);
                    _renderTimer = null;
                }
                state.isInteractingWithUI = true;
            });

            const onPointerRelease = () => {
                _renderTimer = setTimeout(() => {
                    state.isInteractingWithUI = false;
                }, 150);
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
                this.timeSlider!.setAttribute(
                    'aria-valuenow',
                    this.timeSlider!.value
                );
            });
        }

        if (this.dateInput) {
            this.dateInput.setAttribute('aria-label', i18n.t('timeline.date'));

            // v5.54 : Plus de trap pour permettre l'ouverture du calendrier (Teasing)
            const existingWrapper = this.dateInput.parentElement;
            const dateWrapper = existingWrapper?.classList.contains(
                'date-input-wrapper'
            )
                ? existingWrapper
                : document.createElement('div');
            dateWrapper.classList.add(
                'date-input-wrapper',
                'timeline-date-wrapper'
            );
            if (dateWrapper !== existingWrapper) {
                this.dateInput.parentNode!.insertBefore(
                    dateWrapper,
                    this.dateInput
                );
                dateWrapper.appendChild(this.dateInput);
            }

            if (!dateWrapper.querySelector('.date-input-lock')) {
                const lockIcon = document.createElement('div');
                lockIcon.className = 'date-input-lock';
                lockIcon.setAttribute('aria-hidden', 'true');
                lockIcon.innerHTML = ICON_LOCK;
                dateWrapper.appendChild(lockIcon);
            }

            // Initialiser l'aspect visuel du sélecteur de date selon isProActive
            this.syncDateInputLock();
            this.subscriptions.push(
                state.subscribe('isPro', () => this.syncDateInputLock())
            );
            this.subscriptions.push(
                state.subscribe('trialEnd', () => this.syncDateInputLock())
            );

            this.dateInput.addEventListener('change', (e) => {
                const d = new Date((e.target as HTMLInputElement).value);
                if (!isNaN(d.getTime())) {
                    // Gate Pro : seule la date du jour est accessible sans Pro (filet de sécurité)
                    if (!isProActive()) {
                        const today = new Date();
                        const isToday =
                            d.getFullYear() === today.getFullYear() &&
                            d.getMonth() === today.getMonth() &&
                            d.getDate() === today.getDate();
                        if (!isToday) {
                            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            (e.target as HTMLInputElement).value = todayStr;
                            showUpgradePrompt('solar_calendar');
                            return;
                        }
                    }
                    const newDate = new Date(state.simDate);
                    newDate.setFullYear(
                        d.getFullYear(),
                        d.getMonth(),
                        d.getDate()
                    );
                    state.simDate = newDate;
                }
            });
        }

        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            this.syncPlayControl(playBtn, state.isSunAnimating);
            playBtn.addEventListener('click', () => {
                state.isSunAnimating = !state.isSunAnimating;
            });
        }

        const speedSelect = document.getElementById(
            'speed-select'
        ) as HTMLSelectElement;
        if (speedSelect) {
            speedSelect.setAttribute('aria-label', i18n.t('timeline.speed'));
            speedSelect.addEventListener('change', () => {
                state.animationSpeed = parseFloat(speedSelect.value);
            });
        }

        // Toggle Drawer
        if (toggleBtn && bottomBar) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // En mode 2D, la simulation solaire n'est pas disponible, sauf en mode test pour valider l'UI
                if (
                    state.IS_2D_MODE &&
                    !window.location.search.includes('mode=test')
                ) {
                    showToast(i18n.t('solar.toast.notIn2D'));
                    return;
                }

                const isOpen = bottomBar.classList.toggle('is-open');
                toggleBtn.classList.toggle('active');
                document.body.classList.toggle('timeline-open', isOpen);
                if (isOpen) {
                    this.updateTopAnchor(bottomBar);
                } else {
                    bottomBar.style.removeProperty('--timeline-top');
                }
            });

            // Le panneau de contexte Préparer et le résumé réduit du guidage
            // occupent parfois le haut. La timeline se cale alors juste sous
            // le dernier panneau réellement visible, quelle que soit sa hauteur.
            const updateAnchorIfOpen = () => {
                if (bottomBar.classList.contains('is-open')) {
                    this.updateTopAnchor(bottomBar);
                }
            };
            window.addEventListener('resize', updateAnchorIfOpen, {
                passive: true,
            });
            const bodyAnchorObserver = new MutationObserver(updateAnchorIfOpen);
            bodyAnchorObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['class'],
            });
            const anchorResizeObserver =
                typeof ResizeObserver === 'undefined'
                    ? null
                    : new ResizeObserver(updateAnchorIfOpen);
            [
                document.getElementById('top-status-bar'),
                document.getElementById('route-plan-hud'),
                document.querySelector('.guidance-foreground'),
            ].forEach((element) => {
                if (element) anchorResizeObserver?.observe(element);
            });
            this.subscriptions.push(() => {
                window.removeEventListener('resize', updateAnchorIfOpen);
                bodyAnchorObserver.disconnect();
                anchorResizeObserver?.disconnect();
            });
        }

        // Solar info (azimuth + elevation) — Pro only, below slider
        if (this.timeSlider) {
            const solarInfo = document.getElementById('timeline-solar-info');
            const azSpan = document.getElementById('tl-azimuth');
            const elevSpan = document.getElementById('tl-elevation');
            if (!solarInfo || !azSpan || !elevSpan) {
                this.tlAzimuthEl = null;
                this.tlElevationEl = null;
            } else {
                this.tlAzimuthEl = azSpan;
                this.tlElevationEl = elevSpan;
            }
            const syncSolarVis = () => {
                const isPro = isProActive();
                if (solarInfo) solarInfo.hidden = !isPro;
                if (isPro) this.updateSolarInfo();
            };
            syncSolarVis();
            this.subscriptions.push(state.subscribe('isPro', syncSolarVis));
            this.subscriptions.push(state.subscribe('trialEnd', syncSolarVis));
        }

        // Initial sync
        this.syncUI();

        // Subscribe to state changes
        this.subscriptions.push(
            state.subscribe('simDate', () => {
                this.syncUI();
                // Quand l'animation tourne, la boucle de rendu appelle updateSunPosition directement
                if (!state.isSunAnimating) {
                    const mins =
                        state.simDate.getHours() * 60 +
                        state.simDate.getMinutes();
                    updateSunPosition(mins);
                }
                if (isProActive()) this.updateSolarInfo();
            })
        );

        this.subscriptions.push(
            state.subscribe('isSunAnimating', (val: boolean) => {
                if (playBtn) this.syncPlayControl(playBtn, val);
            })
        );

        // Mémorise l'état ouvert/fermé de la timebar en mode 3D
        let _wasOpenIn3D = false;
        this.subscriptions.push(
            state.subscribe('IS_2D_MODE', (is2D: boolean) => {
                if (is2D && bottomBar) {
                    // On quitte la 3D : sauvegarder l'état, fermer la timebar
                    _wasOpenIn3D = bottomBar.classList.contains('is-open');
                    bottomBar.classList.remove('is-open');
                    document.body.classList.remove('timeline-open');
                    if (toggleBtn) toggleBtn.classList.remove('active');
                }
                if (!is2D && bottomBar) {
                    // On revient en 3D : restaurer l'état précédent
                    if (_wasOpenIn3D) {
                        bottomBar.classList.add('is-open');
                        document.body.classList.add('timeline-open');
                        if (toggleBtn) toggleBtn.classList.add('active');
                        this.updateTopAnchor(bottomBar);
                    }
                }
            })
        );
    }

    /** Positionne la timeline sous les panneaux fixes visibles dans la zone haute. */
    private updateTopAnchor(bottomBar: HTMLElement): void {
        const topStatusBar = document.getElementById('top-status-bar');
        const topStatusBottom = topStatusBar
            ? topStatusBar.getBoundingClientRect().bottom
            : 52;
        let top = Math.max(8, topStatusBottom + 8);

        const anchors: Array<HTMLElement | null> = [
            document.getElementById('route-plan-hud'),
            document.body.classList.contains('guidance-profile-open')
                ? document.querySelector<HTMLElement>('.guidance-foreground')
                : null,
        ];

        for (const anchor of anchors) {
            if (!this.isVisibleTopAnchor(anchor)) continue;
            const rect = anchor.getBoundingClientRect();
            // N'utilise jamais un panneau bas comme point d'ancrage : seul le
            // chrome situé dans la moitié supérieure doit décaler la timeline.
            if (rect.top < window.innerHeight / 2) {
                top = Math.max(top, rect.bottom + 8);
            }
        }

        bottomBar.style.setProperty('--timeline-top', `${Math.ceil(top)}px`);
    }

    private isVisibleTopAnchor(
        element: HTMLElement | null
    ): element is HTMLElement {
        if (!element || element.hidden) return false;
        const style = window.getComputedStyle(element);
        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0'
        ) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    private syncUI() {
        if (this.dateInput) {
            const year = state.simDate.getFullYear();
            const month = String(state.simDate.getMonth() + 1).padStart(2, '0');
            const day = String(state.simDate.getDate()).padStart(2, '0');
            this.dateInput.value = `${year}-${month}-${day}`;
        }
        if (this.timeSlider) {
            const val = (
                state.simDate.getHours() * 60 +
                state.simDate.getMinutes()
            ).toString();
            this.timeSlider.value = val;
            // ARIA: sync valuenow
            this.timeSlider.setAttribute('aria-valuenow', val);
        }
    }

    private syncDateInputLock(): void {
        if (!this.dateInput) return;
        const locked = !isProActive();
        this.dateInput.classList.toggle('date-input-locked', locked);
        const lock = this.dateInput.parentNode?.querySelector(
            '.date-input-lock'
        ) as HTMLElement;
        if (lock) lock.hidden = !locked;
    }

    private syncPlayControl(button: HTMLElement, isPlaying: boolean): void {
        const labelKey = isPlaying ? 'timeline.pause' : 'timeline.play';
        button.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
        button.dataset.i18nAriaLabel = labelKey;
        button.setAttribute('aria-label', i18n.t(labelKey));
        button.setAttribute('aria-pressed', String(isPlaying));
    }

    private updateSolarInfo(): void {
        if (!this.tlAzimuthEl || !this.tlElevationEl) return;

        let lat = 46.8182;
        let lon = 8.2275;

        if (state.hasLastClicked) {
            const gps = worldToLngLat(
                state.lastClickedCoords.x,
                state.lastClickedCoords.z,
                state.originTile
            );
            lat = gps.lat;
            lon = gps.lon;
        } else if (state.controls) {
            const gps = worldToLngLat(
                state.controls.target.x,
                state.controls.target.z,
                state.originTile
            );
            lat = gps.lat;
            lon = gps.lon;
        }

        const pos = SunCalc.getPosition(state.simDate, lat, lon);
        const elevDeg = Math.round(pos.altitude * (180 / Math.PI));
        const azDeg = Math.round(
            (pos.azimuth * (180 / Math.PI) + 180 + 360) % 360
        );

        this.tlAzimuthEl.textContent = `${azDeg}°`;
        this.tlElevationEl.textContent = `${elevDeg}°`;
    }

    public dispose(): void {
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
        this.subscriptions = [];
    }
}
