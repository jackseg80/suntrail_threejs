import { state } from './state';

/**
 * Extrait les clés actives depuis la réponse JSON du Gist.
 */
function extractGistKeys(data: any): string[] {
    const raw = data?.maptiler_keys;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
    return raw
        .filter((k: any) => typeof k === 'string' ? true : k.enabled !== false)
        .map((k: any) => typeof k === 'string' ? k : k.key)
        .filter((k: string) => k && k.length > 10);
}

let availableKeys: string[] = [];
let bannedKeys = new Set<string>();
let banTimestamp = 0;

/**
 * Résout la clé MapTiler à utiliser (v5.28.20).
 * Priorité : localStorage (manuel) > .env (build) > Gist (runtime rotation).
 */
export async function resolveMapTilerKey(): Promise<void> {
    if (window.location.search.includes('mode=test')) {
        state.MK = 'test-key-bypass';
        return;
    }

    const userDefinedKey = localStorage.getItem('maptiler_key');
    const bundledKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

    const GIST_URL = 'https://gist.githubusercontent.com/jackseg80/c4f2e5e99c1efb9d736736cb65fce862/raw/suntrail_config.json';

    if (userDefinedKey) {
        state.MK = userDefinedKey;
        console.log(`[Config] MapTiler key: localStorage (manual) [${state.MK.substring(0, 8)}...]`);
        return;
    }

    // Background update from Gist (rotation)
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000); // v5.29.35 : Timeout 4s pour ne pas bloquer le démarrage
        const r = await fetch(GIST_URL, { cache: 'no-cache', signal: ctrl.signal });
        clearTimeout(tid);
        if (r.ok) {
            const data = await r.json();
            availableKeys = extractGistKeys(data);
            if (availableKeys.length > 0) {
                // On choisit une clé au hasard parmi celles non bannies
                const validKeys = availableKeys.filter(k => !bannedKeys.has(k));
                if (validKeys.length > 0) {
                    const idx = Math.floor(Math.random() * validKeys.length);
                    state.MK = validKeys[idx];
                    console.log(`[Config] MapTiler key: Gist rotation active (${validKeys.length} valides) [${state.MK.substring(0, 8)}...]`);
                } else if (bundledKey) {
                    state.MK = bundledKey;
                    console.log(`[Config] MapTiler key: .env fallback [${state.MK.substring(0, 8)}...]`);
                }
            }
        }
    } catch (e) {
        if (bundledKey) {
            state.MK = bundledKey;
            console.log(`[Config] MapTiler key: .env (bundled) [${state.MK.substring(0, 8)}...]`);
        }
    }
}

/**
 * Marque la clé actuelle comme invalide (403) et passe à la suivante.
 * Retourne true si une nouvelle clé a pu être trouvée.
 */
export function rotateMapTilerKey(): boolean {
    if (!state.MK) return false;
    
    console.warn(`[Config] Clé MapTiler bannie (403) : ${state.MK.substring(0, 8)}...`);
    bannedKeys.add(state.MK);
    banTimestamp = Date.now();

    const validKeys = availableKeys.filter(k => !bannedKeys.has(k));
    if (validKeys.length > 0) {
        state.MK = validKeys[Math.floor(Math.random() * validKeys.length)];
        console.log(`[Config] Rotation effectuée. Nouvelle clé : ${state.MK.substring(0, 8)}...`);
        return true;
    }

    // v5.32.0 : Auto-recovery — reset bans after 2 minutes to retry
    // (Brave may temporarily strip Referer, causing 403 on valid keys)
    const BAN_COOLDOWN_MS = 120_000;
    if (Date.now() - banTimestamp > BAN_COOLDOWN_MS) {
        console.log("[Config] Reset MapTiler bans after cooldown — retrying...");
        bannedKeys.clear();
        state.isMapTilerDisabled = false;
        if (availableKeys.length > 0) {
            state.MK = availableKeys[Math.floor(Math.random() * availableKeys.length)];
            console.log(`[Config] Retry avec clé : ${state.MK.substring(0, 8)}...`);
            return true;
        }
    }

    console.error("[Config] Toutes les clés MapTiler ont été bannies.");
    state.isMapTilerDisabled = true;
    return false;
}
