import { afterEach, beforeEach, vi } from 'vitest';

function installDeterministicMatchMedia(): void {
    if (
        typeof window === 'undefined' ||
        typeof window.matchMedia === 'function'
    )
        return;
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn().mockReturnValue(false),
        })),
    });
}

installDeterministicMatchMedia();

/**
 * Unit tests must never issue real network requests. Apart from making tests
 * flaky, pending Happy DOM fetches are reported as AbortError during teardown.
 * Suites needing a response replace this deterministic 404 mock explicitly.
 */
function installDeterministicFetch(): void {
    const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined')
        window.fetch = fetchMock as typeof window.fetch;
}

beforeEach(() => {
    installDeterministicMatchMedia();
    installDeterministicFetch();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    installDeterministicFetch();
    document.body.replaceChildren();
});

// Mock Canvas API for Happy-DOM / JSDOM
// @ts-ignore happy-dom lacks full Canvas types
if (typeof HTMLCanvasElement !== 'undefined') {
    // @ts-ignore happy-dom lacks full Canvas types
    HTMLCanvasElement.prototype.getContext = vi
        .fn()
        .mockImplementation(function (this: HTMLCanvasElement, type: string) {
            if (type === '2d') {
                return {
                    beginPath: vi.fn(),
                    arc: vi.fn(),
                    fill: vi.fn(),
                    stroke: vi.fn(),
                    fillRect: vi.fn(),
                    clearRect: vi.fn(),
                    drawImage: vi.fn(),
                    measureText: vi.fn().mockReturnValue({ width: 0 }),
                    strokeText: vi.fn(),
                    fillText: vi.fn(),
                    moveTo: vi.fn(),
                    lineTo: vi.fn(),
                    closePath: vi.fn(),
                    putImageData: vi.fn(),
                    createImageData: vi
                        .fn()
                        .mockReturnValue({ data: new Uint8ClampedArray() }),
                    setTransform: vi.fn(),
                    translate: vi.fn(),
                    rotate: vi.fn(),
                    scale: vi.fn(),
                    canvas: this,
                };
            }
            if (type === 'webgl' || type === 'webgl2') {
                return {
                    getExtension: vi.fn().mockReturnValue({
                        UNMASKED_RENDERER_WEBGL: 0x9246,
                        UNMASKED_VENDOR_WEBGL: 0x9245,
                    }),
                    getParameter: vi.fn().mockImplementation((p) => {
                        if (p === 0x9246) return 'Mock Renderer';
                        if (p === 0x9245) return 'Mock Vendor';
                        return null;
                    }),
                    canvas: this,
                    bindTexture: vi.fn(),
                    texImage2D: vi.fn(),
                    texParameteri: vi.fn(),
                    createTexture: vi.fn(),
                    deleteTexture: vi.fn(),
                    viewport: vi.fn(),
                    clearColor: vi.fn(),
                    clear: vi.fn(),
                    createProgram: vi.fn(),
                    linkProgram: vi.fn(),
                    useProgram: vi.fn(),
                    getProgramParameter: vi.fn().mockReturnValue(true),
                    getAttribLocation: vi.fn().mockReturnValue(0),
                    getUniformLocation: vi.fn().mockReturnValue({}),
                    createShader: vi.fn(),
                    shaderSource: vi.fn(),
                    compileShader: vi.fn(),
                    getShaderParameter: vi.fn().mockReturnValue(true),
                    enable: vi.fn(),
                    disable: vi.fn(),
                    depthFunc: vi.fn(),
                    frontFace: vi.fn(),
                    cullFace: vi.fn(),
                    blendFunc: vi.fn(),
                    pixelStorei: vi.fn(),
                };
            }
            return null;
        });
}

// Global mock for requestAnimationFrame
if (typeof window !== 'undefined' && !window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
}

// Global mock for caches API
if (typeof global !== 'undefined' && !(global as any).caches) {
    (global as any).caches = {
        open: vi.fn().mockResolvedValue({
            match: vi.fn().mockResolvedValue(null),
            put: vi.fn().mockResolvedValue(undefined),
        }),
    };
}

// Global mock for Supabase
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        auth: {
            getSession: vi
                .fn()
                .mockResolvedValue({ data: { session: null }, error: null }),
            onAuthStateChange: vi.fn((_cb) => {
                return { data: { subscription: { unsubscribe: vi.fn() } } };
            }),
            signInWithPassword: vi.fn(),
            signUp: vi.fn(),
            signOut: vi.fn(),
            signInWithOAuth: vi.fn().mockResolvedValue({
                data: { url: 'https://oauth.example.com' },
                error: null,
            }),
            linkIdentity: vi.fn().mockResolvedValue({
                data: { url: 'https://oauth.example.com' },
                error: null,
            }),
            exchangeCodeForSession: vi
                .fn()
                .mockResolvedValue({ data: {}, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
}));

// Global mock for @capacitor/core
vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: vi.fn(() => false),
        getPlatform: vi.fn(() => 'web'),
        isPluginAvailable: vi.fn(() => false),
    },
    registerPlugin: vi.fn(() => ({})),
}));

// Global mock for @capacitor/browser
vi.mock('@capacitor/browser', () => ({
    Browser: {
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    },
}));
