import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => {
    const state: Record<string, any> = {
        IS_2D_MODE: false,
        ZOOM: 14,
        isRoutePlanningMode: false,
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
    eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock('../../haptics', () => ({
    haptic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../toast', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../routeManager', () => ({
    setRoutePlanningMode: vi.fn((active: boolean) => {
        mockState.isRoutePlanningMode = active;
    }),
    toggleRoutePlanningMode: vi.fn(() => {
        mockState.isRoutePlanningMode = !mockState.isRoutePlanningMode;
    }),
    toggleRoutePlannerChrome: vi.fn(),
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
        <div class="nav-bar-content">
            <button class="nav-tab" data-tab="search" data-label-key="nav.tab.explore"><span class="nav-label">Explore</span></button>
            <button class="nav-tab" id="nav-plan-tab" data-tab="prepare"><span class="nav-label">Prepare</span></button>
            <button class="nav-tab" data-tab="track"><span class="nav-label">Outing</span></button>
            <button class="nav-tab" data-tab="library"><span class="nav-label">Library</span></button>
            <button class="nav-tab nav-tab-secondary" data-tab="settings" data-label-key="nav.tab.more"><span class="nav-label">More</span></button>
        </div>`,
}));

import { NavigationBar } from './NavigationBar';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';
import {
    setRoutePlanningMode,
    toggleRoutePlanningMode,
    toggleRoutePlannerChrome,
} from '../../routeManager';

describe('NavigationBar', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.IS_2D_MODE = false;
        mockState.ZOOM = 14;
        mockState.isRoutePlanningMode = false;
        mockState.gpxLayers = [];
        mockState.activeGPXLayerId = null;
        mockState.routeComputation = null;
        mockState.activePreparedRouteId = null;
        mockState.routeDraftSourceLayerId = null;
        delete document.body.dataset.trackDestination;
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
        expect(
            container.querySelector('.nav-bar-content')?.getAttribute('role')
        ).toBe('tablist');
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

    it('exposes four primary destinations as semantic buttons', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        const primary = container.querySelectorAll(
            '.nav-tab:not(.nav-tab-secondary)'
        );
        expect(primary).toHaveLength(4);
        primary.forEach((tab) => expect(tab.tagName).toBe('BUTTON'));
    });

    it('opens sheet on tab click', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector(
            '[data-tab="search"]'
        ) as HTMLElement;
        tab.click();
        expect(sheetManager.open).toHaveBeenCalledWith('search');
    });

    it('closes sheet when clicking active tab', () => {
        vi.mocked(sheetManager.getActiveSheetId).mockReturnValue('track');
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector(
            '[data-tab="track"]'
        ) as HTMLElement;
        tab.click();
        expect(sheetManager.close).toHaveBeenCalled();
    });

    it('toggles the explicit planning mode without opening a sheet', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector(
            '[data-tab="prepare"]'
        ) as HTMLButtonElement;
        tab.click();
        expect(toggleRoutePlanningMode).toHaveBeenCalledOnce();
        expect(sheetManager.open).not.toHaveBeenCalled();
        expect(tab.getAttribute('aria-selected')).toBe('true');
    });

    it('masque les commandes au second clic sans quitter Préparer', () => {
        mockState.isRoutePlanningMode = true;
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector(
            '[data-tab="prepare"]'
        ) as HTMLButtonElement;

        tab.click();

        expect(toggleRoutePlannerChrome).toHaveBeenCalledOnce();
        expect(toggleRoutePlanningMode).not.toHaveBeenCalled();
        expect(tab.getAttribute('aria-selected')).toBe('true');
    });

    it('does not replace the route draft when an imported GPX is only selected', () => {
        const layer = { id: 'gpx-1', isManualRoute: false };
        mockState.gpxLayers = [layer];
        mockState.activeGPXLayerId = layer.id;
        mockState.routeDraftDirty = true;
        mockState.routeDraftName = 'Brouillon manuel';
        const nav = new NavigationBar();
        nav.hydrate();

        (
            container.querySelector('[data-tab="prepare"]') as HTMLButtonElement
        ).click();

        expect(toggleRoutePlanningMode).toHaveBeenCalledOnce();
        expect(mockState.routeDraftName).toBe('Brouillon manuel');
        expect(mockState.routeDraftDirty).toBe(true);
    });

    it('keeps the library destination on the legacy track sheet adapter', async () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="track"><span class="sheet-title"></span><p id="track-library-scope" hidden></p><div id="gpx-layers-list"></div></div>'
        );
        const nav = new NavigationBar();
        nav.hydrate();
        const tab = container.querySelector(
            '[data-tab="library"]'
        ) as HTMLButtonElement;
        tab.click();
        expect(setRoutePlanningMode).toHaveBeenCalledWith(false);
        expect(sheetManager.open).toHaveBeenCalledWith('track');
        expect(document.body.dataset.trackDestination).toBe('library');
        await vi.waitFor(() => {
            expect(
                (document.getElementById('track-library-scope') as HTMLElement)
                    .hidden
            ).toBe(false);
        });
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
        expect(searchTab.getAttribute('aria-label')).toBe('nav.tab.explore');
    });

    it('setActiveTab highlights the correct tab', () => {
        const nav = new NavigationBar();
        nav.hydrate();
        nav['setActiveTab']('search');
        const searchTab = container.querySelector(
            '[data-tab="search"]'
        ) as HTMLElement;
        const trackTab = container.querySelector(
            '[data-tab="track"]'
        ) as HTMLElement;
        expect(searchTab.classList.contains('active')).toBe(true);
        expect(searchTab.getAttribute('aria-selected')).toBe('true');
        expect(trackTab.getAttribute('aria-selected')).toBe('false');
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
