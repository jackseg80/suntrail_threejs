import { state } from './state';
import { STORAGE_KEYS } from '../constants/storage';
import { eventBus } from './eventBus';

const GIST_URL =
    'https://gist.githubusercontent.com/jackseg80/c4f2e5e99c1efb9d736736cb65fce862/raw/suntrail_config.json';
const GIST_TIMEOUT_MS = 4000;
const BAN_COOLDOWN_MS = 120_000;

function extractKeys(data: any, propertyName: string): string[] {
    const raw = data?.[propertyName];
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
    return raw
        .filter((k: any) =>
            typeof k === 'string' ? true : k.enabled !== false
        )
        .map((k: any) => (typeof k === 'string' ? k : k.key))
        .filter((k: string) => k && k.length > 10);
}

async function fetchGistConfig(): Promise<any> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), GIST_TIMEOUT_MS);
    const r = await fetch(GIST_URL, { cache: 'no-cache', signal: ctrl.signal });
    clearTimeout(tid);
    if (r.ok) return r.json();
    throw new Error(`Gist HTTP ${r.status}`);
}

function pickRandomFromPool(
    available: string[],
    banned: Set<string>
): string | null {
    const valid = available.filter((k) => !banned.has(k));
    if (valid.length === 0) return null;
    return valid[Math.floor(Math.random() * valid.length)];
}

interface KeyRotationState {
    availableKeys: string[];
    bannedKeys: Set<string>;
    banTimestampRef: { value: number };
    onNewKey: (key: string) => void;
    onAllBanned: () => void;
    onCooldownReset: () => void;
}

function rotateServiceKey(rs: KeyRotationState, label: string): boolean {
    const currentKey = label === 'MapTiler' ? state.MK : state.ORS_KEY;
    if (!currentKey) return false;
    if (state.DEBUG_MODE) console.warn(`[Config] ${label} key banned (403)`);
    rs.bannedKeys.add(currentKey);
    rs.banTimestampRef.value = Date.now();

    const newKey = pickRandomFromPool(rs.availableKeys, rs.bannedKeys);
    if (newKey) {
        rs.onNewKey(newKey);
        if (state.DEBUG_MODE) console.log(`[Config] ${label} rotation done.`);
        return true;
    }

    if (Date.now() - rs.banTimestampRef.value > BAN_COOLDOWN_MS) {
        if (state.DEBUG_MODE)
            console.log(
                `[Config] Reset ${label} bans after cooldown — retrying...`
            );
        rs.bannedKeys.clear();
        rs.onCooldownReset();
        if (rs.availableKeys.length > 0) {
            const retryKey =
                rs.availableKeys[
                    Math.floor(Math.random() * rs.availableKeys.length)
                ];
            rs.onNewKey(retryKey);
            if (state.DEBUG_MODE)
                console.log(
                    `[Config] Retry with ${label} key: ${retryKey.substring(0, 8)}...`
                );
            return true;
        }
    }

    console.error(`[Config] All ${label} keys banned.`);
    rs.onAllBanned();
    return false;
}

// ── MapTiler ─────────────────────────────────────────────────────────────────

let availableKeys: string[] = [];
const bannedKeys = new Set<string>();
const banTimestamp = { value: 0 };
let gistData: any = null;

let orsAvailableKeys: string[] = [];
const orsBannedKeys = new Set<string>();
const orsBanTimestamp = { value: 0 };

export async function resolveMapTilerKey(): Promise<void> {
    if (window.location.search.includes('mode=test')) {
        state.MK = 'test-key-bypass';
        return;
    }

    const userDefinedKey = localStorage.getItem(STORAGE_KEYS.MAPTILER_KEY);
    const bundledKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

    if (userDefinedKey) {
        state.MK = userDefinedKey;
        if (state.DEBUG_MODE)
            console.log(`[Config] MapTiler key: localStorage (manual)`);
        return;
    }

    try {
        const data = await fetchGistConfig();
        gistData = data;
        availableKeys = extractKeys(data, 'maptiler_keys');
        orsAvailableKeys = extractKeys(data, 'ors_keys');

        const key = pickRandomFromPool(availableKeys, bannedKeys);
        if (key) {
            state.MK = key;
            if (state.DEBUG_MODE)
                console.log(
                    `[Config] MapTiler key: Gist rotation active (${availableKeys.length - bannedKeys.size}/${availableKeys.length})`
                );
        } else if (bundledKey) {
            state.MK = bundledKey;
            if (state.DEBUG_MODE)
                console.log(`[Config] MapTiler key: .env fallback`);
        }
    } catch (e) {
        if (state.DEBUG_MODE)
            console.warn('[Config] Échec du chargement du Gist MapTiler:', e);
        if (bundledKey) {
            state.MK = bundledKey;
            if (state.DEBUG_MODE)
                console.log(`[Config] MapTiler key: .env (bundled)`);
        }
    }
}

export function rotateMapTilerKey(): boolean {
    return rotateServiceKey(
        {
            availableKeys,
            bannedKeys,
            banTimestampRef: banTimestamp,
            onNewKey: (key) => {
                state.MK = key;
            },
            onAllBanned: () => {
                state.isMapTilerDisabled = true;
                eventBus.emit('serviceDegraded', {
                    service: 'maptiler',
                    disabled: true,
                });
            },
            onCooldownReset: () => {
                state.isMapTilerDisabled = false;
                eventBus.emit('serviceDegraded', {
                    service: 'maptiler',
                    disabled: false,
                });
            },
        },
        'MapTiler'
    );
}

// ── ORS ──────────────────────────────────────────────────────────────────────

export async function resolveORSKey(): Promise<void> {
    const userKey = localStorage.getItem(STORAGE_KEYS.ORS_KEY);
    if (userKey && userKey.length > 10) {
        state.ORS_KEY = userKey;
        if (state.DEBUG_MODE)
            console.log('[Config] ORS key: localStorage (manual)');
        return;
    }

    if (!gistData) {
        try {
            const data = await fetchGistConfig();
            gistData = data;
            orsAvailableKeys = extractKeys(data, 'ors_keys');
        } catch (e) {
            if (state.DEBUG_MODE)
                console.warn('[Config] Échec du chargement du Gist ORS:', e);
        }
    }

    if (!orsAvailableKeys.length) return;

    const key = pickRandomFromPool(orsAvailableKeys, orsBannedKeys);
    if (key) {
        state.ORS_KEY = key;
        if (state.DEBUG_MODE)
            console.log(
                `[Config] ORS key: Gist rotation (${orsAvailableKeys.length - orsBannedKeys.size}/${orsAvailableKeys.length})`
            );
    }
}

export function rotateORSKey(): boolean {
    return rotateServiceKey(
        {
            availableKeys: orsAvailableKeys,
            bannedKeys: orsBannedKeys,
            banTimestampRef: orsBanTimestamp,
            onNewKey: (key) => {
                state.ORS_KEY = key;
            },
            onAllBanned: () => {
                state.isORSDisabled = true;
                eventBus.emit('serviceDegraded', {
                    service: 'ors',
                    disabled: true,
                });
            },
            onCooldownReset: () => {
                state.isORSDisabled = false;
                eventBus.emit('serviceDegraded', {
                    service: 'ors',
                    disabled: false,
                });
            },
        },
        'ORS'
    );
}
