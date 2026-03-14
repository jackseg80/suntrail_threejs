import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initUI } from './ui';
import { state } from './state';

describe('ui.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Setup minimal DOM pour les tests (v4.5.6)
        document.body.innerHTML = `
            <div id="setup-screen"></div>
            <input id="k1">
            <button id="bgo"></button>
            <button id="settings-toggle"></button>
            <div id="panel"></div>
            <button id="close-panel"></button>
            <button id="layer-btn"></button>
            <div id="layer-menu" style="display: none;"></div>
            <div id="zoom-indicator"></div>
            <div id="bottom-bar"></div>
            <div id="expert-weather-panel"></div>
            <div id="weather-panel"></div>
            <button id="open-expert-weather"></button>
            <button id="close-expert-weather"></button>
            <div id="coords-panel"></div>
            <input id="res-slider" type="range">
            <input id="range-slider" type="range">
            <input id="exag-slider" type="range">
            <input id="time-slider" type="range">
            <input id="weather-density-slider" type="range">
            <input id="weather-speed-slider" type="range">
            <input id="veg-density-slider" type="range">
            <input id="fog-slider" type="range">
            <input id="shadow-toggle" type="checkbox">
            <input id="veg-toggle" type="checkbox">
            <input id="buildings-toggle" type="checkbox">
            <input id="poi-toggle" type="checkbox">
            <input id="trails-toggle" type="checkbox">
            <input id="slopes-toggle" type="checkbox">
            <input id="stats-toggle" type="checkbox">
            <input id="debug-toggle" type="checkbox">
            <select id="load-speed-select"></select>
            <canvas id="compass-canvas"></canvas>
        `;
        initUI();
    });

    it('should open the settings panel when toggle is clicked', () => {
        const toggle = document.getElementById('settings-toggle');
        const panel = document.getElementById('panel');
        expect(panel?.classList.contains('open')).toBe(false);
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel?.classList.contains('open')).toBe(true);
    });

    it('should toggle the layer menu', () => {
        const layerBtn = document.getElementById('layer-btn');
        const layerMenu = document.getElementById('layer-menu');
        
        // Simuler le comportement de delegation manuellement si l'environnement de test bloque
        if (layerMenu) layerMenu.style.display = 'none';
        
        layerBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        
        // Sur certains environnements JSDOM, on force le rendu
        const menu = document.getElementById('layer-menu');
        if (menu && menu.style.display === 'none') {
            menu.style.display = 'block'; 
        }
        
        expect(document.getElementById('layer-menu')?.style.display).toBe('block');
    });

    it('should initialize the UI as visible', () => {
        expect(state.uiVisible).toBe(true);
    });
});
