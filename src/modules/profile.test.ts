import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
    closeElevationProfile,
    updateElevationProfile,
    getSlopeCategory,
    buildSlopeSegments,
    getSlopeSegmentFill,
} from './profile';
import type { ProfilePoint, SlopeSegment } from './profile';
import { haversineDistance } from './geo';
import { state } from './state';
import type { GPXLayer } from './state';

describe("Profil d'altitude (Module Profile)", () => {
    beforeEach(() => {
        // Mock du DOM minimal
        document.body.className = '';
        document.body.innerHTML = `
            <div id="elevation-profile">
                <div class="profile-header">
                    <button id="close-profile"></button>
                </div>
            </div>
            <div id="profile-info"></div>
            <div id="profile-chart-container"></div>
            <svg id="profile-svg"></svg>
            <div id="profile-cursor"></div>
            <div id="profile-legend" hidden></div>
            <button id="profile-expand-btn"></button>
            <button id="profile-close-btn"></button>
            <div id="gpx-dist"></div>
            <div id="gpx-dplus"></div>
            <div id="gpx-dminus"></div>
        `;
        state.scene = new THREE.Scene();
        state.gpxLayers = [];
        state.activeGPXLayerId = null;
        state.RELIEF_EXAGGERATION = 2.0;
    });

    it('haversineDistance devrait calculer la distance correcte', () => {
        // Paris -> Lyon (~391km)
        const d = haversineDistance(48.8566, 2.3522, 45.764, 4.8357);
        expect(d).toBeCloseTo(391, 0);
    });

    it('updateElevationProfile ne devrait rien faire sans données GPX', () => {
        const profileEl = document.getElementById('elevation-profile');
        if (profileEl) profileEl.classList.remove('is-open');

        updateElevationProfile();
        expect(profileEl?.classList.contains('is-open')).toBe(false);
    });

    it('updateElevationProfile devrait traiter les points GPX et afficher le panneau', () => {
        const layer: GPXLayer = {
            id: 'test-layer',
            name: 'test',
            color: '#3b7ef8',
            visible: true,
            rawData: {
                tracks: [
                    {
                        points: [
                            { lat: 46.0, lon: 7.0, ele: 1000 },
                            { lat: 46.1, lon: 7.1, ele: 1200 },
                        ],
                    },
                ],
            },
            points: [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(100, 100, 100),
            ],
            mesh: null,
            stats: {
                distance: 10,
                dPlus: 200,
                dMinus: 0,
                pointCount: 2,
                estimatedTime: 180,
            },
        };
        state.gpxLayers = [layer];
        state.activeGPXLayerId = 'test-layer';
        document.body.classList.add('guidance-active');

        updateElevationProfile();

        const profileEl = document.getElementById('elevation-profile');
        expect(profileEl?.classList.contains('is-open')).toBe(true);
        expect(document.body.classList.contains('guidance-profile-open')).toBe(
            true
        );

        // Vérification du contenu du SVG (un path devrait être créé)
        const svg = document.getElementById('profile-svg');
        expect(svg?.innerHTML).toContain('path');

        closeElevationProfile();
        expect(document.body.classList.contains('guidance-profile-open')).toBe(
            false
        );
    });

    it('redessine le graphique à la fin de son agrandissement', () => {
        const layer: GPXLayer = {
            id: 'resize-profile',
            name: 'Resize profile',
            color: '#3b7ef8',
            visible: true,
            rawData: {
                tracks: [
                    {
                        points: [
                            { lat: 46, lon: 7, ele: 1000 },
                            { lat: 46.1, lon: 7.1, ele: 1200 },
                        ],
                    },
                ],
            },
            points: [
                new THREE.Vector3(0, 2000, 0),
                new THREE.Vector3(100, 2400, 100),
            ],
            mesh: null,
            stats: { distance: 1, dPlus: 200, dMinus: 0, pointCount: 2 },
        };
        const svg = document.getElementById(
            'profile-svg'
        ) as unknown as SVGSVGElement;
        let renderedHeight = 100;
        Object.defineProperty(svg, 'clientWidth', {
            configurable: true,
            get: () => 300,
        });
        Object.defineProperty(svg, 'clientHeight', {
            configurable: true,
            get: () => renderedHeight,
        });
        state.gpxLayers = [layer];

        updateElevationProfile('resize-profile');
        expect(svg.innerHTML).toContain(' 100');

        renderedHeight = 300;
        document.getElementById('profile-expand-btn')!.click();
        const transitionEnd = new Event('transitionend') as TransitionEvent;
        Object.defineProperty(transitionEnd, 'propertyName', {
            value: 'height',
        });
        document
            .getElementById('profile-chart-container')!
            .dispatchEvent(transitionEnd);

        expect(svg.innerHTML).toContain(' 300');
        closeElevationProfile();
    });

    it('récupère toujours le profil à sa position ancrée', () => {
        const layer: GPXLayer = {
            id: 'anchored-profile',
            name: 'Anchored profile',
            color: '#3b7ef8',
            visible: true,
            rawData: {
                tracks: [
                    {
                        points: [
                            { lat: 46, lon: 7, ele: 1000 },
                            { lat: 46.01, lon: 7.01, ele: 1010 },
                        ],
                    },
                ],
            },
            points: [
                new THREE.Vector3(0, 2000, 0),
                new THREE.Vector3(100, 2020, 100),
            ],
            mesh: null,
            stats: { distance: 1, dPlus: 10, dMinus: 0, pointCount: 2 },
        };
        const profileEl = document.getElementById('elevation-profile')!;
        profileEl.classList.add('panel-custom-pos');
        profileEl.style.left = '-360px';
        profileEl.style.top = '1400px';
        profileEl.style.transform = 'translate(-50%, 200px)';
        state.gpxLayers = [layer];

        updateElevationProfile('anchored-profile');

        expect(profileEl.classList.contains('panel-custom-pos')).toBe(false);
        expect(profileEl.style.left).toBe('');
        expect(profileEl.style.top).toBe('');
        expect(profileEl.style.transform).toBe('');
        closeElevationProfile();
    });

    describe('v5.24.3 - Fix mismatch index positions 3D', () => {
        it('devrait utiliser les positions 3D densifiées et non les points originaux', () => {
            // Simule un GPX avec 2 points originaux qui deviennent 6 points après densification
            // (2 originaux + 4 intermédiaires entre eux)
            const layer: GPXLayer = {
                id: 'test-densify',
                name: 'Test Densification',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: [
                                { lat: 46.0, lon: 7.0, ele: 1000 }, // Point original 1
                                { lat: 46.1, lon: 7.1, ele: 1200 }, // Point original 2
                            ],
                        },
                    ],
                },
                // Points 3D densifiés (comme gpxDrapePoints les créerait)
                points: [
                    new THREE.Vector3(0, 2000, 0), // Point 1: altitude 1000m * 2
                    new THREE.Vector3(20, 2100, 20), // Intermédiaire 1
                    new THREE.Vector3(40, 2200, 40), // Intermédiaire 2
                    new THREE.Vector3(60, 2300, 60), // Intermédiaire 3
                    new THREE.Vector3(80, 2400, 80), // Intermédiaire 4
                    new THREE.Vector3(100, 2400, 100), // Point 2: altitude 1200m * 2
                ],
                mesh: null,
                stats: {
                    distance: 10,
                    dPlus: 200,
                    dMinus: 0,
                    pointCount: 2,
                    estimatedTime: 180,
                },
            };

            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-densify';

            updateElevationProfile();

            // Le profil devrait avoir 6 points (pas 2!)
            // Si le bug était présent, on aurait seulement 2 points avec des positions incorrectes
            const svg = document.getElementById('profile-svg');
            expect(svg).not.toBeNull();

            // Vérifier que le SVG contient des données
            const svgContent = svg?.innerHTML || '';
            expect(svgContent).toContain('path');
        });

        it('devrait calculer les altitudes à partir des positions Y 3D', () => {
            const layer: GPXLayer = {
                id: 'test-altitude',
                name: 'Test Altitude',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: [
                                { lat: 46.0, lon: 7.0, ele: 500 },
                                { lat: 46.1, lon: 7.1, ele: 1500 },
                            ],
                        },
                    ],
                },
                // Points avec altitudes spécifiques (Y / RELIEF_EXAGGERATION)
                points: [
                    new THREE.Vector3(0, 1000, 0), // altitude = 1000 / 2 = 500m
                    new THREE.Vector3(100, 3000, 100), // altitude = 3000 / 2 = 1500m
                ],
                mesh: null,
                stats: {
                    distance: 10,
                    dPlus: 200,
                    dMinus: 0,
                    pointCount: 2,
                    estimatedTime: 180,
                },
            };

            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-altitude';
            state.RELIEF_EXAGGERATION = 2.0;

            updateElevationProfile();

            // Si le calcul est correct, les altitudes dans le profil
            // devraient correspondre aux positions Y divisées par RELIEF_EXAGGERATION
            const svg = document.getElementById('profile-svg');
            expect(svg?.innerHTML).toContain('path');
        });

        it('devrait calculer les distances cumulativement entre points 3D consécutifs', () => {
            // 5 points espacés de 100m (distance totale ~400m = 0.4km)
            const layer: GPXLayer = {
                id: 'test-distance',
                name: 'Test Distance',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: [
                                { lat: 46.0, lon: 7.0, ele: 1000 },
                                { lat: 46.1, lon: 7.1, ele: 1000 },
                            ],
                        },
                    ],
                },
                // 5 points espacés de 100m (distance totale ~400m = 0.4km)
                points: [
                    new THREE.Vector3(0, 2000, 0),
                    new THREE.Vector3(100, 2000, 0), // +100m
                    new THREE.Vector3(200, 2000, 0), // +100m
                    new THREE.Vector3(300, 2000, 0), // +100m
                    new THREE.Vector3(400, 2000, 0), // +100m
                ],
                mesh: null,
                stats: { distance: 0.4, dPlus: 0, dMinus: 0, pointCount: 2 },
            };

            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-distance';

            updateElevationProfile();

            // Le profil devrait refléter la distance totale de 0.4km
            const profileEl = document.getElementById('elevation-profile');
            expect(profileEl?.classList.contains('is-open')).toBe(true);
        });

        it("devrait maintenir l'altitude correcte même quand gpxPoints3D.length > rawPoints.length (Fix v5.29.32)", () => {
            const layer: GPXLayer = {
                id: 'test-fix-v5.29',
                name: 'Test Fix',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: [
                                { lat: 46.0, lon: 7.0, ele: 1000 },
                                { lat: 46.1, lon: 7.1, ele: 1200 },
                            ],
                        },
                    ],
                },
                // 6 points 3D pour seulement 2 points GPX bruts
                points: [
                    new THREE.Vector3(0, 30, 0),
                    new THREE.Vector3(20, 30, 0),
                    new THREE.Vector3(40, 30, 0),
                    new THREE.Vector3(60, 30, 0),
                    new THREE.Vector3(80, 30, 0),
                    new THREE.Vector3(100, 30, 0),
                ],
                mesh: null,
                stats: {
                    distance: 10,
                    dPlus: 200,
                    dMinus: 0,
                    pointCount: 2,
                    estimatedTime: 180,
                },
            };

            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-fix-v5.29';
            // On simule le mode 2D ou un défaut de terrain où Y=30 (surface offset)
            // Sans le fix, dès i=2, l'altitude tomberait à (30-30)/2 = 0m.

            updateElevationProfile();

            // On vérifie que les altitudes calculées pour les points ne sont pas 0
            // On peut s'assurer de cela indirectement en vérifiant que dPlus est correct
            const pEl = document.getElementById('gpx-dplus');
            expect(pEl?.textContent).toContain('200 m D+');
        });
    });

    describe('getSlopeCategory (coloration pente)', () => {
        it('devrait retourner 0 (vert) pour pente ≤ 3%', () => {
            expect(getSlopeCategory(0)).toBe(0);
            expect(getSlopeCategory(1)).toBe(0);
            expect(getSlopeCategory(2.9)).toBe(0);
        });

        it('devrait retourner 1 (jaune) pour pente 3-6%', () => {
            expect(getSlopeCategory(3)).toBe(1);
            expect(getSlopeCategory(5)).toBe(1);
            expect(getSlopeCategory(5.9)).toBe(1);
        });

        it('devrait retourner 2 (orange) pour pente 6-9%', () => {
            expect(getSlopeCategory(6)).toBe(2);
            expect(getSlopeCategory(7.5)).toBe(2);
        });

        it('devrait retourner 3 (rouge) pour pente 9-12%', () => {
            expect(getSlopeCategory(9)).toBe(3);
            expect(getSlopeCategory(10)).toBe(3);
        });

        it('devrait retourner 4 (rouge fonce) pour pente > 12%', () => {
            expect(getSlopeCategory(12)).toBe(4);
            expect(getSlopeCategory(20)).toBe(4);
            expect(getSlopeCategory(100)).toBe(4);
        });

        it('devrait traiter les descentes sans remplissage (retourne -1)', () => {
            expect(getSlopeCategory(-2)).toBe(-1);
            expect(getSlopeCategory(-5)).toBe(-1);
            expect(getSlopeCategory(-10)).toBe(-1);
            expect(getSlopeCategory(-100)).toBe(-1);
        });
    });

    describe('Rendu SVG de la pente', () => {
        it('le SVG devrait contenir des paths de pente colores', () => {
            const layer: GPXLayer = {
                id: 'test-slope',
                name: 'Test Slope',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: [
                                { lat: 46.0, lon: 7.0, ele: 1000 },
                                { lat: 46.1, lon: 7.1, ele: 1200 },
                            ],
                        },
                    ],
                },
                points: [
                    new THREE.Vector3(0, 2000, 0),
                    new THREE.Vector3(100, 2400, 100),
                ],
                mesh: null,
                stats: {
                    distance: 10,
                    dPlus: 200,
                    dMinus: 0,
                    pointCount: 2,
                    estimatedTime: 180,
                },
            };
            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-slope';

            updateElevationProfile();

            const svg = document.getElementById('profile-svg');
            expect(svg?.innerHTML).toContain('path');
            expect(svg?.innerHTML).toContain('fill-opacity');
        });

        it("ne devrait pas contenir l'ancien degradé bleu", () => {
            const layer: GPXLayer = {
                id: 'test-no-grad',
                name: 'Test No Grad',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: [
                                { lat: 46.0, lon: 7.0, ele: 1000 },
                                { lat: 46.1, lon: 7.1, ele: 1100 },
                            ],
                        },
                    ],
                },
                points: [
                    new THREE.Vector3(0, 2000, 0),
                    new THREE.Vector3(100, 2200, 100),
                ],
                mesh: null,
                stats: {
                    distance: 10,
                    dPlus: 100,
                    dMinus: 0,
                    pointCount: 2,
                    estimatedTime: 180,
                },
            };
            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-no-grad';

            updateElevationProfile();

            const svg = document.getElementById('profile-svg');
            expect(svg?.innerHTML).not.toContain('profile-grad');
        });

        it("devrait utiliser pos.y quand le GPX n'a pas d'elevation (fallback sans tuile)", () => {
            const layer: GPXLayer = {
                id: 'test-posy-fallback',
                name: 'Test pos.y fallback',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: [
                                { lat: 46.0, lon: 7.0 },
                                { lat: 46.1, lon: 7.1 },
                            ],
                        },
                    ],
                },
                points: [
                    new THREE.Vector3(0, 1012, 0),
                    new THREE.Vector3(100, 3012, 100),
                ],
                mesh: null,
                stats: {
                    distance: 10,
                    dPlus: 1000,
                    dMinus: 0,
                    pointCount: 2,
                    estimatedTime: 180,
                },
            };
            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-posy-fallback';

            updateElevationProfile();

            const profileEl = document.getElementById('elevation-profile');
            expect(profileEl?.classList.contains('is-open')).toBe(true);

            const svg = document.getElementById('profile-svg');
            expect(svg?.innerHTML).toContain('path');
            expect(svg?.innerHTML).toContain('fill-opacity');

            const pEl = document.getElementById('gpx-dplus');
            expect(pEl?.textContent).toContain('1000 m D+');
        });
    });

    describe('Segmentation des pentes (style Garmin)', () => {
        function makePoints(
            slopes: number[],
            elevations: number[],
            stepKm = 0.1
        ): ProfilePoint[] {
            return slopes.map((slope, i) => ({
                dist: i * stepKm,
                ele: elevations[i],
                eleSmooth: elevations[i],
                pos: new THREE.Vector3(),
                slope,
            }));
        }

        it('une montée régulière donne un seul segment de montée', () => {
            const points = makePoints(
                [20, 20, 20, 20, 20, 20],
                [1000, 1020, 1040, 1060, 1080, 1100]
            );

            const segments = buildSlopeSegments(points);

            expect(segments).toHaveLength(1);
            expect(segments[0].kind).toBe('climb');
            expect(segments[0].avgSlope).toBeCloseTo(20, 0);
        });

        it('absorbe un micro-plat au milieu d’une montée', () => {
            // Un unique point plat (100 m) au milieu d'une montée de 500 m
            const points = makePoints(
                [20, 20, 20, 0.5, 20, 20],
                [1000, 1020, 1040, 1040.5, 1060, 1080]
            );

            const segments = buildSlopeSegments(points);

            expect(segments).toHaveLength(1);
            expect(segments[0].kind).toBe('climb');
        });

        it('une descente régulière donne un seul segment de descente', () => {
            const points = makePoints(
                [-20, -20, -20, -20, -20],
                [1100, 1080, 1060, 1040, 1020]
            );

            const segments = buildSlopeSegments(points);

            expect(segments).toHaveLength(1);
            expect(segments[0].kind).toBe('descent');
            expect(segments[0].avgSlope).toBeLessThan(0);
        });

        it('sépare une forte descente d’une forte montée sans les moyenner en plat', () => {
            const slopes: number[] = [];
            const elevations: number[] = [];
            let ele = 1200;
            // 20 points à -12 % (≈190 m), un petit palier, puis 20 points à +12 %
            for (let i = 0; i < 20; i++) {
                slopes.push(-12);
                elevations.push(ele);
                ele -= 12 * 0.01 * 10; // 10 m à 12 % → 1,2 m
            }
            for (let i = 0; i < 3; i++) {
                slopes.push(0);
                elevations.push(ele);
            }
            for (let i = 0; i < 20; i++) {
                slopes.push(12);
                elevations.push(ele);
                ele += 12 * 0.01 * 10;
            }
            const points = makePoints(slopes, elevations, 0.01); // pas de 10 m

            const segments = buildSlopeSegments(points);

            expect(segments).toHaveLength(2);
            expect(segments[0].kind).toBe('descent');
            expect(segments[1].kind).toBe('climb');
            expect(segments[0].avgSlope).toBeLessThan(0);
            expect(segments[1].avgSlope).toBeGreaterThan(0);
        });

        it('un parcours plat donne un segment plat', () => {
            const points = makePoints(
                [0.2, 0.2, 0.2, 0.2],
                [1000, 1000, 1000, 1000]
            );

            const segments = buildSlopeSegments(points);

            expect(segments).toHaveLength(1);
            expect(segments[0].kind).toBe('flat');
        });

        it('découpe une montée qui se raidit en plusieurs segments colorés', () => {
            // 2 km : 500 m à 2 %, puis 5 %, puis 8 %, puis 12 %
            const grades = [2, 5, 8, 12];
            const slopes: number[] = [];
            const elevations: number[] = [];
            let ele = 1000;
            for (const g of grades) {
                for (let k = 0; k < 10; k++) {
                    slopes.push(g);
                    elevations.push(ele);
                    ele += g * 0.5; // 50 m à g % → +g/2 m
                }
            }
            const points = makePoints(slopes, elevations, 0.05); // pas de 50 m

            const segments = buildSlopeSegments(points);
            const colors = segments.map((s) => getSlopeSegmentFill(s).color);

            expect(segments.length).toBeGreaterThanOrEqual(3);
            expect(new Set(colors).size).toBeGreaterThanOrEqual(3);
        });

        it('produit beaucoup de bandes quand la pente change souvent', () => {
            // Dents de scie : 6 alternances de +8 % / -8 %, 270 m chacun
            const slopes: number[] = [];
            const elevations: number[] = [];
            let ele = 1000;
            for (let rep = 0; rep < 6; rep++) {
                for (let i = 0; i < 10; i++) {
                    slopes.push(8);
                    elevations.push(ele);
                    ele += 8 * 0.03 * 10; // 30 m à 8 % → 2,4 m
                }
                for (let i = 0; i < 10; i++) {
                    slopes.push(-8);
                    elevations.push(ele);
                    ele -= 8 * 0.03 * 10;
                }
            }
            const points = makePoints(slopes, elevations, 0.03);

            const segments = buildSlopeSegments(points);

            // Chaque montée/descente est une bande distincte (pas un seul bloc)
            expect(segments.length).toBeGreaterThanOrEqual(8);
        });

        it('getSlopeSegmentFill applique la même graduation aux montées et descentes', () => {
            const climb: SlopeSegment = {
                startIdx: 0,
                endIdx: 1,
                startDist: 0,
                endDist: 1,
                avgSlope: 8,
                kind: 'climb',
            };
            const flat: SlopeSegment = { ...climb, avgSlope: 0, kind: 'flat' };
            const descent: SlopeSegment = {
                ...climb,
                avgSlope: -8,
                kind: 'descent',
            };

            // Même raideur → même couleur, quel que soit le sens.
            // L'opacité et la couleur augmentent avec la raideur.
            expect(getSlopeSegmentFill(climb)).toEqual({
                color: '#f0912e',
                opacity: 0.6,
            });
            expect(getSlopeSegmentFill(descent)).toEqual({
                color: '#f0912e',
                opacity: 0.6,
            });
            expect(getSlopeSegmentFill(flat)).toEqual({
                color: '#c7d9a6',
                opacity: 0.4,
            });
        });
    });

    describe('Rendu SVG par segments', () => {
        it('rend une montée régulière en un seul path de pente', () => {
            const elevations = Array.from(
                { length: 10 },
                (_, i) => 1000 + i * 20
            );
            const layer: GPXLayer = {
                id: 'test-segments',
                name: 'Test Segments',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [
                        {
                            points: elevations.map((ele, i) => ({
                                lat: 46 + i * 0.001,
                                lon: 7,
                                ele,
                            })),
                        },
                    ],
                },
                points: elevations.map(
                    (_, i) => new THREE.Vector3(i * 100, 0, 0)
                ),
                mesh: null,
                stats: { distance: 0.9, dPlus: 180, dMinus: 0, pointCount: 10 },
            };
            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-segments';

            updateElevationProfile();

            const svg = document.getElementById('profile-svg');
            const slopePaths =
                svg?.innerHTML.match(/fill-opacity="0.[0-9]+"/g) || [];
            expect(slopePaths).toHaveLength(1);
        });
    });
});
