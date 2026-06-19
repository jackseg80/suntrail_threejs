import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => ({
    mockState: {
        simDate: new Date(),
        controls: { target: { y: 0 } },
        hasLastClicked: false,
        subscribe: vi.fn(() => vi.fn()),
    },
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));
vi.mock('../../state', () => ({
    state: mockState,
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
    sheetManager: { open: vi.fn(), close: vi.fn() },
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
vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../templates/solar-probe.html?raw', () => ({
    default: `
        <div id="solar-probe" class="bottom-sheet">
            <div class="sheet-close" id="close-probe"></div>
            <div id="probe-content">
                <div id="probe-terrain-warn"></div>
                <div id="solar-location-title"></div>
                <div id="probe-free-upsell"></div>
                <div id="probe-stats-grid"></div>
                <div id="probe-realtime-section">
                    <div id="probe-position-coords"></div>
                </div>
                <div id="probe-calendar-section"></div>
                <div id="probe-route-solar-section"></div>
            </div>
        </div>`,
}));

import { SolarProbeSheet } from './SolarProbeSheet';
import { sheetManager } from '../core/SheetManager';

describe('SolarProbeSheet', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('constructs without throwing', () => {
        const sheet = new SolarProbeSheet();
        expect(sheet).toBeDefined();
        sheet.dispose();
    });

    it('hydrates without crashing', () => {
        const sheet = new SolarProbeSheet();
        expect(() => sheet.hydrate()).not.toThrow();
    });

    it('close button calls sheetManager.close', () => {
        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        const btn = document.getElementById('close-probe')!;
        btn.click();
        expect(sheetManager.close).toHaveBeenCalled();
    });

    it('sets aria-label on close button', () => {
        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        const btn = document.getElementById('close-probe')!;
        expect(btn.getAttribute('aria-label')).toBe('solar.aria.close');
    });

    it('sets aria-live on probe content', () => {
        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        const content = document.getElementById('probe-content')!;
        expect(content.getAttribute('aria-live')).toBe('polite');
    });

    it('subscribes to simDate for real-time updates', () => {
        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        expect(mockState.subscribe).toHaveBeenCalledWith(
            'simDate',
            expect.any(Function)
        );
    });

    it('content section elements exist after hydrate', () => {
        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        expect(document.getElementById('probe-terrain-warn')).not.toBeNull();
        expect(document.getElementById('solar-location-title')).not.toBeNull();
        expect(document.getElementById('probe-stats-grid')).not.toBeNull();
        expect(
            document.getElementById('probe-realtime-section')
        ).not.toBeNull();
    });

    it('disposes cleanly', () => {
        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        expect(() => sheet.dispose()).not.toThrow();
    });
});
