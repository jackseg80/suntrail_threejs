import { eventBus } from '../../eventBus';
import { haptic } from '../../haptics';

/**
 * SheetManager
 * Singleton controller for managing bottom sheets.
 * Ensures exclusivity (only one sheet open at a time) and handles overlay visibility.
 */
class SheetManager {
    private static instance: SheetManager;
    private activeSheetId: string | null = null;
    private overlay: HTMLElement | null = null;

    // Accessibility: focus management
    private triggerElement: HTMLElement | null = null;
    private focusTrapHandler: ((e: KeyboardEvent) => void) | null = null;
    private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

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

        const sheet = document.getElementById(id);
        if (!sheet) {
            console.warn(`SheetManager: Sheet with id '${id}' not found.`);
            return;
        }

        // Store the trigger element for focus restoration
        this.triggerElement = document.activeElement as HTMLElement;

        // If another sheet is open, close it first (without restoring focus)
        if (this.activeSheetId && this.activeSheetId !== id) {
            this.releaseFocus();
            this.detachEscapeHandler();
            this.closeActiveSheet();
        }

        // ARIA: mark as dialog
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('tabindex', '-1');

        // ARIA: labelledby — find a .sheet-title or first heading as fallback
        const title = sheet.querySelector('.sheet-title') ?? sheet.querySelector('h1, h2, h3');
        if (title) {
            if (!title.id) {
                title.id = `sheet-title-${id}`;
            }
            sheet.setAttribute('aria-labelledby', title.id);
        }

        // Open the new sheet
        sheet.classList.add('is-open');
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

        // Toujours afficher depuis le haut.
        // trapFocus() focus le premier élément focusable à +50ms → le navigateur
        // scroll automatiquement vers cet élément, annulant tout reset antérieur.
        // On contre-carre à +55ms pour garantir scroll=0 après le focus.
        setTimeout(() => { sheet.scrollTop = 0; }, 55);
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

            this.closeActiveSheet();
            document.body.classList.remove('sheet-open');
            
            // Hide overlay
            const overlay = this.getOverlay();
            if (overlay) {
                overlay.classList.remove('is-open');
            }

            // Emit event
            eventBus.emit('sheetClosed', { id: previousId });
        }
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
     * Internal helper to close the active sheet without affecting the overlay.
     */
    private closeActiveSheet(): void {
        if (this.activeSheetId) {
            const sheet = document.getElementById(this.activeSheetId);
            if (sheet) {
                sheet.classList.remove('is-open');
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
                this.close();
            }
        };

        handle.addEventListener('pointerdown', onStart);
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onEnd);
        handle.addEventListener('pointercancel', onEnd);
    }

    // ─── Accessibility: Focus Trap ──────────────────────────────

    private trapFocus(sheet: HTMLElement): void {
        const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]';

        const getFocusable = (): HTMLElement[] =>
            [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.closest('[hidden]'));

        this.focusTrapHandler = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const elements = getFocusable();
            if (!elements.length) { e.preventDefault(); return; }
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
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
        this.triggerElement?.focus();
        this.triggerElement = null;
    }

    // ─── Accessibility: Escape Key ──────────────────────────────

    private attachEscapeHandler(): void {
        this.escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.activeSheetId) {
                e.preventDefault();
                this.close();
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
