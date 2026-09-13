import { STORAGE_KEYS } from '../constants/storage';
import { i18n } from '../i18n/I18nService';
import { haptic } from './haptics';

type HintResult = 'primary' | 'dismissed' | 'seen' | 'unavailable';

interface HintOptions {
    id: string;
    storageKey: string;
    targetSelector?: string;
    target?: HTMLElement | null;
    titleKey: string;
    bodyKey: string;
    primaryKey: string;
    secondaryKey?: string;
    dismissOnTargetClick?: boolean;
}

let activeHint: HTMLElement | null = null;

function hasSeen(storageKey: string): boolean {
    try {
        return localStorage.getItem(storageKey) === '1';
    } catch {
        return false;
    }
}

function markSeen(storageKey: string): void {
    try {
        localStorage.setItem(storageKey, '1');
    } catch {
        // A private WebView may reject storage. Help remains non-blocking.
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function positionHint(card: HTMLElement, target: HTMLElement): void {
    const margin = 12;
    const gap = 12;
    const targetRect = target.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const left = clamp(
        targetRect.left + targetRect.width / 2 - cardRect.width / 2,
        margin,
        Math.max(margin, viewportWidth - cardRect.width - margin)
    );
    const fitsAbove = targetRect.top - cardRect.height - gap >= margin;
    const top = fitsAbove
        ? targetRect.top - cardRect.height - gap
        : clamp(
              targetRect.bottom + gap,
              margin,
              Math.max(margin, viewportHeight - cardRect.height - margin)
          );

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.dataset.side = fitsAbove ? 'above' : 'below';
}

function showHint(options: HintOptions): Promise<HintResult> {
    if (hasSeen(options.storageKey)) return Promise.resolve('seen');
    if (activeHint) return Promise.resolve('unavailable');

    const target =
        options.target ??
        (options.targetSelector
            ? document.querySelector<HTMLElement>(options.targetSelector)
            : null);
    if (!target) return Promise.resolve('unavailable');

    return new Promise<HintResult>((resolve) => {
        const card = document.createElement('aside');
        card.id = `contextual-help-${options.id}`;
        card.className = 'contextual-help';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-labelledby', `${card.id}-title`);

        const eyebrow = document.createElement('span');
        eyebrow.className = 'contextual-help-eyebrow';
        eyebrow.textContent = i18n.t('onboarding.context.eyebrow');

        const title = document.createElement('h2');
        title.id = `${card.id}-title`;
        title.textContent = i18n.t(options.titleKey);

        const body = document.createElement('p');
        body.textContent = i18n.t(options.bodyKey);

        const actions = document.createElement('div');
        actions.className = 'contextual-help-actions';

        let settled = false;
        const finish = (result: HintResult) => {
            if (settled) return;
            settled = true;
            markSeen(options.storageKey);
            document.removeEventListener(
                'pointerdown',
                onOutsidePointerDown,
                true
            );
            window.removeEventListener('resize', reposition);
            window.removeEventListener('orientationchange', reposition);
            target.removeEventListener('click', onTargetClick);
            card.remove();
            target.classList.remove('contextual-help-target');
            document.body.classList.remove('contextual-help-open');
            activeHint = null;
            resolve(result);
        };

        const primary = document.createElement('button');
        primary.type = 'button';
        primary.className = 'contextual-help-primary';
        primary.textContent = i18n.t(options.primaryKey);
        primary.addEventListener('click', () => {
            void haptic('light');
            finish('primary');
        });

        if (options.secondaryKey) {
            const secondary = document.createElement('button');
            secondary.type = 'button';
            secondary.className = 'contextual-help-secondary';
            secondary.textContent = i18n.t(options.secondaryKey);
            secondary.addEventListener('click', () => finish('dismissed'));
            actions.appendChild(secondary);
        }
        actions.appendChild(primary);

        card.append(eyebrow, title, body, actions);
        document.body.appendChild(card);
        document.body.classList.add('contextual-help-open');
        activeHint = card;
        target.classList.add('contextual-help-target');

        const reposition = () => positionHint(card, target);
        const onOutsidePointerDown = (event: PointerEvent) => {
            const pressedNode =
                event.target instanceof Node ? event.target : null;
            if (!pressedNode || card.contains(pressedNode)) return;
            finish(target.contains(pressedNode) ? 'primary' : 'dismissed');
        };
        const onTargetClick = () => {
            if (options.dismissOnTargetClick) finish('primary');
        };
        if (options.dismissOnTargetClick) {
            target.addEventListener('click', onTargetClick);
        }
        document.addEventListener('pointerdown', onOutsidePointerDown, true);
        window.addEventListener('resize', reposition);
        window.addEventListener('orientationchange', reposition);
        requestAnimationFrame(reposition);
    });
}

export function showPlanningContextHint(): Promise<HintResult> {
    return showHint({
        id: 'planning',
        storageKey: STORAGE_KEYS.PLANNING_CONTEXT_HINT_V2,
        targetSelector: '#nav-plan-tab',
        titleKey: 'onboarding.context.planning.title',
        bodyKey: 'onboarding.context.planning.body',
        primaryKey: 'onboarding.context.gotIt',
        dismissOnTargetClick: true,
    });
}

export function showRecordingContextHint(): Promise<HintResult> {
    return showHint({
        id: 'recording',
        storageKey: STORAGE_KEYS.RECORDING_CONTEXT_HINT_V1,
        targetSelector: '#rec-btn-sheet',
        titleKey: 'onboarding.context.recording.title',
        bodyKey: 'onboarding.context.recording.body',
        primaryKey: 'onboarding.context.gotIt',
        dismissOnTargetClick: true,
    });
}

export function hasSeenProContextHint(): boolean {
    return hasSeen(STORAGE_KEYS.PRO_CONTEXT_HINT_V1);
}

export function showProContextHint(): Promise<HintResult> {
    const activeElement =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

    return showHint({
        id: 'pro',
        storageKey: STORAGE_KEYS.PRO_CONTEXT_HINT_V1,
        target:
            activeElement ?? document.querySelector<HTMLElement>('#nav-bar'),
        titleKey: 'onboarding.context.pro.title',
        bodyKey: 'onboarding.context.pro.body',
        primaryKey: 'onboarding.context.pro.view',
        secondaryKey: 'onboarding.context.pro.later',
    });
}
