export type ReleaseFlagId =
    | 'preparedRoutes'
    | 'guidanceForeground'
    | 'routeReadiness'
    | 'routeCorridor'
    | 'accountSync'
    | 'nativeGuidance'
    | 'expertWorkbench';

export type ReleaseFlags = Record<ReleaseFlagId, boolean>;

export const DEFAULT_RELEASE_FLAGS: Readonly<ReleaseFlags> = Object.freeze({
    preparedRoutes: true,
    guidanceForeground: true,
    routeReadiness: true,
    routeCorridor: true,
    accountSync: false,
    nativeGuidance: false,
    expertWorkbench: false,
});

const REMOTE_CACHE_KEY = 'suntrail_release_flags_lkg_v1';
const DEVELOPER_OVERRIDE_KEY = 'suntrail_release_flags_dev_v1';

interface RemoteReleaseFlagsPayload {
    schemaVersion: 1;
    revision: number;
    ttlSeconds: number;
    flags: Partial<ReleaseFlags>;
}

interface CachedReleaseFlagsPayload extends RemoteReleaseFlagsPayload {
    fetchedAt: number;
}

export interface ReleaseFlagDecision {
    enabled: boolean;
    source: 'build' | 'remote' | 'developer';
    reason: string;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface ReleaseFlagRegistryOptions {
    defaults?: Partial<ReleaseFlags>;
    storage?: StorageLike | null;
    fetcher?: typeof fetch;
    remoteUrl?: string;
    now?: () => number;
}

function isFlagId(value: string): value is ReleaseFlagId {
    return value in DEFAULT_RELEASE_FLAGS;
}

function sanitizeFlags(value: unknown): Partial<ReleaseFlags> {
    if (typeof value !== 'object' || value === null) return {};
    const result: Partial<ReleaseFlags> = {};
    for (const [key, flag] of Object.entries(value)) {
        if (isFlagId(key) && typeof flag === 'boolean') result[key] = flag;
    }
    return result;
}

function parseRemotePayload(value: unknown): RemoteReleaseFlagsPayload | null {
    if (typeof value !== 'object' || value === null) return null;
    const payload = value as Record<string, unknown>;
    if (
        payload.schemaVersion !== 1 ||
        !Number.isInteger(payload.revision) ||
        Number(payload.revision) < 0 ||
        !Number.isFinite(payload.ttlSeconds) ||
        Number(payload.ttlSeconds) <= 0
    ) {
        return null;
    }
    return {
        schemaVersion: 1,
        revision: Number(payload.revision),
        ttlSeconds: Math.min(Number(payload.ttlSeconds), 7 * 24 * 60 * 60),
        flags: sanitizeFlags(payload.flags),
    };
}

export class ReleaseFlagRegistry {
    private readonly defaults: ReleaseFlags;
    private readonly storage: StorageLike | null;
    private readonly fetcher: typeof fetch | undefined;
    private readonly remoteUrl: string;
    private readonly now: () => number;
    private cachedRemote: CachedReleaseFlagsPayload | null = null;
    private developerOverrides: Partial<ReleaseFlags> = {};

    constructor(options: ReleaseFlagRegistryOptions = {}) {
        this.defaults = {
            ...DEFAULT_RELEASE_FLAGS,
            ...sanitizeFlags(options.defaults ?? {}),
        };
        this.storage =
            options.storage === undefined
                ? typeof localStorage === 'undefined'
                    ? null
                    : localStorage
                : options.storage;
        this.fetcher =
            options.fetcher ??
            (typeof fetch === 'undefined' ? undefined : fetch.bind(globalThis));
        this.remoteUrl =
            options.remoteUrl ??
            String(
                (import.meta.env as Record<string, string | undefined>)[
                    'VITE_RELEASE_FLAGS_URL'
                ] ?? ''
            );
        this.now = options.now ?? (() => Date.now());
        this.loadPersistedState();
    }

    public isEnabled(flag: ReleaseFlagId): boolean {
        return this.getDecision(flag).enabled;
    }

    public getDecision(flag: ReleaseFlagId): ReleaseFlagDecision {
        if (typeof this.developerOverrides[flag] === 'boolean') {
            return {
                enabled: this.developerOverrides[flag]!,
                source: 'developer',
                reason: 'developer override',
            };
        }
        if (this.cachedRemote && this.isCacheFresh(this.cachedRemote)) {
            const value = this.cachedRemote.flags[flag];
            if (typeof value === 'boolean') {
                return {
                    enabled: value,
                    source: 'remote',
                    reason: `remote revision ${this.cachedRemote.revision}`,
                };
            }
        }
        return {
            enabled: this.defaults[flag],
            source: 'build',
            reason: this.cachedRemote
                ? 'remote override expired or flag absent'
                : 'build default',
        };
    }

    public setDeveloperOverride(
        flag: ReleaseFlagId,
        enabled: boolean | null
    ): void {
        if (enabled === null) delete this.developerOverrides[flag];
        else this.developerOverrides[flag] = enabled;
        this.persistDeveloperOverrides();
    }

    public clearDeveloperOverrides(): void {
        this.developerOverrides = {};
        try {
            this.storage?.removeItem(DEVELOPER_OVERRIDE_KEY);
        } catch {
            // Storage is optional; in-memory defaults remain usable.
        }
    }

    public async refresh(): Promise<boolean> {
        if (!this.remoteUrl || !this.fetcher) return false;
        try {
            const response = await this.fetcher(this.remoteUrl, {
                cache: 'no-store',
            });
            if (!response.ok) return false;
            const payload = parseRemotePayload(await response.json());
            if (!payload) return false;
            if (
                this.cachedRemote &&
                payload.revision < this.cachedRemote.revision
            ) {
                return false;
            }
            this.cachedRemote = { ...payload, fetchedAt: this.now() };
            try {
                this.storage?.setItem(
                    REMOTE_CACHE_KEY,
                    JSON.stringify(this.cachedRemote)
                );
            } catch {
                // The valid remote flags still apply for this session.
            }
            return true;
        } catch {
            // Last-known-good cache remains active until its TTL expires.
            return false;
        }
    }

    private isCacheFresh(payload: CachedReleaseFlagsPayload): boolean {
        return this.now() - payload.fetchedAt <= payload.ttlSeconds * 1000;
    }

    private loadPersistedState(): void {
        if (!this.storage) return;
        try {
            const rawCache = this.storage.getItem(REMOTE_CACHE_KEY);
            if (rawCache) {
                const parsed = JSON.parse(rawCache) as Record<string, unknown>;
                const payload = parseRemotePayload(parsed);
                if (
                    payload &&
                    Number.isFinite(parsed.fetchedAt) &&
                    Number(parsed.fetchedAt) >= 0
                ) {
                    this.cachedRemote = {
                        ...payload,
                        fetchedAt: Number(parsed.fetchedAt),
                    };
                }
            }
            const rawOverrides = this.storage.getItem(DEVELOPER_OVERRIDE_KEY);
            if (rawOverrides) {
                this.developerOverrides = sanitizeFlags(
                    JSON.parse(rawOverrides)
                );
            }
        } catch {
            this.cachedRemote = null;
            this.developerOverrides = {};
        }
    }

    private persistDeveloperOverrides(): void {
        try {
            this.storage?.setItem(
                DEVELOPER_OVERRIDE_KEY,
                JSON.stringify(this.developerOverrides)
            );
        } catch {
            // Developer overrides are still effective for this session.
        }
    }
}

export const releaseFlags = new ReleaseFlagRegistry();
