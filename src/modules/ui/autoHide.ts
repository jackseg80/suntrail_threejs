import { sheetManager } from './core/SheetManager';

let hideTimer: ReturnType<typeof setTimeout> | null = null;

const hideUI = () => {
    if (sheetManager.getActiveSheetId() === null) {
        document.body.classList.add('ui-hidden');
    }
};

const resetTimer = () => {
    document.body.classList.remove('ui-hidden');
    if (hideTimer) {
        clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(hideUI, 10000); // 10 secondes (délai étendu pour TalkBack)
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
