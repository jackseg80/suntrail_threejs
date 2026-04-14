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

/**
 * Résout la clé MapTiler à utiliser (v5.28.20).
 * Priorité : localStorage (manuel) > .env (build) > Gist (runtime rotation).
 */
export async function resolveMapTilerKey(): Promise<void> {
    if (window.location.search.includes('mode=test')) {
        state.MK = 'test-key-bypass';
        console.log('[Config] MapTiler key: test mode bypass');
        return;
    }

    const userDefinedKey = localStorage.getItem('maptiler_key');
    const bundledKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

    const GIST_URL = 'https://gist.githubusercontent.com/jackseg80/c4f2e5e99c1efb9d736736cb65fce862/raw/suntrail_config.json';

    if (userDefinedKey) {
        state.MK = userDefinedKey;
        console.log('[Config] MapTiler key: localStorage (manual)');
        return;
    }

    if (bundledKey && bundledKey.length > 10) {
        state.MK = bundledKey;
        console.log('[Config] MapTiler key: .env (bundled)');
        
        // Background update from Gist (rotation)
        fetch(GIST_URL, { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const keys = extractGistKeys(data);
                if (keys.length > 0) {
                    const idx = Math.floor(Math.random() * keys.length);
                    state.MK = keys[idx];
                    console.log(`[Config] MapTiler key: Gist rotation (${idx + 1}/${keys.length})`);
                }
            })
            .catch(() => {});
        return;
    }

    // No local key -> Wait for Gist (max 3s)
    console.log('[Config] MapTiler key: Waiting for Gist...');
    await Promise.race([
        fetch(GIST_URL, { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const keys = extractGistKeys(data);
                if (keys.length > 0) {
                    const idx = Math.floor(Math.random() * keys.length);
                    state.MK = keys[idx];
                    console.log(`[Config] MapTiler key: Gist (${idx + 1}/${keys.length})`);
                }
            })
            .catch(() => { console.warn('[Config] Gist inaccessible'); }),
        new Promise<void>(resolve => setTimeout(resolve, 3000))
    ]);
}
