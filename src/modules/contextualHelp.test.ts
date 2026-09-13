import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/I18nService', () => ({
    i18n: { t: (key: string) => key },
}));

vi.mock('./haptics', () => ({ haptic: vi.fn() }));

import {
    showPlanningContextHint,
    showProContextHint,
    showRecordingContextHint,
} from './contextualHelp';

describe('contextualHelp', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <button id="nav-plan-tab">Préparer</button>
            <button id="rec-btn-sheet">REC</button>
            <nav id="nav-bar"></nav>
        `;
    });

    afterEach(() => {
        document
            .querySelector<HTMLButtonElement>('.contextual-help-primary')
            ?.click();
        document.body.innerHTML = '';
    });

    it('anchors planning help to the real Prepare control', async () => {
        const promise = showPlanningContextHint();
        const hint = document.getElementById('contextual-help-planning');
        expect(hint).not.toBeNull();
        expect(
            document
                .getElementById('nav-plan-tab')
                ?.classList.contains('contextual-help-target')
        ).toBe(true);

        hint?.querySelector<HTMLButtonElement>(
            '.contextual-help-primary'
        )?.click();
        await expect(promise).resolves.toBe('primary');
        expect(localStorage.getItem('suntrail_planning_context_hint_v2')).toBe(
            '1'
        );
    });

    it('closes recording help when REC itself is used', async () => {
        const promise = showRecordingContextHint();
        document.getElementById('rec-btn-sheet')?.click();
        await expect(promise).resolves.toBe('primary');
        expect(document.getElementById('contextual-help-recording')).toBeNull();
    });

    it('does not repeat a completed hint', async () => {
        localStorage.setItem('suntrail_recording_context_hint_v1', '1');
        await expect(showRecordingContextHint()).resolves.toBe('seen');
        expect(document.getElementById('contextual-help-recording')).toBeNull();
    });

    it('dismisses the current hint when the user continues elsewhere', async () => {
        const promise = showPlanningContextHint();
        document
            .getElementById('rec-btn-sheet')
            ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        await expect(promise).resolves.toBe('dismissed');
        expect(document.getElementById('contextual-help-planning')).toBeNull();
        expect(localStorage.getItem('suntrail_planning_context_hint_v2')).toBe(
            '1'
        );
    });

    it('lets the first Pro explanation be postponed', async () => {
        document.getElementById('rec-btn-sheet')?.focus();
        const promise = showProContextHint();
        document
            .querySelector<HTMLButtonElement>('.contextual-help-secondary')
            ?.click();
        await expect(promise).resolves.toBe('dismissed');
        expect(localStorage.getItem('suntrail_pro_context_hint_v1')).toBe('1');
    });
});
