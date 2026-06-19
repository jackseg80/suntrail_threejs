import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState } = vi.hoisted(() => {
    const state: Record<string, any> = {
        MAP_SOURCE: 'swisstopo',
        hasManualSource: false,
        SHOW_TRAILS: true,
        SHOW_SLOPES: false,
        ZOOM: 14,
        isPro: false,
        trialEnd: null,
        subscribe: vi.fn(() => vi.fn()),
    };
    return { mockState: state };
});

vi.mock('../../state', () => ({
    state: mockState,
    saveSettings: vi.fn(),
}));

vi.mock('../../terrain', () => ({
    updateSlopeVisibility: vi.fn(),
    refreshTerrain: vi.fn(),
}));

vi.mock('../core/SheetManager', () => ({
    sheetManager: { close: vi.fn() },
}));

vi.mock('../../../i18n/I18nService', () => ({
    i18n: { t: (k: string) => k, applyToDOM: vi.fn() },
}));

vi.mock('../../iap', () => ({
    showUpgradePrompt: vi.fn(),
    isProActive: vi.fn(() => mockState.isPro),
}));

vi.mock('../../haptics', () => ({
    haptic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../templates/layers.html?raw', () => ({
    default: `
        <div>
            <button id="close-layers">Fermer</button>
            <div class="layer-item active" data-source="swisstopo"><span>SwissTopo</span></div>
            <div class="layer-item" data-source="satellite">
                <span>Satellite</span>
                <span class="layer-pro-badge">PRO</span>
            </div>
            <div class="layer-item" data-source="opentopomap"><span>OpenTopoMap</span></div>
            <div id="row-trails">
                <input type="checkbox" id="layers-trails-toggle" checked />
                <div class="lod-warning" style="display:none"></div>
                <div class="info-icon" style="display:none"></div>
            </div>
            <div id="row-slopes">
                <input type="checkbox" id="layers-slopes-toggle" />
                <div class="lod-warning" style="display:none"></div>
                <div class="info-icon" style="display:none"></div>
            </div>
        </div>`,
}));

import { LayersSheet } from './LayersSheet';
import { sheetManager } from '../core/SheetManager';
import { showUpgradePrompt } from '../../iap';

describe('LayersSheet', () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.MAP_SOURCE = 'swisstopo';
        mockState.hasManualSource = false;
        mockState.isPro = false;
        mockState.SHOW_TRAILS = true;
        mockState.SHOW_SLOPES = false;
        mockState.ZOOM = 14;
        container = document.createElement('div');
        container.id = 'sheet-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hydrates without crashing', () => {
        const sheet = new LayersSheet();
        expect(() => sheet.hydrate()).not.toThrow();
    });

    it('close button calls sheetManager.close', () => {
        const sheet = new LayersSheet();
        sheet.hydrate();
        const btn = document.getElementById('close-layers')!;
        btn.click();
        expect(sheetManager.close).toHaveBeenCalled();
    });

    it('clicking a layer item changes MAP_SOURCE', () => {
        const sheet = new LayersSheet();
        sheet.hydrate();
        const item = document.querySelector(
            '[data-source="opentopomap"]'
        ) as HTMLElement;
        item.click();
        expect(mockState.MAP_SOURCE).toBe('opentopomap');
        expect(mockState.hasManualSource).toBe(true);
    });

    it('clicking swisstopo sets hasManualSource to false', () => {
        mockState.MAP_SOURCE = 'opentopomap';
        const sheet = new LayersSheet();
        sheet.hydrate();
        const item = document.querySelector(
            '[data-source="swisstopo"]'
        ) as HTMLElement;
        item.click();
        expect(mockState.MAP_SOURCE).toBe('swisstopo');
        expect(mockState.hasManualSource).toBe(false);
    });

    it('shows Pro upgrade prompt when clicking satellite without Pro', () => {
        mockState.isPro = false;
        const sheet = new LayersSheet();
        sheet.hydrate();
        const item = document.querySelector(
            '[data-source="satellite"]'
        ) as HTMLElement;
        item.click();
        expect(showUpgradePrompt).toHaveBeenCalledWith('satellite');
        expect(mockState.MAP_SOURCE).toBe('swisstopo');
    });

    it('allows satellite when user is Pro', () => {
        mockState.isPro = true;
        const sheet = new LayersSheet();
        sheet.hydrate();
        const item = document.querySelector(
            '[data-source="satellite"]'
        ) as HTMLElement;
        item.click();
        expect(showUpgradePrompt).not.toHaveBeenCalled();
        expect(mockState.MAP_SOURCE).toBe('satellite');
    });

    it('hides PRO badge when user is Pro', () => {
        mockState.isPro = true;
        const sheet = new LayersSheet();
        sheet.hydrate();
        const badge = document.querySelector('.layer-pro-badge') as HTMLElement;
        expect(badge.classList.contains('hidden')).toBe(true);
    });

    it('trails toggle syncs SHOW_TRAILS state', () => {
        const sheet = new LayersSheet();
        sheet.hydrate();
        const toggle = document.getElementById(
            'layers-trails-toggle'
        ) as HTMLInputElement;
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        expect(mockState.SHOW_TRAILS).toBe(false);
    });

    it('slopes toggle syncs SHOW_SLOPES state', () => {
        const sheet = new LayersSheet();
        sheet.hydrate();
        const toggle = document.getElementById(
            'layers-slopes-toggle'
        ) as HTMLInputElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect(mockState.SHOW_SLOPES).toBe(true);
    });

    it('highlights active layer on hydrate', () => {
        mockState.MAP_SOURCE = 'opentopomap';
        const sheet = new LayersSheet();
        sheet.hydrate();
        const active = document.querySelector('.layer-item.active') as HTMLElement;
        expect(active).not.toBeNull();
        expect(active.dataset.source).toBe('opentopomap');
    });

    it('sets aria-selected on active layer', () => {
        const sheet = new LayersSheet();
        sheet.hydrate();
        const active = document.querySelector(
            '[data-source="swisstopo"]'
        ) as HTMLElement;
        expect(active.getAttribute('aria-selected')).toBe('true');
    });

    it('disables trails/slopes when ZOOM < 11', () => {
        mockState.ZOOM = 10;
        const sheet = new LayersSheet();
        sheet.hydrate();
        const trailsToggle = document.getElementById(
            'layers-trails-toggle'
        ) as HTMLInputElement;
        const slopesToggle = document.getElementById(
            'layers-slopes-toggle'
        ) as HTMLInputElement;
        expect(trailsToggle.disabled).toBe(true);
        expect(slopesToggle.disabled).toBe(true);
    });

    it('enables trails/slopes when ZOOM >= 11', () => {
        mockState.ZOOM = 12;
        const sheet = new LayersSheet();
        sheet.hydrate();
        const trailsToggle = document.getElementById(
            'layers-trails-toggle'
        ) as HTMLInputElement;
        expect(trailsToggle.disabled).toBe(false);
    });

    it('disposes cleanly', () => {
        const sheet = new LayersSheet();
        sheet.hydrate();
        expect(() => sheet.dispose()).not.toThrow();
    });
});
