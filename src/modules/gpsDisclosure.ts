/**
 * gpsDisclosure.ts — Modale "Prominent Disclosure" GPS (v5.11)
 *
 * Exigée par Google Play Store avant toute demande de permission de localisation.
 * S'affiche une seule fois (flag localStorage). Retourne une Promise<boolean> :
 *   true  → utilisateur accepte → l'appelant peut demander la permission GPS
 *   false → utilisateur refuse  → continuer sans GPS
 *
 * @see https://support.google.com/googleplay/android-developer/answer/9799150
 */

import { i18n } from '../i18n/I18nService';

const STORAGE_KEY = 'suntrail_gps_disclosure_v1';

/**
 * Vérifie si la modale a déjà été affichée (quel que soit le choix de l'utilisateur).
 * Dans ce cas, l'appelant peut directement tenter la permission GPS sans afficher de modale.
 */
export function hasShownGPSDisclosure(): boolean {
    return localStorage.getItem(STORAGE_KEY) === '1';
}

/**
 * Affiche la modale de disclosure si pas encore vue, puis résout à true (accepté)
 * ou false (refusé). Si déjà vue, résout immédiatement à true.
 */
export function requestGPSDisclosure(): Promise<boolean> {
    if (hasShownGPSDisclosure()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
        _show(resolve);
    });
}

// ── Rendu de la modale ──────────────────────────────────────────────────────────
function _show(resolve: (v: boolean) => void): void {
    const overlay = document.createElement('div');
    overlay.id = 'gps-disclosure-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gps-disclosure-title');
    overlay.setAttribute('aria-describedby', 'gps-disclosure-body');

    // Textes traduits
    const title  = i18n.t('gps.disclosure.title');
    const body   = i18n.t('gps.disclosure.body');
    const allow  = i18n.t('gps.disclosure.allow');
    const decline = i18n.t('gps.disclosure.decline');

    // Les \n du body deviennent des <br>
    const bodyHtml = body.split('\n').map(l => l ? `<p>${l}</p>` : '').join('');

    overlay.innerHTML = `
        <div class="gps-disc-card" role="document">
            <div class="gps-disc-icon">📍</div>
            <h2 class="gps-disc-title" id="gps-disclosure-title">${title}</h2>
            <div class="gps-disc-body" id="gps-disclosure-body">${bodyHtml}</div>
            <div class="gps-disc-actions">
                <button class="gps-disc-btn gps-disc-allow" id="gps-disc-allow-btn">${allow}</button>
                <button class="gps-disc-btn gps-disc-decline" id="gps-disc-decline-btn">${decline}</button>
            </div>
        </div>
    `;

    // ── Styles inline minimaux (pour éviter les conflits avec le CSS global) ──
    Object.assign(overlay.style, {
        position:        'fixed',
        inset:           '0',
        background:      'var(--overlay-bg)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          '9999',
        padding:         '16px',
    });

    document.body.appendChild(overlay);

    // Focus sur le bouton "Autoriser" à l'ouverture
    requestAnimationFrame(() => {
        (overlay.querySelector('#gps-disc-allow-btn') as HTMLElement)?.focus();
    });

    // ── Trap focus (Tab / Shift+Tab) ──────────────────────────────────────────
    const focusable = () => Array.from(
        overlay.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')
    );

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { _close(overlay, onKeyDown); resolve(false); return; }
        if (e.key !== 'Tab') return;
        const els = focusable();
        if (els.length === 0) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { last.focus(); e.preventDefault(); }
        } else {
            if (document.activeElement === last) { first.focus(); e.preventDefault(); }
        }
    };

    overlay.addEventListener('keydown', onKeyDown);

    // ── Handlers boutons ──────────────────────────────────────────────────────
    overlay.querySelector('#gps-disc-allow-btn')?.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEY, '1');
        _close(overlay, onKeyDown);
        resolve(true);
    });

    overlay.querySelector('#gps-disc-decline-btn')?.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEY, '1');
        _close(overlay, onKeyDown);
        resolve(false);
    });
}

function _close(overlay: HTMLElement, onKeyDown: (e: KeyboardEvent) => void): void {
    overlay.removeEventListener('keydown', onKeyDown);
    overlay.remove();
}
