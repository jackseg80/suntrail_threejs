/**
 * onboardingTutorial.ts — Tutoriel d'onboarding immersif v6.0
 *
 * Affiché au PREMIER lancement après l'acceptance wall.
 * 6 slides plein écran avec flou d'arrière-plan.
 * Optimisé pour mobile (Portrait/Paysage) et Desktop.
 *
 * Storage key : 'suntrail_onboarding_v2'
 */

import { i18n } from '../i18n/I18nService';
import { haptic } from './haptics';

const ONBOARDING_KEY = 'suntrail_onboarding_v2';

interface Slide {
    type: 'tilt' | 'solar' | 'track' | 'expert' | 'weather' | 'safety';
    titleKey: string;
    descKey: string;
    special?: 'final-menu';
}

const SLIDES: Slide[] = [
    { type: 'tilt', titleKey: 'onboarding.slide1.title', descKey: 'onboarding.slide1.desc' },
    { type: 'solar', titleKey: 'onboarding.slide2.title', descKey: 'onboarding.slide2.desc' },
    { type: 'track', titleKey: 'onboarding.slide3.title', descKey: 'onboarding.slide3.desc' },
    { type: 'expert', titleKey: 'onboarding.slide4.title', descKey: 'onboarding.slide4.desc' },
    { type: 'weather', titleKey: 'onboarding.slide5.title', descKey: 'onboarding.slide5.desc' },
    { type: 'safety', titleKey: 'onboarding.slide6.title', descKey: 'onboarding.slide6.desc', special: 'final-menu' },
];

/**
 * Affiche le tutoriel uniquement au 1er lancement (flag localStorage).
 */
export function requestOnboarding(): Promise<void> {
    if (localStorage.getItem(ONBOARDING_KEY) === '1') return Promise.resolve();
    return showOnboarding().then(() => {
        localStorage.setItem(ONBOARDING_KEY, '1');
    });
}

/**
 * Affiche le tutoriel sans vérifier le flag.
 */
export function showOnboarding(): Promise<void> {
    return new Promise<void>((resolve) => {
        _show(resolve);
    });
}

function _getSvgIcon(type: string): string {
    switch (type) {
        case 'tilt':
            return `
                <svg viewBox="0 0 100 100" class="ob-svg">
                    <path d="M20 70 L80 70 L60 30 L20 70" fill="none" stroke="currentColor" stroke-width="2" />
                    <circle cx="50" cy="50" r="5" fill="var(--accent)" class="anim-tilt-hand" />
                    <circle cx="70" cy="50" r="5" fill="var(--accent)" class="anim-tilt-hand" />
                </svg>`;
        case 'solar':
            return `
                <svg viewBox="0 0 100 100" class="ob-svg">
                    <path d="M10 80 Q 50 10 90 80" fill="none" stroke="var(--text-3)" stroke-dasharray="2 2" />
                    <circle cx="10" cy="80" r="6" fill="var(--gold)" class="anim-solar-sun" />
                    <path d="M30 80 L50 40 L70 80" fill="var(--surface-subtle)" stroke="currentColor" />
                </svg>`;
        case 'track':
            return `
                <svg viewBox="0 0 100 100" class="ob-svg">
                    <circle cx="20" cy="70" r="3" fill="currentColor" />
                    <circle cx="50" cy="30" r="3" fill="currentColor" />
                    <circle cx="80" cy="50" r="3" fill="currentColor" />
                    <path d="M20 70 L50 30 L80 50" fill="none" stroke="var(--accent)" stroke-width="3" class="anim-track-path" />
                </svg>`;
        case 'expert':
            return `
                <svg viewBox="0 0 100 100" class="ob-svg">
                    <path d="M20 80 L80 80 L80 40 Z" fill="none" stroke="currentColor" stroke-width="2" />
                    <path d="M80 80 L80 40" stroke="var(--accent)" stroke-width="4" />
                    <text x="45" y="75" font-size="8" fill="var(--accent)">35°</text>
                </svg>`;
        case 'weather':
            return `
                <svg viewBox="0 0 100 100" class="ob-svg">
                    <circle cx="70" cy="30" r="10" fill="var(--gold)" />
                    <path d="M20 60 Q35 40 50 60 Q65 40 80 60 L80 75 Q50 90 20 75 Z" fill="currentColor" opacity="0.8" />
                </svg>`;
        case 'safety':
            return `
                <svg viewBox="0 0 100 100" class="ob-svg">
                    <circle cx="50" cy="50" r="10" fill="none" stroke="var(--accent)" stroke-width="2" class="anim-pulse" />
                    <circle cx="50" cy="50" r="20" fill="none" stroke="var(--accent)" stroke-width="1" class="anim-pulse" style="animation-delay: 0.5s" />
                    <path d="M50 35 V65 M35 50 H65" stroke="#ef4444" stroke-width="6" stroke-linecap="round" />
                </svg>`;
        default: return '';
    }
}

function _getMockup(type: string): string {
    switch (type) {
        case 'tilt':
            return `
                <div class="ob-mockup-fab">
                    <div class="fab-btn" style="background:var(--surface); border:1px solid var(--accent); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; width:56px; height:56px; border-radius:16px; backdrop-filter:blur(10px); gap:2px; padding:4px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 3L20 7.5L12 12L4 7.5L12 3Z" fill="currentColor" opacity="0.15" stroke-linejoin="round" />
                            <path d="M4 7.5V16.5L12 21 M20 7.5V16.5L12 21 M12 12V21" stroke="currentColor" />
                        </svg>
                        <span style="font-size:10px; font-weight:800; line-height:1;">3D</span>
                    </div>
                </div>`;
        case 'solar':
            return `
                <div class="ob-mockup-bottom" style="background:rgba(25,28,45,0.95); border:1px solid rgba(255,255,255,0.15); padding:16px; border-radius:20px; width:100%; max-width:280px; box-shadow:0 8px 24px rgba(0,0,0,0.4);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="font-weight:800; font-size:16px; color:#fff;">14:30</div>
                            <div style="font-size:10px; font-weight:800; color:var(--gold); text-transform:uppercase; letter-spacing:1px;">☀️ Plein jour</div>
                        </div>
                        <div style="color:#fff; font-size:16px;">▶</div>
                    </div>
                    <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; position:relative;">
                        <div style="position:absolute; left:60%; top:50%; transform:translate(-50%, -50%); width:20px; height:20px; background:var(--accent); border-radius:50%; border:2px solid #fff; box-shadow:0 0 10px var(--accent);"></div>
                    </div>
                </div>`;
        case 'weather':
            return `
                <div class="ob-mockup-top">
                    <div class="status-widget" style="background:rgba(25,28,45,0.9); border:1px solid var(--accent); color:#fff; display:flex; align-items:center; gap:8px; padding:8px 16px; border-radius:20px; min-height:48px;">
                        <span style="font-size:18px;">☀️</span>
                        <strong style="font-size:16px;">22°</strong>
                    </div>
                </div>`;
        case 'safety':
            return `
                <div class="ob-mockup-top" style="justify-content:center;">
                    <div class="status-widget" style="background:rgba(239,68,68,0.15); border:1.5px solid #ef4444; color:#ef4444; display:flex; align-items:center; justify-content:center; width:64px; height:48px; border-radius:20px;">
                        <strong style="font-size:14px; letter-spacing:1px;">SOS</strong>
                    </div>
                </div>`;
        default: return '';
    }
}

function _show(resolve: () => void): void {
    let currentSlide = 0;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.innerHTML = `
        <style>
            #onboarding-overlay {
                position: fixed;
                inset: 0;
                z-index: 9999;
                background: rgba(0,0,0,0.4);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                display: flex;
                flex-direction: column;
                color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                overflow: hidden;
            }
            .ob-container {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px;
                text-align: center;
                max-width: 800px;
                margin: 0 auto;
                width: 100%;
                box-sizing: border-box;
            }
            @media (min-width: 768px) {
                .ob-container {
                    flex-direction: row;
                    text-align: left;
                    gap: 48px;
                }
                .ob-visual { flex: 1; }
                .ob-content { flex: 1; }
            }
            .ob-visual {
                width: 100%;
                max-width: 320px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin-bottom: 32px;
                gap: 24px;
                position: relative;
            }
            .ob-svg-container {
                width: 140px;
                height: 140px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ob-svg {
                width: 100%;
                height: 100%;
                color: #fff;
            }
            .ob-mockup-container {
                width: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            .ob-mockup-label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: rgba(255,255,255,0.4);
            }
            .ob-mockup-fab { width: 56px; height: 56px; transform: scale(1.2); }
            .ob-mockup-bottom { width: 100%; max-width: 260px; background: var(--surface); padding: 12px; border-radius: 16px; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
            .ob-mockup-top { width: 100%; display: flex; justify-content: center; transform: scale(1.1); }
            
            .ob-title {
                font-size: 1.75rem;
                font-weight: 800;
                margin: 0 0 16px;
                line-height: 1.2;
            }
            .ob-desc {
                font-size: 1.05rem;
                color: rgba(255,255,255,0.8);
                line-height: 1.6;
                margin: 0 0 40px;
            }
            .ob-footer {
                padding: 24px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                align-items: center;
                background: linear-gradient(to top, rgba(0,0,0,0.4), transparent);
            }
            .ob-actions {
                width: 100%;
                max-width: 400px;
                display: flex;
                gap: 12px;
            }
            .ob-btn {
                flex: 1;
                height: 56px;
                border-radius: 16px;
                border: none;
                font-size: 1rem;
                font-weight: 700;
                cursor: pointer;
                transition: transform 0.1s, opacity 0.1s;
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .ob-btn--primary { background: var(--accent, #4a8ef8); color: #fff; }
            .ob-btn--secondary { background: rgba(255,255,255,0.1); color: #fff; backdrop-filter: blur(10px); }
            .ob-btn:active { transform: scale(0.97); opacity: 0.9; }

            .ob-dots { display: flex; gap: 8px; margin-bottom: 8px; }
            .ob-dot { width: 8px; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.2); transition: width 0.3s, background 0.3s; }
            .ob-dot--active { width: 24px; background: var(--accent, #4a8ef8); }

            .ob-menu-grid { display: grid; grid-template-columns: 1fr; gap: 12px; width: 100%; margin-top: 24px; }
            .ob-menu-item {
                background: rgba(255,255,255,0.08); padding: 16px; border-radius: 12px;
                display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer;
                border: 1px solid rgba(255,255,255,0.1);
            }
            .ob-menu-item:hover { background: rgba(255,255,255,0.12); }
            .ob-menu-icon { font-size: 1.5rem; }

            /* Animations */
            @keyframes tilt-hand { 0%, 100% { transform: translateY(10px); } 50% { transform: translateY(-20px); } }
            .anim-tilt-hand { animation: tilt-hand 3s ease-in-out infinite; }
            @keyframes solar-sun { 0% { transform: translate(0, 0); } 50% { transform: translate(40px, -60px); } 100% { transform: translate(80px, 0); } }
            .anim-solar-sun { animation: solar-sun 5s linear infinite; }
            @keyframes track-path { 0% { stroke-dasharray: 0 200; } 100% { stroke-dasharray: 200 200; } }
            .anim-track-path { animation: track-path 3s ease-out infinite; }
            @keyframes pulse { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
            .anim-pulse { transform-origin: center; animation: pulse 2s ease-out infinite; }
        </style>
        <div class="ob-container" id="ob-container">
            <div class="ob-visual" id="ob-visual"></div>
            <div class="ob-content">
                <h1 class="ob-title" id="ob-title"></h1>
                <p class="ob-desc" id="ob-desc"></p>
                <div id="ob-special"></div>
            </div>
        </div>
        <div class="ob-footer">
            <div class="ob-dots" id="ob-dots"></div>
            <div class="ob-actions">
                <button class="ob-btn ob-btn--secondary" id="ob-skip"></button>
                <button class="ob-btn ob-btn--primary" id="ob-next"></button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const title = overlay.querySelector('#ob-title') as HTMLElement;
    const desc = overlay.querySelector('#ob-desc') as HTMLElement;
    const visual = overlay.querySelector('#ob-visual') as HTMLElement;
    const special = overlay.querySelector('#ob-special') as HTMLElement;
    const dotsContainer = overlay.querySelector('#ob-dots') as HTMLElement;
    const skipBtn = overlay.querySelector('#ob-skip') as HTMLButtonElement;
    const nextBtn = overlay.querySelector('#ob-next') as HTMLButtonElement;

    // Create dots
    SLIDES.forEach(() => {
        const dot = document.createElement('div');
        dot.className = 'ob-dot';
        dotsContainer.appendChild(dot);
    });

    function renderSlide(): void {
        const slide = SLIDES[currentSlide];
        const isLast = currentSlide === SLIDES.length - 1;

        title.textContent = i18n.t(slide.titleKey);
        desc.textContent = i18n.t(slide.descKey);
        
        const mockupHtml = _getMockup(slide.type);
        
        visual.innerHTML = `
            <div class="ob-svg-container">
                ${_getSvgIcon(slide.type)}
            </div>
            ${mockupHtml ? `
                <div class="ob-mockup-container">
                    <span class="ob-mockup-label">Interface</span>
                    ${mockupHtml}
                </div>
            ` : ''}
        `;

        // Dots
        const dots = dotsContainer.querySelectorAll('.ob-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('ob-dot--active', i === currentSlide);
        });

        // Buttons
        skipBtn.textContent = i18n.t('onboarding.skip');
        nextBtn.textContent = isLast ? i18n.t('onboarding.start') : i18n.t('onboarding.next');
        skipBtn.style.display = isLast ? 'none' : 'block';

        // Special Menu
        special.innerHTML = '';
        if (slide.special === 'final-menu') {
            const grid = document.createElement('div');
            grid.className = 'ob-menu-grid';
            grid.innerHTML = `
                <div class="ob-menu-item" data-action="explore">
                    <span class="ob-menu-icon">🌍</span>
                    <div>
                        <strong>${i18n.t('onboarding.explore')}</strong>
                    </div>
                </div>
                <div class="ob-menu-item" data-action="import">
                    <span class="ob-menu-icon">📥</span>
                    <div>
                        <strong>${i18n.t('onboarding.importGpx')}</strong>
                    </div>
                </div>
                <div class="ob-menu-item" data-action="search">
                    <span class="ob-menu-icon">🏔️</span>
                    <div>
                        <strong>${i18n.t('onboarding.searchPeak')}</strong>
                    </div>
                </div>
            `;
            special.appendChild(grid);

            grid.querySelectorAll('.ob-menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    const action = (item as HTMLElement).dataset.action;
                    _handleFinalAction(action);
                });
            });
        }
    }

    function _handleFinalAction(action: string | undefined): void {
        void haptic('medium');
        close();
        if (action === 'import') {
            document.querySelector<HTMLElement>('[data-tab="track"]')?.click();
            setTimeout(() => {
                document.getElementById('import-gpx-btn')?.click();
            }, 500);
        } else if (action === 'search') {
            document.querySelector<HTMLElement>('[data-tab="search"]')?.click();
            setTimeout(() => {
                document.querySelector<HTMLInputElement>('#search-sheet input')?.focus();
            }, 500);
        }
    }

    function close(): void {
        overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        overlay.style.opacity = '0';
        overlay.style.transform = 'scale(1.05)';
        setTimeout(() => overlay.remove(), 400);
        resolve();
    }

    nextBtn.addEventListener('click', () => {
        if (currentSlide === SLIDES.length - 1) {
            void haptic('medium');
            close();
        } else {
            currentSlide++;
            void haptic('light');
            renderSlide();
        }
    });

    skipBtn.addEventListener('click', () => {
        void haptic('light');
        close();
    });

    // Swipe handling
    let startX = 0;
    overlay.addEventListener('touchstart', (e) => startX = e.touches[0].clientX);
    overlay.addEventListener('touchend', (e) => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            if (diff > 0 && currentSlide < SLIDES.length - 1) {
                currentSlide++;
                renderSlide();
            } else if (diff < 0 && currentSlide > 0) {
                currentSlide--;
                renderSlide();
            }
        }
    });

    renderSlide();
}

