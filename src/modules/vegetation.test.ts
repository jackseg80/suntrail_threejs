import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { createForestForTile, initVegetationResources } from './vegetation';
import { state } from './state';

vi.mock('./landcover', () => ({
    fetchLandcoverPBF: vi.fn().mockResolvedValue(null),
    isPointInForest: vi.fn().mockReturnValue(false)
}));

describe('vegetation.ts', () => {
    let mockTile: any;

    beforeEach(() => {
        vi.resetAllMocks();
        state.SHOW_VEGETATION = true;
        state.VEGETATION_DENSITY = 100;
        state.RELIEF_EXAGGERATION = 1.0;
        state.PERFORMANCE_PRESET = 'balanced';
        state.MAP_SOURCE = 'outdoor';

        // Couleurs SwissTopo forêt : G légèrement dominant (220>210>180)
        // Ajout d'une légère variation (jitter) pour passer le filtre variance (Phase 1)
        const mockImageData = {
            data: new Uint8ClampedArray(48 * 48 * 4).map((_, i) => {
                const ch = i % 4;
                const pixelIdx = Math.floor(i / 4);
                const jitter = (pixelIdx % 2 === 0) ? 2 : 0; // Alterne +2 sur le vert pour créer de la variance
                if (ch === 0) return 210; 
                if (ch === 1) return 220 + jitter; // G dominant avec texture
                if (ch === 2) return 180; 
                return 255;              
            })
        };

        const mockCtx = {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => mockImageData)
        };

        const mockCanvas = {
            getContext: () => mockCtx,
            width: 48,
            height: 48
        };

        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName === 'canvas') return mockCanvas as any;
            return {} as any;
        });

        // Élévation encodée MapTiler
        const mockPixelData = new Uint8ClampedArray(256 * 256 * 4).map((_, i) => {
            const ch = i % 4;
            if (ch === 0) return 1;
            if (ch === 1) return 193;
            if (ch === 2) return 56;
            return 0;
        });

        mockTile = {
            zoom: 15,
            tx: 4270, ty: 2891,
            colorTex: { image: { width: 256, height: 256 } },
            pixelData: mockPixelData,
            colorScale: 1.0,
            colorOffset: { x: 0, y: 0 },
            elevScale: 1.0,
            elevOffset: { x: 0, y: 0 },
            tileSizeMeters: 500,
            lngLatToLocal: () => new THREE.Vector3(0, 0, 0),
            mesh: { position: new THREE.Vector3(0, 0, 0) }
        };
    });

    it('should initialize and create a forest group', async () => {
        initVegetationResources();
        const forest = await createForestForTile(mockTile);
        
        expect(forest).not.toBeNull();
        expect(forest).toBeInstanceOf(THREE.Group);
        expect(forest!.children.length).toBeGreaterThan(0);
        
        const iMesh = forest!.children[0] as THREE.InstancedMesh;
        expect(iMesh.frustumCulled).toBe(false);
    });

    it('should respect the SHOW_VEGETATION flag', async () => {
        state.SHOW_VEGETATION = false;
        const forest = await createForestForTile(mockTile);
        expect(forest).toBeNull();
    });
});
