import * as THREE from 'three';
import { state, PresetType } from './state';
import { detectBestPreset } from './performance';

export interface BenchmarkResult {
    cpuScore: number;
    gpuScore: number;
    totalScore: number;
    recommendedPreset: PresetType;
}

/**
 * Micro-benchmark ultra-rapide (<500ms) pour calibrer les performances
 * @author Gemini CLI
 */
export async function runBenchmark(): Promise<BenchmarkResult> {
    const start = performance.now();
    
    // 1. Test CPU (~100ms) - Calculs mathématiques bruts
    const cpuRaw = testCPU();
    
    // 2. Test GPU (~150ms) - Rendu de géométrie complexe
    const gpuRaw = await testGPU();
    
    // 3. Calcul du score final
    const basePreset = detectBestPreset();
    let baseWeight = 20; // Eco
    if (basePreset === 'ultra') baseWeight = 95; 
    if (basePreset === 'performance') baseWeight = 60; // S23, High-end mobile
    if (basePreset === 'balanced') baseWeight = 35;

    // Normalisation VÉRITÉ
    const normalizedCPU = Math.min((cpuRaw * 0.8), 100); 
    const normalizedGPU = Math.min((gpuRaw * 5), 100); 

    // Pondération : GPU (60%), CPU (20%), Liste GPU (20%)
    const totalScore = Math.round(
        (normalizedCPU * 0.2) + 
        (normalizedGPU * 0.6) + 
        (baseWeight * 0.2)
    );

    let recommendedPreset: PresetType = 'eco';
    if (totalScore >= 92) recommendedPreset = 'ultra';      // Desktop uniquement
    else if (totalScore >= 65) recommendedPreset = 'performance'; // S23 et mobiles premium
    else if (totalScore >= 30) recommendedPreset = 'balanced';    // A53 et mobiles moyens


    const result = {
        cpuScore: Math.round(normalizedCPU),
        gpuScore: Math.round(normalizedGPU),
        totalScore,
        recommendedPreset
    };

    // Mise à jour de l'état
    state.benchmarkResults = {
        cpuScore: result.cpuScore,
        gpuScore: result.gpuScore,
        totalScore: result.totalScore,
        timestamp: Date.now()
    };

    console.log(`[Benchmark] Final Score: ${totalScore} -> ${recommendedPreset.toUpperCase()} (CPU:${result.cpuScore} GPU:${result.gpuScore} RawCPU:${cpuRaw} RawGPU:${gpuRaw}) in ${Math.round(performance.now() - start)}ms`);
    
    return result;
}

/**
 * Test CPU : Débit d'instructions + Bande passante mémoire
 * (1MB de données pour stresser les caches L2/L3 et la RAM)
 */
function testCPU(): number {
    const start = performance.now();
    let iterations = 0;
    const duration = 100;
    
    // 128k Float64 = 1MB (Dépasse le cache L1 de 32-64KB)
    const size = 128 * 1024;
    const buffer = new Float64Array(size);
    for (let i = 0; i < size; i++) buffer[i] = i;
    
    while (performance.now() - start < duration) {
        for (let i = 1; i < size; i++) {
            // Chaîne d'opérations avec dépendances pour empêcher la parallélisation automatique massive
            buffer[i] = Math.sqrt(buffer[i-1] * 0.1) + (i * 0.0001) + buffer[i];
        }
        iterations++;
    }
    return iterations;
}

/**
 * Test GPU : Rendu Réel (1024px + 8 Lights + gl.readPixels)
 */
async function testGPU(): Promise<number> {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);

    // 8 lumières dynamiques ( shader très lourd )
    for (let i = 0; i < 8; i++) {
        const light = new THREE.PointLight(0xffffff, 1, 150);
        scene.add(light);
    }
    scene.add(new THREE.AmbientLight(0x202020));

    const geometry = new THREE.TorusKnotGeometry(10, 3, 128, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.1, metalness: 0.9 });
    
    for (let i = 0; i < 20; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(Math.random() * 100 - 50, Math.random() * 100 - 50, Math.random() * 100 - 50);
        scene.add(mesh);
    }

    const start = performance.now();
    let frames = 0;
    const duration = 150;

    while (performance.now() - start < duration) {
        renderer.render(scene, camera);
        // FORCE SYNC : Oblige le CPU à attendre que le GPU ait fini de dessiner
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        frames++;
    }

    renderer.dispose();
    geometry.dispose();
    material.dispose();
    return frames;
}
