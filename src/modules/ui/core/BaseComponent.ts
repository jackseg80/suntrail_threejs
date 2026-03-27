import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';

export abstract class BaseComponent {
    protected templateId: string;
    protected containerId: string;
    protected element: HTMLElement | null = null;
    protected subscriptions: Array<() => void> = [];

    constructor(templateId: string, containerId: string) {
        this.templateId = templateId;
        this.containerId = containerId;
    }

    public hydrate(): void {
        const template = document.getElementById(this.templateId) as HTMLTemplateElement;
        const container = this.containerId === 'body' ? document.body : document.getElementById(this.containerId);

        if (!template) {
            console.error(`Template with id "${this.templateId}" not found.`);
            return;
        }

        if (!container) {
            console.error(`Container with id "${this.containerId}" not found.`);
            return;
        }

        const clone = template.content.cloneNode(true) as DocumentFragment;
        this.element = clone.firstElementChild as HTMLElement;
        
        if (this.element) {
            // Apply i18n translations to all [data-i18n] elements in this template
            i18n.applyToDOM(clone);
            container.appendChild(clone);
            this.render();

            // Re-apply i18n on every locale change
            const onLocaleChanged = () => {
                if (this.element) i18n.applyToDOM(this.element);
            };
            eventBus.on('localeChanged', onLocaleChanged);
            this.subscriptions.push(() => eventBus.off('localeChanged', onLocaleChanged));
        } else {
            console.error(`Template "${this.templateId}" does not contain a root element.`);
        }
    }

    public abstract render(): void;

    public dispose(): void {
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];

        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
    }

    protected addSubscription(unsubscribe: () => void): void {
        this.subscriptions.push(unsubscribe);
    }
}
