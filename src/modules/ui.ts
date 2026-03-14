import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { updateSunPosition } from './sun';
import { initScene } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, deleteTerrainCache, loadTerrain } from './terrain';
import { lngLatToTile, worldToLngLat } from './geo';
import { showToast } from './utils';
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

    const bgo = document.getElementById('bgo');
    if (bgo) bgo.addEventListener('click', go);
    if (k1) k1.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') go(); });
    
    const panel = document.getElementById('panel');
    const settingsToggle = document.getElementById('settings-toggle');
    const closePanel = document.getElementById('close-panel');

    if (settingsToggle && panel) settingsToggle.addEventListener('click', () => panel.classList.add('open'));
    if (closePanel && panel) closePanel.addEventListener('click', () => panel.classList.remove('open'));

    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.getAttribute('data-preset') as any;
            applyPreset(preset);
            refreshTerrain();
        });
    });

    const layerBtn = document.getElementById('layer-btn');
    const layerMenu = document.getElementById('layer-menu');
    if (layerBtn && layerMenu) {
        layerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layerMenu.style.display = layerMenu.style.display === 'block' ? 'none' : 'block';
        });
        window.addEventListener('click', () => { if (layerMenu) layerMenu.style.display = 'none'; });
        layerMenu.addEventListener('click', (e) => e.stopPropagation());
    }

    document.querySelectorAll('.layer-item').forEach(item => {
        item.addEventListener('click', async () => {
            document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            state.MAP_SOURCE = (item as HTMLElement).dataset.source || 'swisstopo';
            state.hasManualSource = true;
            if (layerMenu) layerMenu.style.display = 'none';
            await refreshTerrain();
        });
    });

    const gpsBtn = document.getElementById('gps-btn');
    if (gpsBtn) {
        gpsBtn.addEventListener('click', async () => {
            try {
                gpsBtn.classList.add('active');
                const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
                const { latitude, longitude } = pos.coords;
                // autoSelectMapSource est importé de terrain.ts maintenant
                import('./terrain').then(m => m.autoSelectMapSource(latitude, longitude));
                resetTerrain();
                state.TARGET_LAT = latitude; state.TARGET_LON = longitude;
                if (state.controls && state.camera) {
                    state.ZOOM = 12;
                    state.originTile = lngLatToTile(longitude, latitude, 12);
                    state.controls.target.set(0, 0, 0);
                    state.camera.position.set(0, 35000, 40000);
                    state.controls.update();
                }
                await updateVisibleTiles();
                gpsBtn.classList.remove('active');
            } catch (err) { showToast("GPS indisponible"); gpsBtn.classList.remove('active'); }
        });
    }

    const gpsFollowBtn = document.getElementById('gps-follow-btn');
    if (gpsFollowBtn) {
        gpsFollowBtn.addEventListener('click', async () => {
            state.isFollowingUser = !state.isFollowingUser;
            if (state.isFollowingUser) {
                gpsFollowBtn.classList.add('active');
                await startLocationTracking(); centerOnUser();
                showToast("Suivi GPS activé");
            } else {
                gpsFollowBtn.classList.remove('active');
                showToast("Suivi GPS désactivé");
            }
        });
    }

    // --- GPX ---
    const gpxBtn = document.getElementById('gpx-btn');
    const gpxUpload = document.getElementById('gpx-upload') as HTMLInputElement;
    if (gpxBtn && gpxUpload) {
        gpxBtn.addEventListener('click', () => gpxUpload.click());
        gpxUpload.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { if (typeof ev.target?.result === 'string') handleGPX(ev.target.result); };
            reader.readAsText(file);
        });
    }

    // --- CLIC SUR CARTE ---
    window.addEventListener('click', (e: MouseEvent) => {
        if (!state.renderer || !state.camera || !state.scene) return;
        const target = e.target as HTMLElement;
        
        // 1. PRIORITÉ UI : Si on clique sur un élément d'interface, on s'arrête ici
        if (target.closest('button') || target.closest('input') || target.closest('select') || 
            target.closest('summary') || target.closest('details') || 
            target.id === 'weather-clickable' || target.closest('#weather-clickable') ||
            target.closest('.ui-element:not(#coords-panel)')) return;

        // 2. SÉCURITÉ 2D : Pas de relevé d'altitude si zoom <= 10
        if (state.ZOOM <= 10) {
            const cp = document.getElementById('coords-panel');
            if (cp) cp.style.display = 'none';
            return;
        }

        // 3. SEUL LE CANVAS DÉCLENCHE LE RELEVÉ
        if (target.tagName !== 'CANVAS') return;

        // Fermeture automatique réglages
        if (panel && panel.classList.contains('open')) panel.classList.remove('open');

        const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.params.Sprite = { threshold: 10 }; 
        raycaster.setFromCamera(mouse, state.camera);
        
        const intersects = raycaster.intersectObjects(state.scene.children, true);
        const hitPOI = intersects.find(hit => hit.object instanceof THREE.Sprite && hit.object.userData.id);
        if (hitPOI) { showToast(`📍 ${hitPOI.object.userData.name || "POI"}`); return; }

        const hitPoint = findTerrainIntersection(raycaster.ray);
        if (hitPoint && state.originTile) {
            const gps = worldToLngLat(hitPoint.x, hitPoint.z, state.originTile);
            const realAlt = getAltitudeAt(hitPoint.x, hitPoint.z) / state.RELIEF_EXAGGERATION;
            const coordsPanel = document.getElementById('coords-panel');
            if (coordsPanel) {
                coordsPanel.style.display = 'block';
                const latEl = document.getElementById('click-latlon');
                const altEl = document.getElementById('click-alt');
                if (latEl) latEl.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
                if (altEl) altEl.textContent = `${Math.round(realAlt)} m`;
            }
            lastClickedCoords = { x: hitPoint.x, z: hitPoint.z, alt: realAlt * state.RELIEF_EXAGGERATION };
        } else {
            const cp = document.getElementById('coords-panel'); if (cp) cp.style.display = 'none';
        }
    });

    const probeBtn = document.getElementById('probe-btn');
    if (probeBtn) {
        probeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            runSolarProbe(lastClickedCoords.x, lastClickedCoords.z, lastClickedCoords.alt);
        });
    }
    const closeProbe = document.getElementById('close-probe');
    if (closeProbe) closeProbe.addEventListener('click', () => { 
        const pr = document.getElementById('probe-result'); if (pr) pr.style.display = 'none'; 
    });

    const copyReportBtn = document.getElementById('copy-report-btn');
    if (copyReportBtn) {
        copyReportBtn.addEventListener('click', () => {
            const latlon = document.getElementById('click-latlon')?.textContent;
            const report = `SunTrail Report - Location: ${latlon}`;
            navigator.clipboard.writeText(report);
            showToast("📋 Rapport copié");
        });
    }

    // --- MÉTÉO ---
    const weatherDensitySlider = document.getElementById('weather-density-slider') as HTMLInputElement;
    if (weatherDensitySlider) {
        weatherDensitySlider.addEventListener('input', () => {
            state.WEATHER_DENSITY = parseInt(weatherDensitySlider.value);
            const d = document.getElementById('weather-density-disp'); if (d) d.textContent = state.WEATHER_DENSITY.toString();
        });
    }
    const weatherSpeedSlider = document.getElementById('weather-speed-slider') as HTMLInputElement;
    if (weatherSpeedSlider) {
        weatherSpeedSlider.addEventListener('input', () => {
            state.WEATHER_SPEED = parseFloat(weatherSpeedSlider.value);
            const d = document.getElementById('weather-speed-disp'); if (d) d.textContent = state.WEATHER_SPEED.toFixed(1);
        });
    }
    document.querySelectorAll('.weather-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentWeather = btn.getAttribute('data-weather') as any;
        document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        import('./weather').then(m => m.updateWeatherUIIndicator());
    }));

    const weatherIndicator = document.getElementById('zoom-indicator');
    const weatherPanel = document.getElementById('weather-panel');
    if (weatherIndicator) {
        weatherIndicator.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.weatherData && weatherPanel) {
                const titleEl = weatherPanel.querySelector('h3');
                if (titleEl) titleEl.textContent = `☁️ ${state.weatherData.locationName || 'Bulletin Météo'}`;
                
                const getSet = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
                getSet('w-temp', `${state.weatherData.temp.toFixed(1)}°C`);
                getSet('w-apparent', `Ressenti ${state.weatherData.apparentTemp.toFixed(1)}°C`);
                getSet('w-wind', `${Math.round(state.weatherData.windSpeed)} km/h`);
                getSet('w-freezing', `${Math.round(state.weatherData.freezingLevel || 0)} m`);
                getSet('w-uv', (state.weatherData.uvIndex || 0).toFixed(1));
                getSet('w-hum', `${state.weatherData.humidity}%`);
                getSet('w-clouds', `${state.weatherData.cloudCover}%`);

                const arrow = document.getElementById('w-wind-arrow');
                if (arrow) arrow.style.transform = `rotate(${state.weatherData.windDir}deg)`;
                
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
                weatherPanel.style.display = 'block';
            }
        });
    }
    const closeWeather = document.getElementById('close-weather');
    if (closeWeather) closeWeather.addEventListener('click', () => { if (weatherPanel) weatherPanel.style.display = 'none'; });

    // --- AUTRES RÉGLAGES ---
    const shadowToggle = document.getElementById('shadow-toggle') as HTMLInputElement;
    if (shadowToggle) shadowToggle.addEventListener('change', () => { state.SHADOWS = shadowToggle.checked; refreshTerrain(); });
    const vegToggle = document.getElementById('veg-toggle') as HTMLInputElement;
    if (vegToggle) vegToggle.addEventListener('change', () => { state.SHOW_VEGETATION = vegToggle.checked; resetTerrain(); loadTerrain(); });
    const buildingsToggle = document.getElementById('buildings-toggle') as HTMLInputElement;
    if (buildingsToggle) buildingsToggle.addEventListener('change', () => { state.SHOW_BUILDINGS = buildingsToggle.checked; resetTerrain(); loadTerrain(); });
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', async () => { if (confirm("Vider le cache ?")) { await deleteTerrainCache(); refreshTerrain(); } });

    const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    if (timeSlider) timeSlider.addEventListener('input', () => updateSunPosition(parseInt(timeSlider.value)));
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) screenshotBtn.addEventListener('click', takeScreenshot);

    initGeocoding();
}

async function refreshTerrain(): Promise<void> { resetTerrain(); await updateVisibleTiles(); }

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

async function go(): Promise<void> {
    const k1 = document.getElementById('k1') as HTMLInputElement;
    state.MK = k1?.value.trim() || '';
    if (state.MK.length < 5) return;
    localStorage.setItem('maptiler_key_3d', state.MK);
    document.getElementById('setup-screen')!.style.display = 'none';
    document.getElementById('top-search-container')!.style.display = 'block';
    document.getElementById('layer-btn')!.style.display = 'flex';
    document.getElementById('settings-toggle')!.style.display = 'flex';
    document.getElementById('gps-btn')!.style.display = 'flex';
    document.getElementById('gps-follow-btn')!.style.display = 'flex';
    document.getElementById('bottom-bar')!.style.display = 'flex';
    document.getElementById('zoom-indicator')!.style.display = 'block';
    document.getElementById('screenshot-btn')!.style.display = 'flex';
    await initScene();
    
    if (state.camera && state.controls) {
        state.ZOOM = 12;
        state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, 12);
        state.camera.position.set(0, 35000, 40000);
        state.controls.update();
    }
    setTimeout(async () => { await loadTerrain(); initEphemeralUI(); }, 100);
}

function initEphemeralUI(): void {
    const reset = () => { state.lastUIInteraction = Date.now(); if (!state.uiVisible) { state.uiVisible = true; document.body.classList.remove('ui-hidden'); } };
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, reset));
    setInterval(() => {
        if (state.uiVisible && Date.now() - state.lastUIInteraction > 15000) {
            const p = document.getElementById('panel');
            if (p && p.classList.contains('open')) return;
            state.uiVisible = false; document.body.classList.add('ui-hidden');
        }
    }, 1000);
}

async function takeScreenshot() {
    if (!state.renderer || !state.camera || !state.scene) return;
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
            const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`);
            const data = await r.json();
            geoResults.innerHTML = data.map((f: any) => `<div class="geo-item" data-lat="${f.lat}" data-lon="${f.lon}" style="padding:12px; cursor:pointer; color:white;">${f.display_name}</div>`).join('');
            geoResults.style.display = 'block';
            geoResults.querySelectorAll('.geo-item').forEach(item => {
                item.addEventListener('click', () => {
                    state.TARGET_LAT = parseFloat((item as HTMLElement).dataset.lat!);
                    state.TARGET_LON = parseFloat((item as HTMLElement).dataset.lon!);
                    // autoSelectMapSource est importé de terrain.ts maintenant
                    import('./terrain').then(m => m.autoSelectMapSource(state.TARGET_LAT, state.TARGET_LON));
                    state.ZOOM = 13; state.originTile = lngLatToTile(state.TARGET_LON, state.TARGET_LAT, 13);
                    if (state.controls && state.camera) { state.controls.target.set(0, 0, 0); state.camera.position.set(0, 35000, 40000); state.controls.update(); }
                    geoResults.style.display = 'none'; resetTerrain(); updateVisibleTiles();
                });
            });
        }, 400);
    });
}
