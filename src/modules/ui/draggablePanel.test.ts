import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachDraggablePanel } from './draggablePanel';

function makePointerEvent(
    type: string,
    overrides: Record<string, unknown> = {}
): Event {
    try {
        return new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: 0,
            clientY: 0,
            pointerId: 1,
            ...overrides,
        });
    } catch {
        const e = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: (overrides.clientX as number) ?? 0,
            clientY: (overrides.clientY as number) ?? 0,
        });
        Object.defineProperty(e, 'pointerId', {
            value: (overrides.pointerId as number) ?? 1,
        });
        return e;
    }
}

let panel: HTMLElement;
let handle: HTMLElement;
let onDismiss: ReturnType<typeof vi.fn>;
let cleanup: () => void;

describe('attachDraggablePanel()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        panel = document.createElement('div');
        Object.defineProperty(panel, 'offsetWidth', {
            value: 300,
            configurable: true,
        });
        Object.defineProperty(panel, 'offsetHeight', {
            value: 400,
            configurable: true,
        });
        panel.style.cssText =
            'position:fixed;bottom:20px;left:50%;transform:translate(-50%,0);';
        document.body.appendChild(panel);

        handle = document.createElement('div');
        panel.appendChild(handle);

        onDismiss = vi.fn();
        cleanup = attachDraggablePanel({
            panel,
            handle,
            onDismiss: onDismiss as () => void,
        });
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('returns a cleanup function', () => {
        expect(typeof cleanup).toBe('function');
    });

    it('cleanup removes listeners (no crash on subsequent events)', () => {
        cleanup();
        expect(() =>
            handle.dispatchEvent(makePointerEvent('pointerdown'))
        ).not.toThrow();
    });

    it('does not call onDismiss on simple tap', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(makePointerEvent('pointerup', { clientY: 100 }));
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not start a drag from an interactive child', () => {
        const button = document.createElement('button');
        handle.appendChild(button);

        button.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        vi.advanceTimersByTime(350);
        button.dispatchEvent(makePointerEvent('pointermove', { clientY: 180 }));
        button.dispatchEvent(makePointerEvent('pointerup', { clientY: 180 }));

        expect(handle.style.cursor).toBe('');
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('calls onDismiss after swipe down exceeding threshold', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(makePointerEvent('pointermove', { clientY: 130 }));
        handle.dispatchEvent(makePointerEvent('pointermove', { clientY: 165 }));
        handle.dispatchEvent(makePointerEvent('pointerup', { clientY: 165 }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('calls onDismiss on fast flick even below distance threshold', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(makePointerEvent('pointermove', { clientY: 115 }));
        vi.advanceTimersByTime(50);
        handle.dispatchEvent(makePointerEvent('pointerup', { clientY: 150 }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('snaps back when swipe is too short and slow', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(makePointerEvent('pointermove', { clientY: 115 }));
        handle.dispatchEvent(makePointerEvent('pointerup', { clientY: 115 }));
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('enters repositioning mode after hold (300ms with little movement)', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        vi.advanceTimersByTime(350);
        expect(panel.style.transition).toBe('none');
        expect(handle.style.cursor).toBe('grabbing');
    });

    it('cancels hold timer when movement exceeds 20px before hold completes', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(
            makePointerEvent('pointermove', { clientX: 120, clientY: 100 })
        );
        vi.advanceTimersByTime(350);
        expect(handle.style.cursor).toBe('');
    });

    it('ignores pointermove without active pointerdown', () => {
        expect(() =>
            handle.dispatchEvent(
                makePointerEvent('pointermove', { clientY: 200 })
            )
        ).not.toThrow();
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('ignores pointerup without active pointerdown', () => {
        expect(() =>
            handle.dispatchEvent(makePointerEvent('pointerup'))
        ).not.toThrow();
    });

    it('handles pointercancel same as pointerup', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(makePointerEvent('pointermove', { clientY: 165 }));
        handle.dispatchEvent(
            makePointerEvent('pointercancel', { clientY: 165 })
        );
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('adds customPosClass when entering reposition mode and moving', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        vi.advanceTimersByTime(350);
        handle.dispatchEvent(
            makePointerEvent('pointermove', { clientX: 100, clientY: 200 })
        );
        expect(panel.classList.contains('panel-custom-pos')).toBe(true);
    });

    it('swipe dismiss from within same test flow works', () => {
        handle.dispatchEvent(makePointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(makePointerEvent('pointermove', { clientY: 130 }));
        handle.dispatchEvent(makePointerEvent('pointermove', { clientY: 170 }));
        handle.dispatchEvent(makePointerEvent('pointerup', { clientY: 170 }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
