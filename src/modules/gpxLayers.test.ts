import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
    activateGPXLayer,
    addGPXLayer,
    hideAllGPXLayers,
    removeGPXLayer,
    showOnlyGPXLayer,
    updateAllGPXMeshes,
    updateRecordedTrackMesh,
} from './gpxLayers';
import { state } from './state';
import { closeElevationProfile, updateElevationProfile } from './profile';

vi.mock('./profile', () => ({
    updateElevationProfile: vi.fn(),
    closeElevationProfile: vi.fn(),
}));

vi.mock('./solarRoute', () => ({
    disposeSolarOverlay: vi.fn(),
    buildSolarOverlay: vi.fn(),
    setOverlayVisible: vi.fn(),
    getCurrentRouteSolarAnalysis: vi.fn(),
    scheduleRouteSolarAnalysis: vi.fn(),
    invalidateRouteCache: vi.fn(),
    clearSolarRouteAnalysis: vi.fn(),
}));

const mockCloseElevationProfile = closeElevationProfile as ReturnType<
    typeof vi.fn
>;
const mockUpdateElevationProfile = updateElevationProfile as ReturnType<
    typeof vi.fn
>;

const rawData = {
    tracks: [
        {
            points: [
                {
                    lat: 46.5,
                    lon: 7.5,
                    ele: 1000,
                    time: '2024-01-01T10:00:00Z',
                },
                {
                    lat: 46.5,
                    lon: 7.5,
                    ele: 1000,
                    time: '2024-01-01T10:01:00Z',
                },
                {
                    lat: 46.51,
                    lon: 7.51,
                    ele: 1010,
                    time: '2024-01-01T10:20:00Z',
                },
                {
                    lat: 46.51,
                    lon: 7.51,
                    ele: 1010,
                    time: '2024-01-01T10:21:00Z',
                },
            ],
        },
    ],
};

describe('Multi-GPX Layers (v5.10)', () => {
    beforeEach(() => {
        state.gpxLayers = [];
        state.scene = new THREE.Scene();
        state.scene.add = vi.fn();
        state.scene.remove = vi.fn();

        state.originTile = { x: 2130, y: 1445, z: 12 };
        state.camera = new THREE.PerspectiveCamera();
        state.camera.position.set(0, 1000, 0);
    });

    it('addGPXLayer: should create a layer with correct structure', () => {
        const layer = addGPXLayer(rawData, 'test-track');
        expect(layer.name).toBe('test-track');
        expect(layer.stats.pointCount).toBe(4);
        expect(layer.stats.dPlus).toBeGreaterThan(5);
        expect(state.scene!.add).toHaveBeenCalled();
    });

    it('showOnlyGPXLayer keeps exactly the selected loaded trace visible', () => {
        const first = addGPXLayer(rawData, 'first', { forceVisible: true });
        const second = addGPXLayer(rawData, 'second', { forceVisible: true });

        const selected = showOnlyGPXLayer(first.id);

        expect(selected?.id).toBe(first.id);
        expect(state.activeGPXLayerId).toBe(first.id);
        expect(
            state.gpxLayers
                .filter((layer) => layer.visible)
                .map((layer) => layer.id)
        ).toEqual([first.id]);
        expect(first.mesh?.visible).toBe(true);
        expect(second.mesh?.visible).toBe(false);
    });

    it('hideAllGPXLayers hides loaded traces without deleting them or REC', () => {
        addGPXLayer(rawData, 'first', { forceVisible: true });
        addGPXLayer(rawData, 'second', { forceVisible: true });
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1010, timestamp: 2000 },
        ];

        hideAllGPXLayers();

        expect(state.gpxLayers).toHaveLength(2);
        expect(state.gpxLayers.every((layer) => !layer.visible)).toBe(true);
        expect(state.activeGPXLayerId).toBeNull();
        expect(state.recordedPoints).toHaveLength(2);
        expect(mockCloseElevationProfile).toHaveBeenCalled();
    });

    it('addGPXLayer: should calculate stats (distance, D+, D-) with larger variations', () => {
        const raw = {
            tracks: [
                {
                    points: [
                        {
                            lat: 46.5,
                            lon: 7.5,
                            ele: 1000,
                            time: '2024-01-01T10:00:00Z',
                        },
                        {
                            lat: 46.5,
                            lon: 7.5,
                            ele: 1000,
                            time: '2024-01-01T10:01:00Z',
                        },
                        {
                            lat: 46.5,
                            lon: 7.5,
                            ele: 1000,
                            time: '2024-01-01T10:02:00Z',
                        },
                        {
                            lat: 46.5001,
                            lon: 7.5001,
                            ele: 1500,
                            time: '2024-01-01T10:10:00Z',
                        },
                        {
                            lat: 46.5001,
                            lon: 7.5001,
                            ele: 1500,
                            time: '2024-01-01T10:11:00Z',
                        },
                        {
                            lat: 46.5001,
                            lon: 7.5001,
                            ele: 1500,
                            time: '2024-01-01T10:12:00Z',
                        },
                        {
                            lat: 46.5002,
                            lon: 7.5002,
                            ele: 1200,
                            time: '2024-01-01T10:20:00Z',
                        },
                        {
                            lat: 46.5002,
                            lon: 7.5002,
                            ele: 1200,
                            time: '2024-01-01T10:21:00Z',
                        },
                        {
                            lat: 46.5002,
                            lon: 7.5002,
                            ele: 1200,
                            time: '2024-01-01T10:22:00Z',
                        },
                    ],
                },
            ],
        };

        const layer = addGPXLayer(raw, 'stats-test');
        expect(layer.stats.distance).toBeGreaterThan(0);
        expect(layer.stats.dPlus).toBeGreaterThan(150);
        expect(layer.stats.dMinus).toBeGreaterThan(150);
    });

    it('should use zoom-based exponential thickness (Komoot-style) for imported tracks', () => {
        state.gpxLayers = [];
        state.ZOOM = 18;
        const layerZ18 = addGPXLayer(rawData, 'z18');
        const radiusZ18 = (layerZ18.mesh!.geometry as THREE.TubeGeometry)
            .parameters.radius;
        expect(radiusZ18).toBeCloseTo(2.0, 1); // v5.53.3 : Increased from 1.5

        state.gpxLayers = [];
        state.ZOOM = 17;
        const layerZ17 = addGPXLayer(rawData, 'z17');
        const radiusZ17 = (layerZ17.mesh!.geometry as THREE.TubeGeometry)
            .parameters.radius;
        expect(radiusZ17).toBeCloseTo(4.0, 1);

        state.gpxLayers = [];
        state.ZOOM = 14;
        const layerZ14 = addGPXLayer(rawData, 'z14');
        const radiusZ14 = (layerZ14.mesh!.geometry as THREE.TubeGeometry)
            .parameters.radius;
        expect(radiusZ14).toBeCloseTo(32.0, 1);

        state.gpxLayers = [];
        state.ZOOM = 10;
        const layerZ10 = addGPXLayer(rawData, 'z10');
        const radiusZ10 = (layerZ10.mesh!.geometry as THREE.TubeGeometry)
            .parameters.radius;
        expect(radiusZ10).toBeCloseTo(200, 1);
    });

    it('should use zoom-based exponential thickness for recorded tracks', async () => {
        vi.useFakeTimers();
        state.ZOOM = 18;
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 1000 },
            { lat: 46.51, lon: 7.51, alt: 1010, timestamp: 2000 },
            { lat: 46.52, lon: 7.52, alt: 1020, timestamp: 3000 },
        ];
        state.recordedMesh = new THREE.Mesh(
            new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(1, 0, 1),
                ]),
                4,
                5,
                2,
                false
            )
        );

        updateRecordedTrackMesh();
        vi.runAllTimers();
        const radiusZ18 = (state.recordedMesh!.geometry as THREE.TubeGeometry)
            .parameters.radius;
        expect(radiusZ18).toBeCloseTo(2.5, 1); // v5.53.3 : Increased from 2.0

        state.recordedMesh = new THREE.Mesh(
            new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(1, 0, 1),
                ]),
                4,
                5,
                2,
                false
            )
        );
        state.ZOOM = 14;
        updateRecordedTrackMesh();
        vi.runAllTimers();
        const radiusZ14 = (state.recordedMesh!.geometry as THREE.TubeGeometry)
            .parameters.radius;
        expect(radiusZ14).toBeCloseTo(40.0, 1);

        state.recordedMesh = new THREE.Mesh(
            new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(1, 0, 1),
                ]),
                4,
                5,
                2,
                false
            )
        );
        state.ZOOM = 10;
        updateRecordedTrackMesh();
        vi.runAllTimers();
        const radiusZ10 = (state.recordedMesh!.geometry as THREE.TubeGeometry)
            .parameters.radius;
        expect(radiusZ10).toBeCloseTo(250, 1);

        vi.useRealTimers();
    });

    it('updateAllGPXMeshes: should adapt RDP epsilon based on performance preset', async () => {
        const utils = await import('./utils');
        const spyRDP = vi.spyOn(utils, 'simplifyRDP');

        state.gpxLayers = [];

        addGPXLayer(rawData, 'rdp-test');
        vi.useFakeTimers();

        // 1. Test en mode ECO (Epsilon large)
        state.PERFORMANCE_PRESET = 'eco';
        updateAllGPXMeshes();
        vi.runAllTimers();
        const epsEco = spyRDP.mock.calls[spyRDP.mock.calls.length - 1][1];

        // 2. Test en mode ULTRA (Epsilon fin)
        state.PERFORMANCE_PRESET = 'ultra';
        updateAllGPXMeshes();
        vi.runAllTimers();
        const epsUltra = spyRDP.mock.calls[spyRDP.mock.calls.length - 1][1];

        expect(epsEco).toBeGreaterThan(epsUltra);
        // v5.53.4 : RDP ratio check (2.0 vs 0.5 = 4x)
        expect(epsEco / epsUltra).toBeCloseTo(4, 1);
    });

    it('updateAllGPXMeshes preserves route data when one rebuild fails', async () => {
        const layer = addGPXLayer(rawData, 'route-to-preserve');
        const utils = await import('./utils');
        const spyRDP = vi.spyOn(utils, 'simplifyRDP').mockReturnValueOnce([]);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.useFakeTimers();

        updateAllGPXMeshes();
        vi.runAllTimers();

        expect(state.gpxLayers).toHaveLength(1);
        expect(state.gpxLayers[0].id).toBe(layer.id);
        expect(state.gpxLayers[0].points).toHaveLength(layer.points.length);
        expect(state.gpxLayers[0].mesh).toBeNull();

        spyRDP.mockRestore();
        warn.mockRestore();
        vi.useRealTimers();
    });
});

describe('removeGPXLayer', () => {
    beforeEach(() => {
        state.gpxLayers = [];
        state.activeGPXLayerId = null;
        state.scene = new THREE.Scene();
        state.scene.add = vi.fn();
        state.scene.remove = vi.fn();
        state.originTile = { x: 2130, y: 1445, z: 12 };
        state.camera = new THREE.PerspectiveCamera();
        state.camera.position.set(0, 1000, 0);
        mockCloseElevationProfile.mockClear();
        mockUpdateElevationProfile.mockClear();
    });

    it('appelle closeElevationProfile quand le dernier layer est supprimé', () => {
        const layer = addGPXLayer(rawData, 'seul-layer');
        expect(state.gpxLayers).toHaveLength(1);
        mockCloseElevationProfile.mockClear();
        mockUpdateElevationProfile.mockClear();

        removeGPXLayer(layer.id);

        expect(state.gpxLayers).toHaveLength(0);
        expect(mockCloseElevationProfile).toHaveBeenCalledOnce();
        expect(mockUpdateElevationProfile).not.toHaveBeenCalled();
    });

    it('appelle updateElevationProfile quand des layers restent après suppression', () => {
        const layer1 = addGPXLayer(rawData, 'layer-1');
        const layer2 = addGPXLayer(rawData, 'layer-2');
        expect(state.gpxLayers).toHaveLength(2);
        mockUpdateElevationProfile.mockClear();

        removeGPXLayer(layer1.id);

        expect(state.gpxLayers).toHaveLength(1);
        expect(state.gpxLayers[0].id).toBe(layer2.id);
        expect(mockUpdateElevationProfile).toHaveBeenCalled();
        expect(mockCloseElevationProfile).not.toHaveBeenCalled();
    });

    it('supprime le mesh de la scène 3D', () => {
        const layer = addGPXLayer(rawData, 'mesh-test');
        expect(layer.mesh).toBeTruthy();

        removeGPXLayer(layer.id);

        expect(state.scene!.remove).toHaveBeenCalled();
    });

    it("ne fait rien si l'id est inconnu", () => {
        addGPXLayer(rawData, 'existant');
        mockUpdateElevationProfile.mockClear();

        removeGPXLayer('id-inexistant');

        expect(state.gpxLayers).toHaveLength(1);
        expect(mockCloseElevationProfile).not.toHaveBeenCalled();
        expect(mockUpdateElevationProfile).not.toHaveBeenCalled();
    });

    it('bascule activeGPXLayerId vers un layer restant', () => {
        const layer1 = addGPXLayer(rawData, 'layer-a');
        const layer2 = addGPXLayer(rawData, 'layer-b');
        state.activeGPXLayerId = layer1.id;

        removeGPXLayer(layer1.id);

        expect(state.activeGPXLayerId).toBe(layer2.id);
    });

    it('active et rend visible un autre GPX en masquant le précédent pour Free', () => {
        const first = addGPXLayer(rawData, 'layer-a');
        const second = addGPXLayer(rawData, 'layer-b');
        expect(second.visible).toBe(false);

        const active = activateGPXLayer(second.id);

        expect(active?.visible).toBe(true);
        expect(state.activeGPXLayerId).toBe(second.id);
        expect(
            state.gpxLayers.find((layer) => layer.id === first.id)?.visible
        ).toBe(false);
        expect(second.mesh?.visible).toBe(true);
    });

    it('met activeGPXLayerId à null quand aucun layer ne reste', () => {
        const layer = addGPXLayer(rawData, 'seul');
        state.activeGPXLayerId = layer.id;

        removeGPXLayer(layer.id);

        expect(state.activeGPXLayerId).toBeNull();
    });

    it('log un avertissement si scene/camera/originTile est manquant', () => {
        vi.useFakeTimers();
        state.recordedPoints = [
            { lat: 46.5, lon: 7.5, alt: 1000, timestamp: 10000 },
            { lat: 46.5001, lon: 7.5001, alt: 1010, timestamp: 20000 },
        ];
        state.originTile = undefined as any;
        state.scene = undefined as any;
        state.camera = undefined as any;

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        updateRecordedTrackMesh();
        vi.runAllTimers();

        expect(warnSpy).toHaveBeenCalledWith(
            '[GPX] Recorded mesh update skipped — missing:',
            expect.objectContaining({
                camera: false,
                scene: false,
                originTile: false,
            })
        );
        warnSpy.mockRestore();
    });
});
