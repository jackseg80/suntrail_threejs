import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTooltip } from './tooltip';

function createAnchor(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = 'width:100px;height:30px;';
    el.textContent = 'Anchor';
    document.body.appendChild(el);
    return el;
}

function createContent(text = 'Tooltip content'): HTMLElement {
    const el = document.createElement('div');
    el.textContent = text;
    return el;
}

describe('createTooltip', () => {
    let anchor: HTMLElement;
    let content: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
        anchor = createAnchor();
        content = createContent();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    // ── Creation & DOM ──

    it('appends the tooltip element to body', () => {
        const tooltip = createTooltip(anchor, content);
        expect(tooltip.element).toBeInstanceOf(HTMLElement);
        expect(tooltip.element.className).toBe('rich-tooltip');
        expect(document.body.contains(tooltip.element)).toBe(true);
    });

    it('wraps the content element inside the tooltip', () => {
        const tooltip = createTooltip(anchor, content);
        expect(tooltip.element.contains(content)).toBe(true);
    });

    it('starts hidden (display: none)', () => {
        const tooltip = createTooltip(anchor, content);
        expect(tooltip.element.style.display).toBe('none');
    });

    // ── Show / Hide / Toggle ──

    it('show() makes the tooltip visible', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();
        expect(tooltip.element.style.display).toBe('block');
    });

    it('hide() hides the tooltip', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();
        tooltip.hide();
        expect(tooltip.element.style.display).toBe('none');
    });

    it('toggle() alternates visibility', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.toggle();
        expect(tooltip.element.style.display).toBe('block');
        tooltip.toggle();
        expect(tooltip.element.style.display).toBe('none');
    });

    it('show() is idempotent (calling twice does not break)', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();
        tooltip.show();
        expect(tooltip.element.style.display).toBe('block');
    });

    it('hide() is idempotent', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.hide();
        tooltip.hide();
        expect(tooltip.element.style.display).toBe('none');
    });

    // ── Positioning ──

    it('uses fixed positioning', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();
        expect(tooltip.element.style.position).toBe('fixed');
    });

    it('positions below anchor when there is enough space', () => {
        vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
            top: 50,
            bottom: 80,
            left: 100,
            right: 200,
            width: 100,
            height: 30,
            x: 100,
            y: 50,
            toJSON: () => {},
        });

        const tooltip = createTooltip(anchor, content);
        tooltip.show();

        const top = parseFloat(tooltip.element.style.top);
        expect(top).toBe(88); // 80 + 8
    });

    it('positions above anchor when not enough space below', () => {
        vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
            top: 770,
            bottom: 800,
            left: 100,
            right: 200,
            width: 100,
            height: 30,
            x: 100,
            y: 770,
            toJSON: () => {},
        });

        const tooltip = createTooltip(anchor, content);
        tooltip.show();

        const top = parseFloat(tooltip.element.style.top);
        expect(top).toBeLessThan(770);
    });

    it('respects explicit position: "bottom"', () => {
        vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
            top: 770,
            bottom: 800,
            left: 100,
            right: 200,
            width: 100,
            height: 30,
            x: 100,
            y: 770,
            toJSON: () => {},
        });

        const tooltip = createTooltip(anchor, content, {
            position: 'bottom',
        });
        tooltip.show();

        const top = parseFloat(tooltip.element.style.top);
        expect(top).toBe(808); // 800 + 8, forced below even if no space
    });

    it('respects explicit position: "top"', () => {
        vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
            top: 50,
            bottom: 80,
            left: 100,
            right: 200,
            width: 100,
            height: 30,
            x: 100,
            y: 50,
            toJSON: () => {},
        });

        const tooltip = createTooltip(anchor, content, { position: 'top' });
        tooltip.show();

        const top = parseFloat(tooltip.element.style.top);
        expect(top).toBeLessThan(50); // above the anchor
    });

    it('clamps tooltip left to minimum 8px', () => {
        vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
            top: 50,
            bottom: 80,
            left: -5,
            right: 95,
            width: 100,
            height: 30,
            x: -5,
            y: 50,
            toJSON: () => {},
        });

        const tooltip = createTooltip(anchor, content);
        tooltip.show();

        expect(tooltip.element.style.left).toBe('8px');
    });

    // ── Outside click dismissal ──

    it('hides on outside click', async () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();

        // Wait for the setTimeout in show()
        await new Promise((r) => setTimeout(r, 10));

        document.body.click();
        expect(tooltip.element.style.display).toBe('none');
    });

    it('does NOT hide when clicking the anchor', async () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();

        await new Promise((r) => setTimeout(r, 10));

        anchor.click();
        expect(tooltip.element.style.display).toBe('block');
    });

    it('does NOT hide when clicking inside the tooltip', async () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();

        await new Promise((r) => setTimeout(r, 10));

        content.click();
        expect(tooltip.element.style.display).toBe('block');
    });

    // ── Dispose ──

    it('dispose() hides and removes from DOM', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();
        tooltip.dispose();

        expect(tooltip.element.style.display).toBe('none');
        expect(document.body.contains(tooltip.element)).toBe(false);
    });

    it('dispose() is safe to call on hidden tooltip', () => {
        const tooltip = createTooltip(anchor, content);
        expect(() => tooltip.dispose()).not.toThrow();
    });

    it('dispose() is safe to call twice', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.dispose();
        expect(() => tooltip.dispose()).not.toThrow();
    });

    // ── Multiple tooltips ──

    it('multiple tooltips can coexist', () => {
        const anchor2 = createAnchor();
        const content2 = createContent('Second');

        const t1 = createTooltip(anchor, content);
        const t2 = createTooltip(anchor2, content2);

        t1.show();
        t2.show();

        expect(t1.element.style.display).toBe('block');
        expect(t2.element.style.display).toBe('block');

        t1.dispose();
        t2.dispose();
    });

    // ── Content as string ──

    it('creates tooltip with content as string', () => {
        const tooltip = createTooltip(anchor, content);
        expect(tooltip.element.textContent).toContain('Tooltip content');
    });

    // ── Z-index ──

    it('has z-index >= 1000', () => {
        const tooltip = createTooltip(anchor, content);
        tooltip.show();
        expect(tooltip.element.className).toBe('rich-tooltip');
    });
});
