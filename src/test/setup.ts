import { vi } from 'vitest';

// Mock Canvas API for Happy-DOM / JSDOM
// @ts-ignore
if (typeof HTMLCanvasElement !== 'undefined') {
    // @ts-ignore
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(function(this: HTMLCanvasElement, type: string) {
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
                createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray() }),
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
            put: vi.fn().mockResolvedValue(undefined)
        })
    };
}
