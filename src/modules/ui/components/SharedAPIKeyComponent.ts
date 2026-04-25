import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { showToast } from '../../toast';
import { haptic } from '../../haptics';
import templateHTML from '../templates/api-key-form.html?raw';

export class SharedAPIKeyComponent extends BaseComponent {
    private onKeyChange?: () => void;

    constructor(containerId: string, onKeyChange?: () => void) {
        super('template-api-key-form', containerId, templateHTML);
        this.onKeyChange = onKeyChange;
    }

    public render(): void {
        const form = this.element?.querySelector<HTMLFormElement>('.api-key-form');
        const input = this.element?.querySelector<HTMLInputElement>('.api-key-input');
        if (!form || !input) return;

        // Initial value
        input.value = state.MK || '';
        input.setAttribute('aria-label', 'Cl\u00e9 API MapTiler');

        // Submit handler
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const key = input.value.trim();
            if (key.length < 10) return;
            state.MK = key;
            localStorage.setItem('maptiler_key', key);
            showToast('Clé API mise à jour');
            void haptic('success');
            if (this.onKeyChange) this.onKeyChange();
        });

        // Sync from state (if changed elsewhere)
        this.addSubscription(
            state.subscribe('MK', (val: string) => {
                if (document.activeElement !== input) {
                    input.value = val || '';
                }
            })
        );
    }
}
