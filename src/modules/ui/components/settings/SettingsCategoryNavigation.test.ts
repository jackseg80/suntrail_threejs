import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOn, mockOff, mockT } = vi.hoisted(() => ({
    mockOn: vi.fn(),
    mockOff: vi.fn(),
    mockT: vi.fn((key: string) => key),
}));

vi.mock('../../../eventBus', () => ({
    eventBus: { on: mockOn, off: mockOff },
}));

vi.mock('../../../../i18n/I18nService', () => ({
    i18n: { t: mockT },
}));

import { SettingsCategoryNavigation } from './SettingsCategoryNavigation';

describe('SettingsCategoryNavigation', () => {
    let root: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        Element.prototype.scrollIntoView = vi.fn();
        document.body.innerHTML = `
            <section id="settings-root">
                <header class="sheet-header"></header>
                <h2 id="settings-essentials-heading" tabindex="-1">Essentials</h2>
                <section id="settings-hiking-group" tabindex="-1">Hiking</section>
                <details id="settings-developer-lab" tabindex="-1"><summary>Lab</summary></details>
            </section>`;
        root = document.getElementById('settings-root')!;
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('creates the three translated categories after the sheet header', () => {
        const navigation = new SettingsCategoryNavigation(root);
        navigation.hydrate();

        const nav = document.getElementById('settings-category-nav')!;
        expect(nav.previousElementSibling?.classList).toContain('sheet-header');
        expect(nav.getAttribute('aria-label')).toBe(
            'settings.category.ariaLabel'
        );
        expect(nav.querySelectorAll('button')).toHaveLength(3);
        expect(nav.textContent).toContain('settings.category.essentials');
        expect(mockOn).toHaveBeenCalledWith(
            'localeChanged',
            expect.any(Function)
        );
    });

    it('opens and focuses the developer lab while syncing selection', () => {
        const navigation = new SettingsCategoryNavigation(root);
        navigation.hydrate();
        const developerButton = root.querySelector<HTMLButtonElement>(
            '[data-settings-category="developer"]'
        )!;
        const lab = document.getElementById(
            'settings-developer-lab'
        ) as HTMLDetailsElement;
        const focusSpy = vi.spyOn(lab, 'focus');

        developerButton.click();
        vi.advanceTimersByTime(250);

        expect(lab.open).toBe(true);
        expect(lab.scrollIntoView).toHaveBeenCalledWith({
            block: 'start',
            behavior: 'smooth',
        });
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
        expect(developerButton.getAttribute('aria-selected')).toBe('true');
    });

    it('removes its navigation and locale listener on dispose', () => {
        const navigation = new SettingsCategoryNavigation(root);
        navigation.hydrate();
        navigation.dispose();

        expect(document.getElementById('settings-category-nav')).toBeNull();
        expect(mockOff).toHaveBeenCalledWith(
            'localeChanged',
            expect.any(Function)
        );
    });
});
