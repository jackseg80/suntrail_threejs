import * as THREE from 'three';
import { state } from './state';
import { isMobileDevice } from './utils';

let treeGeometry: THREE.BufferGeometry | null = null;
let treeMaterial: THREE.MeshStandardMaterial | null = null;

/**
 * Initialise les ressources partagées pour les arbres
 */
export function initVegetationResources() {
    if (treeGeometry) return;

    const coneGeo = new THREE.ConeGeometry(12, 35, 8); 
    coneGeo.translate(0, 17.5, 0);
    treeGeometry = coneGeo;
    
    treeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x14331a, 
        roughness: 0.9,
        metalness: 0.0,
        emissive: 0x050805,
        emissiveIntensity: 0.2
    });
}

/**
 * Génère une forêt dense et précise sur une tuile
 */
export function createForestForTile(tile: any): THREE.InstancedMesh | null {
    if (!state.SHOW_VEGETATION || !tile.colorTex || !tile.pixelData || tile.zoom < 14) return null;

    const img = tile.colorTex.image;
    if (!img || img.width === 0) return null;

    if (!treeGeometry || !treeMaterial) initVegetationResources();

    const scanRes = 64;
    const canvas = document.createElement('canvas');
    canvas.width = scanRes; canvas.height = scanRes; 
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, scanRes, scanRes);
    const colorData = ctx.getImageData(0, 0, scanRes, scanRes).data;

    const maxTrees = isMobileDevice() ? 4000 : 12000; 
    const mesh = new THREE.InstancedMesh(treeGeometry!, treeMaterial!, maxTrees);
    const dummy = new THREE.Object3D();
    const size = tile.tileSizeMeters;
    let activeTrees = 0;

    const checkIsForest = (x: number, y: number) => {
        if (x < 0 || x >= scanRes || y < 0 || y >= scanRes) return false;
        const i = (y * scanRes + x) * 4;
        const r = colorData[i], g = colorData[i+1], b = colorData[i+2];
        
        if (state.MAP_SOURCE === 'satellite') {
            // DÉSACTIVÉ POUR LE SATELLITE (Trop complexe/imprécis)
            return false;
        } 
        else if (state.MAP_SOURCE === 'opentopomap') {
            // OPENTOPOMAP : On élargit pour capter les verts et les teintes vert-jaune/orange
            // On cherche la dominance du (Vert + un peu de Rouge) sur le Bleu
            return (g > b * 1.1 && (g + r * 0.3) > b * 1.3 && g > 30);
        }
        else {
            // SWISSTOPO / DEFAULT : Critère actuel quasi parfait
            const isNeutral = (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 160);
            return (g > r * 1.1 && g > b * 1.1 && !isNeutral);
        }
    };

    for (let py = 0; py < scanRes; py++) {
        for (let px = 0; px < scanRes; px++) {
            if (activeTrees >= maxTrees) break;

            if (checkIsForest(px, py)) {
                // Filtre de voisinage pour supprimer l'isolement
                let forestNeighbors = 0;
                if (checkIsForest(px - 1, py)) forestNeighbors++;
                if (checkIsForest(px + 1, py)) forestNeighbors++;
                if (checkIsForest(px, py - 1)) forestNeighbors++;
                if (checkIsForest(px, py + 1)) forestNeighbors++;
                
                if (forestNeighbors < 1) continue;

                const lx = ((px / scanRes) - 0.5) * size + (Math.random() - 0.5) * (size / scanRes);
                const lz = ((py / scanRes) - 0.5) * size + (Math.random() - 0.5) * (size / scanRes);

                const h = getSimpleAltitude(tile, lx, lz);
                if (h > 2450 * state.RELIEF_EXAGGERATION || h < 2) continue;

                dummy.position.set(lx, h, lz);
                const scale = 0.3 + Math.random() * 0.7; 
                dummy.scale.set(scale, scale * (0.8 + Math.random() * 0.5), scale);
                dummy.rotation.y = Math.random() * Math.PI;
                dummy.updateMatrix();
                
                mesh.setMatrixAt(activeTrees++, dummy.matrix);
            }
        }
    }

    if (activeTrees === 0) return null;

    mesh.count = activeTrees;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
}

function getSimpleAltitude(tile: any, localX: number, localZ: number): number {
    const res = Math.sqrt(tile.pixelData.length / 4);
    
    let relX = (localX / tile.tileSizeMeters) + 0.5;
    let relZ = (localZ / tile.tileSizeMeters) + 0.5;

    // --- SUPPORT HYBRIDE Z15 (v3.9.7) ---
    // Si la tuile utilise un relief parent, on ajuste les coordonnées d'échantillonnage
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
    
    return (-10000 + (r * 65536 + g * 256 + b) * 0.1) * state.RELIEF_EXAGGERATION;
}
