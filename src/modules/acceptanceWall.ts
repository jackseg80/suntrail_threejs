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

const ACCEPTANCE_VERSION = 'v1';
const STORAGE_KEY = `suntrail_acceptance_${ACCEPTANCE_VERSION}`;

export function hasAccepted(): boolean {
    return localStorage.getItem(STORAGE_KEY) === '1';
}

/**
 * Affiche le disclaimer si pas encore accepté pour cette version.
 * Retourne une Promise qui se résout quand l'utilisateur clique "J'accepte".
 * La Promise ne rejette jamais — l'utilisateur ne peut pas passer outre.
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
                background: rgba(0, 0, 0, 0.92);
                display: flex;
                align-items: flex-end;
                justify-content: center;
                z-index: 9998;
                padding: 0;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
            .aw-card {
                background: var(--glass-bg, #1a1d2e);
                border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-radius: var(--radius-xl, 20px) var(--radius-xl, 20px) 0 0;
                padding: 32px 24px 40px;
                max-width: 480px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
            }
            .aw-icon {
                font-size: 2.5rem;
                text-align: center;
                margin-bottom: 16px;
            }
            .aw-title {
                font-size: var(--text-lg, 1.1rem);
                font-weight: 700;
                color: var(--text-1, #fff);
                text-align: center;
                margin: 0 0 20px;
                line-height: 1.3;
            }
            .aw-items {
                list-style: none;
                padding: 0;
                margin: 0 0 24px;
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
                font-size: 1.2rem;
                flex-shrink: 0;
                margin-top: 1px;
            }
            .aw-item-text {
                font-size: var(--text-sm, 0.85rem);
                color: var(--text-2, rgba(255,255,255,0.75));
                line-height: 1.5;
            }
            .aw-item-text strong {
                color: var(--text-1, #fff);
                font-weight: 600;
                display: block;
                margin-bottom: 2px;
            }
            .aw-divider {
                height: 1px;
                background: var(--border, rgba(255,255,255,0.1));
                margin: 0 0 20px;
            }
            .aw-legal {
                font-size: var(--text-xs, 0.75rem);
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
                border-radius: var(--radius-lg, 12px);
                font-size: var(--text-md, 0.95rem);
                font-weight: 700;
                cursor: pointer;
                transition: opacity 0.15s;
                letter-spacing: 0.01em;
            }
            .aw-accept-btn:hover { opacity: 0.9; }
            .aw-accept-btn:active { opacity: 0.8; }
        </style>

        <div class="aw-card" role="document">
            <div class="aw-icon">⛰️</div>
            <h2 class="aw-title" id="acceptance-title">
                Informations importantes avant utilisation
            </h2>

            <ul class="aw-items" id="acceptance-body">
                <li class="aw-item">
                    <span class="aw-item-icon">🧭</span>
                    <div class="aw-item-text">
                        <strong>Outil d'aide à la planification uniquement</strong>
                        SunTrail n'est pas un dispositif de sauvetage. En cas d'urgence, contactez le 112.
                    </div>
                </li>
                <li class="aw-item">
                    <span class="aw-item-icon">📡</span>
                    <div class="aw-item-text">
                        <strong>Données GPS et 3D approximatives</strong>
                        Le signal GPS peut être inexact en montagne. Le terrain 3D est basé sur des modèles numériques avec une résolution de 5–25m.
                    </div>
                </li>
                <li class="aw-item">
                    <span class="aw-item-icon">☀️</span>
                    <div class="aw-item-text">
                        <strong>Simulation solaire indicative</strong>
                        Les calculs ne tiennent pas compte de la météo, des nuages, ni des obstacles locaux non modélisés.
                    </div>
                </li>
                <li class="aw-item">
                    <span class="aw-item-icon">⚠️</span>
                    <div class="aw-item-text">
                        <strong>Pentes et risque avalanche</strong>
                        La coloration des pentes (&gt;30°) ne remplace pas l'analyse terrain et la méthode 3×3 de réduction des risques d'avalanche.
                    </div>
                </li>
                <li class="aw-item">
                    <span class="aw-item-icon">🔋</span>
                    <div class="aw-item-text">
                        <strong>Prévoyez une batterie externe</strong>
                        L'usage intensif du GPS et du rendu 3D vide rapidement la batterie. Emportez toujours une carte papier.
                    </div>
                </li>
            </ul>

            <div class="aw-divider"></div>
            <p class="aw-legal">
                En continuant, vous acceptez les conditions d'utilisation de SunTrail
                et reconnaissez avoir lu ces informations de sécurité.
            </p>
            <button class="aw-accept-btn" id="aw-accept-btn">
                J'ai compris — Continuer
            </button>
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
