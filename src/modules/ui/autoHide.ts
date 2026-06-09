import { sheetManager } from './core/SheetManager';
import { state } from '../state';

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let _isInitialized = false;

const hideUI = () => {
    if (sheetManager.getActiveSheetId() !== null) return;
    if (state.hasLastClicked) return;
    document.body.classList.add('ui-hidden');
};

const resetTimer = () => {
    document.body.classList.remove('ui-hidden');
    if (hideTimer) {
        clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(hideUI, 10000); // 10 secondes (délai étendu pour TalkBack)
};

export const resetAutoHideTimer = resetTimer;

export const initAutoHide = () => {
    // Idempotence: only initialize once
    if (_isInitialized) return;
    _isInitialized = true;

    // Initial setup: hide UI after 5 seconds if no interaction
    resetTimer();

    // Listen for user interactions to reset the timer
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('keydown', resetTimer);
};

export const cleanupAutoHide = () => {
    _isInitialized = false;
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    window.removeEventListener('mousedown', resetTimer);
    window.removeEventListener('mousemove', resetTimer);
    window.removeEventListener('touchstart', resetTimer);
    window.removeEventListener('keydown', resetTimer);
};
