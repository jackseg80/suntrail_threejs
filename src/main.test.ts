import { describe, it, expect, vi } from 'vitest';

vi.mock('./modules/ui', () => ({
    initUI: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./modules/performance', () => ({
    initBatteryManager: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./modules/networkMonitor', () => ({
    initNetworkMonitor: vi.fn().mockReturnValue(undefined),
}));
vi.mock('./modules/tileLoader', () => ({
    initEmbeddedOverview: vi.fn().mockReturnValue(undefined),
}));
vi.mock('virtual:pwa-register', () => ({
    registerSW: vi.fn(),
}));
vi.mock('./modules/nativeGPSService', () => ({
    nativeGPSService: { init: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('./modules/guidance/GuidanceForegroundService', () => ({
    guidanceForegroundService: {
        recoverNativeSession: vi.fn().mockResolvedValue(undefined),
    },
}));
vi.mock('./modules/toast', () => ({ showToast: vi.fn() }));
vi.mock('./modules/state', () => ({
    state: { isRecording: false, recordedPoints: [], recoveredPoints: [] },
}));
vi.mock('./modules/eventBus', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('./modules/ui/core/SheetManager', () => ({
    sheetManager: { open: vi.fn() },
}));
vi.mock('./modules/ui/components/UpsellModal', () => ({
    UpsellModal: { tryShow: vi.fn() },
}));
vi.mock('./style.css', () => ({}));

describe('main.ts', () => {
    it('imports without crashing', async () => {
        localStorage.clear();
        const mod = await import('./main');
        expect(mod).toBeDefined();
    });

    it('handles version check', async () => {
        localStorage.setItem('suntrail_app_version', 'old-version');
        const mod = await import('./main');
        expect(mod).toBeDefined();
    });
});
