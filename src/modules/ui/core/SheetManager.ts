import { eventBus } from '../../eventBus';
import { haptic } from '../../haptics';

interface SheetHistoryEntry {
    id: string;
    scrollTop: number;
    focusedElement: HTMLElement | null;
}

/**
 * SheetManager
 * Singleton controller for managing bottom sheets.
 * Ensures exclusivity (only one sheet open at a time) and handles overlay visibility.
 */
class SheetManager {
    private static instance: SheetManager;
    private activeSheetId: string | null = null;
    private overlay: HTMLElement | null = null;
    private history: SheetHistoryEntry[] = [];
    private backHandlers = new Map<string, () => boolean>();

    // Accessibility: focus management
    private triggerElement: HTMLElement | null = null;
    private focusTrapHandler: ((e: KeyboardEvent) => void) | null = null;
    private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

    // Swipe gesture cleanup — stored callbacks + handle element for detach
    private swipeHandle: HTMLElement | null = null;
    private swipeCallbacks: Array<{
        type: string;
        fn: (e: Event) => void;
    }> | null = null;

    private constructor() {
        // Overlay will be initialized on first use if not already present
    }

    private getOverlay(): HTMLElement | null {
        if (!this.overlay) {
            this.overlay = document.getElementById('sheet-overlay');
            if (this.overlay) {
                this.overlay.addEventListener('click', () => this.close());
            }
        }
        return this.overlay;
    }

    public static getInstance(): SheetManager {
        if (!SheetManager.instance) {
            SheetManager.instance = new SheetManager();
        }
        return SheetManager.instance;
    }

    /**
     * Opens a specific sheet by ID, closing any other open sheet.
     */
    public open(id: string): void {
        if (this.activeSheetId === id) return;

        if (!document.getElementById(id)) {
            console.warn(`SheetManager: Sheet with id '${id}' not found.`);
            return;
        }

        this.history = [];
        this.openSheet(id);
    }

    /**
     * Opens a sheet as a child of the current one. Back/Escape restores the
     * parent at the same scroll position instead of dropping the context.
     */
    public openChild(id: string): void {
        if (this.activeSheetId === id) return;

        const child = document.getElementById(id);
        if (!child) {
            console.warn(`SheetManager: Sheet with id '${id}' not found.`);
            return;
        }

        if (!this.activeSheetId) {
            this.open(id);
            return;
        }

        const parent = document.getElementById(this.activeSheetId);
        this.history.push({
            id: this.activeSheetId,
            scrollTop: parent?.scrollTop ?? 0,
            focusedElement:
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null,
        });
        this.openSheet(id);
    }

    private openSheet(
        id: string,
        restored?: Pick<SheetHistoryEntry, 'scrollTop' | 'focusedElement'>
    ): void {
        const sheet = document.getElementById(id);
        if (!sheet) {
            console.warn(`SheetManager: Sheet with id '${id}' not found.`);
            return;
        }

        // Store only the element which opened the root sheet. A child keeps
        // this reference so closing the whole flow returns to the map control.
        if (!this.activeSheetId) {
            this.triggerElement = document.activeElement as HTMLElement;
        }

        // If another sheet is open, close it first (without restoring focus)
        if (this.activeSheetId && this.activeSheetId !== id) {
            this.releaseFocus();
            this.detachSwipeGesture();
            const previousId = this.activeSheetId;
            document.body.classList.remove(`sheet-${previousId}-open`);
            this.closeActiveSheet();
            eventBus.emit('sheetClosed', { id: previousId });
        }

        // ARIA: mark as dialog
        sheet.inert = false;
        sheet.removeAttribute('aria-hidden');
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('tabindex', '-1');

        // ARIA: labelledby — find a .sheet-title or first heading as fallback
        const title =
            sheet.querySelector('.sheet-title') ??
            sheet.querySelector('h1, h2, h3');
        if (title) {
            if (!title.id) {
                title.id = `sheet-title-${id}`;
            }
            sheet.setAttribute('aria-labelledby', title.id);
        }

        // Open the new sheet
        sheet.classList.add('is-open');
        sheet.classList.toggle('has-sheet-parent', this.history.length > 0);
        document.body.classList.add('sheet-open');
        document.body.classList.add(`sheet-${id}-open`);
        this.activeSheetId = id;

        // Show overlay
        const overlay = this.getOverlay();
        if (overlay) {
            overlay.classList.add('is-open');
        }

        // Accessibility: trap focus & enable Escape
        this.trapFocus(sheet);
        if (!this.escapeHandler) {
            this.attachEscapeHandler();
        }

        // Swipe-to-dismiss on drag handle
        this.attachSwipeGesture(sheet);

        // Emit event
        eventBus.emit('sheetOpened', { id });

        // Toujours afficher depuis le haut, sauf au retour vers un parent.
        // trapFocus() focus le premier élément focusable à +50ms → le navigateur
        // scroll automatiquement vers cet élément, annulant tout reset antérieur.
        // On contre-carre à +55ms pour garantir scroll=0 après le focus.
        setTimeout(() => {
            sheet.scrollTop = restored?.scrollTop ?? 0;
            if (restored?.focusedElement?.isConnected) {
                restored.focusedElement.focus({ preventScroll: true });
            }
        }, 55);
    }

    /**
     * Closes the currently open sheet.
     */
    public close(): void {
        if (this.activeSheetId) {
            const previousId = this.activeSheetId;
            document.body.classList.remove(`sheet-${this.activeSheetId}-open`);

            // Accessibility: release focus trap & escape handler
            this.releaseFocus();
            this.detachEscapeHandler();
            this.detachSwipeGesture();

            this.closeActiveSheet();
            document.body.classList.remove('sheet-open');

            // Hide overlay
            const overlay = this.getOverlay();
            if (overlay) {
                overlay.classList.remove('is-open');
            }

            // Emit event
            eventBus.emit('sheetClosed', { id: previousId });

            this.history = [];
            const trigger = this.triggerElement;
            this.triggerElement = null;
            if (trigger?.isConnected) trigger.focus();
        }
    }

    /**
     * Returns to the parent sheet when there is one, otherwise closes the flow.
     */
    public back(): void {
        const handler = this.activeSheetId
            ? this.backHandlers.get(this.activeSheetId)
            : undefined;
        if (handler?.()) return;

        const parent = this.history.pop();
        if (!parent) {
            this.close();
            return;
        }
        this.openSheet(parent.id, parent);
    }

    /**
     * Lets a sheet consume Back/Escape for an internal sub-page before the
     * manager returns to a parent sheet or closes the flow.
     */
    public registerBackHandler(id: string, handler: () => boolean): () => void {
        this.backHandlers.set(id, handler);
        return () => {
            if (this.backHandlers.get(id) === handler) {
                this.backHandlers.delete(id);
            }
        };
    }

    /**
     * Toggles a sheet open/closed.
     */
    public toggle(id: string): void {
        if (this.activeSheetId === id) {
            this.close();
        } else {
            this.open(id);
        }
    }

    /**
     * Returns the ID of the currently open sheet or null.
     */
    public getActiveSheetId(): string | null {
        return this.activeSheetId;
    }

    /**
     * Returns the root of the current sheet flow. This lets navigation keep
     * the owning destination highlighted while a child sheet is visible.
     */
    public getRootSheetId(): string | null {
        return this.history[0]?.id ?? this.activeSheetId;
    }

    public canGoBack(): boolean {
        return this.history.length > 0;
    }

    /**
     * Internal helper to close the active sheet without affecting the overlay.
     */
    private closeActiveSheet(): void {
        if (this.activeSheetId) {
            const sheet = document.getElementById(this.activeSheetId);
            if (sheet) {
                sheet.classList.remove('is-open');
                sheet.classList.remove('has-sheet-parent');
                sheet.inert = true;
                sheet.setAttribute('aria-hidden', 'true');
                // Clean up ARIA attributes
                sheet.removeAttribute('role');
                sheet.removeAttribute('aria-modal');
                sheet.removeAttribute('aria-labelledby');
                sheet.removeAttribute('tabindex');
            }
            this.activeSheetId = null;
        }
    }

    // ─── Swipe-to-Dismiss ────────────────────────────────────────

    private attachSwipeGesture(sheet: HTMLElement): void {
        // Detach any previous swipe listeners (redundant guard for re-open)
        this.detachSwipeGesture();

        const handle = sheet.querySelector<HTMLElement>('.sheet-drag-handle');
        if (!handle) return;

        let startY = 0;
        let startTime = 0;
        let isDragging = false;

        const onStart = (e: PointerEvent): void => {
            startY = e.clientY;
            startTime = Date.now();
            isDragging = true;
            handle.setPointerCapture(e.pointerId);
            sheet.style.transition = 'none';
        };

        const onMove = (e: PointerEvent): void => {
            if (!isDragging) return;
            const delta = e.clientY - startY;
            if (delta > 0) {
                sheet.style.transform = `translateY(${delta * 0.6}px)`;
            }
        };

        const onEnd = (e: PointerEvent): void => {
            if (!isDragging) return;
            isDragging = false;
            const delta = e.clientY - startY;
            const duration = Date.now() - startTime;
            const velocity = duration > 0 ? delta / duration : 0;

            sheet.style.transition = '';
            sheet.style.transform = '';

            if (delta > 60 || velocity > 0.3) {
                void haptic('medium');
                this.back();
            }
        };

        handle.addEventListener('pointerdown', onStart);
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onEnd);
        handle.addEventListener('pointercancel', onEnd);

        this.swipeHandle = handle;
        this.swipeCallbacks = [
            {
                type: 'pointerdown',
                fn: onStart as unknown as (e: Event) => void,
            },
            {
                type: 'pointermove',
                fn: onMove as unknown as (e: Event) => void,
            },
            { type: 'pointerup', fn: onEnd as unknown as (e: Event) => void },
            {
                type: 'pointercancel',
                fn: onEnd as unknown as (e: Event) => void,
            },
        ];
    }

    private detachSwipeGesture(): void {
        if (!this.swipeHandle || !this.swipeCallbacks) return;
        for (const { type, fn } of this.swipeCallbacks) {
            this.swipeHandle.removeEventListener(type, fn);
        }
        this.swipeHandle = null;
        this.swipeCallbacks = null;
    }

    // ─── Accessibility: Focus Trap ──────────────────────────────

    private trapFocus(sheet: HTMLElement): void {
        const FOCUSABLE =
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]';

        const getFocusable = (): HTMLElement[] =>
            [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
                (el) => !el.closest('[hidden]')
            );

        this.focusTrapHandler = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const elements = getFocusable();
            if (!elements.length) {
                e.preventDefault();
                return;
            }
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', this.focusTrapHandler);

        // Focus on first focusable element, or the sheet itself
        const firstFocusable = getFocusable()[0];
        setTimeout(() => (firstFocusable ?? sheet).focus(), 50);
    }

    private releaseFocus(): void {
        if (this.focusTrapHandler) {
            document.removeEventListener('keydown', this.focusTrapHandler);
            this.focusTrapHandler = null;
        }
    }

    // ─── Accessibility: Escape Key ──────────────────────────────

    private attachEscapeHandler(): void {
        this.escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.activeSheetId) {
                e.preventDefault();
                this.back();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);
    }

    private detachEscapeHandler(): void {
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }
    }
}

export const sheetManager = SheetManager.getInstance();
