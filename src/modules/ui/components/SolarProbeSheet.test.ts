import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => ({
    mockState: {
        simDate: new Date(),
        controls: { target: { y: 0 } },
        hasLastClicked: false,
        lastClickedCoords: { x: 0, z: 0, alt: 0 },
        subscribe: vi.fn(() => vi.fn()),
        SHOW_SOLAR_ON_TRACE: false,
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
    expertService: {
        generateSolarReport: vi.fn(),
        getMoonEmoji: vi.fn(() => '🌙'),
    },
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
    isOptimalComputing: vi.fn(() => false),
    setSolarOnTrace: vi.fn(),
}));
vi.mock('../core/SheetManager', () => ({
    sheetManager: { open: vi.fn(), close: vi.fn() },
}));
vi.mock('../tooltip', () => ({
    createTooltip: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock('../icons', () => ({
    ICON_ALERT_TRIANGLE: '<svg data-icon="alert"></svg>',
    ICON_COPY: '<svg data-icon="copy"></svg>',
    ICON_INFO: '<svg data-icon="info"></svg>',
    ICON_LOCK: '<svg data-icon="lock"></svg>',
}));
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
import { eventBus } from '../../eventBus';

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

    it('hides the profile while its solar subview is open, then restores it', () => {
        const profile = document.createElement('div');
        profile.id = 'elevation-profile';
        profile.classList.add('is-open');
        document.body.appendChild(profile);
        const sheet = new SolarProbeSheet();
        sheet.hydrate();

        window.dispatchEvent(new CustomEvent('openSolarProbeSheet'));

        expect(sheetManager.open).toHaveBeenCalledWith('solar-probe');
        expect(profile.classList.contains('is-suspended')).toBe(true);
        expect(profile.getAttribute('aria-hidden')).toBe('true');
        expect(document.body.classList).toContain(
            'route-solar-profile-context'
        );
        expect(
            document.getElementById('close-probe')?.getAttribute('aria-label')
        ).toBe('profile.backFromAnalysis');

        const closedHandler = vi
            .mocked(eventBus.on)
            .mock.calls.find(([event]) => event === 'sheetClosed')?.[1] as
            ((payload: { id: string | null }) => void) | undefined;
        closedHandler?.({ id: 'solar-probe' });

        expect(profile.classList.contains('is-suspended')).toBe(false);
        expect(profile.hasAttribute('aria-hidden')).toBe(false);
        expect(document.body.classList).not.toContain(
            'route-solar-profile-context'
        );
        sheet.dispose();
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

    it('renders the actionable free analysis and its upgrade action', async () => {
        const { runSolarProbe } = await import('../../analysis');
        const { showUpgradePrompt } = await import('../../iap');
        mockState.hasLastClicked = true;
        mockState.lastClickedCoords = { x: 1, z: 2, alt: 3 };
        vi.mocked(runSolarProbe).mockReturnValue(makeResult());

        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        document.body.insertAdjacentHTML(
            'beforeend',
            '<button id="probe-btn"></button>'
        );
        (sheet as any).render();
        document.getElementById('probe-btn')!.click();

        expect(runSolarProbe).toHaveBeenCalledWith(1, 2, 3);
        expect(document.querySelector('.exp-probe-status')).not.toBeNull();
        const upgrade = document.querySelector(
            '.solar-upsell-btn'
        ) as HTMLButtonElement;
        upgrade.click();
        expect(showUpgradePrompt).toHaveBeenCalledWith('solar_full');
        sheet.dispose();
    });

    it('renders the detailed Pro analysis including chart and copy report', async () => {
        const { isProActive } = await import('../../state');
        const { expertService } = await import('../../expertService');
        const { showToast } = await import('../../toast');
        vi.mocked(isProActive).mockReturnValue(true);
        vi.mocked(expertService.generateSolarReport).mockReturnValue('rapport');
        const writeText = vi
            .spyOn(navigator.clipboard, 'writeText')
            .mockResolvedValue(undefined);

        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        (sheet as any).updateUI(makeResult());

        expect(
            document.querySelector('svg.solar-elevation-chart-v2')
        ).not.toBeNull();
        const copy = document.querySelector(
            '.solar-copy-button'
        ) as HTMLButtonElement;
        expect(copy.querySelector('[data-icon="copy"]')).not.toBeNull();
        copy.click();
        expect(writeText).toHaveBeenCalledWith('rapport');
        expect(showToast).toHaveBeenCalledWith('solar.toast.copied');
        sheet.dispose();
    });

    it('keeps astronomical data available when terrain relief is missing', async () => {
        const { isProActive } = await import('../../state');
        const { buildTimeline } = await import('./solarprobe/SolarTimeline');
        vi.mocked(isProActive).mockReturnValue(true);

        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        (sheet as any).updateUI(makeResult({ terrainAvailable: false }));

        expect(document.querySelector('.solar-alert--info')).not.toBeNull();
        expect(document.body.textContent).toContain('solar.stat.sunrise');
        expect(document.body.textContent).toContain('solar.stat.sunset');
        expect(
            document.querySelector('svg.solar-elevation-chart-v2')
        ).not.toBeNull();
        expect(buildTimeline).not.toHaveBeenCalled();
        expect(document.querySelector('.solar-copy-button')).not.toBeNull();
        sheet.dispose();
    });

    it('affiche la section parcours avec un bandeau info quand le relief manque', async () => {
        const { getCurrentRouteSolarAnalysis } =
            await import('../../solarRoute');
        vi.mocked(getCurrentRouteSolarAnalysis).mockReturnValue({
            mode: 'hikerTimeline',
            totalKm: 5,
            terrainAvailable: false,
            terrainCoverage: 0.5,
            sunExposedKm: 2,
            shadowKm: 1,
            forestKm: 0,
            nightKm: 1,
            sunPct: 40,
            nightPct: 20,
            shadowSegments: [],
            points: [
                {
                    distKm: 0,
                    evalDate: new Date('2025-06-01T12:00:00'),
                    worldPos: { x: 0, y: 0, z: 0 },
                    inShadow: false,
                    isNight: false,
                    inForest: false,
                    terrainKnown: true,
                },
                {
                    distKm: 5,
                    evalDate: new Date('2025-06-01T13:00:00'),
                    worldPos: { x: 500, y: 0, z: 0 },
                    inShadow: false,
                    isNight: false,
                    inForest: false,
                    terrainKnown: false,
                },
            ],
        } as any);

        const sheet = new SolarProbeSheet();
        sheet.hydrate();
        const container = document.createElement('div');
        (sheet as any).buildRouteSolarSection(container);

        // Non bloquant : les stats sont rendues et le message est informatif
        expect(container.querySelector('.solar-route-grid')).not.toBeNull();
        expect(container.querySelector('.solar-alert--info')).not.toBeNull();
        expect(container.querySelector('.solar-alert--danger')).toBeNull();
        // L'interrupteur de coloration de la trace est présent
        expect(
            container.querySelector('.solar-route-trace-toggle')
        ).not.toBeNull();

        vi.mocked(getCurrentRouteSolarAnalysis).mockReturnValue(null);
        sheet.dispose();
    });
});

function makeResult(overrides: Record<string, unknown> = {}) {
    const time = new Date('2025-06-01T12:00:00');
    return {
        terrainAvailable: true,
        gps: { lat: 46.5, lon: 7.5 },
        totalSunlightMinutes: 360,
        firstSunTime: time,
        dayDurationMinutes: 720,
        goldenHourMorningStart: time,
        goldenHourMorningEnd: time,
        goldenHourEveningStart: time,
        goldenHourEveningEnd: time,
        moonPhaseName: 'Pleine lune',
        moonPhase: 0.5,
        maxElevationDeg: 55,
        elevationCurve: Array.from({ length: 144 }, (_, i) => i / 3),
        timeline: Array.from({ length: 48 }, (_, i) => ({
            isNight: false,
            inShadow: i % 4 === 0,
        })),
        sunrise: time,
        sunset: time,
        solarNoon: time,
        ...overrides,
    } as any;
}
