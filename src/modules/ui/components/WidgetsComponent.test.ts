import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../templates/widgets.html?raw', () => ({
    default: '<div class="floating-widgets"></div>',
}));

import { WidgetsComponent } from './WidgetsComponent';

describe('WidgetsComponent', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'widgets-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hydrates without crashing', () => {
        const comp = new WidgetsComponent();
        expect(() => comp.hydrate()).not.toThrow();
    });

    it('inserts content into the container', () => {
        const comp = new WidgetsComponent();
        comp.hydrate();
        expect(container.children.length).toBeGreaterThan(0);
    });

    it('disposes cleanly', () => {
        const comp = new WidgetsComponent();
        comp.hydrate();
        expect(() => comp.dispose()).not.toThrow();
    });
});
