import * as THREE from 'three';
import { state } from './state';
import type { Tile } from './terrain';

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
    const isSatellite = state.MAP_SOURCE === 'satellite' || state.MAP_SOURCE === 'ign-ortho';
    if (!state.SHOW_VEGETATION || isSatellite || !tile.colorTex || !tile.pixelData || tile.zoom < 14) return null;

    const img = tile.colorTex.image as any;
    if (!img || !img.width) return null;

    initVegetationResources();

    // --- SCAN RESOLUTION STABLE (v5.8.10) ---
    const scanRes = 64;
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
    
    // --- DENSITÉ HARMONISÉE (v5.8.14) ---
    // On calcule la probabilité de placement pour éviter le "Hard Cut-off" ligne par ligne
    const step = (state.PERFORMANCE_PRESET === 'ultra') ? 1 : ((state.PERFORMANCE_PRESET === 'performance') ? 2 : 4);
    const totalSlots = (scanRes / step) * (scanRes / step);
    
    // Nombre cible d'arbres pour CETTE tuile (normalisé par l'aire physique)
    // Référence LOD 15. À LOD 16 on a 4x plus de tuiles, donc 4x moins d'arbres par tuile.
    const areaRatio = Math.pow(4, 15 - tile.zoom);
    const targetTrees = Math.max(20, Math.floor(state.VEGETATION_DENSITY * areaRatio));
    
    // Probabilité qu'un slot éligible (forêt) reçoive effectivement un arbre
    // On utilise un multiplicateur de 1.0 pour une distribution uniforme (v5.8.15)
    const placementProbability = Math.min(1.0, targetTrees / totalSlots);
    
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

            // --- DITHERED SCAN (v5.8.15) ---
            // On ajoute un petit décalage au point de scan pour éviter les bandes de moiré
            const spx = Math.floor(px + pseudoRandom(globalX, globalY, 1) * step);
            const spy = Math.floor(py + pseudoRandom(globalX, globalY, 2) * step);
            const i = (Math.min(scanRes - 1, spy) * scanRes + Math.min(scanRes - 1, spx)) * 4;
            
            const r = colorData[i], g = colorData[i+1], b = colorData[i+2];
            
            let isForest = false;
            if (state.MAP_SOURCE === 'opentopomap') {
                isForest = (g > b * 1.1 && (g + r * 0.3) > b * 1.3 && g > 30);
            } else {
                const brightness = (r + g + b) / 3;
                
                // --- FILTRE DENSITÉ CONTINUE (v5.8.14) ---
                // On détecte toute la zone forestière (fond light green + symboles dark green)
                // Forêt fond SwissTopo : G dominant (~220), R présent (~210), B (~180)
                // Prairie : Très claire (> 235) et plus saturée en jaune
                const isForestColor = (g > r * 1.02 && g > b * 1.05 && brightness < 228 && g > 40);
                
                const isTooVivid = (g > r * 1.38); // Rejet des terrains de sport électriques
                const isNeutral = (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 160);
                
                isForest = isForestColor && !isTooVivid && !isNeutral;
            }

            if (isForest) {
                // --- PLACEMENT PROBABILISTE ---
                if (pseudoRandom(globalX, globalY, 3) > placementProbability) continue;

                // Jitter spatial accru pour casser totalement la grille
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
                // Ajustement de l'échelle pour plus de densité visuelle sans étouffer
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
            const iMesh = new THREE.InstancedMesh(essences[type].geometry, essences[type].material, data.count);
            for (let j = 0; j < data.count; j++) {
                iMesh.setMatrixAt(j, data.matrices[j]);
            }
            // Phase 2 : castShadow désactivé sur mobile mid-range (économise ~18 draw calls shadow pass)
            iMesh.castShadow = state.VEGETATION_CAST_SHADOW;
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
