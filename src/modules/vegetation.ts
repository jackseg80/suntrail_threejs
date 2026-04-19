import * as THREE from 'three';
import { state } from './state';
import type { Tile } from './terrain';
import { decodeTerrainRGB } from './geo';
import { fetchLandcoverPBF, isPointInForest } from './landcover';

/**
 * Seeded pseudo-random function for deterministic placement (v5.8.15)
 */
function pseudoRandom(x: number, y: number, seed: number = 0): number {
    const val = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.11) * 43758.5453123;
    return val - Math.floor(val);
}

// --- RESSOURCES DES ESSENCES (v4.9.1) ---
interface TreeEssence {
    geometry: THREE.BufferGeometry;
    material: THREE.MeshStandardMaterial;
    material2D: THREE.MeshBasicMaterial;
    mesh: THREE.InstancedMesh | null;
}

const essences: Record<string, TreeEssence> = {};

// Canvas/contexte statique réutilisé pour le scan couleur (évite de créer des centaines de canvas orphelins)
let scanCanvas: HTMLCanvasElement | null = null;
let scanCtx: CanvasRenderingContext2D | null = null;

/**
 * Initialise les ressources partagées pour les arbres (Bio-Fidèles)
 */
export function initVegetationResources() {
    if (Object.keys(essences).length > 0) return;

    // 1. SAPIN (Conifère standard)
    const sapinGeo = new THREE.ConeGeometry(10, 35, 7); 
    sapinGeo.translate(0, 17.5, 0);
    essences.sapin = {
        geometry: sapinGeo,
        material: new THREE.MeshStandardMaterial({ color: 0x14331a, roughness: 0.9, emissive: 0x050805, emissiveIntensity: 0.2 }),
        material2D: new THREE.MeshBasicMaterial({ color: 0x14331a }),
        mesh: null
    };

    // 2. MÉLÈZE (Haute altitude)
    const melezeGeo = new THREE.ConeGeometry(14, 28, 5); 
    melezeGeo.translate(0, 14, 0);
    essences.meleze = {
        geometry: melezeGeo,
        material: new THREE.MeshStandardMaterial({ color: 0x2d4c1e, roughness: 0.8, emissive: 0x0a1205, emissiveIntensity: 0.2 }),
        material2D: new THREE.MeshBasicMaterial({ color: 0x2d4c1e }),
        mesh: null
    };

    // 3. FEUILLU (Plaine / Vallées)
    const feuilluGeo = new THREE.SphereGeometry(15, 6, 6);
    feuilluGeo.scale(1, 1.2, 1);
    feuilluGeo.translate(0, 20, 0);
    essences.feuillu = {
        geometry: feuilluGeo,
        material: new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9, emissive: 0x051005, emissiveIntensity: 0.1 }),
        material2D: new THREE.MeshBasicMaterial({ color: 0x2d5a27 }),
        mesh: null
    };
}

/**
 * Génère une forêt bio-fidèle sur une tuile (v5.33.0)
 * Stratégie Tiered : Vector PBF (SwissTopo/MapTiler) -> Raster Variance Fallback
 */
export async function createForestForTile(tile: Tile): Promise<THREE.Group | null> {
    const isSatellite = state.MAP_SOURCE === 'satellite' || state.MAP_SOURCE === 'ign-ortho';
    if (!state.SHOW_VEGETATION || isSatellite || !tile.colorTex || !tile.pixelData || tile.zoom < 14) return null;

    const img = tile.colorTex.image as any;
    if (!img || !img.width) return null;

    initVegetationResources();

    // --- PHASE 2/3 : FETCH VECTOR LANDCOVER (PBF) ---
    // On lance le fetch en parallèle du scan raster pour masquer la latence
    const landcoverPromise = fetchLandcoverPBF(tile);

    // --- SCAN RESOLUTION STABLE (v5.8.10) ---
    const scanRes = 64;
    if (!scanCanvas) {
        scanCanvas = document.createElement('canvas');
        scanCanvas.width = scanRes; scanCanvas.height = scanRes;
        scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
    } else if (scanCtx) {
        scanCtx.clearRect(0, 0, scanRes, scanRes);
    }
    const ctx = scanCtx;
    if (!ctx) return null;

    if (tile.colorScale < 1.0) {
        ctx.drawImage(img, img.width * tile.colorOffset.x, img.height * tile.colorOffset.y, img.width * tile.colorScale, img.height * tile.colorScale, 0, 0, scanRes, scanRes);
    } else {
        ctx.drawImage(img, 0, 0, scanRes, scanRes);
    }
    
    const colorData = ctx.getImageData(0, 0, scanRes, scanRes).data;
    const landcover = await landcoverPromise; // Attente du PBF (déjà en cache si chargé par une tuile voisine)
    const forests = landcover?.forests;

    // --- DENSITÉ HARMONISÉE (v5.33.1) ---
    const hasVectors = (forests && forests.length > 0);
    // Si on a des vecteurs, on utilise un pas de 2 minimum pour économiser du CPU (le résultat est déjà précis)
    const step = hasVectors ? Math.max(2, (state.PERFORMANCE_PRESET === 'eco' ? 4 : 2)) : ((state.PERFORMANCE_PRESET === 'ultra') ? 1 : ((state.PERFORMANCE_PRESET === 'performance') ? 2 : 4));
    
    const totalSlots = (scanRes / step) * (scanRes / step);
    const areaRatio = Math.pow(4, 15 - tile.zoom);
    const targetTrees = Math.max(20, Math.floor(state.VEGETATION_DENSITY * areaRatio));
    
    // Probabilité ajustée : on booste le placement vectoriel car il est plus restrictif géographiquement
    const placementProbability = Math.min(1.0, (hasVectors ? 2.0 : 1.0) * targetTrees / totalSlots);
    
    const dummy = new THREE.Object3D();
    const size = tile.tileSizeMeters;
    const exaggeration = state.RELIEF_EXAGGERATION;

    const forestGroup = new THREE.Group();
    const instances: Record<string, { count: number, matrices: THREE.Matrix4[] }> = {
        sapin: { count: 0, matrices: [] },
        meleze: { count: 0, matrices: [] },
        feuillu: { count: 0, matrices: [] }
    };

    const densityBoost = (state.PERFORMANCE_PRESET === 'ultra') ? 1.1 : 1.0;
    let totalActive = 0;

    for (let py = 0; py < scanRes; py += step) {
        for (let px = 0; px < scanRes; px += step) {
            const globalX = tile.tx * scanRes + px;
            const globalY = tile.ty * scanRes + py;

            const spx = Math.floor(px + pseudoRandom(globalX, globalY, 1) * step);
            const spy = Math.floor(py + pseudoRandom(globalX, globalY, 2) * step);
            const i = (Math.min(scanRes - 1, spy) * scanRes + Math.min(scanRes - 1, spx)) * 4;
            
            const r = colorData[i], g = colorData[i+1], b = colorData[i+2];
            
            let isForest = false;
            
            // --- STRATÉGIE DE DÉTECTION (v5.33.1) ---
            if (forests) {
                // Tier 1/3 : Données vectorielles (on fait confiance au vecteur, même si vide)
                isForest = (forests.length > 0) && isPointInForest(tile, spx, spy, scanRes, forests);
            } else {
                // Tier 4 : Fallback Raster avec filtre de variance (Erreur réseau ou offline sans vecteur)
                if (state.MAP_SOURCE === 'opentopomap') {
                    isForest = (g > b * 1.1 && (g + r * 0.3) > b * 1.3 && g > 30);
                } else {
                    const brightness = (r + g + b) / 3;
                    const isForestColor = (g > r * 1.02 && g > b * 1.05 && brightness < 228 && g > 40);
                    const isTooVivid = (g > r * 1.28); 
                    const isNeutral = (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 160);
                    
                    const i_r = (Math.min(scanRes - 1, spy) * scanRes + Math.min(scanRes - 1, spx + 1)) * 4;
                    const i_d = (Math.min(scanRes - 1, spy + 1) * scanRes + Math.min(scanRes - 1, spx)) * 4;
                    const variance = Math.abs(g - colorData[i_r + 1]) + Math.abs(g - colorData[i_d + 1]);
                    const isArtificial = (variance < 1);
                    
                    isForest = isForestColor && !isTooVivid && !isNeutral && !isArtificial;
                }
            }

            if (isForest) {
                if (pseudoRandom(globalX, globalY, 3) > placementProbability) continue;

                const jx = (pseudoRandom(globalX, globalY, 4) - 0.5) * (size / scanRes) * step;
                const jz = (pseudoRandom(globalX, globalY, 5) - 0.5) * (size / scanRes) * step;
                const lx = ((px / scanRes) - 0.5) * size + jx;
                const lz = ((py / scanRes) - 0.5) * size + jz;

                const h = getSimpleAltitude(tile, lx, lz, exaggeration);
                const realAlt = h / exaggeration;

                if (realAlt > 2450 || realAlt < 1) continue;

                let type = 'sapin';
                const typeRand = pseudoRandom(globalX, globalY, 6);
                if (realAlt < 950) {
                    type = typeRand > 0.28 ? 'feuillu' : 'sapin';
                } else if (realAlt > 1750) {
                    type = typeRand > 0.38 ? 'meleze' : 'sapin';
                }

                dummy.position.set(lx, h, lz);
                const scale = (0.35 + pseudoRandom(globalX, globalY, 7) * 0.65) * densityBoost; 
                dummy.scale.set(scale, scale * (0.85 + pseudoRandom(globalX, globalY, 8) * 0.45), scale);
                dummy.rotation.y = pseudoRandom(globalX, globalY, 9) * Math.PI;
                dummy.updateMatrix();
                
                instances[type].matrices.push(dummy.matrix.clone());
                instances[type].count++;
                totalActive++;
            }
        }
    }

    Object.keys(instances).forEach(type => {
        const data = instances[type];
        if (data.count > 0) {
            const is2D = state.IS_2D_MODE;
            const mat = is2D ? essences[type].material2D : essences[type].material;
            const iMesh = new THREE.InstancedMesh(essences[type].geometry, mat, data.count);
            for (let j = 0; j < data.count; j++) {
                iMesh.setMatrixAt(j, data.matrices[j]);
            }
            iMesh.frustumCulled = false;
            iMesh.castShadow = !is2D && state.VEGETATION_CAST_SHADOW;
            iMesh.receiveShadow = !is2D;
            forestGroup.add(iMesh);
        }
    });

    return totalActive > 0 ? forestGroup : null;
}

function getSimpleAltitude(tile: Tile, localX: number, localZ: number, exaggeration: number): number {
    if (!tile.pixelData) return 0;
    const res = Math.sqrt(tile.pixelData.length / 4);
    
    let relX = (localX / tile.tileSizeMeters) + 0.5;
    let relZ = (localZ / tile.tileSizeMeters) + 0.5;

    if (tile.elevScale < 1.0) {
        relX = tile.elevOffset.x + (relX * tile.elevScale);
        relZ = tile.elevOffset.y + (relZ * tile.elevScale);
    }

    const px = Math.floor(THREE.MathUtils.clamp(relX, 0, 0.999) * res);
    const py = Math.floor(THREE.MathUtils.clamp(relZ, 0, 0.999) * res);
    const idx = (py * res + px) * 4;
    
    const r = tile.pixelData[idx];
    const g = tile.pixelData[idx+1];
    const b = tile.pixelData[idx+2];
    
    return decodeTerrainRGB(r, g, b, exaggeration);
}
