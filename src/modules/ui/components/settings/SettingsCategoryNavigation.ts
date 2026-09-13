import { eventBus } from '../../../eventBus';
import { i18n } from '../../../../i18n/I18nService';

type SettingsCategory = 'essentials' | 'hiking' | 'developer';

const CATEGORY_TARGETS: Partial<Record<SettingsCategory, string>> = {
    essentials: 'settings-essentials-heading',
    hiking: 'settings-hiking-group',
};
const CATEGORIES: SettingsCategory[] = ['essentials', 'hiking', 'developer'];

export class SettingsCategoryNavigation {
    private nav: HTMLElement | null = null;
    private localeHandler = () => this.updateLabels();
    private scrollHandler = () => this.syncSelectionFromScroll();

    constructor(
        private readonly root: HTMLElement,
        private readonly openAdvancedPage: () => void = () => undefined
    ) {}

    hydrate(): void {
        if (this.root.querySelector('#settings-category-nav')) return;
        const header = this.root.querySelector('.sheet-header');
        if (!header) return;

        this.nav = document.createElement('nav');
        this.nav.id = 'settings-category-nav';
        this.nav.className = 'settings-category-nav';
        this.nav.setAttribute(
            'aria-label',
            i18n.t('settings.category.ariaLabel')
        );

        CATEGORIES.forEach((category, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'settings-category-btn';
            button.dataset.settingsCategory = category;
            if (index === 0) button.setAttribute('aria-current', 'location');
            button.addEventListener('click', () =>
                this.activate(category, button)
            );
            this.nav?.appendChild(button);
        });

        header.insertAdjacentElement('afterend', this.nav);
        this.updateLabels();
        eventBus.on('localeChanged', this.localeHandler);
        this.root.addEventListener('scroll', this.scrollHandler, {
            passive: true,
        });
    }

    dispose(): void {
        eventBus.off('localeChanged', this.localeHandler);
        this.root.removeEventListener('scroll', this.scrollHandler);
        this.nav?.remove();
        this.nav = null;
    }

    private activate(
        category: SettingsCategory,
        activeButton: HTMLButtonElement
    ): void {
        if (category === 'developer') {
            this.openAdvancedPage();
            return;
        }
        this.selectButton(activeButton);
        const targetId = CATEGORY_TARGETS[category];
        if (!targetId) return;
        const target = this.root.querySelector<HTMLElement>(`#${targetId}`);
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        window.setTimeout(() => target?.focus({ preventScroll: true }), 250);
    }

    private syncSelectionFromScroll(): void {
        if (!this.nav) return;
        const threshold = this.root.scrollTop + this.nav.offsetHeight + 24;
        let current: SettingsCategory = 'essentials';
        for (const category of Object.keys(CATEGORY_TARGETS) as Array<
            'essentials' | 'hiking'
        >) {
            const targetId = CATEGORY_TARGETS[category];
            if (!targetId) continue;
            const target = this.root.querySelector<HTMLElement>(`#${targetId}`);
            if (target && target.offsetTop <= threshold) current = category;
        }
        const button = this.nav.querySelector<HTMLButtonElement>(
            `[data-settings-category="${current}"]`
        );
        if (button) this.selectButton(button);
    }

    private selectButton(activeButton: HTMLButtonElement): void {
        this.nav
            ?.querySelectorAll<HTMLButtonElement>('.settings-category-btn')
            .forEach((button) => {
                if (button === activeButton) {
                    button.setAttribute('aria-current', 'location');
                } else {
                    button.removeAttribute('aria-current');
                }
            });
    }

    private updateLabels(): void {
        this.nav?.setAttribute(
            'aria-label',
            i18n.t('settings.category.ariaLabel')
        );
        this.nav
            ?.querySelectorAll<HTMLElement>('[data-settings-category]')
            .forEach((button) => {
                button.textContent = i18n.t(
                    `settings.category.${button.dataset.settingsCategory}`
                );
            });
    }
}
