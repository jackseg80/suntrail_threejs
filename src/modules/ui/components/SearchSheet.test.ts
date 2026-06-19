import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => ({
    mockState: {
        localPeaks: [],
        subscribe: vi.fn(() => vi.fn()),
    },
}));

vi.mock('../../state', () => ({
    state: mockState,
}));

vi.mock('../../terrain', () => ({
    autoSelectMapSource: vi.fn(),
    refreshTerrain: vi.fn(),
}));

vi.mock('../../geo', () => ({
    lngLatToTile: vi.fn(() => ({ zoom: 14, tx: 0, ty: 0 })),
    lngLatToWorld: vi.fn(() => ({ x: 0, z: 0 })),
}));

vi.mock('../../scene', () => ({
    flyTo: vi.fn(),
    forceImmediateLODUpdate: vi.fn(),
}));

vi.mock('../../weather', () => ({
    fetchWeather: vi.fn(),
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../core/SheetManager', () => ({
    sheetManager: {
        close: vi.fn(),
        getActiveSheetId: vi.fn(() => null),
    },
}));

vi.mock('../../geocodingService', () => ({
    searchLocations: vi.fn().mockResolvedValue([]),
    searchPeaksByName: vi.fn().mockResolvedValue([]),
    CLASSIFICATIONS: { peak: { type: 'peak', zoom: 14, camDist: 45000 } },
}));

vi.mock('../templates/search.html?raw', () => ({
    default: `
        <div class="search-sheet-root">
            <div id="search">
                <button id="close-search">Fermer</button>
                <div><input id="geo-input" type="text" /></div>
                <div id="geo-results"></div>
            </div>
        </div>`,
}));

import { SearchSheet } from './SearchSheet';
import { sheetManager } from '../core/SheetManager';
import { eventBus } from '../../eventBus';

describe('SearchSheet', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockState.localPeaks = [];
        container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('hydrates without crashing', () => {
        const sheet = new SearchSheet();
        expect(() => sheet.hydrate()).not.toThrow();
    });

    it('close button calls sheetManager.close', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const btn = document.getElementById('close-search')!;
        btn.click();
        expect(sheetManager.close).toHaveBeenCalled();
    });

    it('sets aria-label on input', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const input = document.getElementById('geo-input')!;
        expect(input.getAttribute('aria-label')).toBe('search.aria.input');
    });

    it('sets placeholder on input', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const input = document.getElementById('geo-input') as HTMLInputElement;
        expect(input.placeholder).toBe('search.placeholder');
    });

    it('sets role and aria on results container', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const results = document.getElementById('geo-results')!;
        expect(results.getAttribute('role')).toBe('listbox');
        expect(results.getAttribute('aria-live')).toBe('polite');
        expect(results.getAttribute('aria-label')).toBe('search.aria.results');
    });

    it('creates filter chips', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const chips = document.querySelectorAll('.search-chip');
        expect(chips.length).toBe(4);
    });

    it('first filter chip is active by default', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const chips = document.querySelectorAll('.search-chip');
        expect(chips[0].classList.contains('search-chip-active')).toBe(true);
        expect(chips[0].getAttribute('aria-checked')).toBe('true');
    });

    it('filter chip click sets active filter and updates aria', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const chips = document.querySelectorAll('.search-chip');
        const citiesChip = chips[1]; // cities
        citiesChip.click();
        expect(citiesChip.classList.contains('search-chip-active')).toBe(true);
        expect(citiesChip.getAttribute('aria-checked')).toBe('true');
        expect(chips[0].classList.contains('search-chip-active')).toBe(false);
    });

    it('creates empty states', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const initial = document.getElementById('search-initial-state');
        const noResults = document.getElementById('search-no-results');
        expect(initial).not.toBeNull();
        expect(noResults).not.toBeNull();
        expect(noResults!.style.display).toBe('none');
    });

    it('shows no results state correctly', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        sheet['showSearchEmptyState']('no-results');
        const initial = document.getElementById('search-initial-state');
        const noResults = document.getElementById('search-no-results');
        expect(initial!.style.display).toBe('none');
        expect(noResults!.style.display).toBe('flex');
    });

    it('hides both states with none', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        sheet['showSearchEmptyState']('none');
        const initial = document.getElementById('search-initial-state');
        const noResults = document.getElementById('search-no-results');
        expect(initial!.style.display).toBe('none');
        expect(noResults!.style.display).toBe('none');
    });

    it('matchesFilter returns true for all types with all filter', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        expect(sheet['matchesFilter']('city')).toBe(true);
        expect(sheet['matchesFilter']('peak')).toBe(true);
        expect(sheet['matchesFilter']('country')).toBe(true);
    });

    it('subscribes to localeChanged for placeholder update', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        expect(eventBus.on).toHaveBeenCalledWith(
            'localeChanged',
            expect.any(Function)
        );
    });

    it('disposes cleanly', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        expect(() => sheet.dispose()).not.toThrow();
    });

    it('matchesFilter respects mountain filter', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        sheet['activeFilter'] = 'mountains';
        expect(sheet['matchesFilter']('peak')).toBe(true);
        expect(sheet['matchesFilter']('city')).toBe(false);
        expect(sheet['matchesFilter']('country')).toBe(false);
    });

    it('matchesFilter respects cities filter', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        sheet['activeFilter'] = 'cities';
        expect(sheet['matchesFilter']('city')).toBe(true);
        expect(sheet['matchesFilter']('village')).toBe(true);
        expect(sheet['matchesFilter']('peak')).toBe(false);
        expect(sheet['matchesFilter']('country')).toBe(false);
    });

    it('matchesFilter respects countries filter', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        sheet['activeFilter'] = 'countries';
        expect(sheet['matchesFilter']('country')).toBe(true);
        expect(sheet['matchesFilter']('region')).toBe(true);
        expect(sheet['matchesFilter']('city')).toBe(false);
    });

    it('handleInput hides results for queries < 2 chars', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        const input = document.getElementById('geo-input') as HTMLInputElement;
        input.value = 'a';
        sheet['handleInput']();
        const results = document.getElementById('geo-results')!;
        expect(results.style.display).toBe('none');
    });

    it('handleInput debounces remote search', () => {
        vi.useFakeTimers();
        const sheet = new SearchSheet();
        sheet.hydrate();
        const input = document.getElementById('geo-input') as HTMLInputElement;
        input.value = 'Chamonix';
        sheet['handleInput']();
        vi.advanceTimersByTime(500);
        const results = document.getElementById('geo-results')!;
        expect(results).not.toBeNull();
        vi.useRealTimers();
    });

    it('subscribes to sheetClosed for reset', () => {
        const sheet = new SearchSheet();
        sheet.hydrate();
        expect(eventBus.on).toHaveBeenCalledWith(
            'sheetClosed',
            expect.any(Function)
        );
    });
});
