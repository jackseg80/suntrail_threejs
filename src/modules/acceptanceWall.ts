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

const ACCEPTANCE_VERSION = 'v1';
const STORAGE_KEY = `suntrail_acceptance_${ACCEPTANCE_VERSION}`;

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
                padding: 20px;
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
            }
            .aw-card {
                background: var(--surface-solid, #1a1d2e);
                border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-radius: var(--radius-xl, 24px);
                padding: 36px 24px 32px;
                max-width: 440px;
                width: 100%;
                max-height: 85vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                animation: aw-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                overflow: hidden;
            }
            @keyframes aw-pop {
                from { opacity: 0; transform: scale(0.9) translateY(20px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .aw-scroll-area {
                overflow-y: auto;
                flex: 1;
                margin-bottom: 20px;
                padding-right: 4px;
            }
            /* Custom scrollbar for better look */
            .aw-scroll-area::-webkit-scrollbar { width: 4px; }
            .aw-scroll-area::-webkit-scrollbar-track { background: transparent; }
            .aw-scroll-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

            .aw-icon {
                font-size: 3rem;
                text-align: center;
                margin-bottom: 16px;
            }
            .aw-title {
                font-size: 1.25rem;
                font-weight: 800;
                color: var(--text-1, #fff);
                text-align: center;
                margin: 0 0 24px;
                line-height: 1.3;
            }
            .aw-items {
                list-style: none;
                padding: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                gap: 18px;
            }
            .aw-item {
                display: flex;
                gap: 14px;
                align-items: flex-start;
            }
            .aw-item-icon {
                font-size: 1.3rem;
                flex-shrink: 0;
                margin-top: 1px;
                background: var(--surface-subtle);
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 10px;
            }
            .aw-item-text {
                font-size: 0.9rem;
                color: var(--text-2, rgba(255,255,255,0.75));
                line-height: 1.5;
            }
            .aw-item-text strong {
                color: var(--text-1, #fff);
                font-weight: 700;
                display: block;
                margin-bottom: 3px;
            }
            .aw-footer {
                border-top: 1px solid var(--border, rgba(255,255,255,0.1));
                padding-top: 20px;
                background: var(--surface-solid);
            }
            .aw-legal {
                font-size: 0.75rem;
                color: var(--text-3, rgba(255,255,255,0.45));
                text-align: center;
                margin: 0 0 20px;
                line-height: 1.5;
            }
            .aw-accept-btn {
                width: 100%;
                padding: 16px;
                background: var(--accent, #4a8ef8);
                color: #fff;
                border: none;
                border-radius: var(--radius-lg, 14px);
                font-size: 1rem;
                font-weight: 700;
                cursor: pointer;
                transition: transform 0.2s, background 0.2s;
                box-shadow: 0 4px 15px rgba(74, 142, 248, 0.3);
            }
            .aw-accept-btn:hover { background: #5a9bff; transform: translateY(-2px); }
            .aw-accept-btn:active { transform: translateY(0); }
        </style>

        <div class="aw-card" role="document">
            <div class="aw-icon">⛰️</div>
            <h2 class="aw-title" id="acceptance-title">
                ${i18n.t('acceptance.title')}
            </h2>

            <div class="aw-scroll-area">
                <ul class="aw-items" id="acceptance-body">
                    <li class="aw-item">
                        <span class="aw-item-icon">🧭</span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item1.title')}</strong>
                            ${i18n.t('acceptance.item1.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon">📡</span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item2.title')}</strong>
                            ${i18n.t('acceptance.item2.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon">☀️</span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item3.title')}</strong>
                            ${i18n.t('acceptance.item3.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon">⚠️</span>
                        <div class="aw-item-text">
                            <strong>${i18n.t('acceptance.item4.title')}</strong>
                            ${i18n.t('acceptance.item4.desc')}
                        </div>
                    </li>
                    <li class="aw-item">
                        <span class="aw-item-icon">🔋</span>
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
