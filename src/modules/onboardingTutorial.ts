/**
 * onboardingTutorial.ts — Tutoriel d'onboarding 1er démarrage
 *
 * Affiché au PREMIER lancement après l'acceptance wall.
 * 6 slides passives avec navigation (Suivant/Passer/Commencer).
 * Accessible depuis les Réglages via showOnboarding().
 *
 * Storage key : 'suntrail_onboarding_v1'
 */

import { i18n } from '../i18n/I18nService';

const ONBOARDING_KEY = 'suntrail_onboarding_v1';

interface Slide {
    icon: string;
    titleKey: string;
    descKey: string;
    special?: 'fab-grid';
}

const SLIDES: Slide[] = [
    { icon: '\u{1F3D4}\uFE0F', titleKey: 'onboarding.slide1.title', descKey: 'onboarding.slide1.desc' },
    { icon: '\u270B', titleKey: 'onboarding.slide2.title', descKey: 'onboarding.slide2.desc' },
    { icon: '\u{1F39B}\uFE0F', titleKey: 'onboarding.slide3.title', descKey: 'onboarding.slide3.desc', special: 'fab-grid' },
    { icon: '\u{1F5C2}\uFE0F', titleKey: 'onboarding.slide4.title', descKey: 'onboarding.slide4.desc' },
    { icon: '\u2600\uFE0F', titleKey: 'onboarding.slide5.title', descKey: 'onboarding.slide5.desc' },
    { icon: '\u{1F198}', titleKey: 'onboarding.slide6.title', descKey: 'onboarding.slide6.desc' },
];

/**
 * Affiche le tutoriel uniquement au 1er lancement (flag localStorage).
 * La Promise se résout quand l'utilisateur termine ou passe le tutoriel.
 * Le flag est persisté après la complétion.
 */
export function requestOnboarding(): Promise<void> {
    if (localStorage.getItem(ONBOARDING_KEY) === '1') return Promise.resolve();
    return showOnboarding().then(() => {
        localStorage.setItem(ONBOARDING_KEY, '1');
    });
}

/**
 * Affiche le tutoriel sans vérifier le flag (pour le bouton Réglages).
 * La Promise se résout quand l'utilisateur termine ou passe.
 */
export function showOnboarding(): Promise<void> {
    return new Promise<void>((resolve) => {
        _show(resolve);
    });
}

function _buildFabGrid(): string {
    const items = [
        { icon: '\u{1F9ED}', labelKey: 'onboarding.slide3.compass', descKey: 'onboarding.slide3.compassDesc' },
        { icon: '\u{1F5FA}\uFE0F', labelKey: 'onboarding.slide3.layers', descKey: 'onboarding.slide3.layersDesc' },
        { icon: '\u229E', labelKey: 'onboarding.slide3.mode', descKey: 'onboarding.slide3.modeDesc' },
        { icon: '\u{1F4CD}', labelKey: 'onboarding.slide3.gps', descKey: 'onboarding.slide3.gpsDesc' },
    ];
    return `<div class="ob-fab-grid">${items.map(item =>
        `<div class="ob-fab-item">
            <span class="ob-fab-icon">${item.icon}</span>
            <div class="ob-fab-text">
                <strong>${i18n.t(item.labelKey)}</strong>
                <span>${i18n.t(item.descKey)}</span>
            </div>
        </div>`
    ).join('')}</div>`;
}

function _show(resolve: () => void): void {
    let currentSlide = 0;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
        <style>
            #onboarding-overlay {
                position: fixed;
                inset: 0;
                z-index: 9000;
                background: rgba(0, 0, 0, 0.88);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                touch-action: none;
            }
            .ob-card {
                background: var(--glass-bg, #1a1d2e);
                border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-radius: var(--radius-xl, 20px);
                max-width: 360px;
                width: 100%;
                padding: 36px 24px 28px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                align-items: center;
                overflow: hidden;
            }
            .ob-body {
                width: 100%;
                text-align: center;
                will-change: transform, opacity;
            }
            .ob-icon {
                font-size: 48px;
                line-height: 1;
                margin-bottom: 16px;
            }
            .ob-title {
                font-size: var(--text-xl, 1.25rem);
                font-weight: 700;
                color: var(--text-1, #fff);
                margin: 0 0 12px;
                line-height: 1.3;
            }
            .ob-desc {
                font-size: var(--text-sm, 0.85rem);
                color: var(--text-2, rgba(255,255,255,0.75));
                line-height: 1.6;
                margin: 0 0 24px;
                text-align: center;
            }
            .ob-fab-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                text-align: left;
                margin-bottom: 24px;
            }
            .ob-fab-item {
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }
            .ob-fab-icon {
                font-size: 1.1rem;
                flex-shrink: 0;
                margin-top: 1px;
            }
            .ob-fab-text {
                font-size: var(--text-xs, 0.75rem);
                color: var(--text-2, rgba(255,255,255,0.75));
                line-height: 1.4;
            }
            .ob-fab-text strong {
                color: var(--text-1, #fff);
                font-weight: 600;
                display: block;
                margin-bottom: 1px;
            }
            .ob-dots {
                display: flex;
                gap: 6px;
                justify-content: center;
                margin-bottom: 20px;
            }
            .ob-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.25);
                transition: background 0.22s ease;
            }
            .ob-dot--active {
                background: var(--accent, #4a8ef8);
            }
            .ob-actions {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
            }
            .ob-skip {
                background: none;
                border: none;
                color: var(--text-2, rgba(255,255,255,0.75));
                font-size: var(--text-sm, 0.85rem);
                cursor: pointer;
                padding: 8px 4px;
            }
            .ob-skip:hover { opacity: 0.8; }
            .ob-next {
                background: var(--accent, #4a8ef8);
                color: #fff;
                border: none;
                border-radius: var(--radius-md, 10px);
                padding: 10px 20px;
                font-weight: 600;
                font-size: var(--text-sm, 0.85rem);
                cursor: pointer;
                transition: opacity 0.15s;
            }
            .ob-next:hover { opacity: 0.9; }
            .ob-next:active { opacity: 0.8; }
        </style>

        <div class="ob-card">
            <div class="ob-body" id="ob-body"></div>
            <div class="ob-dots" id="ob-dots"></div>
            <div class="ob-actions">
                <button class="ob-skip" id="ob-skip"></button>
                <button class="ob-next" id="ob-next"></button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const body = overlay.querySelector('#ob-body') as HTMLElement;
    const dotsContainer = overlay.querySelector('#ob-dots') as HTMLElement;
    const skipBtn = overlay.querySelector('#ob-skip') as HTMLButtonElement;
    const nextBtn = overlay.querySelector('#ob-next') as HTMLButtonElement;

    // Build dot indicators
    for (let i = 0; i < SLIDES.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'ob-dot';
        dotsContainer.appendChild(dot);
    }

    function renderSlide(animate: boolean, direction: 'left' | 'right' = 'left'): void {
        const slide = SLIDES[currentSlide];

        const buildContent = (): string => {
            let descHtml: string;
            if (slide.special === 'fab-grid') {
                descHtml = `<p class="ob-desc" style="margin-bottom:8px">${i18n.t(slide.descKey)}</p>${_buildFabGrid()}`;
            } else {
                descHtml = `<p class="ob-desc">${i18n.t(slide.descKey)}</p>`;
            }
            return `
                <div class="ob-icon">${slide.icon}</div>
                <h2 class="ob-title">${i18n.t(slide.titleKey)}</h2>
                ${descHtml}
            `;
        };

        // Update dots
        const dots = dotsContainer.querySelectorAll('.ob-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('ob-dot--active', i === currentSlide);
        });

        // Update button labels
        skipBtn.textContent = i18n.t('onboarding.skip');
        const isLast = currentSlide === SLIDES.length - 1;
        nextBtn.textContent = isLast
            ? `${i18n.t('onboarding.start')} \u2713`
            : `${i18n.t('onboarding.next')} \u2192`;

        if (!animate) {
            body.innerHTML = buildContent();
            return;
        }

        // Animate out current content
        body.style.transition = 'transform 220ms ease-in-out, opacity 220ms ease-in-out';
        body.style.transform = direction === 'left' ? 'translateX(-40px)' : 'translateX(40px)';
        body.style.opacity = '0';

        setTimeout(() => {
            body.innerHTML = buildContent();
            // Position for entrance from opposite side
            body.style.transition = 'none';
            body.style.transform = direction === 'left' ? 'translateX(40px)' : 'translateX(-40px)';
            void body.offsetHeight; // force reflow
            // Animate in
            body.style.transition = 'transform 220ms ease-in-out, opacity 220ms ease-in-out';
            body.style.transform = 'translateX(0)';
            body.style.opacity = '1';
        }, 220);
    }

    function close(): void {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
        resolve();
    }

    // Button handlers
    nextBtn.addEventListener('click', () => {
        if (currentSlide === SLIDES.length - 1) {
            close();
        } else {
            currentSlide++;
            renderSlide(true, 'left');
        }
    });
    skipBtn.addEventListener('click', close);

    // Swipe handling
    let pointerStartX = 0;
    let pointerStartY = 0;
    let swiping = false;

    overlay.addEventListener('pointerdown', (e: PointerEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.ob-skip') || target.closest('.ob-next')) {
            swiping = false;
            return;
        }
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        swiping = true;
    });

    overlay.addEventListener('pointermove', (e: PointerEvent) => {
        if (!swiping) return;
        e.preventDefault();
    });

    overlay.addEventListener('pointerup', (e: PointerEvent) => {
        if (!swiping) return;
        swiping = false;
        const dx = e.clientX - pointerStartX;
        const dy = e.clientY - pointerStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0 && currentSlide < SLIDES.length - 1) {
                currentSlide++;
                renderSlide(true, 'left');
            } else if (dx > 0 && currentSlide > 0) {
                currentSlide--;
                renderSlide(true, 'right');
            }
        }
    });

    // Keyboard navigation
    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') { close(); return; }
        if (e.key === 'ArrowRight' && currentSlide < SLIDES.length - 1) {
            currentSlide++;
            renderSlide(true, 'left');
        }
        if (e.key === 'ArrowLeft' && currentSlide > 0) {
            currentSlide--;
            renderSlide(true, 'right');
        }
        if (e.key === 'Tab') e.preventDefault();
    });

    // Initial render
    renderSlide(false);

    // Focus on next button for accessibility
    requestAnimationFrame(() => nextBtn.focus());
}
