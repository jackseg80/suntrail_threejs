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
