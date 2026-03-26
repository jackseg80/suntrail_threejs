import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'selection';

/**
 * Unified haptic feedback helper.
 * Gracefully no-ops on web/desktop — safe to call anywhere.
 */
export async function haptic(type: HapticType): Promise<void> {
    try {
        switch (type) {
            case 'light':     await Haptics.impact({ style: ImpactStyle.Light }); break;
            case 'medium':    await Haptics.impact({ style: ImpactStyle.Medium }); break;
            case 'heavy':     await Haptics.impact({ style: ImpactStyle.Heavy }); break;
            case 'success':   await Haptics.notification({ type: NotificationType.Success }); break;
            case 'warning':   await Haptics.notification({ type: NotificationType.Warning }); break;
            case 'selection': await Haptics.selectionChanged(); break;
        }
    } catch {
        // Graceful no-op on web/desktop
    }
}
