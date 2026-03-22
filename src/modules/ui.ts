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
let uiTimeout: any = null;

export function initUI(): void {
    const savedSettings = loadSettings();
    if (savedSettings) {
        state.hasManualSource = true;
        if (savedSettings.PERFORMANCE_PRESET === 'custom') applyCustomSettings(savedSettings);
        else applyPreset(savedSettings.PERFORMANCE_PRESET);
    } else {
        applyPreset(detectBestPreset());
    }

    const gpuInfo = getGpuInfo();
    const dg = document.getElementById('diag-gpu'); if (dg) dg.textContent = `GPU: ${gpuInfo.renderer}`;
    const dp = document.getElementById('diag-preset'); if (dp) dp.textContent = `PROFIL: ${state.PERFORMANCE_PRESET.toUpperCase()}`;

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('click', handleGlobalClick);
    document.getElementById('canvas-container')?.addEventListener('click', handleMapClick);

    // --- AUTO-HIDE LOGIC ---
    const resetUITimer = () => {
        document.body.classList.remove('ui-hidden');
        if (uiTimeout) clearTimeout(uiTimeout);
        uiTimeout = setTimeout(() => {
            // On ne cache pas si un menu est ouvert
            const anySheetVisible = Array.from(document.querySelectorAll('.bottom-sheet')).some(s => (s as HTMLElement).style.display === 'block');
            const expertVisible = document.getElementById('expert-weather-panel')?.style.display === 'block';
            if (!anySheetVisible && !expertVisible) {
                document.body.classList.add('ui-hidden');
            }
        }, 5000);
    };
    ['mousedown', 'mousemove', 'touchstart', 'scroll'].forEach(evt => document.addEventListener(evt, resetUITimer));
    resetUITimer();

    // --- TIMELINE & CALENDRIER ---
    const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    const timeDisp = document.getElementById('time-disp');
    const dateInput = document.getElementById('date-input') as HTMLInputElement;

    const refreshSun = () => {
        const v = parseInt(timeSlider.value);
        state.simDate.setHours(Math.floor(v / 60), v % 60);
        if (timeDisp) timeDisp.textContent = `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`;
        updateSunPosition(v);
    };

    if (timeSlider) {
        timeSlider.value = (state.simDate.getHours() * 60 + state.simDate.getMinutes()).toString();
        timeSlider.addEventListener('input', refreshSun);
    }

    if (dateInput) {
        const d = state.simDate;
        dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dateInput.addEventListener('change', () => {
            const nd = new Date(dateInput.value);
            if (!isNaN(nd.getTime())) {
                state.simDate.setFullYear(nd.getFullYear(), nd.getMonth(), nd.getDate());
                refreshSun();
            }
        });
    }

    document.getElementById('play-btn')?.addEventListener('click', (e) => {
        state.isSunAnimating = !state.isSunAnimating;
        (e.target as HTMLElement).textContent = state.isSunAnimating ? '⏸' : '▶';
    });

    // Setup Screen
    document.getElementById('bgo')?.addEventListener('click', () => {
        const k = (document.getElementById('k1') as HTMLInputElement).value.trim();
        if (k.length < 10) return;
        state.MK = k; localStorage.setItem('maptiler_key', k);
        document.getElementById('setup-screen')!.style.display = 'none';
        startApp();
    });

    // NAVIGATION
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const target = (e.currentTarget as HTMLElement).dataset.target;
            if (target === 'map') { closeAllSheets(); showToast("Vue Carte"); }
            else if (target) openSheet(target);
        });
    });

    // REGLAGES
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
    bindT('debug-toggle', 'SHOW_DEBUG', (v: boolean) => { const zi = document.getElementById('zoom-indicator'); if (zi) zi.style.display = v ? 'block' : 'none'; });

    document.getElementById('layer-menu')?.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.layer-item') as HTMLElement;
        if (item?.dataset.source) {
            state.MAP_SOURCE = item.dataset.source;
            document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            saveSettings(); refreshTerrain();
        }
    });

    const bindS = (id: string, key: string, disp: string, cb?: Function) => {
        const el = document.getElementById(id) as HTMLInputElement;
        const d = document.getElementById(disp);
        if (el) {
            el.addEventListener('input', () => { (state as any)[key] = parseFloat(el.value); if (d) d.textContent = el.value; });
            el.addEventListener('change', () => { saveSettings(); if (cb) cb(); });
        }
    };
    bindS('res-slider', 'RESOLUTION', 'res-disp', refreshTerrain);
    bindS('range-slider', 'RANGE', 'range-disp', refreshTerrain);

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => applyPreset((btn as HTMLElement).dataset.preset as any));
    });

    // FABs
    document.getElementById('fab-gps')?.addEventListener('click', async () => {
        try {
            const p = await Geolocation.getCurrentPosition();
            state.TARGET_LAT = p.coords.latitude; state.TARGET_LON = p.coords.longitude;
            state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, state.ZOOM);
            refreshTerrain();
            const wp = lngLatToWorld(state.TARGET_LON, state.TARGET_LAT, state.originTile);
            flyTo(wp.x, wp.z, getAltitudeAt(wp.x, wp.z) + 500);
            fetchWeather(state.TARGET_LAT, state.TARGET_LON);
        } catch(e) { showToast("Erreur GPS"); }
    });

    document.getElementById('fab-follow')?.addEventListener('click', async () => {
        state.isFollowingUser = !state.isFollowingUser;
        document.getElementById('fab-follow')?.classList.toggle('active', state.isFollowingUser);
        if (state.isFollowingUser) await startLocationTracking(); else stopLocationTracking();
    });

    // RANDO
    document.getElementById('rec-btn-new')?.addEventListener('click', async () => {
        state.isRecording = !state.isRecording;
        document.getElementById('rec-btn-new')?.classList.toggle('active', state.isRecording);
        if (state.isRecording) { showToast("🔴 Enregistrement..."); if (!state.isFollowingUser) await startLocationTracking(); }
        else showToast("⏹️ Arrêté");
    });
    document.getElementById('export-gpx-btn-new')?.addEventListener('click', () => { if (state.recordedPoints.length > 1) exportRecordedGPX(); else showToast("Tracé vide"); });
    document.getElementById('gpx-btn')?.addEventListener('click', () => document.getElementById('gpx-upload')?.click());
    document.getElementById('gpx-upload')?.addEventListener('change', (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) { const r = new FileReader(); r.onload = (ev) => handleGPX(ev.target!.result as string); r.readAsText(f); }
    });

    // ANALYSE & SOS
    document.getElementById('probe-btn')?.addEventListener('click', () => {
        if (hasLastClicked) {
            runSolarProbe(lastClickedCoords.x, lastClickedCoords.z, lastClickedCoords.alt);
            document.getElementById('probe-result')!.style.display = 'block';
        } else showToast("Cliquez sur la carte");
    });
    document.getElementById('close-probe')?.addEventListener('click', () => { document.getElementById('probe-result')!.style.display = 'none'; });
    document.getElementById('close-coords')?.addEventListener('click', () => { document.getElementById('coords-panel')!.style.display = 'none'; });
    
    document.getElementById('open-expert-weather')?.addEventListener('click', () => { 
        document.getElementById('expert-weather-panel')!.style.display = 'block';
        closeAllSheets(); 
    });
    document.getElementById('close-expert-weather')?.addEventListener('click', () => { 
        document.getElementById('expert-weather-panel')!.style.display = 'none'; 
    });

    document.getElementById('sos-fab')?.addEventListener('click', openSOSModal);
    document.getElementById('sos-close-btn')?.addEventListener('click', () => { document.getElementById('sos-modal')!.style.display = 'none'; });
    document.getElementById('clear-cache-btn')?.addEventListener('click', deleteTerrainCache);

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
    if (sheetTimer) clearTimeout(sheetTimer);
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
    if ((e.target as HTMLElement).closest('#weather-clickable')) openSheet('activity');
}

function handleMapClick(e: MouseEvent) {
    if (!state.camera) return;
    closeAllSheets();
    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.camera);
    const hit = findTerrainIntersection(raycaster.ray);
    if (hit && state.originTile) {
        const gps = worldToLngLat(hit.x, hit.z, state.originTile);
        const alt = getAltitudeAt(hit.x, hit.z);
        document.getElementById('coords-panel')!.style.display = 'block';
        document.getElementById('click-latlon')!.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
        document.getElementById('click-alt')!.textContent = `${Math.round(alt / state.RELIEF_EXAGGERATION)} m`;
        lastClickedCoords = { x: hit.x, z: hit.z, alt: hit.y }; hasLastClicked = true;
    }
}

function updateTopBar() {
    const altEl = document.getElementById('top-altitude');
    const tempEl = document.getElementById('top-w-temp');
    const iconEl = document.getElementById('top-w-icon');
    const lodEl = document.getElementById('top-lod');
    if (altEl && state.controls) altEl.textContent = `${Math.round(getAltitudeAt(state.controls.target.x, state.controls.target.z) / state.RELIEF_EXAGGERATION)} m`;
    if (state.weatherData) {
        if (tempEl) tempEl.textContent = `${Math.round(state.weatherData.temp)}°`;
        if (iconEl) {
            let icon = '☀️';
            if (state.currentWeather === 'rain') icon = '🌧️';
            else if (state.currentWeather === 'snow') icon = '❄️';
            else if (state.weatherData.cloudCover > 20) icon = '⛅';
            iconEl.textContent = icon;
        }
    }
    if (lodEl) lodEl.textContent = `LOD ${state.ZOOM}`;
}

function initGeocoding() {
    const input = document.getElementById('geo-input') as HTMLInputElement;
    const res = document.getElementById('geo-results');
    let t: any;
    input?.addEventListener('input', () => {
        clearTimeout(t);
        const q = input.value.trim();
        if (q.length < 2) { if (res) res.style.display = 'none'; return; }
        t = setTimeout(async () => {
            const data = await fetchGeocoding({ query: q });
            if (!res) return; res.innerHTML = '';
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
                    res.appendChild(el);
                }
            });
            if (res.children.length > 0) res.style.display = 'block';
        }, 500);
    });
}

function createGeoItem(lat: number, lon: number, label: string): HTMLElement {
    const d = document.createElement('div');
    d.style.cssText = 'padding:15px; border-bottom:1px solid rgba(255,255,255,0.1); color:white; cursor:pointer; font-size:14px;';
    d.innerHTML = `📍 ${label}`;
    return d;
}

function startApp() {
    initScene(); loadTerrain(); fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    const bn = document.getElementById('bottom-nav-bar'); if (bn) bn.style.display = 'flex';
    const fc = document.getElementById('fab-container'); if (fc) fc.style.display = 'flex';
    const ts = document.getElementById('bottom-timeline-stack'); if (ts) ts.style.display = 'block';
}

function onWindowResize() {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

async function handleGPX(xml: string) {
    const gpx = new gpxParser(); gpx.parse(xml);
    if (!gpx.tracks?.length) return;
    state.rawGpxData = gpx;
    const startPt = gpx.tracks[0].points[0];
    state.TARGET_LAT = startPt.lat; state.TARGET_LON = startPt.lon;
    state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
    updateGPXMesh(); updateElevationProfile(); await updateVisibleTiles();
    const tc = document.getElementById('trail-controls'); if (tc) tc.style.display = 'block';
}

function exportRecordedGPX() {
    let g = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="SunTrail"><trk><trkseg>`;
    state.recordedPoints.forEach(p => { g += `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.alt.toFixed(1)}</ele><time>${new Date(p.timestamp).toISOString()}</time></trkpt>`; });
    g += `</trkseg></trk></gpx>`;
    const blob = new Blob([g], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `track-${Date.now()}.gpx`; link.click();
}

async function openSOSModal() {
    const m = document.getElementById('sos-modal'); if (m) m.style.display = 'block';
    const tc = document.getElementById('sos-text-container'); if (tc) tc.textContent = "⌛ Localisation...";
    const gps = worldToLngLat(state.controls?.target.x || 0, state.controls?.target.z || 0, state.originTile);
    const alt = getAltitudeAt(state.controls?.target.x || 0, state.controls?.target.z || 0) / state.RELIEF_EXAGGERATION;
    if (tc) tc.textContent = `🆘 SOS SUNTRAIL: ${gps.lat.toFixed(5)},${gps.lon.toFixed(5)} | ALT:${Math.round(alt)}m`;
}

function refreshTerrain() { resetTerrain(); updateVisibleTiles(); }
