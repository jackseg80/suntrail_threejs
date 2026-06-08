import { ICON_LOCK } from '../../icons';
import { showUpgradePrompt } from '../../../iap';

export function makeLockedItem(
    parent: HTMLElement,
    text: string,
    onClick?: () => void
): HTMLElement {
    const row = document.createElement('div');
    row.className = 'solar-locked-item';
    row.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin:4px 0;border-radius:8px;background:rgba(255,255,255,0.03);cursor:pointer;';
    row.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${ICON_LOCK} <span style="opacity:0.5;font-size:12px;">${text}</span></span>`;

    const badge = document.createElement('span');
    badge.className = 'pro-badge';
    badge.style.cssText =
        'background:var(--accent);color:#fff;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border-radius:4px;';
    badge.textContent = 'PRO';
    row.appendChild(badge);

    row.addEventListener('click', () => {
        if (onClick) onClick();
        else showUpgradePrompt('solar_route_recos');
    });
    parent.appendChild(row);
    return row;
}
