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
    // --- DÉTECTION PERFORMANCE (v3.8.2) ---
    const bestPreset = detectBestPreset();
    applyPreset(bestPreset);

    let s1 = '';
    try { s1 = localStorage.getItem('maptiler_key_3d') || ''; } catch (e) {}
    
    const k1 = document.getElementById('k1') as HTMLInputElement;
    if (s1 && k1) k1.value = s1;

    // --- DEEP LINKING (v3.8.2) - LECTURE INITIALE ---
    const hash = window.location.hash;
    if (hash && hash.includes('lat=')) {
        const params = new URLSearchParams(hash.substring(1));
        state.TARGET_LAT = parseFloat(params.get('lat') || '46.6863');
        state.TARGET_LON = parseFloat(params.get('lon') || '7.6617');
        state.ZOOM = parseInt(params.get('z') || '13');
        const time = parseInt(params.get('t') || '720');
        // Note: l'application de l'heure se fera après l'initialisation complète
        state.simDate.setHours(Math.floor(time / 60), time % 60);
    }
    
    const bgo = document.getElementById('bgo');
    if (bgo) bgo.addEventListener('click', go);
    
    if (k1) k1.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') go(); });
    
    // --- GESTION DU PANNEAU RÉGLAGES ---
    const panel = document.getElementById('panel');
    const settingsToggle = document.getElementById('settings-toggle');
    const closePanel = document.getElementById('close-panel');

    if (settingsToggle && panel) settingsToggle.addEventListener('click', () => panel.classList.add('open'));
    if (closePanel && panel) closePanel.addEventListener('click', () => panel.classList.remove('open'));

    // --- PRESETS PERFORMANCE (v3.8.2) ---
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.getAttribute('data-preset') as any;
            applyPreset(preset);
            refreshTerrain();
        });
    });

    // --- SÉLECTEUR DE CALQUES (VIGNETTES) ---
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

    // --- GESTION DU GPS ---
    const gpsBtn = document.getElementById('gps-btn');
    if (gpsBtn) {
        gpsBtn.addEventListener('click', async () => {
            try {
                gpsBtn.classList.add('active');
                
                let latitude: number, longitude: number;

                // --- DÉTECTION GPS HYBRIDE (Mobile vs Web) ---
                try {
                    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
                    latitude = pos.coords.latitude;
                    longitude = pos.coords.longitude;
                } catch (e) {
                    // Fallback Web natif si Capacitor échoue
                    const webPos = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
                    });
                    latitude = webPos.coords.latitude;
                    longitude = webPos.coords.longitude;
                }

                autoSelectMapSource(latitude, longitude);
                resetTerrain();
                state.TARGET_LAT = latitude;
                state.TARGET_LON = longitude;
                if (state.controls && state.camera) {
                    state.originTile = lngLatToTile(longitude, latitude, state.ZOOM);
                    state.controls.target.set(0, 0, 0);
                    state.camera.position.set(0, 5000, 8000);
                    state.controls.update();
                }
                await updateVisibleTiles();
                gpsBtn.classList.remove('active');
            } catch (err) {
                console.warn("GPS Error:", err);
                showToast("Impossible d'accéder au GPS");
                gpsBtn.classList.remove('active');
            }
        });
    }

    // --- GESTION DU SUIVI GPS (v3.9.6) ---
    const gpsFollowBtn = document.getElementById('gps-follow-btn');
    if (gpsFollowBtn) {
        gpsFollowBtn.addEventListener('click', async () => {
            state.isFollowingUser = !state.isFollowingUser;
            if (state.isFollowingUser) {
                gpsFollowBtn.classList.add('active');
                await startLocationTracking();
                centerOnUser();
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
    const trailFollowToggle = document.getElementById('trail-follow-toggle') as HTMLInputElement;

    if (gpxBtn && gpxUpload) {
        gpxBtn.addEventListener('click', () => gpxUpload.click());
        gpxUpload.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files ? target.files[0] : null;
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                if (event.target && typeof event.target.result === 'string') {
                    handleGPX(event.target.result);
                }
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

    // --- TEMPS ---
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
            const target = e.target as HTMLInputElement;
            updateSunPosition(parseInt(target.value));
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
            const target = e.target as HTMLSelectElement;
            state.animationSpeed = parseFloat(target.value);
        });
    }

    // --- CLIC SUR CARTE (COORDONNÉES) ---
    window.addEventListener('click', (e: MouseEvent) => {
        if (!state.renderer || !state.camera || !state.scene) return;
        const target = e.target as HTMLElement;
        if (target.tagName !== 'CANVAS') return;
        
        const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        // Augmenter un peu la précision pour les petits objets sur mobile
        raycaster.params.Sprite = { threshold: 10 }; 
        raycaster.setFromCamera(mouse, state.camera);
        
        // --- DÉTECTION SIGNALISATION (v4.1.0) ---
        // On cherche tous les sprites dans la scène qui ont un ID (tous les POI en ont un)
        const intersects = raycaster.intersectObjects(state.scene.children, true);
        const hitPOI = intersects.find(hit => hit.object instanceof THREE.Sprite && hit.object.userData.id);
        
        if (hitPOI) {
            const name = hitPOI.object.userData.name || "Signalétique de randonnée";
            showToast(`📍 ${name}`);
            return; 
        }

        // --- NOUVELLE MÉTHODE DE PICKING PAR RAY-MARCHING (v3.9.2) ---
        // Le Raycaster standard est trompé par les montagnes (il ne voit que le sol plat).
        // On utilise notre algorithme qui "marche" le long du rayon pour trouver le relief.
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

            // Mémorisation pour la sonde (v3.9.1)
            lastClickedCoords = { x: hitPoint.x, z: hitPoint.z, alt: realAlt * state.RELIEF_EXAGGERATION };
        } else {
            const coordsPanel = document.getElementById('coords-panel');
            if (coordsPanel) coordsPanel.style.display = 'none';
        }
    });

    // --- SONDE SOLAIRE (v3.9.1) ---
    const probeBtn = document.getElementById('probe-btn');
    if (probeBtn) {
        probeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            runSolarProbe(lastClickedCoords.x, lastClickedCoords.z, lastClickedCoords.alt);
        });
    }

    const closeProbe = document.getElementById('close-probe');
    const probeResult = document.getElementById('probe-result');

    if (closeProbe) {
        closeProbe.addEventListener('click', () => {
            if (probeResult) probeResult.style.display = 'none';
        });
    }

    if (probeResult) {
        // Empêche la fermeture quand on clique dans le panneau lui-même
        probeResult.addEventListener('click', (e) => e.stopPropagation());
    }

    // Fermeture globale des panels au clic ailleurs (v3.9.1)
    window.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (probeResult && probeResult.style.display === 'block') {
            // Si on clique sur le canvas ou ailleurs que sur le bouton de lancement
            if (target.tagName === 'CANVAS' || !target.closest('#probe-btn')) {
                probeResult.style.display = 'none';
            }
        }
    });

    // --- RÉGLAGES TECHNIQUES ---
    const resSlider = document.getElementById('res-slider') as HTMLInputElement;
    if (resSlider) {
        resSlider.addEventListener('input', () => {
            const resDisp = document.getElementById('res-disp');
            if (resDisp) resDisp.textContent = resSlider.value;
        });
        resSlider.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            applyPreset('custom');
            state.RESOLUTION = parseInt(target.value);
            await refreshTerrain();
        });
    }

    const rangeSlider = document.getElementById('range-slider') as HTMLInputElement;
    if (rangeSlider) {
        rangeSlider.addEventListener('input', () => {
            const rangeDisp = document.getElementById('range-disp');
            if (rangeDisp) rangeDisp.textContent = rangeSlider.value;
        });
        rangeSlider.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            applyPreset('custom');
            state.RANGE = parseInt(target.value);
            await refreshTerrain();
        });
    }

    // --- Nouveaux contrôles (v4.3.27) ---
    const vegDensitySlider = document.getElementById('veg-density-slider') as HTMLInputElement;
    if (vegDensitySlider) {
        vegDensitySlider.addEventListener('input', () => {
            const vegDensityDisp = document.getElementById('veg-density-disp');
            if (vegDensityDisp) vegDensityDisp.textContent = vegDensitySlider.value;
        });
        vegDensitySlider.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            applyPreset('custom');
            state.VEGETATION_DENSITY = parseInt(target.value);
            resetTerrain();
            await loadTerrain();
        });
    }

    const loadSpeedSelect = document.getElementById('load-speed-select') as HTMLSelectElement;
    if (loadSpeedSelect) {
        loadSpeedSelect.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement;
            applyPreset('custom');
            state.LOAD_DELAY_FACTOR = parseFloat(target.value);
            showToast(`Vitesse de chargement : ${target.options[target.selectedIndex].text}`);
        });
    }

    const exagSlider = document.getElementById('exag-slider') as HTMLInputElement;
    if (exagSlider) {
        exagSlider.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            // Note: Exaggeration is not part of performance presets, so we don't trigger 'custom'
            state.RELIEF_EXAGGERATION = parseFloat(target.value);
            const exagDisp = document.getElementById('exag-disp');
            if (exagDisp) exagDisp.textContent = state.RELIEF_EXAGGERATION.toFixed(1);
            await updateVisibleTiles();
        });
    }

    const fogSlider = document.getElementById('fog-slider') as HTMLInputElement;
    if (fogSlider) {
        fogSlider.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const val = parseFloat(target.value);
            // On stocke des valeurs qui serviront de base de calcul proportionnel
            // Plus la valeur est haute, plus on repousse le brouillard loin
            state.FOG_NEAR = val * 250; 
            state.FOG_FAR = state.FOG_NEAR * 4; 

            // Note: Le calcul final dist * (FOG_NEAR / 5000) se fait dans scene.ts
        });
    }

    const shadowToggle = document.getElementById('shadow-toggle') as HTMLInputElement;
    if (shadowToggle) {
        shadowToggle.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            applyPreset('custom');
            state.SHADOWS = target.checked;
            if (state.sunLight) state.sunLight.castShadow = state.SHADOWS;
        });
    }

    const trailsToggle = document.getElementById('trails-toggle') as HTMLInputElement;
    if (trailsToggle) {
        trailsToggle.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_TRAILS = target.checked;
            await refreshTerrain();
        });
    }

    const slopesToggle = document.getElementById('slopes-toggle') as HTMLInputElement;
    if (slopesToggle) {
        slopesToggle.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_SLOPES = target.checked;
            await refreshTerrain();
        });
    }

    // --- GESTION DEBUG & STATS (v3.8.5) ---
    const statsToggle = document.getElementById('stats-toggle') as HTMLInputElement;
    if (statsToggle) {
        statsToggle.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_STATS = target.checked;
            if (state.stats && state.stats.dom) {
                state.stats.dom.style.display = state.SHOW_STATS ? 'block' : 'none';
            }
        });
    }

    const debugToggle = document.getElementById('debug-toggle') as HTMLInputElement;
    if (debugToggle) {
        debugToggle.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_DEBUG = target.checked;
            
            const zoomIndicator = document.getElementById('zoom-indicator');
            if (zoomIndicator) zoomIndicator.style.display = state.SHOW_DEBUG ? 'block' : 'none';
            
            // Note: Le panel de coordonnées se cache tout seul si pas de clic, 
            // mais on s'assure qu'il respecte l'état ici si déjà ouvert.
            const coordsPanel = document.getElementById('coords-panel');
            if (coordsPanel && !state.SHOW_DEBUG) coordsPanel.style.display = 'none';
        });
    }

    const vegToggle = document.getElementById('veg-toggle') as HTMLInputElement;
    if (vegToggle) {
        vegToggle.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_VEGETATION = target.checked;
            resetTerrain();
            await loadTerrain();
        });
    }

    const poiToggle = document.getElementById('poi-toggle') as HTMLInputElement;
    if (poiToggle) {
        poiToggle.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_SIGNPOSTS = target.checked;
            resetTerrain();
            await loadTerrain();
        });
    }

    const buildingsToggle = document.getElementById('buildings-toggle') as HTMLInputElement;
    if (buildingsToggle) {
        buildingsToggle.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_BUILDINGS = target.checked;
            resetTerrain();
            await loadTerrain();
        });
    }

    // --- GESTION CACHE & CLÉ (v3.8.2) ---
    const keyInput = document.getElementById('maptiler-key-input') as HTMLInputElement;
    const updateKeyBtn = document.getElementById('update-key-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');

    if (keyInput) keyInput.value = state.MK;
    
    if (updateKeyBtn && keyInput) {
        updateKeyBtn.addEventListener('click', async () => {
            const newKey = keyInput.value.trim();
            if (newKey.length < 5) {
                showToast("Clé invalide");
                return;
            }
            state.MK = newKey;
            localStorage.setItem('maptiler_key_3d', newKey);
            showToast("Clé mise à jour !");
            await refreshTerrain();
        });
    }

    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async () => {
            if (confirm("Voulez-vous vraiment vider tout le cache local ? Les tuiles devront être re-téléchargées.")) {
                await deleteTerrainCache();
                await refreshTerrain();
            }
        });
    }

    initGeocoding();

    // --- RESIZE PROFILE (v3.9.2) ---
    window.addEventListener('resize', () => {
        if (state.rawGpxData) updateElevationProfile();
    });
}

let lastSourceCheck = 0;
export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource) return;
    
    // On ne vérifie que toutes les 2 secondes pour éviter la charge CPU
    const now = Date.now();
    if (now - lastSourceCheck < 2000) return;
    lastSourceCheck = now;

    const isSwiss = isPositionInSwitzerland(lat, lon);
    const newSource = isSwiss ? 'swisstopo' : 'opentopomap';
    
    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        const items = document.querySelectorAll('.layer-item');
        items.forEach(i => {
            i.classList.remove('active');
            if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active');
        });
        
        // IMPORTANT: On ne fait plus un resetTerrain() brutal ici.
        // On laisse updateVisibleTiles gérer le remplacement progressif.
        updateVisibleTiles();
    }
}

async function refreshTerrain(): Promise<void> {
    resetTerrain();
    if (state.rawGpxData) updateGPXMesh(); 
    await updateVisibleTiles();
}

async function handleGPX(xml: string): Promise<void> {
    const gpx = new gpxParser();
    gpx.parse(xml);
    if (!gpx.tracks || !gpx.tracks.length) return;
    state.rawGpxData = gpx;
    const startPt = gpx.tracks[0].points[0];
    autoSelectMapSource(startPt.lat, startPt.lon);
    resetTerrain();
    state.TARGET_LAT = startPt.lat;
    state.TARGET_LON = startPt.lon;
    state.originTile = lngLatToTile(startPt.lon, startPt.lat, state.ZOOM);
    updateGPXMesh();
    
    const trailControls = document.getElementById('trail-controls');
    const gpxDist = document.getElementById('gpx-dist');
    const gpxElev = document.getElementById('gpx-elev');

    if (trailControls) trailControls.style.display = 'block';
    if (gpxDist) gpxDist.textContent = `${(gpx.tracks[0].distance.total / 1000).toFixed(1)} km`;
    if (gpxElev) gpxElev.textContent = `+${Math.round(gpx.tracks[0].elevation.pos)}m / -${Math.round(gpx.tracks[0].elevation.neg)}m`;
    
    if (state.controls && state.camera && state.gpxPoints.length > 0) {
        state.controls.target.set(state.gpxPoints[0].x, state.gpxPoints[0].y, state.gpxPoints[0].z);
        state.camera.position.set(state.gpxPoints[0].x, state.gpxPoints[0].y + 2000, state.gpxPoints[0].z + 4000);
        state.controls.update();
    }
    updateElevationProfile(); // v3.9.2
    await updateVisibleTiles();
}

async function go(): Promise<void> {
    const k1 = document.getElementById('k1') as HTMLInputElement;
    state.MK = k1 ? k1.value.trim() : '';
    if (!state.MK || state.MK.length < 5) {
        const serr = document.getElementById('serr');
        if (serr) serr.textContent = 'Clé MapTiler invalide.';
        return;
    }
    localStorage.setItem('maptiler_key_3d', state.MK);
    
    const setupScreen = document.getElementById('setup-screen');
    const topSearch = document.getElementById('top-search-container');
    const layerBtn = document.getElementById('layer-btn');
    const settingsToggle = document.getElementById('settings-toggle');
    const gpsBtn = document.getElementById('gps-btn');
    const gpsFollowBtn = document.getElementById('gps-follow-btn');
    const screenshotBtn = document.getElementById('screenshot-btn');
    const bottomBar = document.getElementById('bottom-bar');

    if (setupScreen) setupScreen.style.display = 'none';
    if (topSearch) topSearch.style.display = 'block';
    if (layerBtn) layerBtn.style.display = 'flex';
    if (settingsToggle) settingsToggle.style.display = 'flex';
    if (gpsBtn) gpsBtn.style.display = 'flex';
    if (gpsFollowBtn) gpsFollowBtn.style.display = 'flex';
    if (screenshotBtn) {
        screenshotBtn.style.display = 'flex';
        screenshotBtn.addEventListener('click', takeScreenshot);
    }
    if (bottomBar) bottomBar.style.display = 'flex';
    
    autoSelectMapSource(state.TARGET_LAT, state.TARGET_LON);
    
    // Initialisation scène (Caméra + Controls)
    await initScene();
    
    // Petit délai pour laisser le moteur se stabiliser avant le premier chargement massif
    setTimeout(async () => {
        await loadTerrain();
        initEphemeralUI();
    }, 100);
}

function initEphemeralUI(): void {
    const HIDE_DELAY = 5000; // 5 secondes d'inactivité

    const resetTimer = () => {
        state.lastUIInteraction = Date.now();
        if (!state.uiVisible) {
            state.uiVisible = true;
            document.body.classList.remove('ui-hidden');
        }
    };

    // Événements d'interaction globaux
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('touchstart', resetTimer, { passive: true });
    window.addEventListener('keydown', resetTimer);

    // Boucle de vérification d'inactivité
    setInterval(() => {
        if (state.uiVisible && Date.now() - state.lastUIInteraction > HIDE_DELAY) {
            // Ne pas masquer si des menus critiques sont ouverts
            const panel = document.getElementById('panel');
            if (panel && panel.classList.contains('open')) return;
            
            const layerMenu = document.getElementById('layer-menu');
            if (layerMenu && layerMenu.style.display === 'block') return;

            const geoResults = document.getElementById('geo-results');
            if (geoResults && geoResults.style.display === 'block') return;

            // Ne pas masquer si on est en train de taper dans la recherche
            const geoInput = document.getElementById('geo-input') as HTMLInputElement;
            if (geoInput && document.activeElement === geoInput) return;

            state.uiVisible = false;
            document.body.classList.add('ui-hidden');
        }
    }, 1000);
}

async function takeScreenshot(): Promise<void> {
    if (!state.renderer || !state.scene || !state.camera) return;

    // Masquer l'UI pour la capture
    const wasVisible = state.uiVisible;
    if (wasVisible) {
        document.body.classList.add('ui-hidden');
    }

    // Petit délai pour laisser les transitions CSS se faire (ou on peut juste forcer un rendu sans UI)
    // Mais ici on utilise toDataURL sur le canvas WebGL, l'UI DOM n'apparaîtra pas de toute façon !
    // Sauf si on utilise html2canvas, ce qui n'est pas le cas ici.
    
    // On force un rendu immédiat pour être sûr d'avoir l'image à jour
    state.renderer.render(state.scene, state.camera);
    
    try {
        const dataURL = state.renderer.domElement.toDataURL('image/png');
        
        const link = document.createElement('a');
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        
        link.download = `SunTrail_3D_${timestamp}.png`;
        link.href = dataURL;
        link.click();
        
        showToast("📸 Capture d'écran enregistrée");
    } catch (e) {
        console.error("Screenshot error:", e);
        showToast("❌ Échec de la capture");
    }

    if (wasVisible) {
        document.body.classList.remove('ui-hidden');
    }
}

function initGeocoding(): void {
    const geoInput = document.getElementById('geo-input') as HTMLInputElement;
    const geoResults = document.getElementById('geo-results');
    let geoTimer: ReturnType<typeof setTimeout> | null = null;

    if (geoInput && geoResults) {
        geoInput.addEventListener('input', () => {
            if (geoTimer) clearTimeout(geoTimer);
            const q = geoInput.value.trim();
            if (q.length < 2) { geoResults.style.display = 'none'; return; }
            geoTimer = setTimeout(async () => {
                try {
                    // Passage à Nominatim (OpenStreetMap) - Gratuit et illimité
                    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`);
                    const data = await r.json();
                    if (!data || !data.length) { geoResults.style.display = 'none'; return; }
                    
                    geoResults.innerHTML = '';
                    data.forEach((f: any) => {
                        const item = document.createElement('div');
                        item.style.cssText = 'padding:15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05);';
                        const name = f.display_name.split(',')[0];
                        item.innerHTML = `<div style="color:white; font-weight:500">${name}</div><div style="color:var(--t2); font-size:12px;">${f.display_name}</div>`;
                        item.addEventListener('click', async () => {
                            const lat = parseFloat(f.lat);
                            const lng = parseFloat(f.lon);
                            geoResults.style.display = 'none';
                            geoInput.value = name;
                            autoSelectMapSource(lat, lng);
                            resetTerrain();
                            state.TARGET_LAT = lat;
                            state.TARGET_LON = lng;
                            if (state.controls && state.camera) {
                                state.originTile = lngLatToTile(lng, lat, state.ZOOM);
                                state.controls.target.set(0, 0, 0);
                                state.camera.position.set(0, 5000, 8000);
                                state.controls.update();
                            }
                            await updateVisibleTiles();
                            const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
                            if (timeSlider) updateSunPosition(parseInt(timeSlider.value));
                        });
                        geoResults.appendChild(item);
                    });
                    geoResults.style.display = 'block';
                } catch (e) { console.warn('Geocoding error:', e); }
            }, 400);
        });
    }
}
