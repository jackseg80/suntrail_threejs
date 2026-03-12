import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initUI } from './ui';
import { state } from './state';

// Mock Capacitor Geolocation
vi.mock('@capacitor/geolocation', () => ({
    Geolocation: {
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
        getCurrentPosition: vi.fn()
    }
}));

// Mock other modules to avoid circular dependencies in tests
vi.mock('./scene', () => ({ initScene: vi.fn() }));
vi.mock('./performance', () => ({ 
    applyPreset: vi.fn(),
    detectBestPreset: vi.fn(() => 'balanced')
}));
vi.mock('./terrain', () => ({ 
    updateVisibleTiles: vi.fn(),
    resetTerrain: vi.fn(),
    lngLatToTile: vi.fn(() => ({ x: 0, y: 0, z: 13 }))
}));

describe('ui.ts', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input id="k1" />
            <button id="bgo"></button>
            <div id="panel"></div>
            <button id="settings-toggle"></button>
            <button id="close-panel"></button>
            <button id="layer-btn"></button>
            <div id="layer-menu" style="display: none;"></div>
            <div class="layer-item" data-source="swisstopo"></div>
            <button id="gps-btn"></button>
            <button id="gpx-btn"></button>
            <input id="gpx-upload" type="file" />
            <input id="trail-follow-toggle" type="checkbox" />
            <div id="toast-container"></div>
            <div id="res-disp"></div>
            <div id="range-disp"></div>
            <input id="res-slider" type="range" />
            <input id="range-slider" type="range" />
            <input id="shadow-toggle" type="checkbox" />
            <button class="preset-btn" data-preset="eco"></button>
            <button class="preset-btn" data-preset="balanced"></button>
        `;
        localStorage.clear();
    });

    it('should load MapTiler key from localStorage into the input', () => {
        localStorage.setItem('maptiler_key_3d', 'secret-key');
        initUI();
        const k1 = document.getElementById('k1') as HTMLInputElement;
        expect(k1.value).toBe('secret-key');
    });

    it('should open the settings panel when toggle is clicked', () => {
        initUI();
        const panel = document.getElementById('panel');
        const toggle = document.getElementById('settings-toggle');
        
        expect(panel?.classList.contains('open')).toBe(false);
        toggle?.click();
        expect(panel?.classList.contains('open')).toBe(true);
    });

    it('should toggle the layer menu', () => {
        initUI();
        const layerBtn = document.getElementById('layer-btn');
        const layerMenu = document.getElementById('layer-menu');
        
        expect(layerMenu?.style.display).toBe('none');
        layerBtn?.click();
        expect(layerMenu?.style.display).toBe('block');
    });
});
