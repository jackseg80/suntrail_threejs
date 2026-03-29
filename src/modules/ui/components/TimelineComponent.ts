import { state } from '../../state';
import { updateSunPosition } from '../../sun';
import { haptic } from '../../haptics';
import { showToast } from '../../utils';
import { i18n } from '../../../i18n/I18nService';

export class TimelineComponent {
    private timeSlider: HTMLInputElement | null = null;
    private dateInput: HTMLInputElement | null = null;
    private subscriptions: Array<() => void> = [];

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
            this.dateInput.addEventListener('change', (e) => {
                const d = new Date((e.target as HTMLInputElement).value);
                if (!isNaN(d.getTime())) {
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

        // Initial sync
        this.syncUI();

        // Subscribe to state changes
        this.subscriptions.push(state.subscribe('simDate', () => {
            this.syncUI();
            const mins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
            updateSunPosition(mins);
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
        let startY = 0;
        let startTime = 0;
        let isDragging = false;

        const onStart = (e: PointerEvent): void => {
            startY = e.clientY;
            startTime = Date.now();
            isDragging = true;
            handle.setPointerCapture(e.pointerId);
            bottomBar.style.transition = 'none';
        };

        const onMove = (e: PointerEvent): void => {
            if (!isDragging) return;
            const delta = e.clientY - startY;
            if (delta > 0) {
                // Translate relative to open position (translate(-50%, 0))
                bottomBar.style.transform = `translate(-50%, ${delta * 0.6}px)`;
            }
        };

        const onEnd = (e: PointerEvent): void => {
            if (!isDragging) return;
            isDragging = false;
            const delta = e.clientY - startY;
            const duration = Date.now() - startTime;
            const velocity = duration > 0 ? delta / duration : 0;

            // Restore transition
            bottomBar.style.transition = '';
            bottomBar.style.transform = '';

            if (delta > 60 || velocity > 0.3) {
                void haptic('medium');
                // Close: remove is-open + sync body class + toggle button
                bottomBar.classList.remove('is-open');
                document.body.classList.remove('timeline-open');
                const toggleBtn = document.getElementById('timeline-toggle-btn');
                if (toggleBtn) toggleBtn.classList.remove('active');
            }
        };

        handle.addEventListener('pointerdown', onStart);
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onEnd);
        handle.addEventListener('pointercancel', onEnd);
    }

    public dispose(): void {
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];
    }
}
