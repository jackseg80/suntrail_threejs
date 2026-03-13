import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { activeTiles, worldToLngLat } from './terrain';

/**
 * Récupère l'altitude à des coordonnées monde (x, z)
 * Utilise les données pixelData des tuiles actives.
 */
export function getAltitudeAt(worldX: number, worldZ: number): number {
    // 1. Recherche de la meilleure tuile couvrant ce point (v3.10.0)
    let tile: any = null;
    const testPoint = new THREE.Vector3(worldX, 0, worldZ);
    
    for (const t of activeTiles.values()) {
        if (t.bounds.containsPoint(testPoint)) {
            // On privilégie le zoom le plus élevé pour la précision
            if (!tile || t.zoom > tile.zoom) tile = t;
        }
    }

    if (!tile || !tile.pixelData) return 0;

    // 2. Détection de la résolution (256 ou 512)
    const res = Math.sqrt(tile.pixelData.length / 4);

    let relX = (worldX - tile.worldX) / tile.tileSizeMeters + 0.5;
    let relZ = (worldZ - tile.worldZ) / tile.tileSizeMeters + 0.5;

    // 3. --- SUPPORT HYBRIDE (v3.10.0) ---
    if (tile.elevScale < 1.0) {
        relX = tile.elevOffset.x + (relX * tile.elevScale);
        relZ = tile.elevOffset.y + (relZ * tile.elevScale);
    }

    const px = Math.floor(THREE.MathUtils.clamp(relX, 0, 0.999) * res);
    const py = Math.floor(THREE.MathUtils.clamp(relZ, 0, 0.999) * res);

    const idx = (py * res + px) * 4;
    if (idx < 0 || idx >= tile.pixelData.length) return 0;

    const r = tile.pixelData[idx];
    const g = tile.pixelData[idx + 1];
    const b = tile.pixelData[idx + 2];

    return (-10000 + (r * 65536 + g * 256 + b) * 0.1) * state.RELIEF_EXAGGERATION;
}

/**
 * Trouve l'intersection précise entre un rayon (clic souris) et le relief (v3.9.2)
 * Utilise un algorithme de ray-marching sur CPU car le Raycaster Three.js 
 * ne voit pas les déformations du Vertex Shader.
 */
export function findTerrainIntersection(ray: THREE.Ray): THREE.Vector3 | null {
    const stepSize = 150; // Pas de 150m pour la recherche globale
    const maxDist = Math.min(120000, state.FOG_FAR || 100000); // On ne cherche pas plus loin que le voile atmosphérique
    
    for (let dist = 0; dist < maxDist; dist += stepSize) {
        const p = ray.at(dist, new THREE.Vector3());
        const terrainH = getAltitudeAt(p.x, p.z);
        
        if (p.y <= terrainH) {
            // 2. Raffinement par dichotomie (10 itérations pour une précision < 0.1m interne)
            let dMin = dist - stepSize;
            let dMax = dist;
            for (let i = 0; i < 10; i++) {
                const dMid = (dMin + dMax) / 2;
                const pMid = ray.at(dMid, new THREE.Vector3());
                const hMid = getAltitudeAt(pMid.x, pMid.z);
                if (pMid.y <= hMid) dMax = dMid;
                else dMin = dMid;
            }
            return ray.at(dMax, new THREE.Vector3());
        }
    }
    return null;
}

/**
 * Vérifie si le soleil est occlu par le relief depuis un point d'origine
 */
export function isSunOccluded(origin: THREE.Vector3, sunDir: THREE.Vector3): boolean {
    // Si le soleil est sous l'horizon plat, il est occlu
    if (sunDir.y < 0) return true;

    const stepSize = 150; // Pas de 150m pour le ray-marching
    const maxDist = 40000; // On cherche jusqu'à 40km
    let currentDist = stepSize * 5; // Marge accrue pour éviter l'auto-occlusion (v3.9.1 stable)

    while (currentDist < maxDist) {
        const testPt = origin.clone().add(sunDir.clone().multiplyScalar(currentDist));
        const terrainH = getAltitudeAt(testPt.x, testPt.z);
        
        if (terrainH > testPt.y) return true;
        
        // Optimisation : on augmente le pas si on est haut au-dessus du relief
        const diff = testPt.y - terrainH;
        currentDist += stepSize + Math.max(0, diff * 0.5);
    }

    return false;
}

/**
 * Lance l'analyse d'ensoleillement sur 24h
 */
export async function runSolarProbe(worldX: number, worldZ: number, altitude: number): Promise<void> {
    const resultOverlay = document.getElementById('probe-result');
    const timeline = document.getElementById('probe-timeline');
    const totalDisp = document.getElementById('probe-total');
    const statusDisp = document.getElementById('probe-status');

    if (!resultOverlay || !timeline || !totalDisp || !statusDisp) return;

    resultOverlay.style.display = 'block';
    timeline.innerHTML = '';
    totalDisp.textContent = '--h--';
    statusDisp.textContent = 'Calcul...';

    const origin = new THREE.Vector3(worldX, altitude + 2, worldZ);
    const date = new Date(state.simDate);
    date.setHours(0, 0, 0, 0);

    let sunMinutes = 0;
    const samples = 96; // Toutes les 15 min pour plus de précision
    const results: number[] = []; // 0: Nuit, 1: Ombre, 2: Soleil

    // On utilise un générateurs ou des délais pour ne pas freezer l'UI
    for (let i = 0; i < samples; i++) {
        const sampleDate = new Date(date.getTime() + i * 15 * 60000);
        // Utilisation des coordonnées GPS réelles du point pour SunCalc
        const currentGPS = worldToLngLat(worldX, worldZ);
        const sunPos = SunCalc.getPosition(sampleDate, currentGPS.lat, currentGPS.lon);
        
        let res = 0;
        if (sunPos.altitude > 0) {
            const sunDir = new THREE.Vector3();
            const phi = sunPos.altitude;
            const az = sunPos.azimuth;
            
            sunDir.x = Math.cos(phi) * -Math.sin(az);
            sunDir.y = Math.sin(phi);
            sunDir.z = Math.cos(phi) * Math.cos(az);
            sunDir.normalize();
            
            const probeOrigin = origin.clone().add(new THREE.Vector3(0, 5, 0));
            
            if (isSunOccluded(probeOrigin, sunDir)) {
                res = 1;
            } else {
                res = 2;
                sunMinutes += 15;
            }
        }
        results.push(res);

        // Mise à jour visuelle progressive
        if (i % 12 === 0) {
            statusDisp.textContent = `Analyse ${Math.round((i/samples)*100)}%`;
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Rendu de la timeline
    results.forEach((res, i) => {
        const segment = document.createElement('div');
        segment.style.flex = '1';
        // Bordure subtile toutes les heures (tous les 4 segments de 15min)
        if (i % 4 === 0 && i > 0) segment.style.borderLeft = '1px solid rgba(255,255,255,0.1)';
        
        if (res === 0) segment.style.background = '#000';
        else if (res === 1) segment.style.background = '#444';
        else segment.style.background = '#ffd700';
        timeline.appendChild(segment);
    });

    const hours = Math.floor(sunMinutes / 60);
    const mins = sunMinutes % 60;
    totalDisp.textContent = `${hours}h${mins.toString().padStart(2, '0')}`;
    statusDisp.textContent = 'Terminé';
}
