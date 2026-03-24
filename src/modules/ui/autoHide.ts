import { sheetManager } from './core/SheetManager';

let hideTimer: ReturnType<typeof setTimeout> | null = null;

const hideUI = () => {
    if (sheetManager.getActiveSheetId() === null) {
        document.body.classList.add('ui-hidden');
    }
};

const resetTimer = () => {
    if (hideTimer) {
        clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(hideUI, 5000); // 5 seconds
};

export const initAutoHide = () => {
    // Initial setup: hide UI after 5 seconds if no interaction
    resetTimer();

    // Listen for user interactions to reset the timer
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('keydown', resetTimer);
};
