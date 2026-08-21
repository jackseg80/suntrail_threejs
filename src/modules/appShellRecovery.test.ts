import { describe, expect, it, vi } from 'vitest';
import {
    isStaleDynamicImportFailure,
    markAppShellHealthy,
    recoverStaleAppShell,
    type AppShellRecoveryEnvironment,
} from './appShellRecovery';

function createEnvironment(): AppShellRecoveryEnvironment & {
    reloadMock: ReturnType<typeof vi.fn>;
    cacheStorage: {
        keys: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
    };
    serviceWorker: { getRegistrations: ReturnType<typeof vi.fn> };
    sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
} {
    const values = new Map<string, string>();
    const reloadMock = vi.fn();
    return {
        version: 'test-version',
        sessionStorage: {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key),
        },
        cacheStorage: {
            keys: vi
                .fn()
                .mockResolvedValue([
                    'workbox-precache-v2',
                    'maptiler-cache-v5.11',
                ]),
            delete: vi.fn().mockResolvedValue(true),
        },
        serviceWorker: {
            getRegistrations: vi
                .fn()
                .mockResolvedValue([
                    { unregister: vi.fn().mockResolvedValue(true) },
                ]),
        },
        reload: () => reloadMock(),
        reloadMock,
    };
}

describe('appShellRecovery', () => {
    it('identifie les erreurs de chunks hachés devenus obsolètes', () => {
        expect(
            isStaleDynamicImportFailure(
                new TypeError('Failed to fetch dynamically imported module')
            )
        ).toBe(true);
        expect(
            isStaleDynamicImportFailure(
                new Error('Importing a module script failed')
            )
        ).toBe(true);
        expect(isStaleDynamicImportFailure(new Error('Network offline'))).toBe(
            false
        );
    });

    it('purge seulement le shell Workbox, puis recharge une seule fois', async () => {
        const environment = createEnvironment();

        await expect(recoverStaleAppShell(environment)).resolves.toBe(true);
        expect(environment.cacheStorage.delete).toHaveBeenCalledWith(
            'workbox-precache-v2'
        );
        expect(environment.cacheStorage.delete).not.toHaveBeenCalledWith(
            'maptiler-cache-v5.11'
        );
        expect(environment.reloadMock).toHaveBeenCalledOnce();
        await expect(recoverStaleAppShell(environment)).resolves.toBe(false);

        markAppShellHealthy(environment.sessionStorage, environment.version);
        await expect(recoverStaleAppShell(environment)).resolves.toBe(true);
    });
});
