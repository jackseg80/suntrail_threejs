import * as THREE from 'three';
import { state, PresetType } from './state';
import { detectBestPreset, getGpuInfo } from './performance';

export interface BenchmarkResult {
    cpuScore: number;
    gpuScore: number;
    totalScore: number;
    recommendedPreset: PresetType;
}

/**
 * Micro-benchmark (~800ms) pour calibrer les performances
 * v5.56.24 : Durées prolongées + warmup pour fiabilité sur premier démarrage
 */
export async function runBenchmark(): Promise<BenchmarkResult> {
    const start = performance.now();

    // Warmup CPU — pousse les optimisations JIT avant la mesure
    testCPUWarmup();

    // 1. Test CPU (~200ms)
    const cpuRaw = testCPU();

    // 2. Test GPU (~300ms)
    const gpuRaw = await testGPU();

    // 3. Calcul du score final
    const basePreset = detectBestPreset();
    let baseWeight = 20; // Eco
    if (basePreset === 'ultra') baseWeight = 95;
    if (basePreset === 'performance') baseWeight = 60; // S23, High-end mobile
    if (basePreset === 'balanced') baseWeight = 35;

    // Normalisation VÉRITÉ
    const normalizedCPU = Math.min(cpuRaw * 0.8, 100);
    const normalizedGPU = Math.min(gpuRaw * 2.5, 100);

    // Pondération : GPU (75%), CPU (15%), Liste GPU (10%)
    const totalScore = Math.round(
        normalizedCPU * 0.15 + normalizedGPU * 0.75 + baseWeight * 0.1
    );

    let recommendedPreset: PresetType = 'eco';
    if (totalScore >= 92)
        recommendedPreset = 'ultra'; // Desktop uniquement
    else if (totalScore >= 65)
        recommendedPreset = 'performance'; // S23 et mobiles premium
    else if (totalScore >= 30) recommendedPreset = 'balanced'; // A53 et mobiles moyens

    // Cap : les GPU Intel intégrés (HD/UHD/Iris/Graphics hors Arc) ne peuvent pas dépasser balanced
    const gpuRenderer = getGpuInfo().renderer.toLowerCase();
    const isIntelIGP =
        gpuRenderer.includes('intel') &&
        (gpuRenderer.includes('hd') ||
            gpuRenderer.includes('uhd') ||
            gpuRenderer.includes('iris') ||
            gpuRenderer.includes('graphics')) &&
        !gpuRenderer.includes('arc');

    if (isIntelIGP && (basePreset === 'balanced' || basePreset === 'eco')) {
        if (
            recommendedPreset === 'ultra' ||
            recommendedPreset === 'performance'
        ) {
            recommendedPreset = 'balanced';
        }
    }

    const result = {
        cpuScore: Math.round(normalizedCPU),
        gpuScore: Math.round(normalizedGPU),
        totalScore,
        recommendedPreset,
    };

    // Mise à jour de l'état
    state.benchmarkResults = {
        cpuScore: result.cpuScore,
        gpuScore: result.gpuScore,
        totalScore: result.totalScore,
        timestamp: Date.now(),
    };

    console.log(
        `[Benchmark] Final Score: ${totalScore} -> ${recommendedPreset.toUpperCase()} (CPU:${result.cpuScore} GPU:${result.gpuScore} RawCPU:${cpuRaw} RawGPU:${gpuRaw}) in ${Math.round(performance.now() - start)}ms`
    );

    return result;
}

/**
 * Warmup CPU : une passe courte pour forcer la compilation JIT avant la vraie mesure.
 */
function testCPUWarmup(): void {
    const buf = new Float64Array(32 * 1024);
    for (let i = 0; i < buf.length; i++) buf[i] = i;
    const end = performance.now() + 50;
    while (performance.now() < end) {
        for (let i = 1; i < buf.length; i++) {
            buf[i] = Math.sqrt(buf[i - 1] * 0.1) + i * 0.0001 + buf[i];
        }
    }
}

/**
 * Test CPU : Débit d'instructions + Bande passante mémoire
 * (1MB de données pour stresser les caches L2/L3 et la RAM)
 */
function testCPU(): number {
    const start = performance.now();
    let iterations = 0;
    const duration = 200;

    const size = 128 * 1024;
    const buffer = new Float64Array(size);
    for (let i = 0; i < size; i++) buffer[i] = i;

    while (performance.now() - start < duration) {
        for (let i = 1; i < size; i++) {
            buffer[i] = Math.sqrt(buffer[i - 1] * 0.1) + i * 0.0001 + buffer[i];
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

    for (let i = 0; i < 8; i++) {
        const light = new THREE.PointLight(0xffffff, 1, 150);
        scene.add(light);
    }
    scene.add(new THREE.AmbientLight(0x202020));

    const geometry = new THREE.TorusKnotGeometry(10, 3, 128, 32);
    const material = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.1,
        metalness: 0.9,
    });

    for (let i = 0; i < 20; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            Math.random() * 100 - 50,
            Math.random() * 100 - 50,
            Math.random() * 100 - 50
        );
        scene.add(mesh);
    }

    // Warmup frame — force la compilation du shader GPU
    renderer.render(scene, camera);

    const start = performance.now();
    let frames = 0;
    const duration = 300;

    while (performance.now() - start < duration) {
        renderer.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        frames++;
    }

    renderer.dispose();
    geometry.dispose();
    material.dispose();
    return frames;
}
