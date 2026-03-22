import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state, saveSettings, loadSettings } from './state';
import { updateSunPosition } from './sun';
import { initScene, flyTo } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, loadTerrain, autoSelectMapSource, updateSlopeVisibility, updateHydrologyVisibility } from './terrain';
import { deleteTerrainCache, downloadOfflineZone, updateStorageUI } from './tileLoader';
import { lngLatToTile, worldToLngLat, lngLatToWorld } from './geo';
import { showToast, fetchGeocoding } from './utils';
import { applyPreset, detectBestPreset, getGpuInfo, applyCustomSettings } from './performance';
import { runSolarProbe, findTerrainIntersection, getAltitudeAt } from './analysis';
import { updateElevationProfile } from './profile';
import { startLocationTracking, stopLocationTracking } from './location';
import { fetchWeather, updateWeatherUIIndicator } from './weather';

let lastClickedCoords = { x: 0, z: 0, alt: 0 };
let hasLastClicked = false;
let sheetTimer: any = null;

export function initUI(): void {
    const savedSettings = loadSettings();
    if (savedSettings) {
        state.hasManualSource = true;
        if (savedSettings.PERFORMANCE_PRESET === 'custom') applyCustomSettings(savedSettings);
        else applyPreset(savedSettings.PERFORMANCE_PRESET);
    } else {
        applyPreset(detectBestPreset());
    }

    // Diagnostic
    const gpuInfo = getGpuInfo();
    const diagGpu = document.getElementById('diag-gpu'); if (diagGpu) diagGpu.textContent = `GPU: ${gpuInfo.renderer}`;
    const diagCpu = document.getElementById('diag-cpu'); if (diagCpu) diagCpu.textContent = `CPU: ${navigator.hardwareConcurrency || '--'} cores`;
    const diagPreset = document.getElementById('diag-preset'); if (diagPreset) diagPreset.textContent = `PROFIL: ${state.PERFORMANCE_PRESET.toUpperCase()}`;
    const techInfo = document.getElementById('tech-info'); if (techInfo) techInfo.style.display = 'block';

    window.addEventListener('online', () => { state.IS_OFFLINE = false; document.getElementById('offline-indicator')!.style.display = 'none'; });
    window.addEventListener('offline', () => { state.IS_OFFLINE = true; document.getElementById('offline-indicator')!.style.display = 'block'; });
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('click', handleGlobalClick);
    document.getElementById('canvas-container')?.addEventListener('click', handleMapClick);

    // Initialisation valeurs
    const dateInput = document.getElementById('date-input') as HTMLInputElement;
    if (dateInput) {
        const d = state.simDate;
        dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // Setup Screen
    document.getElementById('bgo')?.addEventListener('click', () => {
        const k = (document.getElementById('k1') as HTMLInputElement).value.trim();
        if (k.length < 10) return;
        state.MK = k; localStorage.setItem('maptiler_key', k);
        document.getElementById('setup-screen')!.style.display = 'none';
        startApp();
    });

    // --- NAVIGATION v5.8 ---
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const target = (e.currentTarget as HTMLElement).dataset.target;
            if (target === 'map') { closeAllSheets(); showToast("Vue Carte"); }
            else if (target) openSheet(target);
        });
    });

    // --- TIROIR REGLAGES ---
    document.getElementById('layer-menu')?.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.layer-item') as HTMLElement;
        if (item && item.dataset.source) {
            state.MAP_SOURCE = item.dataset.source;
            document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            saveSettings(); refreshTerrain(); showToast(`Carte: ${state.MAP_SOURCE.toUpperCase()}`);
        }
    });

    const bindT = (id: string, key: string, cb?: Function) => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) {
            el.checked = (state as any)[key];
            el.onchange = () => { (state as any)[key] = el.checked; if (cb) cb(el.checked); saveSettings(); };
        }
    };

    bindT('trails-toggle', 'SHOW_TRAILS', refreshTerrain);
    bindT('slopes-toggle', 'SHOW_SLOPES', updateSlopeVisibility);
    bindT('buildings-toggle', 'SHOW_BUILDINGS', refreshTerrain);
    bindT('hydro-toggle', 'SHOW_HYDROLOGY', updateHydrologyVisibility);
    bindT('veg-toggle', 'SHOW_VEGETATION', refreshTerrain);
    bindT('shadow-toggle', 'SHADOWS', (v: boolean) => { if (state.sunLight) state.sunLight.castShadow = v; });
    bindT('stats-toggle', 'SHOW_STATS', (v: boolean) => { if (state.stats) state.stats.dom.style.display = v ? 'block' : 'none'; });
    bindT('debug-toggle', 'SHOW_DEBUG', (v: boolean) => { document.getElementById('zoom-indicator')!.style.display = v ? 'block' : 'none'; });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => applyPreset((btn as HTMLElement).dataset.preset as any));
    });

    // Sliders
    const bindS = (id: string, key: string, disp: string, cb?: Function) => {
        const el = document.getElementById(id) as HTMLInputElement;
        const d = document.getElementById(disp);
        if (el) {
            el.oninput = () => { (state as any)[key] = parseFloat(el.value); if (d) d.textContent = el.value; };
            el.onchange = () => { saveSettings(); if (cb) cb(); };
        }
    };
    bindS('res-slider', 'RESOLUTION', 'res-disp', refreshTerrain);
    bindS('range-slider', 'RANGE', 'range-disp', refreshTerrain);
    bindS('exag-slider', 'RELIEF_EXAGGERATION', 'exag-disp', refreshTerrain);
    bindS('veg-density-slider', 'VEGETATION_DENSITY', 'veg-density-disp', refreshTerrain);

    // FABs
    document.getElementById('fab-gps')?.addEventListener('click', async () => {
        try {
            const p = await Geolocation.getCurrentPosition();
            state.TARGET_LAT = p.coords.latitude; state.TARGET_LON = p.coords.longitude;
            state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, state.ZOOM);
            refreshTerrain();
            const wp = lngLatToWorld(state.TARGET_LON, state.TARGET_LAT, state.originTile);
            flyTo(wp.x, wp.z, getAltitudeAt(wp.x, wp.z));
            fetchWeather(state.TARGET_LAT, state.TARGET_LON);
            showToast("📍 Position synchronisée");
        } catch(e) { showToast("Erreur GPS"); }
    });

    document.getElementById('fab-follow')?.addEventListener('click', async () => {
        state.isFollowingUser = !state.isFollowingUser;
        document.getElementById('fab-follow')!.classList.toggle('active', state.isFollowingUser);
        if (state.isFollowingUser) { await startLocationTracking(); showToast("Suivi GPS actif"); }
        else { stopLocationTracking(); showToast("Suivi désactivé"); }
    });

    // Rando
    const recT = async () => {
        state.isRecording = !state.isRecording;
        document.getElementById('rec-btn-new')!.classList.toggle('active', state.isRecording);
        if (state.isRecording) { showToast("🔴 Enregistrement..."); if (!state.isFollowingUser) await startLocationTracking(); }
        else showToast("⏹️ Arrêté");
    };
    document.getElementById('rec-btn-new')?.addEventListener('click', recT);
    document.getElementById('export-gpx-btn-new')?.addEventListener('click', () => { if (state.recordedPoints.length > 1) exportRecordedGPX(); else showToast("Tracé vide"); });

    // SOS & Autre
    document.getElementById('sos-fab')?.addEventListener('click', openSOSModal);
    document.getElementById('sos-copy-btn')?.addEventListener('click', () => { navigator.clipboard.writeText(document.getElementById('sos-text-container')!.textContent || ""); showToast("Copié"); });
    document.getElementById('sos-close-btn')?.addEventListener('click', () => document.getElementById('sos-modal')!.style.display='none');
    document.getElementById('close-coords')?.addEventListener('click', () => document.getElementById('coords-panel')!.style.display='none');
    document.getElementById('clear-cache-btn')?.addEventListener('click', deleteTerrainCache);
    document.getElementById('pmtiles-btn')?.addEventListener('click', () => document.getElementById('pmtiles-upload')?.click());
    document.getElementById('pmtiles-upload')?.onchange = async (e) => { 
        const f = (e.target as HTMLInputElement).files?.[0]; 
        if (f) { const { setPMTilesSource } = await import('./tileLoader'); await setPMTilesSource(f); refreshTerrain(); } 
    };

    setInterval(updateTopBar, 1000);
    initGeocoding();
}

function openSheet(id: string) {
    if (sheetTimer) clearTimeout(sheetTimer);
    const s = document.getElementById(`sheet-${id}`);
    const b = document.getElementById('ui-backdrop');
    document.querySelectorAll('.bottom-sheet').forEach(el => { (el as HTMLElement).style.display='none'; (el as HTMLElement).style.bottom='-100%'; });
    if (s) {
        s.style.display = 'block'; void s.offsetWidth; s.style.bottom = '0';
        if (b) { b.style.display = 'block'; void b.offsetWidth; b.classList.add('visible'); }
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.nav-item[data-target="${id}"]`)?.classList.add('active');
    }
}

function closeAllSheets() {
    document.querySelectorAll('.bottom-sheet').forEach(s => (s as HTMLElement).style.bottom = '-100%');
    const b = document.getElementById('ui-backdrop'); if (b) b.classList.remove('visible');
    sheetTimer = setTimeout(() => {
        document.querySelectorAll('.bottom-sheet').forEach(s => (s as HTMLElement).style.display = 'none');
        if (b) b.style.display = 'none';
    }, 400);
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('.nav-item[data-target="map"]')?.classList.add('active');
}

function handleGlobalClick(e: MouseEvent) {
    if ((e.target as HTMLElement).id === 'ui-backdrop') closeAllSheets();
    if ((e.target as HTMLElement).closest('#weather-clickable')) openSheet('explore');
}

function handleMapClick(e: MouseEvent) {
    closeAllSheets();
    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.camera!);
    const hit = findTerrainIntersection(raycaster.ray);
    if (hit && state.originTile) {
        const gps = worldToLngLat(hit.x, hit.z, state.originTile);
        const alt = getAltitudeAt(hit.x, hit.z) / state.RELIEF_EXAGGERATION;
        document.getElementById('coords-panel')!.style.display = 'block';
        document.getElementById('click-latlon')!.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
        document.getElementById('click-alt')!.textContent = `${Math.round(alt)} m`;
        lastClickedCoords = { x: hit.x, z: hit.z, alt: hit.y }; hasLastClicked = true;
    }
}

function updateTopBar() {
    const altEl = document.getElementById('top-altitude');
    const lodEl = document.getElementById('top-lod');
    const tempEl = document.getElementById('top-w-temp');
    if (altEl && state.controls) altEl.textContent = `${Math.round(getAltitudeAt(state.controls.target.x, state.controls.target.z) / state.RELIEF_EXAGGERATION)} m`;
    if (lodEl) lodEl.textContent = `LOD ${state.ZOOM}`;
    if (tempEl && state.weather) tempEl.textContent = `${Math.round(state.weather.current.temp)}°`;
}

function initGeocoding() {
    const input = document.getElementById('geo-input') as HTMLInputElement;
    const res = document.getElementById('geo-results');
    let t: any;
    input?.addEventListener('input', () => {
        clearTimeout(t);
        const q = input.value.trim();
        if (q.length < 2) { res!.style.display = 'none'; return; }
        t = setTimeout(async () => {
            const data = await fetchGeocoding({ query: q });
            res!.innerHTML = '';
            const items = Array.isArray(data) ? data : (data?.features || []);
            items.forEach((f: any) => {
                let lat, lon, label;
                if (f.geometry) { lon = f.geometry.coordinates[0]; lat = f.geometry.coordinates[1]; label = f.place_name_fr || f.place_name; }
                else { lat = parseFloat(f.lat); lon = parseFloat(f.lon); label = f.display_name; }
                if (!isNaN(lat)) {
                    const el = createGeoItem(lat, lon, label);
                    el.onclick = () => {
                        state.TARGET_LAT = lat; state.TARGET_LON = lon;
                        state.originTile = lngLatToTile(lon, lat, 13);
                        refreshTerrain(); closeAllSheets();
                        const wp = lngLatToWorld(lon, lat, state.originTile);
                        flyTo(wp.x, wp.z, 10000);
                        fetchWeather(lat, lon);
                    };
                    res!.appendChild(el);
                }
            });
            if (res!.children.length > 0) res!.style.display = 'block';
        }, 500);
    });
}

function createGeoItem(lat: number, lon: number, label: string): HTMLElement {
    const d = document.createElement('div');
    d.style.cssText = 'padding:12px; border-bottom:1px solid rgba(255,255,255,0.1); color:white; cursor:pointer; font-size:14px;';
    d.innerHTML = `📍 ${label}`;
    return d;
}

function startApp() {
    initScene(); loadTerrain(); fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    document.getElementById('bottom-nav-bar')!.style.display = 'flex';
    document.getElementById('fab-container')!.style.display = 'flex';
}

function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
}

function exportRecordedGPX() {
    let g = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="SunTrail"><trk><trkseg>`;
    state.recordedPoints.forEach(p => { g += `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.alt.toFixed(1)}</ele><time>${new Date(p.timestamp).toISOString()}</time></trkpt>`; });
    g += `</trkseg></trk></gpx>`;
    const blob = new Blob([g], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `track-${Date.now()}.gpx`; link.click();
}

function refreshTerrain() { resetTerrain(); updateVisibleTiles(); }
