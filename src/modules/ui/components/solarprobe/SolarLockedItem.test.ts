import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeLockedItem } from './SolarLockedItem';

vi.mock('../../icons', () => ({
    ICON_LOCK: '<svg>lock</svg>',
}));

vi.mock('../../../iap', () => ({
    showUpgradePrompt: vi.fn(),
}));

import { showUpgradePrompt } from '../../../iap';

describe('makeLockedItem()', () => {
    let parent: HTMLElement;

    beforeEach(() => {
        parent = document.createElement('div');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('creates a row element with class solar-locked-item', () => {
        const row = makeLockedItem(parent, 'Feature Pro');
        expect(row.className).toBe('solar-locked-item');
        expect(parent.contains(row)).toBe(true);
    });

    it('displays the label text', () => {
        makeLockedItem(parent, 'Feature Pro');
        expect(parent.innerHTML).toContain('Feature Pro');
    });

    it('appends a PRO badge', () => {
        makeLockedItem(parent, 'Feature Pro');
        const badge = parent.querySelector('.pro-badge');
        expect(badge).not.toBeNull();
        expect(badge!.textContent).toBe('PRO');
    });

    it('calls showUpgradePrompt on click (default)', () => {
        const row = makeLockedItem(parent, 'Feature Pro');
        row.click();
        expect(showUpgradePrompt).toHaveBeenCalledWith('solar_route_recos');
    });

    it('calls custom onClick instead of showUpgradePrompt when provided', () => {
        const onClick = vi.fn();
        const row = makeLockedItem(parent, 'Feature Pro', onClick);
        row.click();
        expect(onClick).toHaveBeenCalled();
        expect(showUpgradePrompt).not.toHaveBeenCalled();
    });

    it('returns the created HTMLElement', () => {
        const row = makeLockedItem(parent, 'Feature Pro');
        expect(row).toBeInstanceOf(HTMLElement);
    });
});
