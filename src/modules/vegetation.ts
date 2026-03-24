import * as THREE from 'three';
import { state } from './state';
import type { Tile } from './terrain';

// --- RESSOURCES DES ESSENCES (v4.9.1) ---
interface TreeEssence {
    geometry: THREE.BufferGeometry;
    material: THREE.MeshStandardMaterial;
    mesh: THREE.InstancedMesh | null;
}

const essences: Record<string, TreeEssence> = {};

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
        mesh: null
    };

    // 2. MÉLÈZE (Haute altitude)
    const melezeGeo = new THREE.ConeGeometry(14, 28, 5); 
    melezeGeo.translate(0, 14, 0);
    essences.meleze = {
        geometry: melezeGeo,
        material: new THREE.MeshStandardMaterial({ color: 0x2d4c1e, roughness: 0.8, emissive: 0x0a1205, emissiveIntensity: 0.2 }),
        mesh: null
    };

    // 3. FEUILLU (Plaine / Vallées)
    const feuilluGeo = new THREE.SphereGeometry(15, 6, 6);
    feuilluGeo.scale(1, 1.2, 1);
    feuilluGeo.translate(0, 20, 0);
    essences.feuillu = {
        geometry: feuilluGeo,
        material: new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9, emissive: 0x051005, emissiveIntensity: 0.1 }),
        mesh: null
    };
}

/**
 * Génère une forêt bio-fidèle sur une tuile (v5.4.2)
 * Filtre amélioré pour exclure les terrains de sport (trop clairs/saturés)
 */
export function createForestForTile(tile: Tile): THREE.Group | null {
    // --- SÉCURITÉ SATELLITE (v5.4.8) ---
    // L'analyse de texture sur photo satellite produit trop de faux positifs (arbres partout).
    // De plus, les arbres sont déjà visibles sur la photo elle-même.
    const isSatellite = state.MAP_SOURCE === 'satellite' || state.MAP_SOURCE === 'ign-ortho';
    if (!state.SHOW_VEGETATION || isSatellite || !tile.colorTex || !tile.pixelData || tile.zoom < 14) return null;

    const img = tile.colorTex.image as any;
    if (!img || !img.width) return null;

    initVegetationResources();

    // --- ADAPTIVE SCAN RESOLUTION (v5.8.7) ---
    // On augmente la résolution de scan pour permettre plus de densité
    const scanRes = (state.PERFORMANCE_PRESET === 'ultra') ? 128 : 80;
    const canvas = document.createElement('canvas');
    canvas.width = scanRes; canvas.height = scanRes; 
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!ctx) return null;

    if (tile.colorScale < 1.0) {
        ctx.drawImage(img, img.width * tile.colorOffset.x, img.height * tile.colorOffset.y, img.width * tile.colorScale, img.height * tile.colorScale, 0, 0, scanRes, scanRes);
    } else {
        ctx.drawImage(img, 0, 0, scanRes, scanRes);
    }
    
    const colorData = ctx.getImageData(0, 0, scanRes, scanRes).data;
    const maxTrees = state.VEGETATION_DENSITY;
    const dummy = new THREE.Object3D();
    const size = tile.tileSizeMeters;
    const exaggeration = state.RELIEF_EXAGGERATION;

    const forestGroup = new THREE.Group();
    const instances: Record<string, { count: number, matrices: THREE.Matrix4[] }> = {
        sapin: { count: 0, matrices: [] },
        meleze: { count: 0, matrices: [] },
        feuillu: { count: 0, matrices: [] }
    };

    const step = (state.PERFORMANCE_PRESET === 'ultra') ? 1 : ((state.PERFORMANCE_PRESET === 'performance') ? 1 : 2);
    const densityBoost = (state.PERFORMANCE_PRESET === 'ultra') ? 1.2 : 1.0;

    let totalActive = 0;

    for (let py = 0; py < scanRes; py += step) {
        for (let px = 0; px < scanRes; px += step) {
            if (totalActive >= maxTrees) break;

            const i = (py * scanRes + px) * 4;
            const r = colorData[i], g = colorData[i+1], b = colorData[i+2];
            
            let isForest = false;
            if (state.MAP_SOURCE === 'opentopomap') {
                isForest = (g > b * 1.1 && (g + r * 0.3) > b * 1.3 && g > 30);
            } else {
                const brightness = (r + g + b) / 3;
                
                // --- FILTRE ANTI-PELOUSE AVANCÉ (v5.8.9) ---
                // Sur SwissTopo :
                // - Forêt : G est dominant mais R et B sont présents (couleur terreuse/désaturée).
                // - Prairie : Très lumineuse (> 200).
                // - Terrain de Sport : Vert "pur" et très saturé, pauvre en Rouge.
                
                const isVeryBright = brightness > 195; 
                const isSportField = (g > r * 1.45 && g > b * 1.35); // Signature du vert électrique
                const isPureGreen = (g > 100 && r < 80 && b < 80); // Gazon synthétique ou urbain
                
                const isNeutral = (Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 160);
                
                // La forêt sur SwissTopo est dans les tons moyens (100-190) et peu saturée
                isForest = (g > r * 1.05 && g > b * 1.05 && !isNeutral && !isVeryBright && !isSportField && !isPureGreen);
                
                // Correction spécifique pour SwissTopo : la forêt a souvent du rouge (brunatre)
                if (isForest && state.MAP_SOURCE === 'swisstopo') {
                    // Si c'est trop "vert fluo" par rapport au rouge, c'est probablement de la pelouse
                    if (g > r * 1.30) isForest = false;
                }
            }

            if (isForest) {
                // On ajoute un petit aléatoire pour la densité (v5.5.0)
                if (Math.random() > 0.98 && step > 1) continue; 

                const lx = ((px / scanRes) - 0.5) * size + (Math.random() - 0.5) * (size / scanRes) * step;
                const lz = ((py / scanRes) - 0.5) * size + (Math.random() - 0.5) * (size / scanRes) * step;

                const h = getSimpleAltitude(tile, lx, lz, exaggeration);
                const realAlt = h / exaggeration;

                if (realAlt > 2450 || realAlt < 1) continue;

                let type = 'sapin';
                if (realAlt < 950) {
                    type = Math.random() > 0.28 ? 'feuillu' : 'sapin';
                } else if (realAlt > 1750) {
                    type = Math.random() > 0.38 ? 'meleze' : 'sapin';
                }

                dummy.position.set(lx, h, lz);
                const scale = (0.45 + Math.random() * 0.85) * densityBoost; 
                dummy.scale.set(scale, scale * (0.85 + Math.random() * 0.50), scale);
                dummy.rotation.y = Math.random() * Math.PI;
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
            const iMesh = new THREE.InstancedMesh(essences[type].geometry, essences[type].material, data.count);
            for (let j = 0; j < data.count; j++) {
                iMesh.setMatrixAt(j, data.matrices[j]);
            }
            iMesh.castShadow = true;
            iMesh.receiveShadow = true;
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
    
    return (-10000 + (r * 65536 + g * 256 + b) * 0.1) * exaggeration;
}
