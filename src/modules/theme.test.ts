import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState, mockEventBus } = vi.hoisted(() => ({
    mockState: {
        themePreference: 'auto' as 'auto' | 'light' | 'dark',
        subscribe: vi.fn(),
    },
    mockEventBus: { emit: vi.fn() },
}));

vi.mock('./state', () => ({ state: mockState, saveSettings: vi.fn() }));
vi.mock('./eventBus', () => ({ eventBus: mockEventBus }));

describe('getEffectiveTheme()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi
                .fn()
                .mockReturnValue({ matches: false, addEventListener: vi.fn() }),
        });
    });

    it('retourne "dark" si themePreference est "dark"', async () => {
        mockState.themePreference = 'dark';
        const { getEffectiveTheme } = await import('./theme');
        expect(getEffectiveTheme()).toBe('dark');
    });

    it('retourne "light" si themePreference est "light"', async () => {
        mockState.themePreference = 'light';
        const { getEffectiveTheme } = await import('./theme');
        expect(getEffectiveTheme()).toBe('light');
    });

    it('retourne "dark" si auto et matchMedia dark', async () => {
        mockState.themePreference = 'auto';
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi
                .fn()
                .mockReturnValue({ matches: true, addEventListener: vi.fn() }),
        });
        const { getEffectiveTheme } = await import('./theme');
        expect(getEffectiveTheme()).toBe('dark');
    });

    it('retourne "light" si auto et matchMedia pas dark', async () => {
        mockState.themePreference = 'auto';
        const { getEffectiveTheme } = await import('./theme');
        expect(getEffectiveTheme()).toBe('light');
    });
});

describe('initTheme()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        document.documentElement.dataset.theme = '';
        document.head.innerHTML = '';
        mockState.themePreference = 'light';
        mockState.subscribe = vi.fn();
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi
                .fn()
                .mockReturnValue({ matches: false, addEventListener: vi.fn() }),
        });
    });

    afterEach(() => {
        document.documentElement.dataset.theme = '';
        document.head.innerHTML = '';
    });

    it('applique le thème à dataset.theme', async () => {
        const { initTheme } = await import('./theme');
        initTheme();
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('crée meta[name="theme-color"] si absent', async () => {
        const { initTheme } = await import('./theme');
        initTheme();
        expect(
            document.querySelector('meta[name="theme-color"]')
        ).not.toBeNull();
    });

    it('définit meta theme-color sur la valeur light', async () => {
        const { initTheme } = await import('./theme');
        initTheme();
        const meta = document.querySelector<HTMLMetaElement>(
            'meta[name="theme-color"]'
        );
        expect(meta?.content).toBe('#f5f5f0');
    });

    it('émet themeChanged au démarrage', async () => {
        const { initTheme } = await import('./theme');
        initTheme();
        expect(mockEventBus.emit).toHaveBeenCalledWith('themeChanged', {
            theme: 'light',
        });
    });

    it('subscribe aux changements de themePreference', async () => {
        const { initTheme } = await import('./theme');
        initTheme();
        expect(mockState.subscribe).toHaveBeenCalledWith(
            'themePreference',
            expect.any(Function)
        );
    });
});
