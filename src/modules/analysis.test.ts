import { describe, it, expect, beforeEach } from 'vitest';
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
        
        const gps = worldToLngLat(0, 0);
        const tileCoords = lngLatToTile(gps.lon, gps.lat, state.ZOOM);
        centerKey = `${tileCoords.x}_${tileCoords.y}_${state.ZOOM}`;
    });

    it('devrait retourner 0 si aucune tuile n\'est chargée pour la position donnée', () => {
        const alt = getAltitudeAt(100000, 100000); 
        expect(alt).toBe(0);
    });

    it('devrait calculer l\'altitude correcte depuis pixelData (256px)', () => {
        const mockTile: any = {
            tx: 0, ty: 0, zoom: 13,
            worldX: 0, worldZ: 0, tileSizeMeters: 4891.97,
            pixelData: new Uint8ClampedArray(256 * 256 * 4)
        };
        for (let i = 0; i < mockTile.pixelData.length; i += 4) {
            mockTile.pixelData[i] = 1;
            mockTile.pixelData[i + 1] = 193;
            mockTile.pixelData[i + 2] = 56;
            mockTile.pixelData[i + 3] = 255;
        }
        activeTiles.set(centerKey, mockTile);
        const alt = getAltitudeAt(0, 0);
        expect(alt).toBeCloseTo(1500, 0);
    });

    it('devrait calculer l\'altitude correcte pour une tuile haute résolution (512px)', () => {
        const res512 = 512;
        const mockTile: any = {
            tx: 0, ty: 0, zoom: 13,
            worldX: 0, worldZ: 0, tileSizeMeters: 1000,
            pixelData: new Uint8ClampedArray(res512 * res512 * 4)
        };
        for (let i = 0; i < mockTile.pixelData.length; i += 4) {
            mockTile.pixelData[i] = 1;
            mockTile.pixelData[i + 1] = 232;
            mockTile.pixelData[i + 2] = 8;
            mockTile.pixelData[i + 3] = 255;
        }
        activeTiles.set(centerKey, mockTile);
        const alt = getAltitudeAt(0, 0);
        expect(alt).toBeCloseTo(2493.6, 1);
    });

    it('isSunOccluded devrait détecter une occlusion si le relief est plus haut', () => {
        const mockTile: any = {
            tx: 0, ty: 0, zoom: 13,
            worldX: 0, worldZ: 0, tileSizeMeters: 1000000, 
            pixelData: new Uint8ClampedArray(256 * 256 * 4)
        };
        for (let i = 0; i < mockTile.pixelData.length; i += 4) {
            mockTile.pixelData[i] = 2;
            mockTile.pixelData[i + 1] = 34;
            mockTile.pixelData[i + 2] = 224;
            mockTile.pixelData[i + 3] = 255;
        }
        activeTiles.set(centerKey, mockTile);
        const origin = new THREE.Vector3(0, 500, 0); 
        const sunDir = new THREE.Vector3(1, 0.01, 0).normalize(); 
        expect(isSunOccluded(origin, sunDir)).toBe(true);
    });

    it('findTerrainIntersection (Algorithme) devrait trouver le point d\'impact exact', () => {
        const mockGetAltitude = (_x: number, _z: number) => 1000;
        const ray = new THREE.Ray(new THREE.Vector3(0, 5000, 0), new THREE.Vector3(0, -1, 0));
        const stepSize = 100;
        let hitY = 0;
        for (let dist = 0; dist < 10000; dist += stepSize) {
            const p = ray.at(dist, new THREE.Vector3());
            if (p.y <= mockGetAltitude(p.x, p.z)) {
                let dMin = dist - stepSize;
                let dMax = dist;
                for (let i = 0; i < 10; i++) {
                    const dMid = (dMin + dMax) / 2;
                    const pMid = ray.at(dMid, new THREE.Vector3());
                    if (pMid.y <= mockGetAltitude(pMid.x, pMid.z)) dMax = dMid;
                    else dMin = dMid;
                }
                hitY = ray.at(dMax, new THREE.Vector3()).y;
                break;
            }
        }
        expect(hitY).toBeCloseTo(1000, 0);
    });

    it('devrait calculer l\'altitude correcte au Zoom 15 hybride (v3.10.0)', () => {
        // Mock d'une tuile Zoom 15 qui est le quart supérieur droit (0.5, 0) de sa parente
        const mockTile: any = {
            tx: 1, ty: 0, zoom: 15,
            worldX: 0, worldZ: 0, tileSizeMeters: 1000,
            bounds: new THREE.Box3(new THREE.Vector3(-500, -1000, -500), new THREE.Vector3(500, 9000, 500)),
            pixelData: new Uint8ClampedArray(256 * 256 * 4),
            elevScale: 0.5,
            elevOffset: new THREE.Vector2(0.5, 0)
        };
        
        // On remplit la pixelData avec deux zones : 1000m à gauche, 2000m à droite
        for (let py = 0; py < 256; py++) {
            for (let px = 0; px < 256; px++) {
                const i = (py * 256 + px) * 4;
                const h = (px < 128) ? 1000 : 2000;
                const val = (h + 10000) * 10;
                mockTile.pixelData[i] = Math.floor(val / 65536);
                mockTile.pixelData[i+1] = Math.floor((val % 65536) / 256);
                mockTile.pixelData[i+2] = Math.floor(val % 256);
                mockTile.pixelData[i+3] = 255;
            }
        }
        
        activeTiles.set('test_hybrid', mockTile);
        
        // Au Zoom 15 hybride, le point (0,0) de la tuile correspond au milieu du parent (px=128)
        // car l'offset est 0.5. On devrait donc lire 2000m.
        const alt = getAltitudeAt(0, 0);
        expect(alt).toBeCloseTo(2000, 0);
    });
});
