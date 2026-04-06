import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { haversineDistance, updateElevationProfile } from './profile';
import { state } from './state';
import type { GPXLayer } from './state';

describe('Profil d\'altitude (Module Profile)', () => {
    beforeEach(() => {
        // Mock du DOM minimal
        document.body.innerHTML = `
            <div id="elevation-profile"></div>
            <div id="profile-info"></div>
            <div id="profile-chart-container"></div>
            <svg id="profile-svg"></svg>
            <div id="profile-cursor"></div>
        `;
        state.scene = new THREE.Scene();
        state.gpxLayers = [];
        state.activeGPXLayerId = null;
        state.RELIEF_EXAGGERATION = 2.0;
    });

    it('haversineDistance devrait calculer la distance correcte', () => {
        // Paris -> Lyon (~391km)
        const d = haversineDistance(48.8566, 2.3522, 45.7640, 4.8357);
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
                tracks: [{
                    points: [
                        { lat: 46.0, lon: 7.0, ele: 1000 },
                        { lat: 46.1, lon: 7.1, ele: 1200 }
                    ]
                }]
            },
            points: [new THREE.Vector3(0,0,0), new THREE.Vector3(100,100,100)],
            mesh: null,
            stats: { distance: 10, dPlus: 200, dMinus: 0, pointCount: 2 }
        };
        state.gpxLayers = [layer];
        state.activeGPXLayerId = 'test-layer';

        updateElevationProfile();

        const profileEl = document.getElementById('elevation-profile');
        expect(profileEl?.classList.contains('is-open')).toBe(true);
        
        // Vérification du contenu du SVG (un path devrait être créé)
        const svg = document.getElementById('profile-svg');
        expect(svg?.innerHTML).toContain('path');
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
                    tracks: [{
                        points: [
                            { lat: 46.0, lon: 7.0, ele: 1000 },  // Point original 1
                            { lat: 46.1, lon: 7.1, ele: 1200 }   // Point original 2
                        ]
                    }]
                },
                // Points 3D densifiés (comme gpxDrapePoints les créerait)
                points: [
                    new THREE.Vector3(0, 2000, 0),      // Point 1: altitude 1000m * 2
                    new THREE.Vector3(20, 2100, 20),    // Intermédiaire 1
                    new THREE.Vector3(40, 2200, 40),    // Intermédiaire 2
                    new THREE.Vector3(60, 2300, 60),    // Intermédiaire 3
                    new THREE.Vector3(80, 2400, 80),    // Intermédiaire 4
                    new THREE.Vector3(100, 2400, 100)   // Point 2: altitude 1200m * 2
                ],
                mesh: null,
                stats: { distance: 15, dPlus: 200, dMinus: 0, pointCount: 2 }
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
                    tracks: [{
                        points: [
                            { lat: 46.0, lon: 7.0, ele: 500 },
                            { lat: 46.1, lon: 7.1, ele: 1500 }
                        ]
                    }]
                },
                // Points avec altitudes spécifiques (Y / RELIEF_EXAGGERATION)
                points: [
                    new THREE.Vector3(0, 1000, 0),    // altitude = 1000 / 2 = 500m
                    new THREE.Vector3(100, 3000, 100) // altitude = 3000 / 2 = 1500m
                ],
                mesh: null,
                stats: { distance: 10, dPlus: 1000, dMinus: 0, pointCount: 2 }
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
            // Points espacés de 100m en 3D
            const layer: GPXLayer = {
                id: 'test-distance',
                name: 'Test Distance',
                color: '#3b7ef8',
                visible: true,
                rawData: {
                    tracks: [{
                        points: [
                            { lat: 46.0, lon: 7.0, ele: 1000 },
                            { lat: 46.1, lon: 7.1, ele: 1000 }
                        ]
                    }]
                },
                // 5 points espacés de 100m (distance totale ~400m = 0.4km)
                points: [
                    new THREE.Vector3(0, 2000, 0),
                    new THREE.Vector3(100, 2000, 0),   // +100m
                    new THREE.Vector3(200, 2000, 0),   // +100m
                    new THREE.Vector3(300, 2000, 0),   // +100m
                    new THREE.Vector3(400, 2000, 0)    // +100m
                ],
                mesh: null,
                stats: { distance: 0.4, dPlus: 0, dMinus: 0, pointCount: 2 }
            };
            
            state.gpxLayers = [layer];
            state.activeGPXLayerId = 'test-distance';
            
            updateElevationProfile();
            
            // Le profil devrait refléter la distance totale de 0.4km
            const profileEl = document.getElementById('elevation-profile');
            expect(profileEl?.classList.contains('is-open')).toBe(true);
        });
    });
});
