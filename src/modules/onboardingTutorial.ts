/**
 * Prise en main SunTrail v5.90.
 *
 * La carte réelle reste visible et manipulable. Cette visite courte enseigne
 * uniquement son modèle mental; les actions métier sont expliquées ensuite,
 * au moment où l'utilisateur les rencontre.
 */

import { i18n } from '../i18n/I18nService';
import { haptic } from './haptics';
import { STORAGE_KEYS } from '../constants/storage';

const ONBOARDING_KEY = STORAGE_KEYS.ONBOARDING_V3;

interface TourStep {
    targetSelector: string;
    titleKey: string;
    descKey: string;
    gestureKeys?: string[];
}

const STEPS: TourStep[] = [
    {
        targetSelector: '#canvas-container',
        titleKey: 'onboarding.map.title',
        descKey: 'onboarding.map.desc',
        gestureKeys: [
            'onboarding.map.drag',
            'onboarding.map.zoom',
            'onboarding.map.tilt',
        ],
    },
    {
        targetSelector: '#nav-2d-toggle',
        titleKey: 'onboarding.relief.title',
        descKey: 'onboarding.relief.desc',
    },
];

/** Propose la nouvelle visite une fois, y compris après l'ancien tutoriel v2. */
export function requestOnboarding(): Promise<void> {
    if (localStorage.getItem(ONBOARDING_KEY) === '1') return Promise.resolve();
    return showOnboarding().then(() => {
        localStorage.setItem(ONBOARDING_KEY, '1');
    });
}

/** Rejoue la prise en main depuis l'aide, sans toucher aux aides contextuelles. */
export function showOnboarding(): Promise<void> {
    return new Promise<void>((resolve) => {
        showTour(resolve);
    });
}

function showTour(resolve: () => void): void {
    document.getElementById('onboarding-overlay')?.remove();

    let currentStep = 0;
    let activeTarget: HTMLElement | null = null;
    let targetClickHandler: (() => void) | null = null;
    let settled = false;

    const overlay = document.createElement('section');
    overlay.id = 'onboarding-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', 'ob-title');
    overlay.setAttribute('aria-describedby', 'ob-desc');
    overlay.innerHTML = `
        <div class="ob-live-card">
            <div class="ob-live-header">
                <span class="ob-step" id="ob-step"></span>
                <button type="button" class="ob-close" id="ob-skip" aria-label=""></button>
            </div>
            <h1 class="ob-title" id="ob-title"></h1>
            <p class="ob-desc" id="ob-desc"></p>
            <ul class="ob-gestures" id="ob-gestures"></ul>
            <div class="ob-actions">
                <button type="button" class="ob-btn ob-btn--primary" id="ob-next"></button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const card = overlay.querySelector<HTMLElement>('.ob-live-card')!;
    const stepLabel = overlay.querySelector<HTMLElement>('#ob-step')!;
    const title = overlay.querySelector<HTMLElement>('#ob-title')!;
    const desc = overlay.querySelector<HTMLElement>('#ob-desc')!;
    const gestures = overlay.querySelector<HTMLElement>('#ob-gestures')!;
    const skipBtn = overlay.querySelector<HTMLButtonElement>('#ob-skip')!;
    const nextBtn = overlay.querySelector<HTMLButtonElement>('#ob-next')!;

    skipBtn.textContent = '×';
    skipBtn.setAttribute('aria-label', i18n.t('onboarding.skip'));

    const detachTarget = () => {
        if (activeTarget && targetClickHandler) {
            activeTarget.removeEventListener('click', targetClickHandler);
        }
        activeTarget?.classList.remove('onboarding-live-target');
        activeTarget = null;
        targetClickHandler = null;
    };

    const close = () => {
        if (settled) return;
        settled = true;
        detachTarget();
        document.removeEventListener('keydown', onKeyDown);
        overlay.classList.add('is-closing');
        window.setTimeout(() => overlay.remove(), 240);
        resolve();
    };

    const advance = () => {
        if (currentStep >= STEPS.length - 1) {
            void haptic('medium');
            close();
            return;
        }
        currentStep += 1;
        void haptic('light');
        renderStep();
    };

    const renderStep = () => {
        detachTarget();
        const step = STEPS[currentStep];
        const isLast = currentStep === STEPS.length - 1;
        const requestedTarget = document.querySelector<HTMLElement>(
            step.targetSelector
        );
        const reliefUnavailable =
            isLast && requestedTarget?.matches(':disabled') === true;

        stepLabel.textContent = i18n.t('onboarding.step', {
            current: String(currentStep + 1),
            total: String(STEPS.length),
        });
        title.textContent = i18n.t(
            reliefUnavailable ? 'onboarding.detail.title' : step.titleKey
        );
        desc.textContent = i18n.t(
            reliefUnavailable ? 'onboarding.detail.desc' : step.descKey
        );
        nextBtn.textContent = i18n.t(
            isLast ? 'onboarding.finish' : 'onboarding.next'
        );

        gestures.replaceChildren();
        for (const [index, key] of (step.gestureKeys ?? []).entries()) {
            const item = document.createElement('li');
            const marker = document.createElement('span');
            marker.className = 'ob-gesture-marker';
            marker.setAttribute('aria-hidden', 'true');
            marker.textContent = ['↔', '＋', '↕'][index] ?? '•';
            const copy = document.createElement('span');
            copy.textContent = i18n.t(key);
            item.append(marker, copy);
            gestures.appendChild(item);
        }
        gestures.hidden = !step.gestureKeys?.length;

        activeTarget = reliefUnavailable
            ? document.querySelector<HTMLElement>('#top-pill-lod')
            : requestedTarget;
        activeTarget?.classList.add('onboarding-live-target');

        // Le second pas peut se terminer en essayant réellement le bouton 2D/3D.
        if (isLast && !reliefUnavailable && activeTarget) {
            targetClickHandler = () => close();
            activeTarget.addEventListener('click', targetClickHandler);
        }

        card.dataset.step = String(currentStep + 1);
        overlay.dataset.step = String(currentStep + 1);
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    };

    nextBtn.addEventListener('click', advance);
    skipBtn.addEventListener('click', () => {
        void haptic('light');
        close();
    });
    document.addEventListener('keydown', onKeyDown);

    renderStep();
    nextBtn.focus({ preventScroll: true });
}
