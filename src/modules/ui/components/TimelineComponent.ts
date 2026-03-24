import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { updateSunPosition } from '../../sun';

export class TimelineComponent extends BaseComponent {
    private timeSlider: HTMLInputElement | null = null;
    private dateInput: HTMLInputElement | null = null;

    constructor() {
        super('template-widgets', 'body'); // It's part of widgets
    }

    public render(): void {
        // The elements are already in the DOM because WidgetsComponent hydrated them
        this.timeSlider = document.getElementById('time-slider') as HTMLInputElement;
        this.dateInput = document.getElementById('date-input') as HTMLInputElement;

        if (this.timeSlider) {
            this.timeSlider.addEventListener('input', () => {
                const mins = parseInt(this.timeSlider!.value);
                const newDate = new Date(state.simDate);
                newDate.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
                state.simDate = newDate;
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

        // Initial sync
        this.syncUI();

        // Subscribe to state changes
        this.addSubscription(state.subscribe('simDate', () => {
            this.syncUI();
            const mins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
            updateSunPosition(mins);
        }));

        this.addSubscription(state.subscribe('isSunAnimating', (val: boolean) => {
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
            this.timeSlider.value = (state.simDate.getHours() * 60 + state.simDate.getMinutes()).toString();
        }
    }
}
