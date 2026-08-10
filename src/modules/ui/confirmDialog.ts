import { i18n } from '../../i18n/I18nService';

/**
 * confirmDialog.ts — Confirmation modale HTML réutilisable.
 *
 * Remplace `window.confirm()`, qui n'est pas fiable sur iOS/WebKit (retourne
 * toujours `false` sans afficher de dialog natif, comportement Apple documenté).
 * La modale est accessible, stylée selon le thème, et retourne une Promise.
 */
export function confirmDialog(
    message: string,
    options?: {
        confirmText?: string;
        cancelText?: string;
        danger?: boolean;
    }
): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'confirm-dialog-overlay';
        overlay.className = 'confirm-dialog-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'confirm-dialog-title');

        const title = i18n.t('common.confirm') || 'Confirmation';
        const confirmLabel = options?.confirmText || 'Confirmer';
        const cancelLabel = options?.cancelText || 'Annuler';

        overlay.innerHTML = `
            <div class="confirm-dialog-card">
                <h3 id="confirm-dialog-title" class="confirm-dialog-title">${title}</h3>
                <p class="confirm-dialog-message">${message}</p>
                <div class="confirm-dialog-actions">
                    <button type="button" class="confirm-dialog-btn confirm-dialog-cancel" data-action="cancel">${cancelLabel}</button>
                    <button type="button" class="confirm-dialog-btn confirm-dialog-accept${options?.danger ? ' confirm-dialog-danger' : ''}" data-action="confirm">${confirmLabel}</button>
                </div>
            </div>
        `;

        const cleanup = (result: boolean): void => {
            overlay.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(result);
        };

        const onClick = (e: Event): void => {
            const target = e.target as HTMLElement;
            const action = target
                .closest('[data-action]')
                ?.getAttribute('data-action');
            if (action === 'confirm') cleanup(true);
            else if (action === 'cancel') cleanup(false);
        };
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                cleanup(true);
            }
        };

        overlay.addEventListener('click', onClick);
        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            (
                overlay.querySelector('.confirm-dialog-accept') as HTMLElement
            )?.focus();
        });
    });
}
