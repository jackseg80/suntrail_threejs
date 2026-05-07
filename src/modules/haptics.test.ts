import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHaptics } = vi.hoisted(() => ({
    mockHaptics: {
        impact: vi.fn(),
        notification: vi.fn(),
        selectionChanged: vi.fn(),
    }
}));

vi.mock('@capacitor/haptics', () => ({
    Haptics: mockHaptics,
    ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
    NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}));

import { haptic } from './haptics';

describe('haptic()', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('appelle Haptics.impact avec Light pour "light"', async () => {
        await haptic('light');
        expect(mockHaptics.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    });

    it('appelle Haptics.impact avec Medium pour "medium"', async () => {
        await haptic('medium');
        expect(mockHaptics.impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
    });

    it('appelle Haptics.impact avec Heavy pour "heavy"', async () => {
        await haptic('heavy');
        expect(mockHaptics.impact).toHaveBeenCalledWith({ style: 'HEAVY' });
    });

    it('appelle Haptics.notification avec Success pour "success"', async () => {
        await haptic('success');
        expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
    });

    it('appelle Haptics.notification avec Warning pour "warning"', async () => {
        await haptic('warning');
        expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'WARNING' });
    });

    it('appelle Haptics.selectionChanged pour "selection"', async () => {
        await haptic('selection');
        expect(mockHaptics.selectionChanged).toHaveBeenCalled();
    });

    it('ne throw pas si Haptics throw (graceful no-op)', async () => {
        mockHaptics.impact.mockRejectedValueOnce(new Error('Not available'));
        await expect(haptic('light')).resolves.toBeUndefined();
    });
});
