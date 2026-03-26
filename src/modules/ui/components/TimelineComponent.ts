import { state } from '../../state';
import { updateSunPosition } from '../../sun';

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

            this.timeSlider.addEventListener('input', () => {
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
                bottomBar.classList.toggle('is-open');
                toggleBtn.classList.toggle('active');
            });
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

    public dispose(): void {
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];
    }
}
