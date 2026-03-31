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
});
