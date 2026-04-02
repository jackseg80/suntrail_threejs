import { Network, type ConnectionStatus } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { state } from './state';
import { eventBus } from './eventBus';
import { showToast } from './utils';
import { i18n } from '../i18n/I18nService';

let _userManualOverride = false;
let _initialized = false;

/** Consecutive network failures from tile workers — threshold before declaring offline. */
let _consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;

/**
 * Maps Capacitor connectionType to our state type.
 * On web fallback, uses Network Information API (Chromium only).
 */
function mapConnectionType(type: string): 'wifi' | 'cellular' | 'none' | 'unknown' {
    switch (type) {
        case 'wifi': return 'wifi';
        case 'cellular': return 'cellular';
        case 'none': return 'none';
        default: return 'unknown';
    }
}

function applyStatus(connected: boolean, type: string, emitToast: boolean) {
    const connType = mapConnectionType(type);
    const wasAvailable = state.isNetworkAvailable;

    state.isNetworkAvailable = connected;
    state.connectionType = connType;

    if (connected && !wasAvailable) {
        _consecutiveFailures = 0;
        eventBus.emit('networkOnline');
        // Auto-restore IS_OFFLINE only if the user hasn't manually forced it
        if (!_userManualOverride) {
            state.IS_OFFLINE = false;
        }
        if (emitToast) showToast(i18n.t('network.toast.online'));
    } else if (!connected && wasAvailable) {
        eventBus.emit('networkOffline');
        state.IS_OFFLINE = true;
        if (emitToast) showToast(i18n.t('network.toast.offline'));
    }
}

/**
 * Probe real connectivity with a tiny no-cors fetch.
 * Returns true if the network is reachable, false otherwise.
 * Single request, no polling — called only on init and on 'online' event.
 */
async function probeConnectivity(): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        await fetch('https://tile.openstreetmap.org/0/0/0.png', {
            method: 'HEAD',
            mode: 'no-cors',
            signal: ctrl.signal,
            cache: 'no-store',
        });
        clearTimeout(tid);
        return true;
    } catch {
        return false;
    }
}

/**
 * Initialize network monitoring. Event-driven only — no polling, no timers.
 * Uses @capacitor/network on native, navigator.onLine + events + probe on web.
 */
export async function initNetworkMonitor(): Promise<void> {
    if (_initialized) return;
    _initialized = true;

    if (Capacitor.isNativePlatform()) {
        // ── Native (Android/iOS) — Capacitor Network plugin ──
        try {
            const status: ConnectionStatus = await Network.getStatus();
            applyStatus(status.connected, status.connectionType, false);

            Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
                applyStatus(status.connected, status.connectionType, true);
            });
        } catch {
            // Plugin not available — fall through to web fallback
            await initWebFallback();
        }
    } else {
        // ── Web / PWA — navigator.onLine + events + probe ──
        await initWebFallback();
    }
}

async function initWebFallback() {
    // navigator.onLine is unreliable on Windows/Chrome — verify with a real probe
    let online = navigator.onLine;
    if (online) {
        online = await probeConnectivity();
    }
    const webType = online ? getWebConnectionType() : 'none';
    applyStatus(online, webType, false);

    window.addEventListener('online', async () => {
        // Verify the claim with a real probe — navigator.onLine can lie
        const reallyOnline = await probeConnectivity();
        applyStatus(reallyOnline, reallyOnline ? getWebConnectionType() : 'none', true);
    });

    window.addEventListener('offline', () => {
        applyStatus(false, 'none', true);
    });

    // Network Information API change event (Chromium only — fires on WiFi↔cellular, speed changes)
    const conn = (navigator as any).connection;
    if (conn?.addEventListener) {
        conn.addEventListener('change', async () => {
            const isOnline = navigator.onLine && await probeConnectivity();
            applyStatus(isOnline, isOnline ? getWebConnectionType() : 'none', true);
        });
    }
}

/**
 * Best-effort connection type on web via Network Information API (Chromium only).
 */
function getWebConnectionType(): string {
    const conn = (navigator as any).connection;
    if (!conn) return 'unknown';
    const t = conn.type;
    if (t === 'wifi') return 'wifi';
    if (t === 'cellular') return 'cellular';
    if (t === 'none') return 'none';
    // effectiveType fallback (4g, 3g, 2g, slow-2g)
    if (conn.effectiveType && conn.effectiveType !== 'unknown') return 'cellular';
    return 'unknown';
}

/**
 * Called by ConnectivitySheet when user manually toggles offline mode.
 * Tracks manual override so auto-restore doesn't fight the user.
 */
export function setManualOffline(val: boolean) {
    _userManualOverride = val;
    state.IS_OFFLINE = val;
}

/**
 * Called by workerManager when a tile fetch fails with a network error (not 403/429).
 * After FAILURE_THRESHOLD consecutive failures, declares offline.
 * Event-driven — no polling.
 */
export function reportNetworkFailure() {
    _consecutiveFailures++;
    if (_consecutiveFailures >= FAILURE_THRESHOLD && state.isNetworkAvailable) {
        applyStatus(false, 'none', true);
    }
}

/**
 * Called by workerManager when a tile fetch succeeds over the network.
 * Resets failure counter and restores online status if needed.
 */
export function reportNetworkSuccess() {
    if (_consecutiveFailures > 0) {
        _consecutiveFailures = 0;
        if (!state.isNetworkAvailable) {
            applyStatus(true, getWebConnectionType(), true);
        }
    }
}
