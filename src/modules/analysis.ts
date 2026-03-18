import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { activeTiles } from './terrain';
import { worldToLngLat } from './geo';
import { showToast } from './utils';

let lastUsedTile: any = null;

export function getAltitudeAt(worldX: number, worldZ: number, hintTile: any = null): number {
    const testPoint = new THREE.Vector3(worldX, 0, worldZ);
    let tile = hintTile;

    if (!tile) {
        if (lastUsedTile && lastUsedTile.status === 'loaded' && lastUsedTile.bounds && lastUsedTile.bounds.containsPoint(testPoint)) {
            tile = lastUsedTile;
        } else {
            for (const t of activeTiles.values()) {
                if (t.status === 'loaded' && t.bounds && t.bounds.containsPoint(testPoint)) {
                    if (!tile || t.zoom > tile.zoom) tile = t;
                }
            }
            if (tile) lastUsedTile = tile;
        }
    }

    if (!tile || !tile.pixelData) return 0;

    const res = Math.sqrt(tile.pixelData.length / 4);
    let relX = (worldX - tile.worldX) / tile.tileSizeMeters + 0.5;
    let relZ = (worldZ - tile.worldZ) / tile.tileSizeMeters + 0.5;

    if (tile.elevScale < 1.0) {
        relX = tile.elevOffset.x + (relX * tile.elevScale);
        relZ = tile.elevOffset.y + (relZ * tile.elevScale);
    }

    const fx = relX * res;
    const fz = relZ * res;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(x0 + 1, res - 1);
    const z1 = Math.min(z0 + 1, res - 1);
    const dx = fx - x0;
    const dz = fz - z0;

    const getH = (x: number, z: number) => {
        const i = (Math.max(0, Math.min(res - 1, z)) * res + Math.max(0, Math.min(res - 1, x))) * 4;
        const r = tile.pixelData[i];
        const g = tile.pixelData[i+1];
        const b = tile.pixelData[i+2];
        return (-10000 + ((r * 65536 + g * 256 + b) * 0.1)) * state.RELIEF_EXAGGERATION;
    };

    const h00 = getH(x0, z0);
    const h10 = getH(x1, z0);
    const h01 = getH(x0, z1);
    const h11 = getH(x1, z1);

    return (h00 * (1 - dx) * (1 - dz) + h10 * dx * (1 - dz) + h01 * (1 - dx) * dz + h11 * dx * dz);
}

/**
 * Analyse solaire avancée (v5.4.2)
 * Correction des IDs d'interface pour correspondre à index.html
 */
export function runSolarProbe(worldX: number, worldZ: number, altitude: number) {
    if (!state.simDate) return;
    const gps = worldToLngLat(worldX, worldZ, state.originTile);
    const steps = 48; 
    const timeline = document.getElementById('probe-timeline');
    if (timeline) timeline.innerHTML = '';

    const statusEl = document.getElementById('probe-status');
    if (statusEl) statusEl.textContent = "⌛ Analyse en cours...";

    let totalSunlightMinutes = 0;
    let firstSunTime = null;

    // Simulation sur 24h
    for (let i = 0; i < steps; i++) {
        const date = new Date(state.simDate);
        date.setHours(0, i * 30, 0, 0);
        const sunPos = SunCalc.getPosition(date, gps.lat, gps.lon);
        const sunPosVector = new THREE.Vector3().setFromSphericalCoords(100000, Math.PI/2 - sunPos.altitude, sunPos.azimuth + Math.PI);
        
        const inShadow = isAtShadow(worldX, worldZ, altitude, sunPosVector);
        const hasSun = (sunPos.altitude > 0) && !inShadow;

        if (hasSun) {
            totalSunlightMinutes += 30;
            if (firstSunTime === null) firstSunTime = date;
        }

        const bar = document.createElement('div');
        bar.style.flex = "1";
        bar.style.height = "100%";
        
        // Couleur selon l'état : Or (Soleil), Gris (Ombre), Noir (Nuit)
        if (sunPos.altitude <= 0) {
            bar.style.background = "#000";
        } else if (inShadow) {
            bar.style.background = "#444";
        } else {
            bar.style.background = "#ffd700";
        }
        
        if (timeline) timeline.appendChild(bar);
    }

    const resPanel = document.getElementById('probe-result');
    if (resPanel) {
        resPanel.style.display = 'block';
        if (statusEl) statusEl.textContent = "Analyse terminée";

        const totalStr = `${Math.floor(totalSunlightMinutes / 60)}h ${totalSunlightMinutes % 60}m`;
        const sunriseStr = firstSunTime ? firstSunTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—:—";
        
        // Mise à jour des éléments index.html
        const totalEl = document.getElementById('probe-total');
        const sunriseEl = document.getElementById('probe-sunrise');
        if (totalEl) totalEl.textContent = totalStr;
        if (sunriseEl) sunriseEl.textContent = sunriseStr;

        const copyBtn = document.getElementById('copy-report-btn');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const report = `SunTrail Solar Report\nLocation: ${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}\nSunlight: ${totalStr}\nSunrise: ${sunriseStr}`;
                navigator.clipboard.writeText(report);
                showToast("📋 Rapport copié");
            };
        }
    }
}

export function isAtShadow(worldX: number, worldZ: number, altitude: number, sunPos: THREE.Vector3): boolean {
    const ray = new THREE.Ray(new THREE.Vector3(worldX, altitude + 2, worldZ), sunPos.clone().normalize());
    const hit = findTerrainIntersection(ray);
    return hit !== null;
}

export function findTerrainIntersection(ray: THREE.Ray): THREE.Vector3 | null {
    const stepSize = 100; 
    const maxDist = 500000; // Augmenté à 500km pour détecter le terrain depuis l'espace (LOD 12)
    const p = new THREE.Vector3();
    for (let dist = 100; dist < maxDist; dist += stepSize) {
        ray.at(dist, p);
        const groundH = getAltitudeAt(p.x, p.z);
        if (p.y < groundH) {
            // Raffinement de précision
            return ray.at(dist - stepSize * 0.5, new THREE.Vector3());
        }
        // Accélération adaptative : si on est très haut, on avance plus vite
        if (p.y > 10000 && dist > 5000) dist += 500;
    }
    return null;
}
