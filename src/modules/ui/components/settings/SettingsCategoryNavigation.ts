import { eventBus } from '../../../eventBus';
import { i18n } from '../../../../i18n/I18nService';

type SettingsCategory = 'essentials' | 'hiking' | 'developer';

const CATEGORY_TARGETS: Record<SettingsCategory, string> = {
    essentials: 'settings-essentials-heading',
    hiking: 'settings-hiking-group',
    developer: 'settings-developer-lab',
};

export class SettingsCategoryNavigation {
    private nav: HTMLElement | null = null;
    private localeHandler = () => this.updateLabels();

    constructor(private readonly root: HTMLElement) {}

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

        (Object.keys(CATEGORY_TARGETS) as SettingsCategory[]).forEach(
            (category, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'settings-category-btn';
                button.dataset.settingsCategory = category;
                button.setAttribute('aria-selected', String(index === 0));
                button.addEventListener('click', () =>
                    this.activate(category, button)
                );
                this.nav?.appendChild(button);
            }
        );

        header.insertAdjacentElement('afterend', this.nav);
        this.updateLabels();
        eventBus.on('localeChanged', this.localeHandler);
    }

    dispose(): void {
        eventBus.off('localeChanged', this.localeHandler);
        this.nav?.remove();
        this.nav = null;
    }

    private activate(
        category: SettingsCategory,
        activeButton: HTMLButtonElement
    ): void {
        this.nav
            ?.querySelectorAll('.settings-category-btn')
            .forEach((button) =>
                button.setAttribute(
                    'aria-selected',
                    String(button === activeButton)
                )
            );
        const target = this.root.querySelector<HTMLElement>(
            `#${CATEGORY_TARGETS[category]}`
        );
        if (category === 'developer' && target instanceof HTMLDetailsElement) {
            target.open = true;
        }
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        window.setTimeout(() => target?.focus({ preventScroll: true }), 250);
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
