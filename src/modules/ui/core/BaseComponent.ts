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
        const container = document.getElementById(this.containerId);

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
            container.appendChild(clone);
            this.render();
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
