import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { updateSunPosition } from './sun';
import { initScene } from './scene';
import { resetToNorth } from './compass';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, loadTerrain, autoSelectMapSource, deleteTerrainCache } from './terrain';
import { lngLatToTile, worldToLngLat } from './geo';
import { showToast, fetchGeocoding } from './utils';
import { applyPreset, detectBestPreset, getGpuInfo } from './performance';
import { runSolarProbe, findTerrainIntersection, getAltitudeAt } from './analysis';
import { updateElevationProfile } from './profile';
import { startLocationTracking, centerOnUser } from './location';

let lastClickedCoords = { x: 0, z: 0, alt: 0 };

export function initUI(): void {
    const bestPreset = detectBestPreset();
    applyPreset(bestPreset);

    // --- DIAGNOSTIC MATÉRIEL (v4.5.35) ---
    const techInfo = document.getElementById('tech-info');
    if (techInfo) {
        techInfo.style.display = 'block';
        const gpu = getGpuInfo();
        const gpuEl = document.getElementById('diag-gpu');
        if (gpuEl) {
            const vendorPrefix = gpu.vendor.includes('NVIDIA') ? 'NVIDIA ' : (gpu.vendor.includes('Qualcomm') ? 'Qualcomm ' : '');
            let cleanRenderer = gpu.renderer;
            
            // Nettoyage agressif pour ne garder que le nom commercial (RTX, Adreno, etc.)
            // On coupe avant les parenthèses, Direct3D, vs_5_0, etc.
            const noise = [' (', ' Direct3D', ' vs_', ' ps_', ' OpenGL'];
            noise.forEach(n => {
                const idx = cleanRenderer.indexOf(n);
                if (idx !== -1) cleanRenderer = cleanRenderer.substring(0, idx);
            });

            // Suppression des doublons de vendor (ex: NVIDIA NVIDIA)
            if (vendorPrefix && cleanRenderer.startsWith(vendorPrefix.trim())) {
                gpuEl.textContent = `GPU: ${cleanRenderer}`;
            } else {
                gpuEl.textContent = `GPU: ${vendorPrefix}${cleanRenderer}`;
            }
        }
        
        const cpuEl = document.getElementById('diag-cpu');
        if (cpuEl) cpuEl.textContent = `CPU: ${navigator.hardwareConcurrency || '--'} logical cores`;
        
        const presetEl = document.getElementById('diag-preset');
        if (presetEl) presetEl.textContent = `PROFIL AUTO: ${bestPreset.toUpperCase()}`;
    }

    let s1 = '';
    try { s1 = localStorage.getItem('maptiler_key_3d') || ''; } catch (e) {}
    const k1 = document.getElementById('k1') as HTMLInputElement;
    if (s1 && k1) k1.value = s1;

    // --- DÉLÉGATION GLOBALE DES CLICS (INCASSABLE) ---
    document.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const id = target.id;

        // BOUSSOLE (v4.5.24 FIX) - On vérifie le canvas et le conteneur
        if (id === 'compass-canvas' || target.closest('#compass-canvas')) {
            resetToNorth();
            return;
        }

        if (id === 'bgo') go();
        if (target.closest('#settings-toggle')) document.getElementById('panel')!.classList.add('open');
        if (target.closest('#close-panel')) document.getElementById('panel')!.classList.remove('open');

        if (target.closest('#layer-btn')) {
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
            refreshTerrain();
        }

        if (target.closest('#gps-btn')) {
            try {
                const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
                const { latitude, longitude } = pos.coords;
                state.TARGET_LAT = latitude; state.TARGET_LON = longitude;
                state.ZOOM = 13;
                state.originTile = lngLatToTile(longitude, latitude, 13);
                resetTerrain();
                if (state.controls && state.camera) {
                    state.controls.target.set(0, 0, 0);
                    state.camera.position.set(0, 15000, 20000);
                    state.controls.update();
                }
                autoSelectMapSource(latitude, longitude);
                await updateVisibleTiles();
                showToast("Position actualisée");
            } catch (err) { showToast("GPS indisponible"); }
        }

        const followBtn = target.closest('#gps-follow-btn');
        if (followBtn) {
            state.isFollowingUser = !state.isFollowingUser;
            followBtn.classList.toggle('active', state.isFollowingUser);
            if (state.isFollowingUser) { await startLocationTracking(); centerOnUser(); }
        }

        // MÉTÉO
        if (id === 'zoom-indicator' || target.closest('#zoom-indicator') || id === 'weather-clickable') {
            openWeatherPanel();
        }
        if (id === 'close-weather') document.getElementById('weather-panel')!.style.display = 'none';
        
        if (id === 'open-expert-weather') {
            document.getElementById('weather-panel')!.style.display = 'none';
            openExpertWeatherPanel();
        }
        if (id === 'close-expert-weather') document.getElementById('expert-weather-panel')!.style.display = 'none';

        const wBtn = target.closest('.weather-btn') as HTMLElement;
        if (wBtn) {
            state.currentWeather = wBtn.dataset.weather as any;
            document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('active'));
            wBtn.classList.add('active');
            import('./weather').then(m => m.updateWeatherUIIndicator());
        }

        // ANALYSE SOLAIRE
        if (id === 'probe-btn') {
            e.stopPropagation();
            runSolarProbe(lastClickedCoords.x, lastClickedCoords.z, lastClickedCoords.alt);
        }
        if (id === 'close-probe') document.getElementById('probe-result')!.style.display = 'none';
        if (id === 'copy-report-btn') {
            const report = `SunTrail Report - Lat: ${state.TARGET_LAT.toFixed(4)} Lon: ${state.TARGET_LON.toFixed(4)}`;
            navigator.clipboard.writeText(report); showToast("Copié !");
        }

        if (id === 'gpx-btn') document.getElementById('gpx-upload')!.click();
        if (id === 'screenshot-btn') takeScreenshot();

        const pBtn = target.closest('.preset-btn') as HTMLElement;
        if (pBtn) {
            const preset = pBtn.dataset.preset as any;
            applyPreset(preset);
            refreshTerrain();
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
    hookInput('exag-slider', (v) => { state.RELIEF_EXAGGERATION = parseFloat(v); document.getElementById('exag-disp')!.textContent = v; refreshTerrain(); loadTerrain(); });
    hookInput('time-slider', (v) => updateSunPosition(parseInt(v)));
    hookInput('weather-density-slider', (v) => { state.WEATHER_DENSITY = parseInt(v); document.getElementById('weather-density-disp')!.textContent = v; });
    hookInput('weather-speed-slider', (v) => { state.WEATHER_SPEED = parseFloat(v); document.getElementById('weather-speed-disp')!.textContent = parseFloat(v).toFixed(1); });
    hookInput('veg-density-slider', (v) => { state.VEGETATION_DENSITY = parseInt(v); document.getElementById('veg-density-disp')!.textContent = v; refreshTerrain(); loadTerrain(); });
    hookInput('fog-slider', (v) => { state.FOG_FAR = parseInt(v) * 1000; refreshTerrain(); loadTerrain(); });

    hookChange('shadow-toggle', (v) => { state.SHADOWS = v; if (state.sunLight) state.sunLight.castShadow = v; });
    hookChange('veg-toggle', (v) => { state.SHOW_VEGETATION = v; refreshTerrain(); loadTerrain(); });
    hookChange('buildings-toggle', (v) => { state.SHOW_BUILDINGS = v; refreshTerrain(); loadTerrain(); });
    hookChange('poi-toggle', (v) => { state.SHOW_SIGNPOSTS = v; refreshTerrain(); loadTerrain(); });
    hookChange('trails-toggle', (v) => { state.SHOW_TRAILS = v; refreshTerrain(); loadTerrain(); });
    hookChange('slopes-toggle', (v) => { state.SHOW_SLOPES = v; refreshTerrain(); loadTerrain(); });
    hookChange('stats-toggle', (v) => { state.SHOW_STATS = v; if (state.stats) state.stats.dom.style.display = v ? 'block' : 'none'; });
    hookChange('debug-toggle', (v) => { state.SHOW_DEBUG = v; });

    document.getElementById('load-speed-select')?.addEventListener('change', (e) => {
        state.LOAD_DELAY_FACTOR = parseFloat((e.target as HTMLSelectElement).value);
    });

    document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
        if (confirm("Vider le cache local ?")) { await deleteTerrainCache(); refreshTerrain(); }
    });

    document.getElementById('gpx-upload')?.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => { if (typeof ev.target?.result === 'string') handleGPX(ev.target.result); };
            reader.readAsText(file);
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
        const cll = document.getElementById('click-latlon'); if (cll) cll.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
        const cal = document.getElementById('click-alt'); if (cal) cal.textContent = `${Math.round(realAlt)} m`;
        lastClickedCoords = { x: hitPoint.x, z: hitPoint.z, alt: realAlt * state.RELIEF_EXAGGERATION };
    } else {
        const cp = document.getElementById('coords-panel'); if (cp) cp.style.display = 'none';
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
        hCont.innerHTML = state.weatherData.hourly.slice(0, 24).map(h => `
            <div style="min-width:65px; background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; text-align:center; border:1px solid var(--border); flex-shrink:0;">
                <div style="font-size:10px; color:var(--t2); mb:4px;">${h.time}</div>
                <div style="font-size:18px; margin-bottom:5px;">${h.code >= 51 ? (h.code >= 71 ? '❄️' : '🌧️') : '☀️'}</div>
                <div style="font-size:12px; font-weight:700;">${Math.round(h.temp)}°</div>
            </div>
        `).join('');

        hCont.onwheel = (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                hCont.scrollLeft += e.deltaY;
            }
        };
    }
    wp.style.display = 'block';
}

function openExpertWeatherPanel() {
    const ep = document.getElementById('expert-weather-panel')!;
    if (!state.weatherData) return;

    const getSet = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    
    getSet('ex-location', state.weatherData.locationName || 'Station Expert');
    getSet('ex-coords', `${state.TARGET_LAT.toFixed(4)}, ${state.TARGET_LON.toFixed(4)}`);
    
    getSet('ex-gusts', `${Math.round(state.weatherData.windGusts || 0)} km/h`);
    getSet('ex-vis', `${(state.weatherData.visibility || 0).toFixed(1)} km`);
    getSet('ex-precip', `${Math.round(state.weatherData.precProb || 0)} %`);
    getSet('ex-dew', `${(state.weatherData.dewPoint || 0).toFixed(1)}°C`);
    getSet('ex-freezing', `${Math.round(state.weatherData.freezingLevel || 0)} m`);
    
    if (state.ephemeris) {
        getSet('ex-golden', state.ephemeris.goldenHour || '--:--');
        getSet('ex-blue', state.ephemeris.blueHour || '--:--');
        const mi = document.getElementById('ex-moon-icon'); if (mi) mi.textContent = state.ephemeris.moonPhaseIcon || '🌑';
        getSet('ex-moon-text', `${state.ephemeris.moonPhaseText} (${state.ephemeris.moonIllum || 0}%)`);
    } else {
        getSet('ex-golden', '--:--');
        getSet('ex-blue', '--:--');
        getSet('ex-moon-text', '--');
    }

    const chart = document.getElementById('ex-chart-container')!;
    if (state.weatherData.hourly) {
        const hourly = state.weatherData.hourly;
        const maxT = Math.max(...hourly.map(h => h.temp));
        const minT = Math.min(...hourly.map(h => h.temp));
        const range = maxT - minT || 1;

        chart.innerHTML = hourly.map((h, i) => {
            const hFactor = (h.temp - minT) / range;
            const height = 20 + hFactor * 100;
            const opacity = (i % 2 === 0) ? 0.4 : 0.2;
            const color = h.code >= 51 ? '#3b82f6' : '#f59e0b';
            const timeLabel = (i % 3 === 0) ? `<div style="position:absolute; bottom:-25px; left:0; font-size:8px; color:var(--t2);">${h.time}</div>` : '';

            return `
                <div style="flex:1; display:flex; flex-direction:column; justify-content:flex-end; height:100%; position:relative;" title="${h.time}: ${h.temp}°C">
                    ${timeLabel}
                    <div style="height:${height}px; background:${color}; opacity:${opacity}; border-radius:4px 4px 0 0;"></div>
                    <div style="position:absolute; bottom:${height + 5}px; left:50%; transform:translateX(-50%); font-size:8px; color:white; font-weight:700;">${Math.round(h.temp)}°</div>
                </div>
            `;
        }).join('');
    }

    ep.style.display = 'block';
}

async function go() {
    const k1 = document.getElementById('k1') as HTMLInputElement;
    if (!k1 || k1.value.length < 5) return;
    state.MK = k1.value;
    localStorage.setItem('maptiler_key_3d', state.MK);
    
    const ss = document.getElementById('setup-screen'); if (ss) ss.style.display = 'none';
    const zi = document.getElementById('zoom-indicator'); if (zi) zi.style.display = 'block';
    const bb = document.getElementById('bottom-bar'); if (bb) bb.style.display = 'block';
    
    ['layer-btn', 'settings-toggle', 'gps-btn', 'gps-follow-btn', 'screenshot-btn'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'flex';
    });
    
    const ts = document.getElementById('top-search-container'); if (ts) ts.style.display = 'block';
    const dateInput = document.getElementById('date-input') as HTMLInputElement;
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

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
                const data = await fetchGeocoding(q);
                if (!data) return;
                geoResults.innerHTML = data.map((f: any) => `<div class="geo-item" data-lat="${f.lat}" data-lon="${f.lon}" style="padding:12px; cursor:pointer; color:white; border-bottom:1px solid rgba(255,255,255,0.05);">${f.display_name}</div>`).join('');
                geoResults.style.display = 'block';
                geoResults.querySelectorAll('.geo-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const lat = parseFloat((item as HTMLElement).dataset.lat!);
                        const lon = parseFloat((item as HTMLElement).dataset.lon!);
                        
                        if (isNaN(lat) || isNaN(lon)) return;

                        state.TARGET_LAT = lat;
                        state.TARGET_LON = lon;
                        autoSelectMapSource(lat, lon);
                        
                        // Recentrage total
                        state.ZOOM = 13; 
                        state.originTile = lngLatToTile(lon, lat, 13);
                        
                        if (state.controls && state.camera) { 
                            state.controls.target.set(0, 0, 0); 
                            state.camera.position.set(0, 35000, 40000); 
                            state.controls.update(); 
                        }
                        
                        geoResults.style.display = 'none'; 
                        geoInput.value = '';
                        
                        refreshTerrain(); // Reset et recharge
                        fetchWeather(lat, lon);
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
