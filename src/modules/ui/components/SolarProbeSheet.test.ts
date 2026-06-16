import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k },
}));
vi.mock('../../state', () => ({
    state: {
        simDate: new Date(),
        controls: { target: { y: 0 } },
        hasLastClicked: false,
    },
    isProActive: vi.fn(() => false),
}));
vi.mock('../../analysis', () => ({ runSolarProbe: vi.fn() }));
vi.mock('../../toast', () => ({ showToast: vi.fn() }));
vi.mock('../../iap', () => ({ showUpgradePrompt: vi.fn() }));
vi.mock('../../utils', () => ({ fmtTime: vi.fn(), fmtDuration: vi.fn() }));
vi.mock('../../expertService', () => ({
    expertService: { generateSolarReport: vi.fn() },
}));
vi.mock('../../geocodingService', () => ({
    getPlaceName: vi.fn().mockResolvedValue('Lieu'),
}));
vi.mock('../../solarRoute', () => ({
    getCurrentRouteSolarAnalysis: vi.fn(() => null),
    getOptimalDepartureData: vi.fn(() => null),
    getSolarRouteMode: vi.fn(() => 'snapshot'),
    setSolarRouteMode: vi.fn(),
    setAvgSpeedKmh: vi.fn(),
    getAvgSpeedKmh: vi.fn(() => 4),
    findStrongExposureSegments: vi.fn(() => []),
}));
vi.mock('../core/SheetManager', () => ({
    sheetManager: { close: vi.fn() },
}));
vi.mock('../tooltip', () => ({
    createTooltip: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock('../icons', () => ({ ICON_LOCK: '🔒' }));
vi.mock('./solarprobe/SolarTimeline', () => ({
    buildTimeline: vi.fn(),
}));
vi.mock('./solarprobe/SolarLockedItem', () => ({
    makeLockedItem: vi.fn(),
}));

import { SolarProbeSheet } from './SolarProbeSheet';

describe('SolarProbeSheet', () => {
    it('constructs without throwing', () => {
        const sheet = new SolarProbeSheet();
        expect(sheet).toBeDefined();
        sheet.dispose();
    });
});
