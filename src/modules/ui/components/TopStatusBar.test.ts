import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCountryCode } = vi.hoisted(() => ({
    mockGetCountryCode: vi.fn((_lat: number, _lon: number) => 'CH'),
}));

vi.mock('../../geo', () => ({
    getCountryCode: mockGetCountryCode,
}));

vi.mock('../../eventBus', () => ({
    eventBus: {
        on: vi.fn(),
        off: vi.fn(),
    },
}));

vi.mock('../../haptics', () => ({
    haptic: vi.fn(),
}));

vi.mock('../core/SheetManager', () => ({
    sheetManager: {
        toggle: vi.fn(),
    },
}));

vi.mock('../tooltip', () => ({
    createTooltip: vi.fn(() => ({ dispose: vi.fn() })),
}));

import { state } from '../../state';
import { TopStatusBar } from './TopStatusBar';

describe('TopStatusBar — LOD label (country mapping)', () => {
    let bar: TopStatusBar;

    beforeEach(() => {
        vi.clearAllMocks();

        document.body.innerHTML = `
            <template id="template-top-status-bar">
                <div class="top-status-bar-content">
                    <div class="top-left-widgets">
                        <div class="top-widget" id="top-pill-main" role="button" tabindex="0">
                            <span class="lod-badge">SWISS · LVL --</span>
                            <span class="weather-icon">☀️</span>
                            <span class="weather-temp">--°C</span>
                        </div>
                    </div>
                    <div class="top-right-widgets">
                        <div class="status-widget rec-indicator" style="display:none">
                            <span class="rec-dot-css"></span>
                            <span class="rec-timer">REC</span>
                        </div>
                        <div class="icon-btn-sm" id="net-status-icon"></div>
                        <div class="icon-btn-sm danger" id="sos-main-btn"></div>
                        <div class="status-widget" id="timeline-toggle-btn"></div>
                    </div>
                </div>
            </template>
            <div id="top-status-bar"></div>
        `;

        state.MAP_SOURCE = 'swisstopo';
        state.ZOOM = 14;
        state.TARGET_LAT = 46.8;
        state.TARGET_LON = 8.2;
    });

    function createAndRender() {
        bar = new TopStatusBar();
        bar.hydrate();
        bar.render();
    }

    it('shows SWISS when getCountryCode returns CH', () => {
        mockGetCountryCode.mockReturnValue('CH');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('SWISS');
    });

    it('shows IGN FR when getCountryCode returns FR', () => {
        mockGetCountryCode.mockReturnValue('FR');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('IGN FR');
    });

    it('shows ITALY when getCountryCode returns IT', () => {
        mockGetCountryCode.mockReturnValue('IT');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('ITALY');
    });

    it('shows GERMANY when getCountryCode returns DE', () => {
        mockGetCountryCode.mockReturnValue('DE');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('GERMANY');
    });

    it('shows AUSTRIA when getCountryCode returns AT', () => {
        mockGetCountryCode.mockReturnValue('AT');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('AUSTRIA');
    });

    it('shows SPAIN when getCountryCode returns ES', () => {
        mockGetCountryCode.mockReturnValue('ES');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('SPAIN');
    });

    it('shows KARTVERK when getCountryCode returns NO', () => {
        mockGetCountryCode.mockReturnValue('NO');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('KARTVERK');
    });

    it('shows WORLD when getCountryCode returns unknown country', () => {
        mockGetCountryCode.mockReturnValue('XX');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('WORLD');
    });

    it('shows SAT when MAP_SOURCE is satellite', () => {
        state.MAP_SOURCE = 'satellite';
        mockGetCountryCode.mockReturnValue('CH');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('SAT');
    });

    it('shows OPENTOPO when MAP_SOURCE is opentopomap', () => {
        state.MAP_SOURCE = 'opentopomap';
        mockGetCountryCode.mockReturnValue('CH');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('OPENTOPO');
    });

    it('shows zoom level in badge', () => {
        state.ZOOM = 14.7;
        mockGetCountryCode.mockReturnValue('CH');
        createAndRender();
        const badge = document.querySelector('.lod-badge');
        expect(badge?.textContent).toContain('LVL 14');
    });
});

describe('TopStatusBar — REC indicator (v5.57.2)', () => {
    let bar: TopStatusBar;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <template id="template-top-status-bar">
                <div class="top-status-bar-content">
                    <div class="top-left-widgets">
                        <div class="top-widget" id="top-pill-main">
                            <span class="lod-badge">SWISS · LVL --</span>
                        </div>
                    </div>
                    <div class="top-right-widgets">
                        <div class="status-widget rec-indicator" style="display:none">
                            <span class="rec-dot-css"></span>
                            <span class="rec-timer">REC</span>
                        </div>
                        <div class="icon-btn-sm" id="net-status-icon"></div>
                        <div class="icon-btn-sm danger" id="sos-main-btn"></div>
                        <div class="status-widget" id="timeline-toggle-btn"></div>
                    </div>
                </div>
            </template>
            <div id="top-status-bar"></div>
        `;
        bar = new TopStatusBar();
        bar.hydrate();
        bar.render();
    });

    it('affiche le REC indicator quand isRecording devient true', async () => {
        const widget = document.querySelector('.rec-indicator') as HTMLElement;
        expect(widget.style.display).toBe('none');
        state.isRecording = true;
        await Promise.resolve();
        expect(widget.style.display).toBe('flex');
    });

    it('cache le REC indicator quand isRecording devient false', async () => {
        const widget = document.querySelector('.rec-indicator') as HTMLElement;
        state.isRecording = true;
        await Promise.resolve();
        expect(widget.style.display).toBe('flex');
        state.isRecording = false;
        await Promise.resolve();
        expect(widget.style.display).toBe('none');
    });

    it("affiche le timer pendant l'enregistrement", async () => {
        const timer = document.querySelector('.rec-timer') as HTMLElement;
        state.isRecording = true;
        await Promise.resolve();
        expect(timer.textContent).not.toBe('REC');
        expect(timer.textContent).toMatch(/\d+:\d+/);
    });

    it('le toggle de repli est visible et bascule la classe collapsed sur #top-status-bar (v5.58)', () => {
        const toggle = document.querySelector(
            '.top-collapse-toggle'
        ) as HTMLElement;
        const topBar = document.getElementById('top-status-bar');
        expect(toggle).not.toBeNull();
        expect(topBar?.classList.contains('collapsed')).toBe(false);

        topBar?.classList.toggle('collapsed');
        expect(topBar?.classList.contains('collapsed')).toBe(true);

        topBar?.classList.toggle('collapsed');
        expect(topBar?.classList.contains('collapsed')).toBe(false);
    });
});
