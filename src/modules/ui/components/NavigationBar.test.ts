import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => {
    const state: Record<string, any> = {
        IS_2D_MODE: false,
        ZOOM: 14,
        MAP_SOURCE: 'swisstopo',
        hasManualSource: false,
        subscribe: vi.fn(() => vi.fn()),
    };
    return { mockState: state };
});

vi.mock('../../state', () => ({
    state: mockState,
    saveSettings: vi.fn(),
}));

vi.mock('../core/SheetManager', () => ({
    sheetManager: {
        open: vi.fn(),
        close: vi.fn(),
        getActiveSheetId: vi.fn(() => null),
    },
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../../haptics', () => ({
    haptic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../toast', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../terrain', () => ({
    rebuildActiveTiles: vi.fn(),
    updateVisibleTiles: vi.fn(),
    refreshTracks: vi.fn(),
}));

vi.mock('../../scene', () => ({
    forceImmediateLODUpdate: vi.fn(),
}));

vi.mock('../../location', () => ({
    updateUserMarker: vi.fn(),
}));

vi.mock('../../analysis', () => ({
    getAltitudeAt: vi.fn(() => 1000),
    hasTerrainData: vi.fn(() => true),
}));

vi.mock('../templates/nav-bar.html?raw', () => ({
    default: `
        <nav id="nav-bar">
            <div class="nav-tab" data-tab="search"><span class="nav-label">Search</span></div>
            <div class="nav-tab" data-tab="layers"><span class="nav-label">Layers</span></div>
            <div class="nav-tab" data-tab="tracks"><span class="nav-label">Tracks</span></div>
        </nav>`,
}));

import { NavigationBar } from './NavigationBar';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';

describe('NavigationBar', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.IS_2D_MODE = false;
        mockState.ZOOM = 14;
        container = document.createElement('div');
        container.id = 'nav-bar';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hydrates without crashing', () => {
        const nav = new NavigationBar();
        expect(() => nav.hydrate()).not.toThrow();
    });

    it('sets role=tablist on the element', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        expect(nav.element?.getAttribute('role')).toBe('tablist');
    });

    it('sets ARIA attributes on tabs', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        const tabs = container.querySelectorAll('.nav-tab');
        tabs.forEach((tab) => {
            expect(tab.getAttribute('role')).toBe('tab');
            expect(tab.getAttribute('aria-selected')).toBe('false');
        });
    });

    it('opens sheet on tab click', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector('[data-tab="search"]') as HTMLElement;
        tab.click();
        expect(sheetManager.open).toHaveBeenCalledWith('search');
    });

    it('closes sheet when clicking active tab', () => {
        vi.mocked(sheetManager.getActiveSheetId).mockReturnValue('layers');
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector('[data-tab="layers"]') as HTMLElement;
        tab.click();
        expect(sheetManager.close).toHaveBeenCalled();
    });

    it('ignores tab without data-tab attribute', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector('.nav-tab') as HTMLElement;
        tab.removeAttribute('data-tab');
        tab.click();
        expect(sheetManager.open).not.toHaveBeenCalled();
    });

    it('registers sheetOpened and sheetClosed listeners', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        expect(eventBus.on).toHaveBeenCalledWith(
            'sheetOpened',
            expect.any(Function)
        );
        expect(eventBus.on).toHaveBeenCalledWith(
            'sheetClosed',
            expect.any(Function)
        );
    });

    it('subscribes to localeChanged for tab label updates', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        expect(eventBus.on).toHaveBeenCalledWith(
            'localeChanged',
            expect.any(Function)
        );
    });

    it('updates tab labels with i18n keys', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        const searchTab = container.querySelector(
            '[data-tab="search"]'
        ) as HTMLElement;
        expect(searchTab.getAttribute('aria-label')).toBe('nav.tab.search');
    });

    it('setActiveTab highlights the correct tab', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        nav['setActiveTab']('search');
        const searchTab = container.querySelector(
            '[data-tab="search"]'
        ) as HTMLElement;
        const layersTab = container.querySelector(
            '[data-tab="layers"]'
        ) as HTMLElement;
        expect(searchTab.classList.contains('active')).toBe(true);
        expect(searchTab.getAttribute('aria-selected')).toBe('true');
        expect(layersTab.getAttribute('aria-selected')).toBe('false');
    });

    it('setActiveTab with null deactivates all tabs', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        nav['setActiveTab']('search');
        nav['setActiveTab'](null);
        const searchTab = container.querySelector(
            '[data-tab="search"]'
        ) as HTMLElement;
        expect(searchTab.classList.contains('active')).toBe(false);
        expect(searchTab.getAttribute('aria-selected')).toBe('false');
    });

    it('disposes cleanly', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        expect(() => nav.dispose()).not.toThrow();
    });
});
