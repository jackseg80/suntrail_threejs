import { state } from './state';
import { STORAGE_KEYS } from '../constants/storage';

/**
 * Extrait les clés actives depuis la réponse JSON du Gist.
 */
function extractGistKeys(data: any): string[] {
    const raw = data?.maptiler_keys;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
    return raw
        .filter((k: any) =>
            typeof k === 'string' ? true : k.enabled !== false
        )
        .map((k: any) => (typeof k === 'string' ? k : k.key))
        .filter((k: string) => k && k.length > 10);
}

let availableKeys: string[] = [];
const bannedKeys = new Set<string>();
let banTimestamp = 0;
let gistData: any = null;

let orsAvailableKeys: string[] = [];
const orsBannedKeys = new Set<string>();
let orsBanTimestamp = 0;

/**
 * Résout la clé MapTiler à utiliser (v5.28.20).
 * Priorité : localStorage (manuel) > .env (build) > Gist (runtime rotation).
 */
export async function resolveMapTilerKey(): Promise<void> {
    if (window.location.search.includes('mode=test')) {
        state.MK = 'test-key-bypass';
        return;
    }

    const userDefinedKey = localStorage.getItem(STORAGE_KEYS.MAPTILER_KEY);
    const bundledKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

    const GIST_URL =
        'https://gist.githubusercontent.com/jackseg80/c4f2e5e99c1efb9d736736cb65fce862/raw/suntrail_config.json';

    if (userDefinedKey) {
        state.MK = userDefinedKey;
        if (state.DEBUG_MODE)
            console.log(`[Config] MapTiler key: localStorage (manual)`);
        return;
    }

    // Background update from Gist (rotation)
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000); // v5.29.35 : Timeout 4s pour ne pas bloquer le démarrage
        const r = await fetch(GIST_URL, {
            cache: 'no-cache',
            signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (r.ok) {
            const data = await r.json();
            gistData = data;
            availableKeys = extractGistKeys(data);
            orsAvailableKeys = extractORSGistKeys(data);
            if (availableKeys.length > 0) {
                // On choisit une clé au hasard parmi celles non bannies
                const validKeys = availableKeys.filter(
                    (k) => !bannedKeys.has(k)
                );
                if (validKeys.length > 0) {
                    const idx = Math.floor(Math.random() * validKeys.length);
                    state.MK = validKeys[idx];
                    if (state.DEBUG_MODE)
                        console.log(
                            `[Config] MapTiler key: Gist rotation active (${validKeys.length} valides)`
                        );
                } else if (bundledKey) {
                    state.MK = bundledKey;
                    if (state.DEBUG_MODE)
                        console.log(`[Config] MapTiler key: .env fallback`);
                }
            }
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

/**
 * Marque la clé actuelle comme invalide (403) et passe à la suivante.
 * Retourne true si une nouvelle clé a pu être trouvée.
 */
export function rotateMapTilerKey(): boolean {
    if (!state.MK) return false;

    if (state.DEBUG_MODE) console.warn(`[Config] Clé MapTiler bannie (403)`);
    bannedKeys.add(state.MK);
    banTimestamp = Date.now();

    const validKeys = availableKeys.filter((k) => !bannedKeys.has(k));
    if (validKeys.length > 0) {
        state.MK = validKeys[Math.floor(Math.random() * validKeys.length)];
        if (state.DEBUG_MODE) console.log(`[Config] Rotation effectuée.`);
        return true;
    }

    // v5.32.0 : Auto-recovery — reset bans after 2 minutes to retry
    // (Brave may temporarily strip Referer, causing 403 on valid keys)
    const BAN_COOLDOWN_MS = 120_000;
    if (Date.now() - banTimestamp > BAN_COOLDOWN_MS) {
        if (state.DEBUG_MODE)
            console.log(
                '[Config] Reset MapTiler bans after cooldown — retrying...'
            );
        bannedKeys.clear();
        state.isMapTilerDisabled = false;
        if (availableKeys.length > 0) {
            state.MK =
                availableKeys[Math.floor(Math.random() * availableKeys.length)];
            if (state.DEBUG_MODE)
                console.log(
                    `[Config] Retry avec clé : ${state.MK.substring(0, 8)}...`
                );
            return true;
        }
    }

    console.error('[Config] Toutes les clés MapTiler ont été bannies.');
    state.isMapTilerDisabled = true;
    return false;
}

function extractORSGistKeys(data: any): string[] {
    const raw = data?.ors_keys;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
    return raw
        .filter((k: any) =>
            typeof k === 'string' ? true : k.enabled !== false
        )
        .map((k: any) => (typeof k === 'string' ? k : k.key))
        .filter((k: string) => k && k.length > 10);
}

export async function resolveORSKey(): Promise<void> {
    const userKey = localStorage.getItem(STORAGE_KEYS.ORS_KEY);
    if (userKey && userKey.length > 10) {
        state.ORS_KEY = userKey;
        if (state.DEBUG_MODE)
            console.log('[Config] ORS key: localStorage (manual)');
        return;
    }

    const GIST_URL =
        'https://gist.githubusercontent.com/jackseg80/c4f2e5e99c1efb9d736736cb65fce862/raw/suntrail_config.json';

    if (!gistData) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 4000);
            const r = await fetch(GIST_URL, {
                cache: 'no-cache',
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (r.ok) {
                gistData = await r.json();
                orsAvailableKeys = extractORSGistKeys(gistData);
            }
        } catch (e) {
            if (state.DEBUG_MODE)
                console.warn('[Config] Échec du chargement du Gist ORS:', e);
        }
    }

    if (!orsAvailableKeys.length) return;

    const validKeys = orsAvailableKeys.filter((k) => !orsBannedKeys.has(k));
    if (validKeys.length > 0) {
        state.ORS_KEY = validKeys[Math.floor(Math.random() * validKeys.length)];
        if (state.DEBUG_MODE)
            console.log(
                `[Config] ORS key: Gist rotation (${validKeys.length}/${orsAvailableKeys.length})`
            );
    }
}

export function rotateORSKey(): boolean {
    if (!state.ORS_KEY || state.ORS_KEY.length <= 10) return false;

    if (state.DEBUG_MODE) console.warn('[Config] ORS key banned (403/429)');
    orsBannedKeys.add(state.ORS_KEY);
    orsBanTimestamp = Date.now();

    const validKeys = orsAvailableKeys.filter((k) => !orsBannedKeys.has(k));
    if (validKeys.length > 0) {
        state.ORS_KEY = validKeys[Math.floor(Math.random() * validKeys.length)];
        if (state.DEBUG_MODE)
            console.log(
                `[Config] ORS key rotated (${validKeys.length}/${orsAvailableKeys.length})`
            );
        return true;
    }

    const BAN_COOLDOWN_MS = 120_000;
    if (Date.now() - orsBanTimestamp > BAN_COOLDOWN_MS) {
        if (state.DEBUG_MODE)
            console.log('[Config] Reset ORS bans after cooldown — retrying...');
        orsBannedKeys.clear();
        state.isORSDisabled = false;
        if (orsAvailableKeys.length > 0) {
            state.ORS_KEY =
                orsAvailableKeys[
                    Math.floor(Math.random() * orsAvailableKeys.length)
                ];
            if (state.DEBUG_MODE)
                console.log(
                    `[Config] ORS retry with key: ${state.ORS_KEY.substring(0, 8)}...`
                );
            return true;
        }
    }

    console.error('[Config] All ORS keys banned.');
    state.isORSDisabled = true;
    return false;
}
