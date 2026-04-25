import { BaseComponent } from '../core/BaseComponent';
import templateHTML from '../templates/widgets.html?raw';

export class WidgetsComponent extends BaseComponent {
    constructor() {
        super('template-widgets', 'body', templateHTML); // Mount directly to body
    }

    public render(): void {
        // This component just hydrates the floating widgets
        // Logic for individual widgets is still in ui.ts for now
    }
}
