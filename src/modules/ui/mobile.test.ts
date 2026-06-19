import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/app', () => ({
    App: {
        addListener: vi
            .fn()
            .mockReturnValue({ catch: vi.fn() }),
        exitApp: vi.fn(),
    },
}));

vi.mock('./core/SheetManager', () => ({
    sheetManager: {
        getActiveSheetId: vi.fn(() => null),
        close: vi.fn(),
    },
}));

const { mockState } = vi.hoisted(() => ({
    mockState: {
        DEBUG_MODE: false,
        isRecording: false,
        currentCourseId: '',
    },
}));

vi.mock('../state', () => ({
    state: mockState,
}));

vi.mock('../location', () => ({
    startLocationTracking: vi.fn().mockResolvedValue(undefined),
    isWatchActive: vi.fn(() => true),
}));

vi.mock('../nativeGPSService', () => ({
    nativeGPSService: {
        syncPoints: vi.fn().mockResolvedValue(undefined),
    },
}));

import { App } from '@capacitor/app';
import { initMobileUI } from './mobile';
import { sheetManager } from './core/SheetManager';
import { startLocationTracking, isWatchActive } from '../location';
import { nativeGPSService } from '../nativeGPSService';

describe('initMobileUI()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.DEBUG_MODE = false;
        mockState.isRecording = false;
        mockState.currentCourseId = '';
    });

    it('registers backButton listener', () => {
        initMobileUI();
        expect(App.addListener).toHaveBeenCalledWith(
            'backButton',
            expect.any(Function)
        );
    });

    it('registers appUrlOpen listener', () => {
        initMobileUI();
        expect(App.addListener).toHaveBeenCalledWith(
            'appUrlOpen',
            expect.any(Function)
        );
    });

    it('registers appStateChange listener', () => {
        initMobileUI();
        expect(App.addListener).toHaveBeenCalledWith(
            'appStateChange',
            expect.any(Function)
        );
    });

    describe('backButton handler', () => {
        it('closes sheet when a sheet is active', () => {
            initMobileUI();
            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'backButton'
            )![1] as (data: any) => void;

            vi.mocked(sheetManager.getActiveSheetId).mockReturnValue(
                'some-sheet'
            );
            handler({ canGoBack: true });

            expect(sheetManager.close).toHaveBeenCalled();
        });

        it('exits app when no sheet and cannot go back', () => {
            initMobileUI();
            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'backButton'
            )![1] as (data: any) => void;

            vi.mocked(sheetManager.getActiveSheetId).mockReturnValue(null);
            handler({ canGoBack: false });

            expect(App.exitApp).toHaveBeenCalled();
        });

        it('goes back in history when no sheet and can go back', () => {
            const historyBack = vi.spyOn(window.history, 'back');
            initMobileUI();
            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'backButton'
            )![1] as (data: any) => void;

            vi.mocked(sheetManager.getActiveSheetId).mockReturnValue(null);
            handler({ canGoBack: true });

            expect(historyBack).toHaveBeenCalled();
            historyBack.mockRestore();
        });
    });

    describe('appStateChange handler', () => {
        it('remembers recording state when app goes to background', () => {
            mockState.isRecording = true;
            initMobileUI();
            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'appStateChange'
            )![1] as (data: any) => void;

            handler({ isActive: false });
            expect(mockState.isRecording).toBe(true);
        });

        it('syncs points on resume when was recording', async () => {
            mockState.isRecording = true;
            mockState.currentCourseId = 'course-1';
            initMobileUI();

            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'appStateChange'
            )![1] as (data: any) => void;

            // First: background
            handler({ isActive: false });
            // Then: resume
            await handler({ isActive: true });

            expect(nativeGPSService.syncPoints).toHaveBeenCalled();
        });

        it('restarts location tracking on resume if watch is inactive', async () => {
            mockState.isRecording = true;
            mockState.currentCourseId = 'course-1';
            vi.mocked(isWatchActive).mockReturnValue(false);
            initMobileUI();

            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'appStateChange'
            )![1] as (data: any) => void;

            handler({ isActive: false });
            await handler({ isActive: true });

            expect(startLocationTracking).toHaveBeenCalled();
        });

        it('does not restart tracking when watch is already active', async () => {
            mockState.isRecording = true;
            mockState.currentCourseId = 'course-1';
            vi.mocked(isWatchActive).mockReturnValue(true);
            initMobileUI();

            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'appStateChange'
            )![1] as (data: any) => void;

            handler({ isActive: false });
            await handler({ isActive: true });

            expect(startLocationTracking).not.toHaveBeenCalled();
        });

        it('ignores resume when not recording', async () => {
            mockState.isRecording = false;
            initMobileUI();

            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'appStateChange'
            )![1] as (data: any) => void;

            await handler({ isActive: true });
            expect(nativeGPSService.syncPoints).not.toHaveBeenCalled();
        });

        it('ignores resume when no course ID', async () => {
            mockState.isRecording = true;
            mockState.currentCourseId = '';
            initMobileUI();

            const handler = vi.mocked(App.addListener).mock.calls.find(
                (c) => c[0] === 'appStateChange'
            )![1] as (data: any) => void;

            handler({ isActive: false });
            await handler({ isActive: true });

            expect(nativeGPSService.syncPoints).not.toHaveBeenCalled();
        });
    });
});
