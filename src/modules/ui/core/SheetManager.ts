/**
 * SheetManager
 * Singleton controller for managing bottom sheets.
 * Ensures exclusivity (only one sheet open at a time) and handles overlay visibility.
 */
class SheetManager {
    private static instance: SheetManager;
    private activeSheetId: string | null = null;
    private overlay: HTMLElement | null = null;

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
        const sheet = document.getElementById(id);
        if (!sheet) {
            console.warn(`SheetManager: Sheet with id '${id}' not found.`);
            return;
        }

        // If another sheet is open, close it first
        if (this.activeSheetId && this.activeSheetId !== id) {
            this.closeActiveSheet();
        }

        // Open the new sheet
        sheet.classList.add('is-open');
        this.activeSheetId = id;

        // Show overlay
        const overlay = this.getOverlay();
        if (overlay) {
            overlay.classList.add('is-open');
        }
    }

    /**
     * Closes the currently open sheet.
     */
    public close(): void {
        if (this.activeSheetId) {
            this.closeActiveSheet();
            
            // Hide overlay
            const overlay = this.getOverlay();
            if (overlay) {
                overlay.classList.remove('is-open');
            }
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
            }
            this.activeSheetId = null;
        }
    }
}

export const sheetManager = SheetManager.getInstance();
