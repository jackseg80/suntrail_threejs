/**
 * tooltip.ts — Reusable rich tooltip with auto-positioning.
 *
 * Supports hover (desktop) and click (mobile) triggers with auto-detection.
 *
 * Usage:
 *   const tooltip = createTooltip(anchorEl, contentEl);
 *   // anchorEl becomes the trigger automatically (hover on desktop, tap on mobile)
 *   // On component dispose: tooltip.dispose();
 *
 *   // For anchors that already have a tap action, use a separate ⓘ icon:
 *   const infoIcon = document.createElement('span');
 *   infoIcon.textContent = 'ⓘ';
 *   parent.appendChild(infoIcon);
 *   const tooltip = createTooltip(infoIcon, contentEl);
 */

export interface TooltipOptions {
    /** Preferred position relative to anchor. Default: 'auto' */
    position?: 'auto' | 'top' | 'bottom';
    /**
     * Trigger mode.
     * - 'auto' (default): hover on pointer-fine devices, click on touch/coarse-pointer
     * - 'click': toggle on click (always)
     * - 'hover': show on mouseenter/focus, hide on mouseleave/blur
     */
    trigger?: 'auto' | 'click' | 'hover';
}

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

function isTouchDevice(): boolean {
    return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        matchMedia('(pointer: coarse)').matches
    );
}

const HIDE_DELAY_MS = 150;

export function createTooltip(
    anchor: HTMLElement,
    content: HTMLElement,
    options?: TooltipOptions
): TooltipHandle {
    const el = document.createElement('div');
    el.className = 'rich-tooltip';
    el.style.display = 'none';
    el.appendChild(content);
    document.body.appendChild(el);

    let visible = false;
    let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
    let outsideTouchHandler: ((e: TouchEvent) => void) | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let hoverCleanup: Array<() => void> = [];

    const trigger = options?.trigger ?? 'auto';
    const resolvedTrigger: 'click' | 'hover' =
        trigger === 'auto'
            ? isTouchDevice()
                ? 'click'
                : 'hover'
            : trigger;

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
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            if (visible) return;
            position();
            visible = true;

            outsideClickHandler = (e: MouseEvent) => {
                if (
                    !el.contains(e.target as Node) &&
                    !anchor.contains(e.target as Node)
                ) {
                    handle.hide();
                }
            };
            setTimeout(() => {
                if (visible && outsideClickHandler) {
                    document.addEventListener('click', outsideClickHandler);
                }
            }, 0);

            outsideTouchHandler = (e: TouchEvent) => {
                if (
                    !el.contains(e.target as Node) &&
                    !anchor.contains(e.target as Node)
                ) {
                    handle.hide();
                }
            };
            document.addEventListener('touchstart', outsideTouchHandler, {
                passive: true,
            });
        },

        hide() {
            if (!visible) return;
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            el.style.display = 'none';
            visible = false;
            if (outsideClickHandler) {
                document.removeEventListener('click', outsideClickHandler);
                outsideClickHandler = null;
            }
            if (outsideTouchHandler) {
                document.removeEventListener(
                    'touchstart',
                    outsideTouchHandler
                );
                outsideTouchHandler = null;
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
            if (hoverCleanup.length > 0) {
                hoverCleanup.forEach((fn) => fn());
                hoverCleanup = [];
            }
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        },
    };

    // ── Bind trigger ──────────────────────────────────────────────────

    if (resolvedTrigger === 'hover') {
        const onEnter = () => {
            handle.show();
        };
        const onLeave = () => {
            hideTimer = setTimeout(() => handle.hide(), HIDE_DELAY_MS);
        };
        const onFocus = () => handle.show();
        const onBlur = () => handle.hide();

        anchor.addEventListener('mouseenter', onEnter);
        anchor.addEventListener('mouseleave', onLeave);
        anchor.addEventListener('focus', onFocus);
        anchor.addEventListener('blur', onBlur);

        hoverCleanup = [
            () => anchor.removeEventListener('mouseenter', onEnter),
            () => anchor.removeEventListener('mouseleave', onLeave),
            () => anchor.removeEventListener('focus', onFocus),
            () => anchor.removeEventListener('blur', onBlur),
        ];

        // Make anchor focusable if not already
        if (anchor.tabIndex === -1) {
            const prevTabIndex = anchor.tabIndex;
            anchor.tabIndex = 0;
            hoverCleanup.push(() => {
                anchor.tabIndex = prevTabIndex;
            });
        }
    } else {
        // click trigger (mobile or explicit)
        const onClick = (e: MouseEvent) => {
            e.stopPropagation();
            handle.toggle();
        };
        anchor.addEventListener('click', onClick);
        hoverCleanup = [() => anchor.removeEventListener('click', onClick)];
    }

    return handle;
}
