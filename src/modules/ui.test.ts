import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state';

describe('ui.ts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Setup DOM minimal pour les tests
        document.body.innerHTML = `
            <div id="setup-screen"></div>
            <input id="k1">
            <button id="bgo"></button>
            <button id="settings-toggle"></button>
            <div id="top-status-bar"></div>
            <nav id="nav-bar"></nav>
            <div id="sheet-overlay"></div>
            <div id="sheet-container"></div>
            <template id="template-settings"><div id="panel"></div></template>
            <template id="template-search"><div id="top-search-container"></div></template>
            <template id="template-nav-bar"><div class="nav-bar-content"></div></template>
            <template id="template-top-status-bar"><div class="top-status-bar-content"></div></template>
        `;
    });

    it('should initialize the UI state', () => {
        expect(state.uiVisible).toBe(true);
    });
});
