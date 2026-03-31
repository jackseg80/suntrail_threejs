/**
 * a11y.test.ts — Audit accessibilité automatisé via axe-core (v5.11)
 *
 * Ces tests vérifient les violations WCAG 2.1 AA les plus critiques sur
 * les composants principaux de SunTrail. Ils complètent (mais ne remplacent pas)
 * un audit TalkBack manuel sur appareil physique.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import axe from 'axe-core';

// ── Helpers ──────────────────────────────────────────────────────────────────────
function createContainer(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
}

async function runAxe(container: HTMLElement) {
    const results = await axe.run(container, {
        runOnly: ['wcag2a', 'wcag2aa', 'best-practice'],
    });
    return results.violations;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────
describe('a11y — GPS Disclosure Modal', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createContainer(`
            <div role="dialog" aria-modal="true" aria-labelledby="disc-title" aria-describedby="disc-body">
                <h2 id="disc-title">Accès à votre localisation</h2>
                <div id="disc-body">
                    <p>SunTrail utilise votre position GPS pour centrer la carte.</p>
                </div>
                <div>
                    <button id="allow-btn">Autoriser la localisation</button>
                    <button id="decline-btn">Continuer sans GPS</button>
                </div>
            </div>
        `);
    });

    it('ne doit avoir aucune violation WCAG 2.1 AA', async () => {
        const violations = await runAxe(container);
        expect(violations, violations.map(v => `${v.id}: ${v.description}`).join('\n')).toHaveLength(0);
    });

    it('les boutons ont un texte accessible', () => {
        const allowBtn  = container.querySelector<HTMLButtonElement>('#allow-btn');
        const declineBtn = container.querySelector<HTMLButtonElement>('#decline-btn');
        expect(allowBtn?.textContent?.trim()).toBeTruthy();
        expect(declineBtn?.textContent?.trim()).toBeTruthy();
    });

    it('le dialog a un titre référencé par aria-labelledby', () => {
        const dialog = container.querySelector('[role="dialog"]');
        const labelId = dialog?.getAttribute('aria-labelledby');
        const title = container.querySelector(`#${labelId}`);
        expect(title).not.toBeNull();
        expect(title?.textContent?.trim()).toBeTruthy();
    });
});

describe('a11y — Navigation Bar', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createContainer(`
            <nav id="nav-bar" role="tablist" aria-label="Navigation principale">
                <button role="tab" aria-selected="true"  aria-label="Carte"     style="min-height:48px;min-width:48px;">🗺️</button>
                <button role="tab" aria-selected="false" aria-label="Explorer"  style="min-height:48px;min-width:48px;">🏔️</button>
                <button role="tab" aria-selected="false" aria-label="Randonnée" style="min-height:48px;min-width:48px;">🏃</button>
                <button role="tab" aria-selected="false" aria-label="Réglages"  style="min-height:48px;min-width:48px;">⚙️</button>
            </nav>
        `);
    });

    it('ne doit avoir aucune violation WCAG 2.1 AA', async () => {
        const violations = await runAxe(container);
        expect(violations, violations.map(v => `${v.id}: ${v.description}`).join('\n')).toHaveLength(0);
    });

    it('chaque tab a un aria-label', () => {
        const tabs = container.querySelectorAll('[role="tab"]');
        tabs.forEach(tab => {
            expect(tab.getAttribute('aria-label')).toBeTruthy();
        });
    });
});

describe('a11y — Bottom Sheet générique', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createContainer(`
            <div role="dialog" aria-modal="true" aria-labelledby="sheet-title">
                <div class="sheet-drag-handle" role="presentation" aria-hidden="true"></div>
                <h3 id="sheet-title">Paramètres</h3>
                <div>
                    <label for="toggle-shadows">
                        <input type="checkbox" id="toggle-shadows" role="switch" aria-checked="false">
                        Ombres
                    </label>
                </div>
                <button aria-label="Fermer">×</button>
            </div>
        `);
    });

    it('ne doit avoir aucune violation WCAG 2.1 AA', async () => {
        const violations = await runAxe(container);
        expect(violations, violations.map(v => `${v.id}: ${v.description}`).join('\n')).toHaveLength(0);
    });
});

describe('a11y — Onboarding Dialog', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createContainer(`
            <div id="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="ob-title">
                <div class="ob-card">
                    <div class="ob-body">
                        <div class="ob-icon">🏔️</div>
                        <h2 class="ob-title" id="ob-title">Naviguez sur la carte</h2>
                        <p class="ob-desc">1 doigt pour déplacer</p>
                    </div>
                    <button class="ob-skip">Passer</button>
                    <button class="ob-next">Suivant →</button>
                </div>
            </div>
        `);
    });

    it('ne doit avoir aucune violation WCAG 2.1 AA', async () => {
        const violations = await runAxe(container);
        expect(violations, violations.map(v => `${v.id}: ${v.description}`).join('\n')).toHaveLength(0);
    });

    it('le dialog a aria-labelledby pointant vers le titre', () => {
        const dialog = container.querySelector('[role="dialog"]');
        const labelId = dialog?.getAttribute('aria-labelledby');
        expect(labelId).toBe('ob-title');
        const title = container.querySelector(`#${labelId}`);
        expect(title).not.toBeNull();
        expect(title?.textContent?.trim()).toBeTruthy();
    });
});

describe('a11y — Settings Form Controls', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createContainer(`
            <div role="dialog" aria-modal="true" aria-labelledby="settings-title">
                <h3 id="settings-title">Réglages</h3>
                <div>
                    <input type="checkbox" id="energy-saver-toggle" aria-label="Économie d'énergie" role="switch" aria-checked="false">
                    <input type="checkbox" id="veg-toggle" aria-label="Forêts & Végétation" role="switch" aria-checked="true">
                    <input type="checkbox" id="weather-toggle" aria-label="Météo" role="switch" aria-checked="true">
                    <input type="checkbox" id="hydro-toggle" aria-label="Lacs & Rivières" role="switch" aria-checked="true">
                    <input type="checkbox" id="buildings-toggle" aria-label="Bâtiments OSM" role="switch" aria-checked="true">
                    <input type="checkbox" id="poi-toggle" aria-label="Signalisation 3D" role="switch" aria-checked="true">
                    <input type="range" id="veg-density-slider" aria-label="Densité végétation" min="0" max="15000" value="4000">
                    <input type="range" id="weather-density-slider" aria-label="Intensité météo" min="0" max="15000" value="2500">
                    <select id="lang-select" aria-label="Langue">
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                    </select>
                </div>
                <button aria-label="Fermer">×</button>
            </div>
        `);
    });

    it('ne doit avoir aucune violation WCAG 2.1 AA', async () => {
        const violations = await runAxe(container);
        expect(violations, violations.map(v => `${v.id}: ${v.description}`).join('\n')).toHaveLength(0);
    });

    it('tous les toggles ont un aria-label', () => {
        const toggles = container.querySelectorAll('input[type="checkbox"]');
        toggles.forEach(toggle => {
            expect(toggle.getAttribute('aria-label'), `toggle ${toggle.id} manque aria-label`).toBeTruthy();
        });
    });

    it('tous les sliders ont un aria-label', () => {
        const sliders = container.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => {
            expect(slider.getAttribute('aria-label'), `slider ${slider.id} manque aria-label`).toBeTruthy();
        });
    });

    it('le select langue a un aria-label', () => {
        const select = container.querySelector('#lang-select');
        expect(select?.getAttribute('aria-label')).toBeTruthy();
    });
});

describe('a11y — Bouton FAB GPS', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createContainer(`
            <button id="gps-main-btn" aria-label="Localiser ma position" style="min-height:48px;min-width:48px;">
                📍
            </button>
        `);
    });

    it('a un aria-label et une taille cible ≥ 48px', async () => {
        const violations = await runAxe(container);
        expect(violations, violations.map(v => `${v.id}: ${v.description}`).join('\n')).toHaveLength(0);
    });
});
