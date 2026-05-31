/**
 * tooltip.ts — Reusable rich tooltip with auto-positioning.
 *
 * Usage:
 *   const tooltip = createTooltip(anchorEl, contentEl);
 *   anchorEl.addEventListener('click', (e) => { e.stopPropagation(); tooltip.toggle(); });
 *   // On component dispose: tooltip.dispose();
 */

export interface TooltipHandle {
    /** The tooltip wrapper element (appended to body). */
    readonly element: HTMLElement;
    /** Show and position the tooltip. */
    show(): void;
    /** Hide the tooltip. */
    hide(): void;
    /** Toggle visibility. */
    toggle(): void;
    /** Remove from DOM and clean up listeners. */
    dispose(): void;
}

export function createTooltip(
    anchor: HTMLElement,
    content: HTMLElement,
    options?: { position?: 'auto' | 'top' | 'bottom' }
): TooltipHandle {
    const el = document.createElement('div');
    el.className = 'rich-tooltip';
    el.style.display = 'none';
    el.appendChild(content);
    document.body.appendChild(el);

    let visible = false;
    let outsideHandler: ((e: MouseEvent) => void) | null = null;

    const position = () => {
        const anchorRect = anchor.getBoundingClientRect();
        el.style.display = 'block';
        el.style.visibility = 'hidden';
        el.style.position = 'fixed';
        el.style.left = Math.max(8, anchorRect.left) + 'px';
        el.style.top = '0';
        el.style.bottom = 'auto';
        el.style.maxWidth = Math.min(320, window.innerWidth - 16) + 'px';

        const elRect = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const preferBottom =
            options?.position === 'bottom' ||
            (options?.position !== 'top' && spaceBelow >= elRect.height + 8);

        if (preferBottom) {
            el.style.top = anchorRect.bottom + 8 + 'px';
        } else {
            el.style.top =
                Math.max(8, anchorRect.top - elRect.height - 8) + 'px';
        }
        el.style.visibility = 'visible';
    };

    const handle: TooltipHandle = {
        element: el,

        show() {
            if (visible) return;
            position();
            visible = true;

            outsideHandler = (e: MouseEvent) => {
                if (
                    !el.contains(e.target as Node) &&
                    !anchor.contains(e.target as Node)
                ) {
                    handle.hide();
                }
            };
            setTimeout(() => {
                if (visible && outsideHandler) {
                    document.addEventListener('click', outsideHandler);
                }
            }, 0);
        },

        hide() {
            if (!visible) return;
            el.style.display = 'none';
            visible = false;
            if (outsideHandler) {
                document.removeEventListener('click', outsideHandler);
                outsideHandler = null;
            }
        },

        toggle() {
            if (visible) {
                handle.hide();
            } else {
                handle.show();
            }
        },

        dispose() {
            handle.hide();
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        },
    };

    return handle;
}
