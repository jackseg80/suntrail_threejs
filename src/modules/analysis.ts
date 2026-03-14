import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { updateSunPosition } from './sun';
import { activeTiles } from './terrain';
import { worldToLngLat } from './geo';
import { showToast } from './utils';

/**
 * Récupère l'altitude à des coordonnées monde (x, z)
 * Utilise les données pixelData des tuiles actives.
 */
let lastTile: any = null;

export function getAltitudeAt(worldX: number, worldZ: number): number {
    const testPoint = new THREE.Vector3(worldX, 0, worldZ);
    let tile: any = null;

    // 1. Essayer d'abord la dernière tuile (Spatial Locality)
    if (lastTile && lastTile.status === 'loaded' && lastTile.bounds && lastTile.bounds.containsPoint(testPoint)) {
        tile = lastTile;
    } else {
        // 2. Recherche complète si nécessaire
        for (const t of activeTiles.values()) {
            if (t.bounds && t.bounds.containsPoint(testPoint)) {
                if (!tile || t.zoom > tile.zoom) tile = t;
            }
        }
        if (tile) lastTile = tile;
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

    // --- INTERPOLATION BI-LINÉAIRE (v4.2.3) ---
    // On calcule les coordonnées flottantes dans la grille de pixels
    const fx = relX * res;
    const fz = relZ * res;
    
    // Indices des 4 pixels environnants
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(x0 + 1, res - 1);
    const z1 = Math.min(z0 + 1, res - 1);
    
    // Ratios d'interpolation
    const u = fx - x0;
    const v = fz - z0;

    const getHeight = (px: number, pz: number) => {
        const idx = (pz * res + px) * 4;
        const r = tile.pixelData[idx];
        const g = tile.pixelData[idx + 1];
        const b = tile.pixelData[idx + 2];
        return -10000 + (r * 65536 + g * 256 + b) * 0.1;
    };

    const h00 = getHeight(x0, z0);
    const h10 = getHeight(x1, z0);
    const h01 = getHeight(x0, z1);
    const h11 = getHeight(x1, z1);

    // Interpolation finale
    const finalH = h00 * (1 - u) * (1 - v) +
                   h10 * u * (1 - v) +
                   h01 * (1 - u) * v +
                   h11 * u * v;

    return finalH * state.RELIEF_EXAGGERATION;
}

/**
 * Trouve l'intersection précise entre un rayon (clic souris) et le relief (v3.9.2)
 * Utilise un algorithme de ray-marching sur CPU car le Raycaster Three.js 
 * ne voit pas les déformations du Vertex Shader.
 */
export function findTerrainIntersection(ray: THREE.Ray): THREE.Vector3 | null {
    const stepSize = 250; 
    const maxDist = 500000; // Étendu à 500km pour le clic haute altitude (v4.4.1)
    
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

    const stepSize = 100; // Pas réduit pour plus de précision (v4.2.3)
    const maxDist = 50000; // Étendu à 50km
    let currentDist = stepSize; // Marge réduite grâce à l'interpolation lisse

    while (currentDist < maxDist) {
        const testPt = origin.clone().add(sunDir.clone().multiplyScalar(currentDist));
        const terrainH = getAltitudeAt(testPt.x, testPt.z);
        
        if (terrainH > testPt.y) return true;
        
        // Pas adaptatif : on avance plus vite si on est loin au-dessus du sol
        const diff = testPt.y - terrainH;
        currentDist += stepSize + Math.max(0, diff * 0.8);
    }

    return false;
}

/**
 * Lance l'analyse d'ensoleillement sur 24h (Précision 5 min - v4.2.3)
 */
export async function runSolarProbe(worldX: number, worldZ: number, altitude: number): Promise<void> {
    const resultOverlay = document.getElementById('probe-result');
    const timeline = document.getElementById('probe-timeline');
    const totalDisp = document.getElementById('probe-total');
    const statusDisp = document.getElementById('probe-status');
    const sunriseDisp = document.getElementById('probe-sunrise');
    const coordInfo = document.getElementById('probe-coord-info');
    const copyBtn = document.getElementById('copy-report-btn');

    if (!resultOverlay || !timeline || !totalDisp || !statusDisp || !sunriseDisp) return;

    resultOverlay.style.display = 'block';
    timeline.innerHTML = '';
    totalDisp.textContent = '--h--';
    sunriseDisp.textContent = '--:--';
    statusDisp.textContent = 'Calcul...';

    const currentGPS = worldToLngLat(worldX, worldZ, state.originTile);
    if (coordInfo) coordInfo.textContent = `LAT: ${currentGPS.lat.toFixed(4)} LON: ${currentGPS.lon.toFixed(4)}`;

    const origin = new THREE.Vector3(worldX, altitude + 1, worldZ);
    const date = new Date(state.simDate);
    date.setHours(0, 0, 0, 0);

    let sunMinutes = 0;
    let firstSunMinute = -1;
    const interval = 5; 
    const samples = 288; 
    const results: number[] = []; 

    for (let i = 0; i < samples; i++) {
        const sampleDate = new Date(date.getTime() + i * interval * 60000);
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
            
            if (isSunOccluded(origin, sunDir)) {
                res = 1;
            } else {
                res = 2;
                sunMinutes += interval;
                if (firstSunMinute === -1) firstSunMinute = i * interval;
            }
        }
        results.push(res);

        if (i % 36 === 0) {
            statusDisp.textContent = `${Math.round((i/samples)*100)}%`;
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Lever de soleil effectif
    if (firstSunMinute !== -1) {
        const h = Math.floor(firstSunMinute / 60);
        const m = firstSunMinute % 60;
        sunriseDisp.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Rendu de la timeline + Interaction
    results.forEach((res, i) => {
        const segment = document.createElement('div');
        segment.style.flex = '1';
        if (i % 12 === 0 && i > 0) segment.style.borderLeft = '1px solid rgba(255,255,255,0.05)';
        
        if (res === 0) segment.style.background = '#000';
        else if (res === 1) segment.style.background = '#333';
        else segment.style.background = 'linear-gradient(to bottom, #ffd700, #f59e0b)';

        // Interaction au survol/clic
        segment.addEventListener('click', () => {
            const minutes = i * interval;
            const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
            if (timeSlider) {
                timeSlider.value = minutes.toString();
                updateSunPosition(minutes);
            }
            // Feedback visuel sur la timeline
            Array.from(timeline.children).forEach(c => (c as HTMLElement).style.opacity = '1');
            segment.style.opacity = '0.5';
        });

        timeline.appendChild(segment);
    });

    const hours = Math.floor(sunMinutes / 60);
    const mins = sunMinutes % 60;
    const totalStr = `${hours}h${mins.toString().padStart(2, '0')}`;
    totalDisp.textContent = totalStr;
    statusDisp.textContent = 'Précision 5m';

    // Bouton de copie
    if (copyBtn) {
        copyBtn.onclick = () => {
            const report = `SunTrail Solar Report\nLocation: ${currentGPS.lat.toFixed(5)}, ${currentGPS.lon.toFixed(5)}\nTotal Sunlight: ${totalStr}\nActual Sunrise: ${sunriseDisp.textContent}`;
            navigator.clipboard.writeText(report);
            showToast("📋 Rapport copié");
        };
    }
}
