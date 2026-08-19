/**
 * acceptanceWall.ts — Disclaimer de sécurité alpine (v5.11)
 *
 * Affiché au PREMIER lancement et après chaque mise à jour majeure (changement de clé).
 * L'utilisateur doit accepter explicitement avant de pouvoir utiliser l'app.
 * Exigé par Play Store pour les apps de navigation (positionnement "Loisir/Planification").
 *
 * Storage key versionnée : incrémenter ACCEPTANCE_VERSION à chaque mise à jour
 * des CGU ou des avertissements de sécurité pour forcer un re-affichage.
 */

import { i18n } from '../i18n/I18nService';
import { STORAGE_KEYS } from '../constants/storage';

const STORAGE_KEY = STORAGE_KEYS.ACCEPTANCE_V1;

export function hasAccepted(): boolean {
    return localStorage.getItem(STORAGE_KEY) === '1';
}

/**
 * Affiche le disclaimer si pas encore accepté pour cette version.
 * Retourne une Promise qui se résout quand l'utilisateur clique "J'accepte".
 */
export function requestAcceptance(): Promise<void> {
    if (hasAccepted()) return Promise.resolve();
    return new Promise<void>((resolve) => {
        _show(resolve);
    });
}

function _show(resolve: () => void): void {
    const overlay = document.createElement('div');
    overlay.id = 'acceptance-wall-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'acceptance-title');
    overlay.setAttribute('aria-describedby', 'acceptance-body');

    overlay.innerHTML = `
        <style>
            #acceptance-wall-overlay {
                position: fixed;
                inset: 0;
                background: var(--overlay-bg);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9998;
                padding: 16px;
                padding-bottom: calc(16px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
            }
            .aw-card {
                background: var(--surface-solid, #1a1d2e);
                border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-radius: var(--radius-xl, 24px);
                padding: 28px 20px 24px;
                max-width: 400px;
                width: 100%;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                animation: aw-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                overflow: hidden;
            }
            @keyframes aw-pop {
                from { opacity: 0; transform: scale(0.92) translateY(24px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .aw-scroll-area {
                overflow-y: auto;
                flex: 1;
                margin-bottom: 16px;
                padding-right: 4px;
            }
            .aw-scroll-area::-webkit-scrollbar { width: 4px; }
            .aw-scroll-area::-webkit-scrollbar-track { background: transparent; }
            .aw-scroll-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

            .aw-hero-svg {
                display: block;
                margin: 0 auto 14px;
                width: 56px;
                height: 56px;
            }
            .aw-title {
                font-size: 1.1rem;
                font-weight: 700;
                color: var(--text, #fff);
                text-align: center;
                margin: 0 0 20px;
                line-height: 1.3;
            }
            .aw-items {
                list-style: none;
                padding: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .aw-item {
                display: flex;
                gap: 12px;
                align-items: flex-start;
            }
            .aw-item-icon {
                flex-shrink: 0;
                width: 34px;
                height: 34px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                background: var(--surface-subtle);
                margin-top: 2px;
            }
            .aw-item-icon svg {
                width: 18px;
                height: 18px;
            }
            .aw-item-text {
                font-size: 0.82rem;
                color: var(--text-2);
                line-height: 1.45;
            }
            .aw-item-text strong {
                color: var(--text);
                font-weight: 600;
                display: block;
                margin-bottom: 2px;
                font-size: 0.85rem;
            }
            .aw-footer {
                border-top: 1px solid var(--border);
                padding-top: 16px;
                background: var(--surface-solid);
            }
            .aw-legal {
                font-size: 0.72rem;
                color: var(--text-3);
                text-align: center;
                margin: 0 0 16px;
                line-height: 1.5;
            }
            .aw-accept-btn {
                width: 100%;
                padding: 14px;
                background: var(--accent);
                color: #fff;
                border: none;
                border-radius: var(--radius-lg);
                font-size: 0.95rem;
                font-weight: 700;
                cursor: pointer;
                transition: opacity 0.2s, transform 0.15s;
                min-height: 48px;
            }
            .aw-accept-btn:active { opacity: 0.85; transform: scale(0.98); }
        </style>

        <div class="aw-card" role="document">
            <svg class="aw-hero-svg" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="28" cy="28" r="24" fill="var(--surface-subtle)" stroke="var(--accent)" stroke-width="1.5"/>
                <path d="M16 44 L28 24 L40 44" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <path d="M22 34 L34 34" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="26" cy="30" r="2" fill="var(--gold)"/>
                <line x1="26" y1="28" x2="26" y2="25" stroke="var(--gold)" stroke-width="1"/>
            </svg>
            <h2 class="aw-title" id="acceptance-title">
                ${i18n.t('acceptance.title')}
            </h2>

            <div class="aw-scroll-area">
                <ul class="aw-items" id="acceptance-body">
                    <li class="aw-item">
                        <span class="aw-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16.2 16.2l-2.6-2.6M7.8 7.8l2.6 2.6M14.1 9.9l-4.2 4.2M9.9 9.9l4.2 4.2"/><circle cx="12" cy="12" r="1.5"/></svg></span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item1.title')}</strong>
                            ${i18n.t('acceptance.item1.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="12" y1="14" x2="12" y2="17"/><path d="M8 8.5L10 7M16 8.5L14 7"/></svg></span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item2.title')}</strong>
                            ${i18n.t('acceptance.item2.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4" y1="12" x2="2" y2="12"/><line x1="22" y1="12" x2="20" y2="12"/><line x1="6.3" y1="6.3" x2="4.9" y2="4.9"/><line x1="19.1" y1="17.7" x2="17.7" y2="19.1"/></svg></span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item3.title')}</strong>
                            ${i18n.t('acceptance.item3.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.3L1.8 18.2a1.5 1.5 0 0 0 1.3 2.3h17.8a1.5 1.5 0 0 0 1.3-2.3L13.7 3.3a1.5 1.5 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg></span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item4.title')}</strong>
                            ${i18n.t('acceptance.item4.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="18" height="13" rx="3"/><line x1="6" y1="7" x2="6" y2="4"/><line x1="10" y1="7" x2="10" y2="4"/><line x1="14" y1="7" x2="14" y2="4"/><line x1="18" y1="7" x2="18" y2="4"/><rect x="6" y="11" width="4" height="5" rx="0.5"/><rect x="14" y="11" width="4" height="5" rx="0.5"/></svg></span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item5.title')}</strong>
                            ${i18n.t('acceptance.item5.desc')}
                        </div>
                    </li>
                </ul>
            </div>

            <div class="aw-footer">
                <p class="aw-legal">
                    ${i18n.t('acceptance.legal')}
                </p>
                <button class="aw-accept-btn" id="aw-accept-btn">
                    ${i18n.t('acceptance.btn')}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Focus sur le bouton à l'ouverture
    requestAnimationFrame(() => {
        (overlay.querySelector('#aw-accept-btn') as HTMLElement)?.focus();
    });

    // Trap focus — seul le bouton est focusable
    const onKeyDown = (e: KeyboardEvent) => {
        // Pas d'Escape — l'utilisateur doit accepter
        if (e.key === 'Tab') e.preventDefault(); // Reste sur le bouton
    };
    overlay.addEventListener('keydown', onKeyDown);

    overlay.querySelector('#aw-accept-btn')?.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEY, '1');
        overlay.removeEventListener('keydown', onKeyDown);
        // Fade out
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 320);
        resolve();
    });
}
