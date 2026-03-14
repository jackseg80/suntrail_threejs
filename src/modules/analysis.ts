import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { activeTiles } from './terrain';
import { worldToLngLat } from './geo';
import { showToast } from './utils';

// --- CACHE SPATIAL (v4.5.25) ---
let lastUsedTile: any = null;

/**
 * Récupère l'altitude à des coordonnées monde (x, z)
 * Version ultra-haute performance pour usage à 120 FPS.
 */
export function getAltitudeAt(worldX: number, worldZ: number): number {
    const testPoint = new THREE.Vector3(worldX, 0, worldZ);
    let tile: any = null;

    // 1. Priorité au cache (Spatial Locality)
    if (lastUsedTile && lastUsedTile.status === 'loaded' && lastUsedTile.bounds && lastUsedTile.bounds.containsPoint(testPoint)) {
        tile = lastUsedTile;
    } else {
        // 2. Sinon recherche rapide dans les tuiles actives
        for (const t of activeTiles.values()) {
            if (t.status === 'loaded' && t.bounds && t.bounds.containsPoint(testPoint)) {
                // On privilégie la tuile la plus précise (zoom le plus élevé)
                if (!tile || t.zoom > tile.zoom) tile = t;
            }
        }
        if (tile) lastUsedTile = tile;
    }

    if (!tile || !tile.pixelData) return 0;

    const res = Math.sqrt(tile.pixelData.length / 4);
    let relX = (worldX - tile.worldX) / tile.tileSizeMeters + 0.5;
    let relZ = (worldZ - tile.worldZ) / tile.tileSizeMeters + 0.5;

    // Support tuiles hybrides
    if (tile.elevScale < 1.0) {
        relX = tile.elevOffset.x + (relX * tile.elevScale);
        relZ = tile.elevOffset.y + (relZ * tile.elevScale);
    }

    // Interpolation Bi-linéaire rapide
    const fx = relX * res;
    const fz = relZ * res;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    
    if (x0 < 0 || x0 >= res - 1 || z0 < 0 || z0 >= res - 1) {
        const idx = (Math.max(0, Math.min(res-1, Math.floor(fx))) + Math.max(0, Math.min(res-1, Math.floor(fz))) * res) * 4;
        return (-10000.0 + ((tile.pixelData[idx] * 65536.0 + tile.pixelData[idx+1] * 256.0 + tile.pixelData[idx+2]) * 0.1)) * state.RELIEF_EXAGGERATION;
    }

    const getH = (x: number, z: number) => {
        const i = (x + z * res) * 4;
        return -10000.0 + ((tile.pixelData[i] * 65536.0 + tile.pixelData[i+1] * 256.0 + tile.pixelData[i+2]) * 0.1);
    };

    const h00 = getH(x0, z0);
    const h10 = getH(x0 + 1, z0);
    const h01 = getH(x0, z0 + 1);
    const h11 = getH(x0 + 1, z0 + 1);

    const tx = fx - x0;
    const tz = fz - z0;
    const avgH = (1-tx)*(1-tz)*h00 + tx*(1-tz)*h10 + (1-tx)*tz*h01 + tx*tz*h11;

    return avgH * state.RELIEF_EXAGGERATION;
}

/**
 * Lance une sonde solaire sur un point précis
 */
export async function runSolarProbe(worldX: number, worldZ: number, elevation: number) {
    const probeResult = document.getElementById('probe-result');
    const probeStatus = document.getElementById('probe-status');
    if (!probeResult || !probeStatus) return;

    probeResult.style.display = 'block';
    probeStatus.textContent = "Calcul de l'horizon...";
    probeStatus.style.color = "var(--gold)";

    const originTile = state.originTile;
    if (!originTile) return;
    
    const currentGPS = worldToLngLat(worldX, worldZ, originTile);
    const date = state.simDate || new Date();
    
    // On simule sur 24h
    const steps = 96; // toutes les 15 min
    const timeline = document.getElementById('probe-timeline');
    if (timeline) timeline.innerHTML = '';

    let totalSunlightMinutes = 0;
    let firstSunTime = null;

    // Calcul de l'ensoleillement
    for (let i = 0; i < steps; i++) {
        const time = new Date(date);
        time.setHours(0, i * 15, 0, 0);
        
        const sunPos = SunCalc.getPosition(time, currentGPS.lat, currentGPS.lon);
        const altitude = sunPos.altitude; // en radians

        const slot = document.createElement('div');
        slot.style.flex = "1";
        slot.style.height = "100%";

        if (altitude < 0) {
            slot.style.background = "#000"; // Nuit
        } else {
            // Test d'ombre portée par le relief (Ray-marching)
            const isShadowed = checkTerrainShadow(worldX, worldZ, elevation, sunPos.azimuth, sunPos.altitude);
            if (isShadowed) {
                slot.style.background = "#333"; // Ombre
            } else {
                slot.style.background = "#ffd700"; // Soleil
                totalSunlightMinutes += 15;
                if (!firstSunTime) firstSunTime = time;
            }
        }
        timeline?.appendChild(slot);
    }

    const totalHours = Math.floor(totalSunlightMinutes / 60);
    const totalMinutes = totalSunlightMinutes % 60;
    document.getElementById('probe-total')!.textContent = `${totalHours}h${totalMinutes.toString().padStart(2, '0')}`;
    
    if (firstSunTime) {
        document.getElementById('probe-sunrise')!.textContent = `${firstSunTime.getHours()}:${firstSunTime.getMinutes().toString().padStart(2, '0')}`;
    } else {
        document.getElementById('probe-sunrise')!.textContent = "--:--";
    }

    probeStatus.textContent = "Analyse terminée";
    probeStatus.style.color = "#10b981";

    const copyBtn = document.getElementById('copy-report-btn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const totalStr = `${totalHours}h${totalMinutes.toString().padStart(2, '0')}`;
            const sunriseStr = firstSunTime ? `${firstSunTime.getHours()}:${firstSunTime.getMinutes().toString().padStart(2, '0')}` : 'N/A';
            const report = `SunTrail Insight\nLocation: ${currentGPS.lat.toFixed(5)}, ${currentGPS.lon.toFixed(5)}\nTotal Sunlight: ${totalStr}\nSunrise: ${sunriseStr}`;
            navigator.clipboard.writeText(report);
            showToast("📋 Rapport copié");
        };
    }
}

/**
 * Ray-marching pour tester si un point est à l'ombre du relief
 */
function checkTerrainShadow(worldX: number, worldZ: number, elevation: number, azimuth: number, altitude: number): boolean {
    const dirX = Math.sin(azimuth + Math.PI);
    const dirZ = Math.cos(azimuth + Math.PI);
    const dirY = Math.tan(altitude);

    const stepSize = 300; 
    const maxDist = 40000; // 40km suffisent pour l'horizon proche

    for (let d = stepSize; d < maxDist; d += stepSize) {
        const tx = worldX + dirX * d;
        const tz = worldZ + dirZ * d;
        const ty = elevation + dirY * d;

        const groundH = getAltitudeAt(tx, tz);
        if (groundH > ty) return true;
    }
    return false;
}

/**
 * Trouve l'intersection d'un rayon avec le terrain (pour le clic carte)
 */
export function findTerrainIntersection(ray: THREE.Ray): THREE.Vector3 | null {
    const stepSize = 250; 
    const maxDist = 500000; 
    
    for (let dist = 0; dist < maxDist; dist += stepSize) {
        const p = ray.at(dist, new THREE.Vector3());
        const groundH = getAltitudeAt(p.x, p.z);
        if (p.y < groundH) {
            // Raffinement de précision
            return ray.at(dist - stepSize * 0.5, new THREE.Vector3());
        }
    }
    return null;
}
