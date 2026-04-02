/**
 * Déclarations de types globaux pour les APIs non couvertes par TypeScript DOM lib.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent
 */

// ── Battery Status API (non inclus dans TypeScript lib.dom) ───────────────────
interface BatteryManager extends EventTarget {
    readonly charging: boolean;
    readonly chargingTime: number;
    readonly dischargingTime: number;
    readonly level: number;
    addEventListener(type: 'levelchange' | 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange', listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}

interface Navigator {
    getBattery(): Promise<BatteryManager>;
}

// ── Version injectée par Vite au build (depuis package.json) ──────────────────
declare const __APP_VERSION__: string;

// ── WebKit Compass Heading (propriété non-standard iOS/Safari) ─────────────────
interface DeviceOrientationEvent {
    readonly webkitCompassHeading?: number;
}
