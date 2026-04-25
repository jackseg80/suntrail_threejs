import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';

export abstract class BaseComponent {
    protected templateId: string;
    protected containerId: string;
    protected templateHTML: string | null;
    protected element: HTMLElement | null = null;
    protected subscriptions: Array<() => void> = [];

    constructor(templateId: string, containerId: string, templateHTML: string | null = null) {
        this.templateId = templateId;
        this.containerId = containerId;
        this.templateHTML = templateHTML;
    }

    public hydrate(): void {
        let content: DocumentFragment;
        const container = this.containerId === 'body' ? document.body : document.getElementById(this.containerId);

        if (this.templateHTML) {
            const temp = document.createElement('template');
            temp.innerHTML = this.templateHTML;
            content = temp.content;
        } else {
            const template = document.getElementById(this.templateId) as HTMLTemplateElement;
            if (!template) {
                console.error(`Template with id "${this.templateId}" not found.`);
                return;
            }
            content = template.content;
        }

        if (!container) {
            console.error(`Container with id "${this.containerId}" not found.`);
            return;
        }

        const clone = content.cloneNode(true) as DocumentFragment;
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
