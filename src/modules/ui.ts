import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { updateSunPosition } from './sun';
import { initScene } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, deleteTerrainCache, loadTerrain, autoSelectMapSource } from './terrain';
import { lngLatToTile, worldToLngLat } from './geo';
import { isPositionInSwitzerland, showToast } from './utils';
import { applyPreset, detectBestPreset } from './performance';
import { runSolarProbe, findTerrainIntersection, getAltitudeAt } from './analysis';
import { updateElevationProfile } from './profile';
import { startLocationTracking, centerOnUser } from './location';

let lastClickedCoords = { x: 0, z: 0, alt: 0 };

export function initUI(): void {
    const bestPreset = detectBestPreset();
    applyPreset(bestPreset);

    let s1 = '';
    try { s1 = localStorage.getItem('maptiler_key_3d') || ''; } catch (e) {}
    const k1 = document.getElementById('k1') as HTMLInputElement;
    if (s1 && k1) k1.value = s1;

    // --- DÉLÉGATION GLOBALE DES CLICS ---
    document.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const id = target.id;

        if (id === 'bgo') go();
        if (id === 'settings-toggle') document.getElementById('panel')!.classList.add('open');
        if (id === 'close-panel') document.getElementById('panel')!.classList.remove('open');

        if (id === 'layer-btn') {
            const menu = document.getElementById('layer-menu');
            if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }
        
        const layerItem = target.closest('.layer-item') as HTMLElement;
        if (layerItem) {
            document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('active'));
            layerItem.classList.add('active');
            state.MAP_SOURCE = layerItem.dataset.source || 'swisstopo';
            state.hasManualSource = true;
            const menu = document.getElementById('layer-menu');
            if (menu) menu.style.display = 'none';
            resetTerrain(); await updateVisibleTiles();
        }

        if (id === 'gps-btn') {
            try {
                const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
                state.TARGET_LAT = pos.coords.latitude; state.TARGET_LON = pos.coords.longitude;
                state.ZOOM = 13; state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, 13);
                if (state.controls && state.camera) {
                    state.controls.target.set(0, 0, 0); state.camera.position.set(0, 15000, 20000); state.controls.update();
                }
                resetTerrain(); await updateVisibleTiles();
            } catch (err) { showToast("GPS indisponible"); }
        }

        if (id === 'gps-follow-btn') {
            state.isFollowingUser = !state.isFollowingUser;
            target.classList.toggle('active', state.isFollowingUser);
            if (state.isFollowingUser) { await startLocationTracking(); centerOnUser(); }
        }

        // 5. MÉTÉO (Dashboard & Simulation)
        if (id === 'zoom-indicator' || target.closest('#zoom-indicator') || id === 'weather-clickable') {
            openWeatherPanel();
        }
        if (id === 'close-weather') document.getElementById('weather-panel')!.style.display = 'none';
        
        const wBtn = target.closest('.weather-btn') as HTMLElement;
        if (wBtn) {
            state.currentWeather = wBtn.dataset.weather as any;
            document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('active'));
            wBtn.classList.add('active');
            import('./weather').then(m => m.updateWeatherUIIndicator());
        }

        // 6. ANALYSE SOLAIRE
        if (id === 'probe-btn') {
            e.stopPropagation();
            runSolarProbe(lastClickedCoords.x, lastClickedCoords.z, lastClickedCoords.alt);
        }
        if (id === 'close-probe') document.getElementById('probe-result')!.style.display = 'none';
        if (id === 'copy-report-btn') {
            const report = `SunTrail Report - Lat: ${state.TARGET_LAT.toFixed(4)} Lon: ${state.TARGET_LON.toFixed(4)}`;
            navigator.clipboard.writeText(report); showToast("Copié !");
        }

        // 7. GPX & Capture
        if (id === 'gpx-btn') document.getElementById('gpx-upload')!.click();
        if (id === 'screenshot-btn') takeScreenshot();

        const pBtn = target.closest('.preset-btn') as HTMLElement;
        if (pBtn) {
            const preset = pBtn.dataset.preset as any;
            applyPreset(preset);
            resetTerrain(); await updateVisibleTiles();
        }

        if (target.tagName === 'CANVAS') {
            handleMapClick(e);
        }
    });

    const hookInput = (id: string, callback: (val: any) => void) => {
        document.getElementById(id)?.addEventListener('input', (e) => callback((e.target as HTMLInputElement).value));
    };
    const hookChange = (id: string, callback: (val: boolean) => void) => {
        document.getElementById(id)?.addEventListener('change', (e) => callback((e.target as HTMLInputElement).checked));
    };

    hookInput('res-slider', (v) => { state.RESOLUTION = parseInt(v); document.getElementById('res-disp')!.textContent = v; applyPreset('custom'); });
    hookInput('range-slider', (v) => { state.RANGE = parseInt(v); document.getElementById('range-disp')!.textContent = v; applyPreset('custom'); });
    hookInput('exag-slider', (v) => { state.RELIEF_EXAGGERATION = parseFloat(v); document.getElementById('exag-disp')!.textContent = v; resetTerrain(); loadTerrain(); });
    hookInput('time-slider', (v) => updateSunPosition(parseInt(v)));
    hookInput('weather-density-slider', (v) => { state.WEATHER_DENSITY = parseInt(v); document.getElementById('weather-density-disp')!.textContent = v; });
    hookInput('weather-speed-slider', (v) => { state.WEATHER_SPEED = parseFloat(v); document.getElementById('weather-speed-disp')!.textContent = parseFloat(v).toFixed(1); });
    hookInput('veg-density-slider', (v) => { state.VEGETATION_DENSITY = parseInt(v); document.getElementById('veg-density-disp')!.textContent = v; resetTerrain(); loadTerrain(); });
    hookInput('fog-slider', (v) => { state.FOG_FAR = parseInt(v) * 1000; resetTerrain(); loadTerrain(); });

    hookChange('shadow-toggle', (v) => { state.SHADOWS = v; if (state.sunLight) state.sunLight.castShadow = v; });
    hookChange('veg-toggle', (v) => { state.SHOW_VEGETATION = v; resetTerrain(); loadTerrain(); });
    hookChange('buildings-toggle', (v) => { state.SHOW_BUILDINGS = v; resetTerrain(); loadTerrain(); });
    hookChange('poi-toggle', (v) => { state.SHOW_SIGNPOSTS = v; resetTerrain(); loadTerrain(); });
    hookChange('trails-toggle', (v) => { state.SHOW_TRAILS = v; resetTerrain(); loadTerrain(); });
    hookChange('slopes-toggle', (v) => { state.SHOW_SLOPES = v; resetTerrain(); loadTerrain(); });
    hookChange('stats-toggle', (v) => { state.SHOW_STATS = v; if (state.stats) state.stats.dom.style.display = v ? 'block' : 'none'; });
    hookChange('debug-toggle', (v) => { state.SHOW_DEBUG = v; });

    document.getElementById('load-speed-select')?.addEventListener('change', (e) => {
        state.LOAD_DELAY_FACTOR = parseFloat((e.target as HTMLSelectElement).value);
    });

    document.getElementById('api-key-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('maptiler-key-input') as HTMLInputElement;
        if (input.value.length > 5) {
            state.MK = input.value;
            localStorage.setItem('maptiler_key_3d', state.MK);
            showToast("Clé mise à jour");
            resetTerrain(); loadTerrain();
        }
    });

    initGeocoding();
}

function handleMapClick(e: MouseEvent) {
    if (!state.renderer || !state.camera || !state.scene) return;
    const panel = document.getElementById('panel');
    if (panel?.classList.contains('open')) panel.classList.remove('open');
    if (state.ZOOM <= 10) { document.getElementById('coords-panel')!.style.display = 'none'; return; }

    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite = { threshold: 10 };
    raycaster.setFromCamera(mouse, state.camera);
    const hitPoint = findTerrainIntersection(raycaster.ray);
    if (hitPoint && state.originTile) {
        const gps = worldToLngLat(hitPoint.x, hitPoint.z, state.originTile);
        const realAlt = getAltitudeAt(hitPoint.x, hitPoint.z) / state.RELIEF_EXAGGERATION;
        const cp = document.getElementById('coords-panel')!;
        cp.style.display = 'block';
        document.getElementById('click-latlon')!.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
        document.getElementById('click-alt')!.textContent = `${Math.round(realAlt)} m`;
        lastClickedCoords = { x: hitPoint.x, z: hitPoint.z, alt: realAlt * state.RELIEF_EXAGGERATION };
    } else {
        document.getElementById('coords-panel')!.style.display = 'none';
    }
}

function openWeatherPanel() {
    const wp = document.getElementById('weather-panel')!;
    if (!state.weatherData) return;
    
    const getSet = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const titleEl = wp.querySelector('h3');
    if (titleEl) titleEl.textContent = `☁️ ${state.weatherData.locationName || 'Bulletin Météo'}`;
    
    getSet('w-temp', `${state.weatherData.temp.toFixed(1)}°C`);
    getSet('w-apparent', `Ressenti ${state.weatherData.apparentTemp.toFixed(1)}°C`);
    getSet('w-wind', `${Math.round(state.weatherData.windSpeed)} km/h`);
    getSet('w-freezing', `${Math.round(state.weatherData.freezingLevel || 0)} m`);
    getSet('w-uv', (state.weatherData.uvIndex || 0).toFixed(1));
    getSet('w-hum', `${state.weatherData.humidity}%`);
    getSet('w-clouds', `${state.weatherData.cloudCover}%`);

    const arrow = document.getElementById('w-wind-arrow');
    if (arrow) arrow.style.transform = `rotate(${state.weatherData.windDir}deg)`;

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const dirTxt = directions[Math.round(state.weatherData.windDir / 45) % 8];
    getSet('w-wind-dir', dirTxt);

    const hCont = document.getElementById('w-hourly');
    if (hCont && state.weatherData.hourly) {
        hCont.innerHTML = state.weatherData.hourly.map(h => `
            <div style="min-width:55px; background:rgba(255,255,255,0.03); padding:8px; border-radius:10px; text-align:center; border:1px solid var(--border);">
                <div style="font-size:9px; color:var(--t2); mb:4px;">${h.time}</div>
                <div style="font-size:14px;">${h.code >= 51 ? '🌧️' : h.code >= 71 ? '❄️' : '☀️'}</div>
                <div style="font-size:11px; font-weight:700;">${Math.round(h.temp)}°</div>
            </div>
        `).join('');
    }
    wp.style.display = 'block';
}

async function go() {
    const k1 = document.getElementById('k1') as HTMLInputElement;
    if (!k1 || k1.value.length < 5) return;
    state.MK = k1.value;
    localStorage.setItem('maptiler_key_3d', state.MK);
    document.getElementById('setup-screen')!.style.display = 'none';
    document.getElementById('zoom-indicator')!.style.display = 'block';
    document.getElementById('bottom-bar')!.style.display = 'block';
    ['layer-btn', 'settings-toggle', 'gps-btn', 'gps-follow-btn', 'screenshot-btn'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'flex';
    });
    autoSelectMapSource(state.TARGET_LAT, state.TARGET_LON);
    await initScene();
    if (state.camera && state.controls) {
        state.ZOOM = 12;
        state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, 12);
        state.camera.position.set(0, 35000, 40000);
        state.controls.update();
    }
    setTimeout(async () => { await loadTerrain(); initEphemeralUI(); }, 100);
}

function initEphemeralUI() {
    const reset = () => { state.lastUIInteraction = Date.now(); document.body.classList.remove('ui-hidden'); };
    ['mousemove', 'touchstart'].forEach(ev => window.addEventListener(ev, reset));
    setInterval(() => {
        if (Date.now() - state.lastUIInteraction > 15000) {
            const p = document.getElementById('panel');
            if (p && p.classList.contains('open')) return;
            document.body.classList.add('ui-hidden');
        }
    }, 1000);
}

async function takeScreenshot() {
    if (!state.renderer || !state.scene || !state.camera) return;
    state.renderer.render(state.scene, state.camera);
    const link = document.createElement('a');
    link.download = `SunTrail_${Date.now()}.png`;
    link.href = state.renderer.domElement.toDataURL();
    link.click();
}

function initGeocoding() {
    const geoInput = document.getElementById('geo-input') as HTMLInputElement;
    const geoResults = document.getElementById('geo-results');
    if (!geoInput || !geoResults) return;
    let timer: any = null;
    geoInput.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            const q = geoInput.value.trim();
            if (q.length < 2) return;
            try {
                const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`);
                const data = await r.json();
                geoResults.innerHTML = data.map((f: any) => `<div class="geo-item" data-lat="${f.lat}" data-lon="${f.lon}" style="padding:12px; cursor:pointer; color:white; border-bottom:1px solid rgba(255,255,255,0.05);">${f.display_name}</div>`).join('');
                geoResults.style.display = 'block';
                geoResults.querySelectorAll('.geo-item').forEach(item => {
                    item.addEventListener('click', () => {
                        state.TARGET_LAT = parseFloat((item as HTMLElement).dataset.lat!);
                        state.TARGET_LON = parseFloat((item as HTMLElement).dataset.lon!);
                        autoSelectMapSource(state.TARGET_LAT, state.TARGET_LON);
                        state.ZOOM = 13; state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, 13);
                        if (state.controls && state.camera) { state.controls.target.set(0, 0, 0); state.camera.position.set(0, 35000, 40000); state.controls.update(); }
                        geoResults.style.display = 'none'; resetTerrain(); updateVisibleTiles();
                    });
                });
            } catch (e) {}
        }, 400);
    });
}

async function handleGPX(xml: string) {
    const gpx = new gpxParser(); gpx.parse(xml);
    if (!gpx.tracks?.length) return;
    state.rawGpxData = gpx;
    const startPt = gpx.tracks[0].points[0];
    state.TARGET_LAT = startPt.lat; state.TARGET_LON = startPt.lon;
    state.ZOOM = 13; state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
    updateGPXMesh(); updateElevationProfile(); await updateVisibleTiles();
    const tc = document.getElementById('trail-controls'); if (tc) tc.style.display = 'block';
}

function refreshTerrain() {
    resetTerrain();
    updateVisibleTiles();
}
