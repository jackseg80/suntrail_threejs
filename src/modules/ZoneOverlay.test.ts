import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

const { mockState, mockStateProxy } = vi.hoisted(() => {
    const state: Record<string, any> = {};
    const proxy = new Proxy(state, {
        get(target, prop) {
            return target[prop as string];
        },
        set(target, prop, value) {
            target[prop as string] = value;
            return true;
        },
    });
    return {
        mockState: state,
        mockStateProxy: proxy,
    };
});

vi.mock('./state', () => ({
    state: mockStateProxy,
}));

const { mockLngLatToWorld } = vi.hoisted(() => ({
    mockLngLatToWorld: vi.fn((lon, lat, _origin) => ({
        x: lon * 1000,
        z: lat * 1000,
    })),
}));

vi.mock('./geo', () => ({
    lngLatToWorld: mockLngLatToWorld,
}));

const { mockGetAltitudeAt } = vi.hoisted(() => ({
    mockGetAltitudeAt: vi.fn(() => 500),
}));

vi.mock('./analysis', () => ({
    getAltitudeAt: mockGetAltitudeAt,
}));

import { ZoneOverlay } from './ZoneOverlay';

function createFakeScene() {
    const scene = new THREE.Scene();
    vi.spyOn(scene, 'add');
    vi.spyOn(scene, 'remove');
    return scene;
}

describe('ZoneOverlay', () => {
    let overlay: ZoneOverlay;
    let scene: THREE.Scene;

    const testBbox = {
        minLat: 46.0,
        maxLat: 47.0,
        minLon: 6.0,
        maxLon: 7.0,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.originTile = { x: 0, y: 0, z: 0 };
        mockState.controls = null;
        scene = createFakeScene();
        mockState.scene = scene;
        overlay = new ZoneOverlay();
    });

    afterEach(() => {
        overlay.dispose();
    });

    describe('isLocked', () => {
        it('retourne true si le mode est cached', () => {
            overlay.show(testBbox, 'cached');
            expect(overlay.isLocked).toBe(true);
        });

        it("retourne false si le mode n'est pas cached", () => {
            overlay.show(testBbox, 'selecting');
            expect(overlay.isLocked).toBe(false);

            overlay.setMode('downloading');
            expect(overlay.isLocked).toBe(false);
        });
    });

    describe('show', () => {
        it('ajoute un groupe à la scène avec un fill mesh', () => {
            overlay.show(testBbox);
            expect(scene.add).toHaveBeenCalledWith(expect.any(THREE.Group));
            const group = (scene.add as any).mock.calls[0][0] as THREE.Group;
            expect(group.children.length).toBeGreaterThanOrEqual(1);
            const fill = group.children.find((c) => c instanceof THREE.Mesh);
            expect(fill).toBeDefined();
        });

        it('utilise la couleur orange en mode selecting', () => {
            overlay.show(testBbox, 'selecting');
            const group = (scene.add as any).mock.calls[0][0] as THREE.Group;
            const fill = group.children.find(
                (c) => c instanceof THREE.Mesh
            ) as THREE.Mesh;
            const mat = fill.material as THREE.MeshBasicMaterial;
            expect(mat.color.getHex()).toBe(0xff8800);
        });

        it('utilise la couleur bleue en mode cached', () => {
            overlay.show(testBbox, 'cached');
            const group = (scene.add as any).mock.calls[0][0] as THREE.Group;
            const fill = group.children.find(
                (c) => c instanceof THREE.Mesh
            ) as THREE.Mesh;
            const mat = fill.material as THREE.MeshBasicMaterial;
            expect(mat.color.getHex()).toBe(0x3366ff);
        });

        it('utilise la couleur verte en mode downloading', () => {
            overlay.show(testBbox, 'downloading');
            const group = (scene.add as any).mock.calls[0][0] as THREE.Group;
            const fill = group.children.find(
                (c) => c instanceof THREE.Mesh
            ) as THREE.Mesh;
            const mat = fill.material as THREE.MeshBasicMaterial;
            expect(mat.color.getHex()).toBe(0x00ff66);
        });

        it('crée des bordures en mode downloading et cached, pas en selecting', () => {
            overlay.show(testBbox, 'selecting');
            let group = (scene.add as any).mock.calls[0][0] as THREE.Group;
            const borders = group.children.filter(
                (c) =>
                    c instanceof THREE.Mesh &&
                    c !== group.children.find((f) => f instanceof THREE.Mesh)
            );
            expect(borders.length).toBe(0);

            (scene.add as any).mockClear();
            overlay.show(testBbox, 'downloading');
            group = (scene.add as any).mock.calls[0][0] as THREE.Group;
            const meshes = group.children.filter(
                (c) => c instanceof THREE.Mesh
            );
            expect(meshes.length).toBeGreaterThanOrEqual(5);

            (scene.add as any).mockClear();
            overlay.show(testBbox, 'cached');
            group = (scene.add as any).mock.calls[0][0] as THREE.Group;
            const meshesCached = group.children.filter(
                (c) => c instanceof THREE.Mesh
            );
            expect(meshesCached.length).toBeGreaterThanOrEqual(5);
        });
    });

    describe('setMode', () => {
        it('change la couleur en appelant show avec le nouveau mode', () => {
            overlay.show(testBbox);
            const sceneAddCalls = (scene.add as any).mock.calls.length;

            overlay.setMode('cached');
            expect((scene.add as any).mock.calls.length).toBeGreaterThan(
                sceneAddCalls
            );
            const group = (scene.add as any).mock.calls[
                (scene.add as any).mock.calls.length - 1
            ][0] as THREE.Group;
            const fill = group.children.find(
                (c) => c instanceof THREE.Mesh
            ) as THREE.Mesh;
            const mat = fill.material as THREE.MeshBasicMaterial;
            expect(mat.color.getHex()).toBe(0x3366ff);
        });

        it('met à jour le bbox si overrideBbox est fourni', () => {
            const newBbox = {
                minLat: 45.0,
                maxLat: 46.0,
                minLon: 5.0,
                maxLon: 6.0,
            };
            overlay.show(testBbox);
            overlay.setMode('downloading', newBbox);
            expect(mockLngLatToWorld).toHaveBeenCalledWith(
                (newBbox.minLon + newBbox.maxLon) / 2,
                (newBbox.minLat + newBbox.maxLat) / 2,
                mockState.originTile
            );
        });
    });

    describe('hide', () => {
        it('retire le groupe de la scène et vide currentBbox', () => {
            overlay.show(testBbox);
            expect(scene.add).toHaveBeenCalled();

            overlay.hide();
            expect(scene.remove).toHaveBeenCalled();
            expect(overlay['currentBbox']).toBeNull();
        });

        it('ne fait rien si aucun groupe ni scène', () => {
            mockState.scene = null;
            overlay['currentBbox'] = testBbox;
            overlay.hide();
            expect(overlay['currentBbox']).toBeNull();
        });
    });

    describe('updateFromBBox', () => {
        it("met à jour le bbox courant et recrée l'overlay", () => {
            overlay.show(testBbox);
            const newBbox = {
                minLat: 45.0,
                maxLat: 46.0,
                minLon: 5.0,
                maxLon: 6.0,
            };
            (scene.add as any).mockClear();
            overlay.updateFromBBox(newBbox);
            expect((scene.add as any).mock.calls.length).toBe(1);
            expect(overlay['currentBbox']).toEqual(newBbox);
        });
    });

    describe('update', () => {
        it("recrée l'overlay si un bbox est défini", () => {
            overlay.show(testBbox);
            (scene.add as any).mockClear();
            overlay.update();
            expect((scene.add as any).mock.calls.length).toBe(1);
        });

        it('ne fait rien si aucun bbox', () => {
            overlay.update();
            expect(scene.add).not.toHaveBeenCalled();
        });
    });
});
