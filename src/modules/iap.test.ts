import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockState, mockSaveProStatus } = vi.hoisted(() => ({
    mockState: {
        isPro: false,
        SHOW_BUILDINGS: false,
        SHOW_INCLINOMETER: false,
        SHOW_WEATHER_PRO: false,
    },
    mockSaveProStatus: vi.fn(),
}));

vi.mock('./state', () => ({
    state: mockState,
    saveProStatus: mockSaveProStatus,
    isProActive: vi.fn(() => mockState.isPro),
}));

vi.mock('./toast', () => ({
    showToast: vi.fn(),
}));

vi.mock('./ui/core/SheetManager', () => ({
    sheetManager: {
        open: vi.fn(),
    },
}));

import { showUpgradePrompt, grantProAccess, revokeProAccess } from './iap';
import { showToast } from './toast';
import { sheetManager } from './ui/core/SheetManager';

describe('showUpgradePrompt()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows a toast with the feature label', () => {
        showUpgradePrompt('lod_18');
        expect(showToast).toHaveBeenCalledWith(
            '🔒 LOD 18 (détail max) — fonctionnalité Pro'
        );
    });

    it('shows a toast with the raw feature name if unknown', () => {
        showUpgradePrompt('unknown_feature');
        expect(showToast).toHaveBeenCalledWith(
            '🔒 unknown_feature — fonctionnalité Pro'
        );
    });

    it('opens the upgrade sheet', () => {
        showUpgradePrompt('export_gpx');
        expect(sheetManager.open).toHaveBeenCalledWith('upgrade-sheet');
    });

    it('handles all known feature keys', () => {
        const keys = [
            'lod_18',
            'satellite',
            'multi_gpx',
            'export_gpx',
            'rec_unlimited',
            'offline_multi',
            'solar_calendar',
            'rec_stats',
            'weather_extended',
            'weather_pro',
            'inclinometer',
        ];
        for (const key of keys) {
            showUpgradePrompt(key);
            const callArgs = vi
                .mocked(showToast)
                .mock.calls.at(-1)?.[0] as string;
            expect(callArgs).not.toContain(key);
        }
    });
});

describe('grantProAccess()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.isPro = false;
        mockState.SHOW_BUILDINGS = false;
        mockState.SHOW_INCLINOMETER = false;
        mockState.SHOW_WEATHER_PRO = false;
    });

    it('sets isPro to true', () => {
        grantProAccess();
        expect(mockState.isPro).toBe(true);
    });

    it('enables Pro features', () => {
        grantProAccess();
        expect(mockState.SHOW_BUILDINGS).toBe(true);
        expect(mockState.SHOW_INCLINOMETER).toBe(true);
        expect(mockState.SHOW_WEATHER_PRO).toBe(true);
    });

    it('persists Pro status', () => {
        grantProAccess();
        expect(mockSaveProStatus).toHaveBeenCalled();
    });

    it('shows a success toast', () => {
        grantProAccess();
        expect(showToast).toHaveBeenCalledWith('✅ Accès Pro activé !');
    });

    it('is idempotent when called twice', () => {
        grantProAccess();
        const firstCallCount = mockSaveProStatus.mock.calls.length;
        grantProAccess();
        expect(mockSaveProStatus.mock.calls.length).toBe(firstCallCount);
    });
});

describe('revokeProAccess()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.isPro = true;
        mockState.SHOW_BUILDINGS = true;
        mockState.SHOW_INCLINOMETER = true;
        mockState.SHOW_WEATHER_PRO = true;
    });

    it('sets isPro to false', () => {
        revokeProAccess();
        expect(mockState.isPro).toBe(false);
    });

    it('disables Pro features', () => {
        revokeProAccess();
        expect(mockState.SHOW_BUILDINGS).toBe(false);
        expect(mockState.SHOW_INCLINOMETER).toBe(false);
        expect(mockState.SHOW_WEATHER_PRO).toBe(false);
    });

    it('persists Pro status', () => {
        revokeProAccess();
        expect(mockSaveProStatus).toHaveBeenCalled();
    });

    it('shows a revocation toast', () => {
        revokeProAccess();
        expect(showToast).toHaveBeenCalledWith('⚠️ Accès Pro révoqué');
    });
});
