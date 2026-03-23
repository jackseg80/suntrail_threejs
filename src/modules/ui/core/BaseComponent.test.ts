import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseComponent } from './BaseComponent';

class TestComponent extends BaseComponent {
    public renderCalled = false;

    public render(): void {
        this.renderCalled = true;
    }

    public addSub(sub: () => void) {
        this.addSubscription(sub);
    }
}

describe('BaseComponent', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <template id="test-template">
                <div class="test-element">Test Content</div>
            </template>
            <div id="test-container"></div>
        `;
    });

    it('should hydrate template and append to container', () => {
        const component = new TestComponent('test-template', 'test-container');
        component.hydrate();

        const container = document.getElementById('test-container');
        expect(container?.innerHTML).toContain('Test Content');
        expect(component.renderCalled).toBe(true);
    });

    it('should call cleanup functions and remove element on dispose', () => {
        const component = new TestComponent('test-template', 'test-container');
        component.hydrate();

        const cleanup1 = vi.fn();
        const cleanup2 = vi.fn();

        component.addSub(cleanup1);
        component.addSub(cleanup2);

        const container = document.getElementById('test-container');
        expect(container?.innerHTML).toContain('Test Content');

        component.dispose();

        expect(cleanup1).toHaveBeenCalled();
        expect(cleanup2).toHaveBeenCalled();
        expect(container?.innerHTML).not.toContain('Test Content');
    });

    it('should handle missing template gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const component = new TestComponent('missing-template', 'test-container');
        component.hydrate();

        expect(consoleSpy).toHaveBeenCalledWith('Template with id "missing-template" not found.');
        expect(component.renderCalled).toBe(false);
        consoleSpy.mockRestore();
    });

    it('should handle missing container gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const component = new TestComponent('test-template', 'missing-container');
        component.hydrate();

        expect(consoleSpy).toHaveBeenCalledWith('Container with id "missing-container" not found.');
        expect(component.renderCalled).toBe(false);
        consoleSpy.mockRestore();
    });
});
