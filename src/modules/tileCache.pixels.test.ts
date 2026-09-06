import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { restoreCachedPixelData, type CachedTileData } from './tileCache';

vi.mock('./state', () => ({ state: {} }));
vi.mock('./utils', () => ({ isMobileDevice: () => true }));

describe('cached elevation pixels', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function fixture() {
        const image = { width: 2, height: 1, close: vi.fn() };
        const data: CachedTileData = {
            elev: new THREE.Texture(image as any),
            color: new THREE.Texture(),
            overlay: null,
            normal: null,
            pixelData: null,
        };
        const pixels = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
        const ctx = {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: pixels })),
        };
        const canvas = { width: 2, height: 1, getContext: vi.fn(() => ctx) };
        vi.stubGlobal(
            'OffscreenCanvas',
            vi.fn(function () {
                return canvas;
            })
        );
        return { data, image, pixels, ctx, canvas };
    }

    it('restores exact RGBA data once, keeping the cached image and textures intact', () => {
        const { data, image, pixels, ctx, canvas } = fixture();
        const dispose = vi.spyOn(data.elev, 'dispose');
        expect(restoreCachedPixelData(data)).toBe(pixels);
        expect(restoreCachedPixelData(data)).toBe(pixels);
        expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(image, 0, 0);
        expect(canvas.getContext).toHaveBeenCalledWith('2d', {
            alpha: false,
            willReadFrequently: true,
        });
        expect(data.elev.image).toBe(image);
        expect(dispose).not.toHaveBeenCalled();
        expect(image.close).not.toHaveBeenCalled();
        expect(canvas.width).toBe(1);
        expect(canvas.height).toBe(1);
    });

    it('allows normal loading fallback if bitmap readback fails', () => {
        const { data, ctx, canvas } = fixture();
        ctx.drawImage.mockImplementation(() => {
            throw new Error('bitmap unavailable');
        });
        expect(restoreCachedPixelData(data)).toBeNull();
        expect(data.pixelData).toBeNull();
        expect(canvas.width).toBe(1);
    });

    it('supports browsers without OffscreenCanvas', () => {
        const { data, pixels, canvas } = fixture();
        vi.stubGlobal('OffscreenCanvas', undefined);
        vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as any);
        expect(restoreCachedPixelData(data)).toBe(pixels);
    });

    it('does not decode missing or closed images', () => {
        const { data, image, ctx } = fixture();
        image.width = 0;
        expect(restoreCachedPixelData(data)).toBeNull();
        expect(ctx.drawImage).not.toHaveBeenCalled();
    });
});
