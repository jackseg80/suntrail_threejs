import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { updateSunPosition } from './sun';
import { initScene } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, deleteTerrainCache, loadTerrain } from './terrain';
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

    const hash = window.location.hash;
    if (hash && hash.includes('lat=')) {
        const params = new URLSearchParams(hash.substring(1));
        state.TARGET_LAT = parseFloat(params.get('lat') || '46.6863');
        state.TARGET_LON = parseFloat(params.get('lon') || '7.6617');
        state.ZOOM = parseInt(params.get('z') || '13');
        const time = parseInt(params.get('t') || '720');
        state.simDate.setHours(Math.floor(time / 60), time % 60);
    }
    
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
    const layerItems = document.querySelectorAll('.layer-item');

    if (layerBtn && layerMenu) {
        layerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layerMenu.style.display = layerMenu.style.display === 'block' ? 'none' : 'block';
        });
        window.addEventListener('click', () => layerMenu.style.display = 'none');
        layerMenu.addEventListener('click', (e) => e.stopPropagation());
    }

    layerItems.forEach(item => {
        item.addEventListener('click', async () => {
            layerItems.forEach(i => i.classList.remove('active'));
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
                let latitude: number, longitude: number;
                try {
                    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
                    latitude = pos.coords.latitude; longitude = pos.coords.longitude;
                } catch (e) {
                    const webPos = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
                    });
                    latitude = webPos.coords.latitude; longitude = webPos.coords.longitude;
                }
                autoSelectMapSource(latitude, longitude);
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
            } catch (err) {
                showToast("Impossible d'accéder au GPS");
                gpsBtn.classList.remove('active');
            }
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

    const gpxBtn = document.getElementById('gpx-btn');
    const gpxUpload = document.getElementById('gpx-upload') as HTMLInputElement;
    const trailFollowToggle = document.getElementById('trail-follow-toggle') as HTMLInputElement;

    if (gpxBtn && gpxUpload) {
        gpxBtn.addEventListener('click', () => gpxUpload.click());
        gpxUpload.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files ? target.files[0] : null;
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                if (event.target && typeof event.target.result === 'string') handleGPX(event.target.result);
            };
            reader.readAsText(file);
        });
    }

    if (trailFollowToggle) {
        trailFollowToggle.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.isFollowingTrail = target.checked;
            if (state.isFollowingTrail && state.gpxPoints.length > 0) {
                state.trailProgress = 0;
                if (state.controls) state.controls.enabled = false;
            } else {
                if (state.controls) state.controls.enabled = true;
            }
        });
    }

    const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    const dateInput = document.getElementById('date-input') as HTMLInputElement;

    if (dateInput) {
        dateInput.valueAsDate = state.simDate;
        dateInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.simDate = new Date(target.value);
            if (timeSlider) updateSunPosition(parseInt(timeSlider.value));
        });
    }

    if (timeSlider) {
        timeSlider.addEventListener('input', (e: Event) => {
            updateSunPosition(parseInt((e.target as HTMLInputElement).value));
        });
    }

    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            state.isAnimating = !state.isAnimating;
            playBtn.textContent = state.isAnimating ? "⏸" : "▶";
        });
    }

    const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
    if (speedSelect) {
        speedSelect.addEventListener('change', (e: Event) => {
            state.animationSpeed = parseFloat((e.target as HTMLSelectElement).value);
        });
    }

    // --- CLIC SUR CARTE (COORDONNÉES) ---
    window.addEventListener('click', (e: MouseEvent) => {
        if (!state.renderer || !state.camera || !state.scene) return;
        const target = e.target as HTMLElement;
        
        if (target.tagName === 'CANVAS' && panel && panel.classList.contains('open')) {
            panel.classList.remove('open');
        }

        if (target.tagName !== 'CANVAS' && target.id !== 'canvas-container') return;
        
        const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.params.Sprite = { threshold: 10 }; 
        raycaster.setFromCamera(mouse, state.camera);
        
        const intersects = raycaster.intersectObjects(state.scene.children, true);
        const hitPOI = intersects.find(hit => hit.object instanceof THREE.Sprite && hit.object.userData.id);
        
        if (hitPOI) {
            showToast(`📍 ${hitPOI.object.userData.name || "POI"}`);
            return; 
        }

        const hitPoint = findTerrainIntersection(raycaster.ray);
        if (hitPoint && state.originTile) {
            const gps = worldToLngLat(hitPoint.x, hitPoint.z, state.originTile);
            const realAlt = getAltitudeAt(hitPoint.x, hitPoint.z) / state.RELIEF_EXAGGERATION;

            const coordsPanel = document.getElementById('coords-panel');
            const clickLatLon = document.getElementById('click-latlon');
            const clickAlt = document.getElementById('click-alt');

            if (coordsPanel) coordsPanel.style.display = state.SHOW_DEBUG ? 'block' : 'none';
            if (clickLatLon) clickLatLon.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
            if (clickAlt) clickAlt.textContent = `${Math.round(realAlt)} m`;

            lastClickedCoords = { x: hitPoint.x, z: hitPoint.z, alt: realAlt * state.RELIEF_EXAGGERATION };
        } else {
            const coordsPanel = document.getElementById('coords-panel');
            if (coordsPanel) coordsPanel.style.display = 'none';
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
    const probeResult = document.getElementById('probe-result');
    if (closeProbe) closeProbe.addEventListener('click', () => { if (probeResult) probeResult.style.display = 'none'; });
    if (probeResult) probeResult.addEventListener('click', (e) => e.stopPropagation());

    const resSlider = document.getElementById('res-slider') as HTMLInputElement;
    if (resSlider) {
        resSlider.addEventListener('input', () => {
            const resDisp = document.getElementById('res-disp');
            if (resDisp) resDisp.textContent = resSlider.value;
        });
        resSlider.addEventListener('change', async (e: Event) => {
            state.RESOLUTION = parseInt((e.target as HTMLInputElement).value);
            applyPreset('custom'); await refreshTerrain();
        });
    }

    const rangeSlider = document.getElementById('range-slider') as HTMLInputElement;
    if (rangeSlider) {
        rangeSlider.addEventListener('input', () => {
            const rangeDisp = document.getElementById('range-disp');
            if (rangeDisp) rangeDisp.textContent = rangeSlider.value;
        });
        rangeSlider.addEventListener('change', async (e: Event) => {
            state.RANGE = parseInt((e.target as HTMLInputElement).value);
            applyPreset('custom'); await refreshTerrain();
        });
    }

    const shadowToggle = document.getElementById('shadow-toggle') as HTMLInputElement;
    if (shadowToggle) shadowToggle.addEventListener('change', (e: Event) => {
        state.SHADOWS = (e.target as HTMLInputElement).checked;
        applyPreset('custom'); if (state.sunLight) state.sunLight.castShadow = state.SHADOWS;
    });

    const trailsToggle = document.getElementById('trails-toggle') as HTMLInputElement;
    if (trailsToggle) trailsToggle.addEventListener('change', async (e: Event) => { state.SHOW_TRAILS = (e.target as HTMLInputElement).checked; await refreshTerrain(); });

    const slopesToggle = document.getElementById('slopes-toggle') as HTMLInputElement;
    if (slopesToggle) slopesToggle.addEventListener('change', async (e: Event) => { state.SHOW_SLOPES = (e.target as HTMLInputElement).checked; await refreshTerrain(); });

    const vegToggle = document.getElementById('veg-toggle') as HTMLInputElement;
    if (vegToggle) vegToggle.addEventListener('change', async (e: Event) => { state.SHOW_VEGETATION = (e.target as HTMLInputElement).checked; resetTerrain(); await loadTerrain(); });

    const poiToggle = document.getElementById('poi-toggle') as HTMLInputElement;
    if (poiToggle) poiToggle.addEventListener('change', async (e: Event) => { state.SHOW_SIGNPOSTS = (e.target as HTMLInputElement).checked; resetTerrain(); await loadTerrain(); });

    const buildingsToggle = document.getElementById('buildings-toggle') as HTMLInputElement;
    if (buildingsToggle) buildingsToggle.addEventListener('change', async (e: Event) => { state.SHOW_BUILDINGS = (e.target as HTMLInputElement).checked; resetTerrain(); await loadTerrain(); });

    // --- MÉTÉO (v4.4) ---
    const weatherDensitySlider = document.getElementById('weather-density-slider') as HTMLInputElement;
    const weatherDensityDisp = document.getElementById('weather-density-disp');
    if (weatherDensitySlider) {
        weatherDensitySlider.addEventListener('input', () => {
            state.WEATHER_DENSITY = parseInt(weatherDensitySlider.value);
            if (weatherDensityDisp) weatherDensityDisp.textContent = state.WEATHER_DENSITY.toString();
        });
    }

    const weatherSpeedSlider = document.getElementById('weather-speed-slider') as HTMLInputElement;
    const weatherSpeedDisp = document.getElementById('weather-speed-disp');
    if (weatherSpeedSlider) {
        weatherSpeedSlider.addEventListener('input', () => {
            state.WEATHER_SPEED = parseFloat(weatherSpeedSlider.value);
            if (weatherSpeedDisp) weatherSpeedDisp.textContent = state.WEATHER_SPEED.toFixed(1);
        });
    }

    const weatherBtns = document.querySelectorAll('.weather-btn');
    weatherBtns.forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.getAttribute('data-weather') as any;
        state.currentWeather = type;
        if (type !== 'clear' && state.WEATHER_DENSITY <= 0) {
            state.WEATHER_DENSITY = 2500;
            if (weatherDensitySlider) weatherDensitySlider.value = "2500";
            if (weatherDensityDisp) weatherDensityDisp.textContent = "2500";
        }
        weatherBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        import('./weather').then(m => m.updateWeatherUIIndicator());
    }));

    const weatherIndicator = document.getElementById('zoom-indicator');
    const weatherPanel = document.getElementById('weather-panel');
    const closeWeather = document.getElementById('close-weather');

    if (weatherIndicator && weatherPanel) {
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.id === 'weather-clickable' || target.closest('#weather-clickable')) {
                e.stopPropagation();
                if (state.weatherData) {
                    const titleEl = weatherPanel.querySelector('h3');
                    if (titleEl) titleEl.textContent = `☁️ ${state.weatherData.locationName || 'Bulletin Météo'}`;
                    
                    const tempEl = document.getElementById('w-temp');
                    const apparentEl = document.getElementById('w-apparent');
                    const windEl = document.getElementById('w-wind');
                    const windArrow = document.getElementById('w-wind-arrow');
                    const windDirEl = document.getElementById('w-wind-dir');
                    const humEl = document.getElementById('w-hum');
                    const cloudsEl = document.getElementById('w-clouds');

                    if (tempEl) tempEl.textContent = `${state.weatherData.temp.toFixed(1)}°C`;
                    if (apparentEl) apparentEl.textContent = `Ressenti ${state.weatherData.apparentTemp.toFixed(1)}°C`;
                    if (windEl) windEl.textContent = `${state.weatherData.windSpeed.toFixed(1)} km/h`;
                    if (windArrow) windArrow.style.transform = `rotate(${state.weatherData.windDir}deg)`;
                    if (windDirEl) {
                        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO', 'N'];
                        const index = Math.round(state.weatherData.windDir / 45);
                        windDirEl.textContent = `Dir. ${directions[index]} (${state.weatherData.windDir}°)`;
                    }
                    if (humEl) humEl.textContent = `${state.weatherData.humidity}%`;
                    if (cloudsEl) cloudsEl.textContent = `${state.weatherData.cloudCover}%`;
                    
                    weatherPanel.style.display = 'block';
                }
            }
        });
    }
    if (closeWeather) closeWeather.addEventListener('click', (e) => { e.stopPropagation(); if (weatherPanel) weatherPanel.style.display = 'none'; });

    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) screenshotBtn.addEventListener('click', takeScreenshot);

    const keyInput = document.getElementById('maptiler-key-input') as HTMLInputElement;
    const updateKeyBtn = document.getElementById('update-key-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (keyInput) keyInput.value = state.MK;
    if (updateKeyBtn) updateKeyBtn.addEventListener('click', async () => { state.MK = keyInput.value.trim(); localStorage.setItem('maptiler_key_3d', state.MK); await refreshTerrain(); });
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', async () => { if (confirm("Vider le cache ?")) { await deleteTerrainCache(); await refreshTerrain(); } });

    initGeocoding();
    window.addEventListener('resize', () => { if (state.rawGpxData) updateElevationProfile(); });
}

export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource) return;
    if (isNaN(lat) || Math.abs(lat) > 80 || lat === 0) return;
    const isSwiss = isPositionInSwitzerland(lat, lon);
    const newSource = isSwiss ? 'swisstopo' : 'opentopomap';
    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        document.querySelectorAll('.layer-item').forEach(i => {
            i.classList.remove('active');
            if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active');
        });
        updateVisibleTiles();
    }
}

async function refreshTerrain(): Promise<void> { resetTerrain(); if (state.rawGpxData) updateGPXMesh(); await updateVisibleTiles(); }

async function handleGPX(xml: string): Promise<void> {
    const gpx = new gpxParser(); gpx.parse(xml);
    if (!gpx.tracks || !gpx.tracks.length) return;
    state.rawGpxData = gpx;
    const startPt = gpx.tracks[0].points[0];
    autoSelectMapSource(startPt.lat, startPt.lon);
    resetTerrain();
    state.TARGET_LAT = startPt.lat; state.TARGET_LON = startPt.lon;
    state.originTile = lngLatToTile(startPt.lon, startPt.lat, state.ZOOM);
    updateGPXMesh();
    
    const trailControls = document.getElementById('trail-controls');
    const gpxDist = document.getElementById('gpx-dist');
    const gpxElev = document.getElementById('gpx-elev');
    if (trailControls) trailControls.style.display = 'block';
    if (gpxDist) gpxDist.textContent = `${(gpx.tracks[0].distance.total / 1000).toFixed(1)} km`;
    if (gpxElev) gpxElev.textContent = `+${Math.round(gpx.tracks[0].elevation.pos)}m / -${Math.round(gpx.tracks[0].elevation.neg)}m`;
    
    if (state.controls && state.camera && state.gpxPoints.length > 0) {
        state.ZOOM = 12;
        state.originTile = lngLatToTile(startPt.lon, startPt.lat, 12);
        state.controls.target.set(state.gpxPoints[0].x, state.gpxPoints[0].y, state.gpxPoints[0].z);
        state.camera.position.set(state.gpxPoints[0].x, state.gpxPoints[0].y + 35000, state.gpxPoints[0].z + 40000);
        state.controls.update();
    }
    updateElevationProfile(); await updateVisibleTiles();
}

async function go(): Promise<void> {
    const k1 = document.getElementById('k1') as HTMLInputElement;
    state.MK = k1 ? k1.value.trim() : '';
    if (!state.MK || state.MK.length < 5) return;
    localStorage.setItem('maptiler_key_3d', state.MK);
    document.getElementById('setup-screen')!.style.display = 'none';
    document.getElementById('top-search-container')!.style.display = 'block';
    document.getElementById('layer-btn')!.style.display = 'flex';
    document.getElementById('settings-toggle')!.style.display = 'flex';
    document.getElementById('gps-btn')!.style.display = 'flex';
    document.getElementById('gps-follow-btn')!.style.display = 'flex';
    document.getElementById('screenshot-btn')!.style.display = 'flex';
    document.getElementById('bottom-bar')!.style.display = 'flex';
    autoSelectMapSource(state.TARGET_LAT, state.TARGET_LON);
    await initScene();
    setTimeout(async () => { await loadTerrain(); initEphemeralUI(); }, 100);
}

function initEphemeralUI(): void {
    const resetTimer = () => { state.lastUIInteraction = Date.now(); if (!state.uiVisible) { state.uiVisible = true; document.body.classList.remove('ui-hidden'); } };
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, resetTimer));
    setInterval(() => {
        if (state.uiVisible && Date.now() - state.lastUIInteraction > 5000) {
            if (document.querySelector('#panel.open') || document.activeElement?.tagName === 'INPUT') return;
            state.uiVisible = false; document.body.classList.add('ui-hidden');
        }
    }, 1000);
}

async function takeScreenshot(): Promise<void> {
    if (!state.renderer || !state.scene || !state.camera) return;
    const wasVisible = state.uiVisible;
    if (wasVisible) document.body.classList.add('ui-hidden');
    state.renderer.render(state.scene, state.camera);
    try {
        const dataURL = state.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `SunTrail_3D_${Date.now()}.png`;
        link.href = dataURL; link.click();
        showToast("📸 Capture enregistrée");
    } catch (e) { showToast("❌ Échec capture"); }
    if (wasVisible) document.body.classList.remove('ui-hidden');
}

function initGeocoding(): void {
    const geoInput = document.getElementById('geo-input') as HTMLInputElement;
    const geoResults = document.getElementById('geo-results');
    let geoTimer: any = null;
    if (geoInput && geoResults) {
        geoInput.addEventListener('input', () => {
            if (geoTimer) clearTimeout(geoTimer);
            const q = geoInput.value.trim();
            if (q.length < 2) { geoResults.style.display = 'none'; return; }
            geoTimer = setTimeout(async () => {
                try {
                    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6`);
                    const data = await r.json();
                    if (!data || !data.length) { geoResults.style.display = 'none'; return; }
                    geoResults.innerHTML = '';
                    data.forEach((f: any) => {
                        const item = document.createElement('div');
                        item.style.cssText = 'padding:15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05);';
                        const name = f.display_name.split(',')[0];
                        item.innerHTML = `<div style="color:white; font-weight:500">${name}</div><div style="color:var(--t2); font-size:12px;">${f.display_name}</div>`;
                        item.addEventListener('click', async () => {
                            geoResults.style.display = 'none'; geoInput.value = name;
                            const lat = parseFloat(f.lat), lng = parseFloat(f.lon);
                            autoSelectMapSource(lat, lng); resetTerrain();
                            state.TARGET_LAT = lat; state.TARGET_LON = lng;
                            if (state.controls && state.camera) {
                                state.ZOOM = 13; state.originTile = lngLatToTile(lng, lat, 13);
                                state.controls.target.set(0, 0, 0); state.camera.position.set(0, 35000, 40000);
                                state.controls.update();
                            }
                            await updateVisibleTiles();
                        });
                        geoResults.appendChild(item);
                    });
                    geoResults.style.display = 'block';
                } catch (e) {}
            }, 400);
        });
    }
}
