import { i18n } from '../../../../i18n/I18nService';
import { authService } from '../../../authService';
import { showToast } from '../../../toast';
import { confirmDialog } from '../../confirmDialog';
import { ICON_CHECK, ICON_LOG_OUT, ICON_USER } from '../../icons';

/**
 * Owns the optional-account/RGPD presentation while authentication entry
 * points remain unavailable. The existing DOM IDs are intentionally kept as
 * the compatibility contract for native and smoke tests.
 */
export function bindSettingsAccountSection(root: HTMLElement): void {
    const sectionLabel = root.querySelector(
        '[data-i18n="settings.section.account"]'
    ) as HTMLElement | null;
    const accountSection = root.querySelector(
        '#account-section'
    ) as HTMLElement | null;
    const statusEl = root.querySelector('#account-status');
    const emailEl = root.querySelector('#account-email');
    const avatarEl = root.querySelector(
        '#account-avatar'
    ) as HTMLElement | null;
    const actionBtn = root.querySelector(
        '#account-action-btn'
    ) as HTMLButtonElement | null;
    const deleteBtn = root.querySelector(
        '#account-delete-btn'
    ) as HTMLButtonElement | null;
    const linkGoogleBtn = root.querySelector(
        '#account-link-google-btn'
    ) as HTMLButtonElement | null;

    if (!statusEl || !emailEl || !actionBtn || !accountSection) return;

    accountSection.style.display = 'block';
    if (sectionLabel) sectionLabel.style.display = 'block';
    if (linkGoogleBtn) linkGoogleBtn.style.display = 'none';

    if (!authService.isAuthenticated) {
        if (avatarEl) avatarEl.innerHTML = ICON_USER;
        statusEl.textContent =
            i18n.t('settings.account.unavailable') || 'Connexion indisponible';
        emailEl.textContent =
            i18n.t('settings.account.unavailableHint') ||
            'La connexion sera disponible prochainement';
        actionBtn.style.display = 'none';
        actionBtn.onclick = null;
        if (deleteBtn) deleteBtn.style.display = 'none';
        return;
    }

    if (avatarEl) avatarEl.innerHTML = ICON_CHECK;
    actionBtn.style.background = 'var(--surface-subtle)';
    actionBtn.style.color = 'var(--text-2)';
    actionBtn.style.borderTop = '1px solid var(--border)';
    actionBtn.style.display = 'flex';
    statusEl.textContent = i18n.t('settings.account.loggedInAs') || 'Connecté';
    emailEl.textContent = authService.user?.email || '';
    actionBtn.innerHTML = `${ICON_LOG_OUT}<span>${i18n.t('settings.account.logout') || 'Se déconnecter'}</span>`;
    actionBtn.onclick = async () => {
        await authService.signOut();
        window.location.reload();
    };

    if (!deleteBtn) return;
    deleteBtn.style.display = 'block';
    deleteBtn.textContent =
        i18n.t('settings.account.deleteAccount') || 'Supprimer mon compte';
    deleteBtn.onclick = async () => {
        const confirmed = await confirmDialog(
            i18n.t('settings.account.deleteConfirmMsg') ||
                'Supprimer définitivement votre compte et vos données ? Cette action ne résilie pas votre abonnement. Irréversible.',
            { danger: true }
        );
        if (!confirmed) return;
        const { error } = await authService.deleteAccount();
        if (error) {
            showToast(
                i18n.t('settings.account.deleteError') ||
                    'Erreur lors de la suppression.',
                4000
            );
        } else {
            window.location.reload();
        }
    };
}
