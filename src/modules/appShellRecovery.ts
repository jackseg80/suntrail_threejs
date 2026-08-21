type CacheStore = Pick<CacheStorage, 'keys' | 'delete'>;
type ServiceWorkerStore = Pick<ServiceWorkerContainer, 'getRegistrations'>;

export interface AppShellRecoveryEnvironment {
    version: string;
    sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    cacheStorage?: CacheStore;
    serviceWorker?: ServiceWorkerStore;
    reload: () => void;
}

const STALE_SHELL_RECOVERY_PREFIX = 'suntrail_stale_shell_recovery:';

function recoveryKey(version: string): string {
    return `${STALE_SHELL_RECOVERY_PREFIX}${version}`;
}

/**
 * A hashed dynamic chunk missing while the entry module still loads means the
 * WebView is serving a mixed PWA shell after an update. Retrying the import
 * cannot repair that state: the shell must be refreshed first.
 */
export function isStaleDynamicImportFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
        message
    );
}

/**
 * Removes only Workbox's app-shell precache. Map runtime caches, local data,
 * recordings and settings deliberately remain untouched.
 *
 * A session guard prevents an infinite reload if a browser cannot recover.
 */
export async function recoverStaleAppShell(
    environment: AppShellRecoveryEnvironment
): Promise<boolean> {
    const key = recoveryKey(environment.version);
    if (environment.sessionStorage.getItem(key)) return false;

    environment.sessionStorage.setItem(key, '1');
    try {
        const cacheNames = (await environment.cacheStorage?.keys()) ?? [];
        const staleShellCaches = cacheNames.filter((name) =>
            name.startsWith('workbox-')
        );
        await Promise.all(
            staleShellCaches.map((name) =>
                environment.cacheStorage!.delete(name)
            )
        );

        const registrations =
            (await environment.serviceWorker?.getRegistrations()) ?? [];
        await Promise.all(
            registrations.map((registration) => registration.unregister())
        );
    } finally {
        environment.reload();
    }
    return true;
}

/** Clears the one-shot guard only after all lazy UI modules loaded successfully. */
export function markAppShellHealthy(
    sessionStorage: Pick<Storage, 'removeItem'>,
    version: string
): void {
    sessionStorage.removeItem(recoveryKey(version));
}
