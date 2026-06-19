import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => {
    const state: Record<string, any> = {
        MK: '',
    };
    state.subscribe = vi.fn((_path, _cb) => vi.fn());
    return { mockState: state };
});

vi.mock('../../state', () => ({
    state: mockState,
}));

vi.mock('../../toast', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../haptics', () => ({
    haptic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../constants/storage', () => ({
    STORAGE_KEYS: {
        MAPTILER_KEY: 'maptiler_key',
    },
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../templates/api-key-form.html?raw', () => ({
    default: `
        <div class="api-key-section">
            <form class="api-key-form">
                <div class="api-key-input-row">
                    <input type="text" class="api-key-input" />
                    <button type="submit" class="api-key-submit-btn">OK</button>
                </div>
            </form>
        </div>`,
}));

import { SharedAPIKeyComponent } from './SharedAPIKeyComponent';
import { showToast } from '../../toast';

describe('SharedAPIKeyComponent', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.MK = '';
        localStorage.clear();
        container = document.createElement('div');
        container.id = 'test-api-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hydrates without crashing', () => {
        const comp = new SharedAPIKeyComponent('test-api-container');
        expect(() => comp.hydrate()).not.toThrow();
    });

    it('renders input with current state.MK value', () => {
        mockState.MK = 'test-key-1234567890';
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        const input = container.querySelector(
            '.api-key-input'
        ) as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.value).toBe('test-key-1234567890');
    });

    it('sets aria-label on the input', () => {
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        const input = container.querySelector(
            '.api-key-input'
        ) as HTMLInputElement;
        expect(input.getAttribute('aria-label')).toBe('Clé API MapTiler');
    });

    it('saves key on form submit', () => {
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        const input = container.querySelector(
            '.api-key-input'
        ) as HTMLInputElement;
        const form = container.querySelector(
            '.api-key-form'
        ) as HTMLFormElement;
        input.value = 'valid-key-long-enough-12345';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(mockState.MK).toBe('valid-key-long-enough-12345');
        expect(localStorage.getItem('maptiler_key')).toBe(
            'valid-key-long-enough-12345'
        );
        expect(showToast).toHaveBeenCalledWith('Clé API mise à jour');
    });

    it('rejects keys shorter than 10 characters', () => {
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        const input = container.querySelector(
            '.api-key-input'
        ) as HTMLInputElement;
        const form = container.querySelector(
            '.api-key-form'
        ) as HTMLFormElement;
        input.value = 'short';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(showToast).not.toHaveBeenCalled();
        expect(mockState.MK).toBe('');
    });

    it('calls onKeyChange callback after submit', () => {
        const onKeyChange = vi.fn();
        const comp = new SharedAPIKeyComponent(
            'test-api-container',
            onKeyChange
        );
        comp.hydrate();
        const input = container.querySelector(
            '.api-key-input'
        ) as HTMLInputElement;
        const form = container.querySelector(
            '.api-key-form'
        ) as HTMLFormElement;
        input.value = 'valid-key-long-enough-12345';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onKeyChange).toHaveBeenCalled();
    });

    it('subscribes to state.MK changes', () => {
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        expect(mockState.subscribe).toHaveBeenCalledWith(
            'MK',
            expect.any(Function)
        );
    });

    it('disposes cleanly', () => {
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        expect(() => comp.dispose()).not.toThrow();
        expect(container.children.length).toBe(0);
    });

    it('trims whitespace from the key', () => {
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        const input = container.querySelector(
            '.api-key-input'
        ) as HTMLInputElement;
        const form = container.querySelector(
            '.api-key-form'
        ) as HTMLFormElement;
        input.value = '   trimmed-key-12345   ';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(mockState.MK).toBe('trimmed-key-12345');
    });

    it('initializes input as empty string when state.MK is null', () => {
        mockState.MK = '';
        const comp = new SharedAPIKeyComponent('test-api-container');
        comp.hydrate();
        const input = container.querySelector(
            '.api-key-input'
        ) as HTMLInputElement;
        expect(input.value).toBe('');
    });
});
