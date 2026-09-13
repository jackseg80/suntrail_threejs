import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n/I18nService', () => ({
    i18n: { t: () => 'Confirmation' },
}));

import { confirmDialog } from './confirmDialog';

describe('confirmDialog', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('lets Enter activate the focused button and restores prior focus', async () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();

        const result = confirmDialog('Continuer ?');
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
        );

        const cancel = document.querySelector<HTMLButtonElement>(
            '.confirm-dialog-cancel'
        )!;
        cancel.focus();
        cancel.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        cancel.click();

        await expect(result).resolves.toBe(false);
        expect(document.activeElement).toBe(opener);
    });

    it('keeps keyboard focus inside the dialog', async () => {
        const result = confirmDialog('Continuer ?');
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
        );

        const cancel = document.querySelector<HTMLButtonElement>(
            '.confirm-dialog-cancel'
        )!;
        const accept = document.querySelector<HTMLButtonElement>(
            '.confirm-dialog-accept'
        )!;

        accept.focus();
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
        );
        expect(document.activeElement).toBe(cancel);

        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        await expect(result).resolves.toBe(false);
    });
});
