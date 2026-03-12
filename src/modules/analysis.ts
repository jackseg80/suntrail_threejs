import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';
import { activeTiles, worldToLngLat, lngLatToTile } from './terrain';

/**
 * Récupère l'altitude à des coordonnées monde (x, z)
 * Utilise les données pixelData des tuiles actives.
 */
export function getAltitudeAt(worldX: number, worldZ: number): number {
    const gps = worldToLngLat(worldX, worldZ);
    // On utilise le zoom actuel de la scène pour chercher la tuile
    const tileCoords = lngLatToTile(gps.lon, gps.lat, state.ZOOM);
    const key = `${tileCoords.x}_${tileCoords.y}_${state.ZOOM}`;
    const tile = activeTiles.get(key);

    if (!tile || !tile.pixelData) return 0;

    // Calcul des UV locaux à la tuile
    const relX = (worldX - tile.worldX) / tile.tileSizeMeters + 0.5;
    const relZ = (worldZ - tile.worldZ) / tile.tileSizeMeters + 0.5;

    const px = Math.floor(THREE.MathUtils.clamp(relX, 0, 0.999) * 256);
    const py = Math.floor(THREE.MathUtils.clamp(relZ, 0, 0.999) * 256);
    
    const idx = (py * 256 + px) * 4;
    if (idx < 0 || idx >= tile.pixelData.length) return 0;

    const r = tile.pixelData[idx];
    const g = tile.pixelData[idx + 1];
    const b = tile.pixelData[idx + 2];
    
    // Décodage Terrain-RGB (v3.9.1)
    // Formula: -10000 + (R * 65536 + G * 256 + B) * 0.1
    return (-10000 + (r * 65536 + g * 256 + b) * 0.1) * state.RELIEF_EXAGGERATION;
}

/**
 * Vérifie si le soleil est occlu par le relief depuis un point d'origine
 */
export function isSunOccluded(origin: THREE.Vector3, sunDir: THREE.Vector3): boolean {
    // Si le soleil est sous l'horizon plat, il est occlu
    if (sunDir.y < 0) return true;

    const stepSize = 150; // Pas de 150m pour le ray-marching
    const maxDist = 40000; // On cherche jusqu'à 40km
    let currentDist = stepSize * 2; // On commence un peu plus loin pour éviter l'auto-occlusion

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
    const samples = 48; // Toutes les 30 min
    const results: number[] = []; // 0: Nuit, 1: Ombre, 2: Soleil

    // On utilise un générateurs ou des délais pour ne pas freezer l'UI
    for (let i = 0; i < samples; i++) {
        const sampleDate = new Date(date.getTime() + i * 30 * 60000);
        const sunPos = SunCalc.getPosition(sampleDate, state.TARGET_LAT, state.TARGET_LON);
        
        let res = 0;
        if (sunPos.altitude > 0) {
            const sunDir = new THREE.Vector3();
            sunDir.x = -Math.sin(sunPos.azimuth) * Math.cos(sunPos.altitude);
            sunDir.y = Math.sin(sunPos.altitude);
            sunDir.z = Math.cos(sunPos.azimuth) * Math.cos(sunPos.altitude);
            
            if (isSunOccluded(origin, sunDir)) {
                res = 1;
            } else {
                res = 2;
                sunMinutes += 30;
            }
        }
        results.push(res);

        // Mise à jour visuelle progressive
        if (i % 8 === 0) {
            statusDisp.textContent = `Analyse ${Math.round((i/samples)*100)}%`;
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Rendu de la timeline
    results.forEach(res => {
        const segment = document.createElement('div');
        segment.style.flex = '1';
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
