import { ICON_LOCK } from '../../icons';
import { showUpgradePrompt } from '../../../iap';

export function makeLockedItem(
    parent: HTMLElement,
    text: string,
    onClick?: () => void
): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'solar-locked-item';
    const label = document.createElement('span');
    label.className = 'solar-locked-label';
    label.innerHTML = ICON_LOCK;
    const labelText = document.createElement('span');
    labelText.className = 'solar-locked-copy';
    labelText.textContent = text;
    label.appendChild(labelText);

    const badge = document.createElement('span');
    badge.className = 'pro-badge solar-locked-badge';
    badge.textContent = 'PRO';
    row.appendChild(label);
    row.appendChild(badge);

    row.addEventListener('click', () => {
        if (onClick) onClick();
        else showUpgradePrompt('solar_route_recos');
    });
    parent.appendChild(row);
    return row;
}
