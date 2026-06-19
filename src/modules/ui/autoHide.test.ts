import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => ({
    mockState: {
        hasLastClicked: false,
    },
}));

vi.mock('../state', () => ({
    state: mockState,
}));

vi.mock('./core/SheetManager', () => ({
    sheetManager: {
        getActiveSheetId: vi.fn(() => null),
    },
}));

import { initAutoHide, resetAutoHideTimer, cleanupAutoHide } from './autoHide';
import { sheetManager } from './core/SheetManager';

describe('autoHide', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockState.hasLastClicked = false;
        vi.mocked(sheetManager.getActiveSheetId).mockReturnValue(null);
        document.body.classList.remove('ui-hidden');
    });

    afterEach(() => {
        cleanupAutoHide();
        vi.useRealTimers();
    });

    describe('initAutoHide()', () => {
        it('adds the ui-hidden class after 10 seconds of inactivity', () => {
            initAutoHide();
            expect(document.body.classList.contains('ui-hidden')).toBe(false);
            vi.advanceTimersByTime(10000);
            expect(document.body.classList.contains('ui-hidden')).toBe(true);
        });

        it('does not add ui-hidden when a sheet is open', () => {
            vi.mocked(sheetManager.getActiveSheetId).mockReturnValue('some-sheet');
            initAutoHide();
            vi.advanceTimersByTime(10000);
            expect(document.body.classList.contains('ui-hidden')).toBe(false);
        });

        it('does not add ui-hidden when hasLastClicked is true', () => {
            mockState.hasLastClicked = true;
            initAutoHide();
            vi.advanceTimersByTime(10000);
            expect(document.body.classList.contains('ui-hidden')).toBe(false);
        });

        it('is idempotent (calling twice does not break)', () => {
            initAutoHide();
            initAutoHide();
            vi.advanceTimersByTime(10000);
            expect(document.body.classList.contains('ui-hidden')).toBe(true);
        });
    });

    describe('resetAutoHideTimer()', () => {
        it('removes ui-hidden class', () => {
            document.body.classList.add('ui-hidden');
            resetAutoHideTimer();
            expect(document.body.classList.contains('ui-hidden')).toBe(false);
        });

        it('resets the timer (no ui-hidden before 10s)', () => {
            initAutoHide();
            vi.advanceTimersByTime(5000);
            resetAutoHideTimer();
            vi.advanceTimersByTime(5000);
            expect(document.body.classList.contains('ui-hidden')).toBe(false);
            vi.advanceTimersByTime(5000);
            expect(document.body.classList.contains('ui-hidden')).toBe(true);
        });

        it('works even before initAutoHide is called', () => {
            expect(() => resetAutoHideTimer()).not.toThrow();
            document.body.classList.add('ui-hidden');
            resetAutoHideTimer();
            expect(document.body.classList.contains('ui-hidden')).toBe(false);
        });
    });

    describe('cleanupAutoHide()', () => {
        it('clears the timer so ui-hidden is never added', () => {
            initAutoHide();
            cleanupAutoHide();
            vi.advanceTimersByTime(20000);
            expect(document.body.classList.contains('ui-hidden')).toBe(false);
        });

        it('allows re-initialization after cleanup', () => {
            initAutoHide();
            cleanupAutoHide();
            initAutoHide();
            vi.advanceTimersByTime(10000);
            expect(document.body.classList.contains('ui-hidden')).toBe(true);
        });
    });
});
