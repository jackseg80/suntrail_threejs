import { describe, expect, it, vi } from 'vitest';
import { ReleaseFlagRegistry } from './releaseFlags';

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length(): number {
        return this.values.size;
    }
    clear(): void {
        this.values.clear();
    }
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

function response(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('ReleaseFlagRegistry', () => {
    it('keeps release flags separate with safe build defaults', () => {
        const registry = new ReleaseFlagRegistry({ storage: null });
        expect(registry.getDecision('preparedRoutes')).toMatchObject({
            enabled: true,
            source: 'build',
        });
        expect(registry.getDecision('guidanceForeground')).toMatchObject({
            enabled: true,
            source: 'build',
        });
        expect(registry.isEnabled('nativeGuidance')).toBe(false);
        expect(registry.isEnabled('accountSync')).toBe(false);
    });

    it('applies a versioned remote override while its TTL is valid', async () => {
        let now = 1_000;
        const registry = new ReleaseFlagRegistry({
            storage: new MemoryStorage(),
            remoteUrl: 'https://flags.example.test/release.json',
            now: () => now,
            fetcher: vi.fn(async () =>
                response({
                    schemaVersion: 1,
                    revision: 4,
                    ttlSeconds: 60,
                    flags: { preparedRoutes: false },
                })
            ),
        });

        expect(await registry.refresh()).toBe(true);
        expect(registry.getDecision('preparedRoutes')).toMatchObject({
            enabled: false,
            source: 'remote',
            reason: 'remote revision 4',
        });
        now += 61_000;
        expect(registry.getDecision('preparedRoutes')).toMatchObject({
            enabled: true,
            source: 'build',
        });
    });

    it('uses a fresh last-known-good cache when refresh fails', async () => {
        const storage = new MemoryStorage();
        const successful = new ReleaseFlagRegistry({
            storage,
            remoteUrl: 'https://flags.example.test/release.json',
            now: () => 2_000,
            fetcher: vi.fn(async () =>
                response({
                    schemaVersion: 1,
                    revision: 2,
                    ttlSeconds: 120,
                    flags: { preparedRoutes: false },
                })
            ),
        });
        await successful.refresh();

        const offline = new ReleaseFlagRegistry({
            storage,
            remoteUrl: 'https://flags.example.test/release.json',
            now: () => 3_000,
            fetcher: vi.fn(async () => {
                throw new Error('offline');
            }),
        });
        expect(await offline.refresh()).toBe(false);
        expect(offline.getDecision('preparedRoutes').source).toBe('remote');
        expect(offline.isEnabled('preparedRoutes')).toBe(false);
    });

    it('gives the local developer override the highest priority', async () => {
        const registry = new ReleaseFlagRegistry({
            storage: new MemoryStorage(),
            remoteUrl: 'https://flags.example.test/release.json',
            fetcher: vi.fn(async () =>
                response({
                    schemaVersion: 1,
                    revision: 1,
                    ttlSeconds: 120,
                    flags: { preparedRoutes: false },
                })
            ),
        });
        await registry.refresh();
        registry.setDeveloperOverride('preparedRoutes', true);
        expect(registry.getDecision('preparedRoutes')).toMatchObject({
            enabled: true,
            source: 'developer',
        });
        registry.setDeveloperOverride('preparedRoutes', null);
        expect(registry.isEnabled('preparedRoutes')).toBe(false);
    });
});
