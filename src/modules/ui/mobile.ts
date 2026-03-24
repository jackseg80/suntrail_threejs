import { App } from '@capacitor/app';
import { sheetManager } from './core/SheetManager';

/**
 * Initializes mobile-specific UI logic, such as back button handling.
 * This is primarily for Android/Capacitor environments.
 */
export function initMobileUI(): void {
    App.addListener('backButton', (data) => {
        const activeSheetId = sheetManager.getActiveSheetId();
        
        if (activeSheetId) {
            sheetManager.close();
        } else if (!data.canGoBack) {
            App.exitApp();
        } else {
            window.history.back();
        }
    }).catch(() => {});
}
