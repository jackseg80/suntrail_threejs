import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state, loadSettings, loadProStatus } from './state';
import { iapService } from './iapService';
import { requestGPSDisclosure } from './gpsDisclosure';
import { requestAcceptance } from './acceptanceWall';
import { requestOnboarding } from './onboardingTutorial';
import { i18n } from '../i18n/I18nService';
import { initScene, flyTo, forceImmediateLODUpdate } from './scene';
import { refreshTerrain } from './terrain';
import { updateElevationProfile } from './profile';
import { startLocationTracking, updateUserMarker, stopLocationTracking, clearUserMarker } from './location';
import { lngLatToTile, lngLatToWorld, worldToLngLat } from './geo';
import { showToast } from './toast';
import { applyPreset, detectBestPreset, getGpuInfo, applyCustomSettings } from './performance';
import { findTerrainIntersection, getAltitudeAt } from './analysis';
import { initRouteManager, removeWaypointAt, scheduleAutoCompute, clearRoute } from './routeManager';
import { fetchWeather } from './weather';
import { fetchLocalPeaks } from './peaks';
import { initTheme } from './theme';
import { haptic } from './haptics';
import { resolveMapTilerKey } from './config';

import { NavigationBar } from './ui/components/NavigationBar';
import { TopStatusBar } from './ui/components/TopStatusBar';
import { WidgetsComponent } from './ui/components/WidgetsComponent';
import { TimelineComponent } from './ui/components/TimelineComponent';
import { initAutoHide } from './ui/autoHide';
import { initMobileUI } from './ui/mobile';
import { sheetManager } from './ui/core/SheetManager';
import { attachDraggablePanel } from './ui/draggablePanel';

export async function appInit(): Promise<void> {
    // --- 1. HYDRATATION IMMÉDIATE DES COMPOSANTS SYSTÈME ---
    const topStatusBar = new TopStatusBar();
    topStatusBar.hydrate();

    const navBar = new NavigationBar();
    navBar.hydrate();

    const widgets = new WidgetsComponent();
    widgets.hydrate();

    // Charger le statut Pro en premier
    loadProStatus();

    // Charger la clé ORS depuis localStorage (v5.50.x)
    try {
        const savedORSKey = localStorage.getItem('suntrail_ors_key');
        if (savedORSKey && savedORSKey.length > 10) {
            state.ORS_KEY = savedORSKey;
        }
    } catch { /* ignore */ }

    // Initialiser RevenueCat en fire-and-forget
    void iapService.initialize();

    // v5.29.35 : Résolution de la clé MapTiler et chargement du catalog des packs.
    await Promise.all([
        resolveMapTilerKey(),
        import('./packManager').then(m => m.packManager.fetchCatalog())
    ]);

    const savedSettings = loadSettings();
    if (savedSettings) {
        const AUTO_SOURCES = ['swisstopo', 'opentopomap'];
        state.hasManualSource = !AUTO_SOURCES.includes(savedSettings.MAP_SOURCE);
        if (savedSettings.PERFORMANCE_PRESET === 'custom') {
            applyCustomSettings(savedSettings);
        } else {
            applyPreset(savedSettings.PERFORMANCE_PRESET);
        }
    } else {
        const bestPreset = detectBestPreset();
        applyPreset(bestPreset);
    }

    document.body.classList.toggle('mode-2d', state.IS_2D_MODE);
    i18n.setLocale(state.lang);
    initTheme();

    // Diagnostic matériel
    const gpuInfo = getGpuInfo();
    const diagGpu = document.getElementById('diag-gpu');
    if (diagGpu) diagGpu.textContent = `GPU: ${gpuInfo.renderer}`;
    
    const diagCpu = document.getElementById('diag-cpu');
    if (diagCpu) diagCpu.textContent = `CPU: ${navigator.hardwareConcurrency || '--'} cores`;
    
    const diagPreset = document.getElementById('diag-preset');
    if (diagPreset) diagPreset.textContent = `PROFIL: ${state.PERFORMANCE_PRESET.toUpperCase()}`;
    
    const techInfo = document.getElementById('tech-info');
    if (techInfo) techInfo.style.display = state.SHOW_DEBUG ? 'block' : 'none';

    setupOrientationHandler();
    
    document.addEventListener('click', handleGlobalClick);
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.addEventListener('click', handleMapClick);

    // Initialiser les composants
    new TimelineComponent();
    initAutoHide();
    initMobileUI();

    // Lancer la scène
    await launchScene();

    // Hydratation secondaire
    void initSecondaryUI().then(() => {
        if (state.DEBUG_MODE) console.log('[UI] Secondary UI Hydrated');
    });

    setupGpsButton();
    setupFabs();
    setupCoordsPill();
    setupLongPress();
    setupRouteBar();

    (window as any).sheetManager = sheetManager;
}

function setupOrientationHandler() {
    let _orientPollId: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener('orientationchange', () => {
        if (_orientPollId !== null) clearTimeout(_orientPollId);
        const prevW = window.innerWidth;
        const prevH = window.innerHeight;
        let attempts = 0;
        const poll = () => {
            _orientPollId = null;
            const w = window.innerWidth;
            const h = window.innerHeight;
            if ((w !== prevW || h !== prevH) && w > 0 && h > 0) {
                window.dispatchEvent(new Event('resize'));
                return;
            }
            if (++attempts < 30) {
                _orientPollId = setTimeout(poll, 50);
            } else {
                window.dispatchEvent(new Event('resize'));
            }
        };
        _orientPollId = setTimeout(poll, 50);
    });
}

async function launchScene() {
    window.addEventListener('suntrail:sceneReady', () => {
        void requestAcceptance().then(() => requestOnboarding());

        const mapOverlay = document.getElementById('map-loading-overlay');
        if (mapOverlay) {
            mapOverlay.classList.add('visible');
            let tilesStarted = false;

            const offlineMsg = document.getElementById('map-loading-offline-msg');
            const spinnerText = mapOverlay.querySelector('.map-loading-text') as HTMLElement;
            const showOfflineMsg = () => {
                if (offlineMsg) offlineMsg.style.display = 'flex';
                if (spinnerText) spinnerText.style.display = 'none';
            };
            const hideOfflineMsg = () => {
                if (offlineMsg) offlineMsg.style.display = 'none';
                if (spinnerText) spinnerText.style.display = '';
            };

            if (!state.isNetworkAvailable) showOfflineMsg();
            const unsubNet = state.subscribe('isNetworkAvailable', (available: boolean) => {
                if (available) hideOfflineMsg(); else showOfflineMsg();
            });

            const hideOverlay = () => {
                mapOverlay.classList.add('fade-out');
                setTimeout(() => { mapOverlay.style.display = 'none'; }, 300);
                unsubNet();
            };

            const unsub = state.subscribe('isProcessingTiles', (processing: boolean) => {
                if (processing) tilesStarted = true;
                if (!processing && tilesStarted) { hideOverlay(); unsub(); }
            });

            setTimeout(() => { if (!tilesStarted) { hideOverlay(); unsub(); } }, 2000);
            setTimeout(() => { if (mapOverlay.classList.contains('visible')) hideOverlay(); }, 15000);
        }
    }, { once: true });

    await startApp();

    // Tile loading bar
    const bar = document.getElementById('tile-loading-bar');
    let debounce: ReturnType<typeof setTimeout> | null = null;
    state.subscribe('isProcessingTiles', (processing: boolean) => {
        if (!bar) return;
        if (processing) {
            if (!debounce) {
                debounce = setTimeout(() => { bar.classList.add('visible'); }, 600);
            }
        } else {
            if (debounce) { clearTimeout(debounce); debounce = null; }
            bar.classList.remove('visible');
        }
    });
}

async function startApp() {
    try {
        await initScene();
        fetchWeather(state.TARGET_LAT, state.TARGET_LON);
        fetchLocalPeaks(state.TARGET_LAT, state.TARGET_LON);
        
        const ids = ['nav-bar', 'top-status-bar', 'widgets-container', 'bottom-bar'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = id === 'widgets-container' || id === 'bottom-bar' ? 'block' : 'flex';
        });
        
        const fabStack = document.querySelector('.fab-stack') as HTMLElement;
        if (fabStack) fabStack.style.display = 'flex';
    } catch (e) {
        console.error('[AppInit] Critical failure during startApp:', e);
    } finally {
        (window as any).suntrailReady = true;
        window.dispatchEvent(new Event('suntrail:uiReady'));
    }
}

async function initSecondaryUI(): Promise<void> {
    try {
        const [
            { SettingsSheet },
            { LayersSheet },
            { SearchSheet },
            { TrackSheet },
            { WeatherSheet },
            { SolarProbeSheet },
            { SOSSheet },
            { ConnectivitySheet },
            { PacksSheet },
            { UpgradeSheet },
            { VRAMDashboard },
            { InclinometerWidget },
        ] = await Promise.all([
            import('./ui/components/SettingsSheet'),
            import('./ui/components/LayersSheet'),
            import('./ui/components/SearchSheet'),
            import('./ui/components/TrackSheet'),
            import('./ui/components/WeatherSheet'),
            import('./ui/components/SolarProbeSheet'),
            import('./ui/components/SOSSheet'),
            import('./ui/components/ConnectivitySheet'),
            import('./ui/components/PacksSheet'),
            import('./ui/components/UpgradeSheet'),
            import('./ui/components/VRAMDashboard'),
            import('./ui/components/InclinometerWidget'),
        ]);

        new SettingsSheet().hydrate();
        new LayersSheet().hydrate();
        new SearchSheet().hydrate();
        new TrackSheet().hydrate();
        new WeatherSheet().hydrate();
        new SolarProbeSheet().hydrate();
        new SOSSheet().hydrate();
        new ConnectivitySheet().hydrate();
        new PacksSheet().hydrate();
        new UpgradeSheet().hydrate();

        const vramDashboard = new VRAMDashboard();
        vramDashboard.init();
        state.vramPanel = vramDashboard;

        new InclinometerWidget().init();
        initRouteManager();
    } catch (e) {
        console.error('[UI] Secondary hydration failed:', e);
    }
}

function handleGlobalClick(_e: MouseEvent) {}

let _longPressJustFired = false;

const POI_CATEGORY_LABELS: Record<string, string> = {
    guidepost: 'Signalisation',
    viewpoint: 'Point de vue',
    shelter: 'Abri',
    info: 'Information',
    trail: 'Sentier',
    hut: 'Refuge',
    rest: 'Halte',
    attraction: 'Curiosité'
};

function getPOICategoryLabel(category: string): string {
    return POI_CATEGORY_LABELS[category] || '';
}

async function handleMapClick(e: MouseEvent) {
    if (_longPressJustFired) { _longPressJustFired = false; return; }
    if (!state.renderer || !state.camera || !state.scene) return;

    if (sheetManager.getActiveSheetId()) {
        sheetManager.close();
    }

    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite = { threshold: 35 };
    raycaster.setFromCamera(mouse, state.camera);

    const intersects = raycaster.intersectObjects(state.scene.children, true);

    // Tap sur un marker de waypoint → supprimer
    const waypointHit = intersects.find(h => h.object.userData?.type === 'waypoint-marker');
    if (waypointHit) {
        void haptic('medium');
        removeWaypointAt(waypointHit.object.userData.waypointIndex as number);
        return;
    }

    const gpxHit = intersects.find(hit => hit.object.userData?.type === 'gpx-track');
    if (gpxHit) {
        const layerId = gpxHit.object.userData.layerId;
        if (layerId) {
            state.activeGPXLayerId = layerId;
            updateElevationProfile(layerId);
            sheetManager.open('track');
        }
        return;
    }

    const spriteHit = intersects.find(hit => hit.object.type === 'Sprite');
    if (spriteHit) {
        const poiData = spriteHit.object.userData;
        const spriteWorldX = spriteHit.object.position.x + (spriteHit.object.parent?.position.x || 0);
        const spriteWorldZ = spriteHit.object.position.z + (spriteHit.object.parent?.position.z || 0);

        if (poiData && poiData.name) {
            state.hasLastClicked = true;
            state.lastClickedCoords = { 
                x: spriteWorldX,
                z: spriteWorldZ, 
                alt: getAltitudeAt(spriteWorldX, spriteWorldZ) 
            };
            
            const cp = document.getElementById('coords-pill');
            if (cp) {
                cp.classList.remove('panel-custom-pos');
                cp.style.left = ''; cp.style.top = ''; cp.style.bottom = ''; cp.style.transform = '';
                cp.classList.remove('hidden');
                const gps = worldToLngLat(spriteWorldX, spriteWorldZ, state.originTile!);
                const clickLatLon = document.getElementById('click-latlon');
                if (clickLatLon) clickLatLon.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
                const clickAlt = document.getElementById('click-alt');
                if (clickAlt) clickAlt.textContent = `${Math.round(state.lastClickedCoords.alt / state.RELIEF_EXAGGERATION)} m`;
                const clickPoiName = document.getElementById('click-poi-name');
                if (clickPoiName) {
                    clickPoiName.style.display = 'block';
                    const catLabel = getPOICategoryLabel(poiData.category);
                    if (catLabel && poiData.name !== catLabel) {
                        clickPoiName.textContent = `📍 ${catLabel} : ${poiData.name}`;
                    } else {
                        clickPoiName.textContent = `📍 ${poiData.name}`;
                    }
                }
            }
            return;
        }
    }

    const hit = findTerrainIntersection(raycaster.ray);
    if (hit && state.originTile) {

        state.hasLastClicked = true;
        state.lastClickedCoords = { x: hit.x, z: hit.z, alt: getAltitudeAt(hit.x, hit.z) };
        
        const cp = document.getElementById('coords-pill');
        if (cp) {
            cp.classList.remove('panel-custom-pos');
            cp.style.left = ''; cp.style.top = ''; cp.style.bottom = ''; cp.style.transform = '';
            cp.classList.remove('hidden');
            const gps = worldToLngLat(hit.x, hit.z, state.originTile);
            const clickLatLon = document.getElementById('click-latlon');
            if (clickLatLon) clickLatLon.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
            const clickAlt = document.getElementById('click-alt');
            if (clickAlt) clickAlt.textContent = `${Math.round(state.lastClickedCoords.alt / state.RELIEF_EXAGGERATION)} m`;
            const clickPoiName = document.getElementById('click-poi-name');
            if (clickPoiName) clickPoiName.style.display = 'none';
        }
    } else {
        state.hasLastClicked = false;
        const cp = document.getElementById('coords-pill');
        if (cp) cp.classList.add('hidden');
    }
}

function setupGpsButton() {
    const gpsMainBtn = document.getElementById('gps-main-btn');
    let gpsLongPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressTriggered = false;

    gpsMainBtn?.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        longPressTriggered = false;
        
        gpsLongPressTimer = setTimeout(() => {
            clearUserMarker();
            stopLocationTracking();
            gpsMainBtn.classList.remove('active', 'following');
            showToast(i18n.t('gps.toast.disabled') || 'Position désactivée');
            gpsLongPressTimer = null;
            longPressTriggered = true;
            void haptic('medium');
        }, 2000);
    });

    const cancelGpsLongPress = () => {
        if (gpsLongPressTimer) {
            clearTimeout(gpsLongPressTimer);
            gpsLongPressTimer = null;
        }
    };

    gpsMainBtn?.addEventListener('pointerup', () => {
        setTimeout(() => { longPressTriggered = false; }, 10);
        cancelGpsLongPress();
    });
    gpsMainBtn?.addEventListener('pointerleave', cancelGpsLongPress);
    gpsMainBtn?.addEventListener('contextmenu', (e) => e.preventDefault());

    gpsMainBtn?.addEventListener('click', async () => {
        if (longPressTriggered) return;
        
        try {
            const allowed = await requestGPSDisclosure();
            if (!allowed) return;

            const position = await Geolocation.getCurrentPosition({
                timeout: 5000,
                enableHighAccuracy: true
            });
            
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const isAlreadyCentered = gpsMainBtn.classList.contains('active');

            if (!isAlreadyCentered) {
                state.TARGET_LAT = lat;
                state.TARGET_LON = lon;
                state.ZOOM = 14;
                state.originTile = lngLatToTile(lon, lat, 14);
                state.userLocation = { lat, lon, alt: position.coords.altitude || 0 };
                updateUserMarker();
                refreshTerrain();
                
                const worldPos = lngLatToWorld(lon, lat, state.originTile);
                const altWorld = getAltitudeAt(worldPos.x, worldPos.z);
                
                await flyTo(worldPos.x, worldPos.z, (altWorld / state.RELIEF_EXAGGERATION) + 500);
                forceImmediateLODUpdate();
                
                fetchWeather(lat, lon);
                gpsMainBtn.classList.add('active');
                showToast(i18n.t('gps.toast.centered'));
            } else {
                gpsMainBtn.classList.toggle('following');
                const isFollowing = gpsMainBtn.classList.contains('following');
                showToast(isFollowing ? i18n.t('gps.toast.followOn') : i18n.t('gps.toast.followOff'));
                
                if (isFollowing) {
                    state.isFollowingUser = true;
                    await startLocationTracking();
                } else {
                    state.isFollowingUser = false;
                }
            }
        } catch (e: any) { 
            showToast(e.code === 1 ? i18n.t('gps.toast.permissionDenied') : i18n.t('gps.toast.error')); 
        }
    });

    state.subscribe('isUserInteracting', (interacting) => {
        if (interacting && state.isFollowingUser) {
            const btn = document.getElementById('gps-main-btn');
            if (btn?.classList.contains('following')) {
                state.isFollowingUser = false;
                btn.classList.remove('active', 'following');
                showToast(i18n.t('gps.toast.interrupted'));
            }
        }
    });
}

function setupFabs() {
    const layersFab = document.getElementById('layers-fab');
    layersFab?.addEventListener('click', () => {
        sheetManager.toggle('layers-sheet');
    });

    const compassFab = document.getElementById('compass-fab');
    compassFab?.addEventListener('click', () => {
        if (state.controls && state.camera) {
            const controls = state.controls;
            const startAngle = controls.getAzimuthalAngle();
            let targetAngle = 0;
            
            let diff = targetAngle - startAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            targetAngle = startAngle + diff;
            
            const startTime = Date.now();
            const duration = 500;
            const initialAngle = startAngle;
            state.isInteractingWithUI = true;

            function animateNorth() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const currentAngle = initialAngle + (targetAngle - initialAngle) * eased;

                const offset = state.camera!.position.clone().sub(controls.target);
                const spherical = new THREE.Spherical().setFromVector3(offset);
                spherical.theta = currentAngle;
                const newPos = new THREE.Vector3().setFromSpherical(spherical).add(controls.target);
                state.camera!.position.copy(newPos);
                controls.update();

                if (progress < 1) {
                    requestAnimationFrame(animateNorth);
                } else {
                    state.isInteractingWithUI = false;
                    showToast(i18n.t('compass.toast.northAligned'));
                }
            }
            animateNorth();
        }
    });

    state.subscribe('isUserInteracting', () => {
        const compassSvg = document.getElementById('compass-svg');
        if (compassSvg && state.camera) {
            const angle = state.controls?.getAzimuthalAngle() || 0;
            compassSvg.style.transform = `rotate(${-angle}rad)`;
        }
    });
}

function setupCoordsPill() {
    const coordsPill = document.getElementById('coords-pill');
    if (!coordsPill) return;

    document.getElementById('close-coords')?.addEventListener('click', () => {
        coordsPill.classList.add('hidden');
        state.hasLastClicked = false;
    });

    attachDraggablePanel({
        panel: coordsPill,
        handle: coordsPill, 
        customPosClass: 'panel-custom-pos',
        onDismiss: () => {
            coordsPill.classList.add('hidden');
            state.hasLastClicked = false;
        },
    });

    const OVERLAP_TARGETS = [
        { el: document.querySelector('.fab-stack') as HTMLElement | null },
        { el: document.getElementById('top-pill-main') },
        { el: document.getElementById('rec-status-widget') },
        { el: document.getElementById('net-status-icon') },
        { el: document.getElementById('sos-main-btn') },
        { el: document.getElementById('timeline-toggle-btn') },
    ];
    const OVERLAP_CLS = 'widget-overlap-hidden';

    const checkPillOverlap = (): void => {
        if (coordsPill.classList.contains('hidden')) {
            OVERLAP_TARGETS.forEach(t => t.el?.classList.remove(OVERLAP_CLS));
            return;
        }
        const pr = coordsPill.getBoundingClientRect();
        OVERLAP_TARGETS.forEach(({ el }) => {
            if (!el) return;
            const had = el.classList.contains(OVERLAP_CLS);
            if (had) el.classList.remove(OVERLAP_CLS);
            const r = el.getBoundingClientRect();
            if (had) el.classList.add(OVERLAP_CLS);
            const overlaps = pr.right > r.left - 8 && pr.left < r.right + 8
                          && pr.bottom > r.top - 8 && pr.top < r.bottom + 8;
            el.classList.toggle(OVERLAP_CLS, overlaps);
        });
    };

    window.addEventListener('pointermove', checkPillOverlap, { passive: true });
    new MutationObserver(checkPillOverlap).observe(coordsPill, {
        attributes: true, attributeFilter: ['class'],
    });
}

function setupLongPress() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    const indicator = document.getElementById('lp-indicator');

    container.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;

        if (indicator) {
            indicator.style.left = `${e.clientX}px`;
            indicator.style.top = `${e.clientY}px`;
            indicator.classList.add('active');
            requestAnimationFrame(() => indicator.classList.add('filling'));
        }

        timer = setTimeout(() => {
            timer = null;
            if (indicator) {
                indicator.classList.add('done');
                setTimeout(() => indicator.classList.remove('active', 'filling', 'done'), 300);
            }
            _longPressJustFired = true;
            void haptic('medium');
            placeWaypointAt(e.clientX, e.clientY);
        }, 500);
    });

    container.addEventListener('pointermove', (e: PointerEvent) => {
        if (!timer) return;
        if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) {
            clearTimeout(timer);
            timer = null;
            if (indicator) {
                indicator.classList.remove('filling');
                setTimeout(() => indicator.classList.remove('active', 'done'), 50);
            }
        }
    }, { passive: true });

    const cancel = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        indicator?.classList.remove('active', 'filling', 'done');
    };
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('contextmenu', (e) => { if (_longPressJustFired) e.preventDefault(); });
}

function placeWaypointAt(clientX: number, clientY: number): void {
    if (!state.renderer || !state.camera || !state.scene || !state.originTile) return;

    const mouse = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.camera);

    const intersects = raycaster.intersectObjects(state.scene.children, true);

    const blockedHit = intersects.find(h =>
        h.object.userData?.type === 'waypoint-marker' || h.object.userData?.type === 'gpx-track'
    );
    if (blockedHit) return;

    let hit: { x: number; z: number } | null = null;

    if (state.IS_2D_MODE) {
        // En 2D, le terrain est plat à y=0, on intersecte le plan horizontal
        const dir = raycaster.ray.direction;
        const t = -raycaster.ray.origin.y / (dir.y || -1);
        hit = {
            x: raycaster.ray.origin.x + t * dir.x,
            z: raycaster.ray.origin.z + t * dir.z,
        };
    } else {
        hit = findTerrainIntersection(raycaster.ray);
    }

    if (hit && state.originTile) {
        const gps = worldToLngLat(hit.x, hit.z, state.originTile);
        const alt = state.IS_2D_MODE ? 0 : getAltitudeAt(hit.x, hit.z);
        if (state.routeWaypoints.length >= 10) return;
        state.routeWaypoints = [...state.routeWaypoints, { lat: gps.lat, lon: gps.lon, alt }];

        const bar = document.getElementById('route-bar');
        if (bar) {
            bar.classList.remove('rb-flash');
            void bar.offsetWidth;
            bar.classList.add('rb-flash');
            bar.addEventListener('animationend', () => bar.classList.remove('rb-flash'), { once: true });
        }
    }
}

function setupRouteBar(): void {
    document.getElementById('rb-clear-btn')?.addEventListener('click', () => clearRoute());

    document.getElementById('rb-settings-btn')?.addEventListener('click', () => {
        document.getElementById('route-settings')?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('route-settings');
        if (!panel || panel.classList.contains('hidden')) return;
        if (!panel.contains(e.target as Node) && !(e.target as Element)?.closest('#rb-settings-btn')) {
            panel.classList.add('hidden');
        }
    });

    document.getElementById('rs-profile')?.addEventListener('change', (e) => {
        state.activeRouteProfile = (e.target as HTMLSelectElement).value as any;
        if (state.routeWaypoints.length >= 2) scheduleAutoCompute();
    });

    const loopChk = document.getElementById('rs-loop') as HTMLInputElement | null;
    loopChk?.addEventListener('change', () => {
        state.routeLoopEnabled = loopChk.checked;
        if (state.routeWaypoints.length >= 2) scheduleAutoCompute();
    });

    document.getElementById('rs-save-key')?.addEventListener('click', () => {
        const key = (document.getElementById('rs-ors-key') as HTMLInputElement)?.value.trim();
        if (key && key.length > 10) {
            state.ORS_KEY = key;
            try { localStorage.setItem('suntrail_ors_key', key); } catch { /* ignore */ }
        }
    });
}
