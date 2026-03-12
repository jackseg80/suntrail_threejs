import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { getAltitudeAt, isSunOccluded } from './analysis';
import { state } from './state';
import { activeTiles, worldToLngLat, lngLatToTile } from './terrain';

describe('Analyse Solaire (Module Analysis)', () => {
    let centerKey: string;

    beforeEach(() => {
        activeTiles.clear();
        state.ZOOM = 13;
        state.RELIEF_EXAGGERATION = 1.0;
        state.originTile = { x: 4272, y: 2883, z: 13 }; // Thune, Suisse
        
        // Calculer la clé de tuile attendue pour world(0,0)
        const gps = worldToLngLat(0, 0);
        const tileCoords = lngLatToTile(gps.lon, gps.lat, state.ZOOM);
        centerKey = `${tileCoords.x}_${tileCoords.y}_${state.ZOOM}`;
    });

    it('devrait retourner 0 si aucune tuile n\'est chargée pour la position donnée', () => {
        const alt = getAltitudeAt(100000, 100000); // Loin de (0,0)
        expect(alt).toBe(0);
    });

    it('devrait calculer l\'altitude correcte depuis pixelData', () => {
        const mockTile: any = {
            tx: 0, ty: 0, zoom: 13,
            worldX: 0, worldZ: 0, tileSizeMeters: 4891.97,
            pixelData: new Uint8ClampedArray(256 * 256 * 4)
        };
        
        // Simuler une altitude de 1500m
        for (let i = 0; i < mockTile.pixelData.length; i += 4) {
            mockTile.pixelData[i] = 1;
            mockTile.pixelData[i + 1] = 193;
            mockTile.pixelData[i + 2] = 56;
            mockTile.pixelData[i + 3] = 255;
        }

        activeTiles.set(centerKey, mockTile);

        const alt = getAltitudeAt(0, 0);
        expect(Math.round(alt)).toBe(1500);
    });

    it('isSunOccluded devrait détecter une occlusion si le relief est plus haut', () => {
        const mockTile: any = {
            tx: 0, ty: 0, zoom: 13,
            worldX: 0, worldZ: 0, tileSizeMeters: 1000000, 
            pixelData: new Uint8ClampedArray(256 * 256 * 4)
        };
        
        // Relief à 4000m partout
        // (4000 / 0.1) + 10000 = 140000
        // 2*65536 + 34*256 + 224 = 131072 + 8704 + 224 = 140000
        for (let i = 0; i < mockTile.pixelData.length; i += 4) {
            mockTile.pixelData[i] = 2;
            mockTile.pixelData[i + 1] = 34;
            mockTile.pixelData[i + 2] = 224;
            mockTile.pixelData[i + 3] = 255;
        }
        activeTiles.set(centerKey, mockTile);

        // Origine au centre (0, 500, 0), relief à 4000m tout autour
        const origin = new THREE.Vector3(0, 500, 0); 
        const sunDir = new THREE.Vector3(1, 0.01, 0).normalize(); 

        expect(isSunOccluded(origin, sunDir)).toBe(true);
    });

    it('isSunOccluded ne devrait pas détecter d\'occlusion si le ciel est dégagé', () => {
        const mockTile: any = {
            tx: 0, ty: 0, zoom: 13,
            worldX: 0, worldZ: 0, tileSizeMeters: 1000000,
            pixelData: new Uint8ClampedArray(256 * 256 * 4)
        };
        // Relief à 500m partout
        // (500 / 0.1) + 10000 = 15000 -> G=58, B=152
        for (let i = 0; i < mockTile.pixelData.length; i += 4) {
            mockTile.pixelData[i] = 0;
            mockTile.pixelData[i + 1] = 58;
            mockTile.pixelData[i + 2] = 152;
            mockTile.pixelData[i + 3] = 255;
        }
        activeTiles.set(centerKey, mockTile);

        const origin = new THREE.Vector3(0, 1000, 0); 
        const sunDir = new THREE.Vector3(0, 1, 0); 

        expect(isSunOccluded(origin, sunDir)).toBe(false);
    });
});
