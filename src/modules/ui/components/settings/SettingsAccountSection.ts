import { i18n } from '../../../../i18n/I18nService';
import { authService } from '../../../authService';
import { showToast } from '../../../toast';
import { confirmDialog } from '../../confirmDialog';
import { ICON_CHECK, ICON_LOG_OUT } from '../../icons';

/**
 * Owns the optional-account/RGPD presentation. The section stays out of the
 * way until an account exists, while the existing DOM IDs remain available
 * for native and smoke tests.
 */
export function bindSettingsAccountSection(root: HTMLElement): void {
    const sectionLabel = root.querySelector(
        '.settings-account-heading'
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

    if (linkGoogleBtn) linkGoogleBtn.hidden = true;

    if (!authService.isAuthenticated) {
        accountSection.hidden = true;
        if (sectionLabel) sectionLabel.hidden = true;
        actionBtn.hidden = true;
        actionBtn.onclick = null;
        if (deleteBtn) deleteBtn.hidden = true;
        return;
    }

    accountSection.hidden = false;
    if (sectionLabel) sectionLabel.hidden = false;
    if (avatarEl) avatarEl.innerHTML = ICON_CHECK;
    actionBtn.hidden = false;
    statusEl.textContent = i18n.t('settings.account.loggedInAs') || 'Connecté';
    emailEl.textContent = authService.user?.email || '';
    actionBtn.innerHTML = `${ICON_LOG_OUT}<span>${i18n.t('settings.account.logout') || 'Se déconnecter'}</span>`;
    actionBtn.onclick = async () => {
        await authService.signOut();
        window.location.reload();
    };

    if (!deleteBtn) return;
    deleteBtn.hidden = false;
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
