# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [5.11.0-wip] - 2026-03-28
### 🔋 Sprint 6 — Optimisation Énergétique Mobile + PerfRecorder + Recalibration Presets

#### Sprint 6 — Phase 1 : Quick Wins Batterie
- **Deep Sleep réel** (`scene.ts`) : Remplacement du `return` inline insuffisant par `renderer.setAnimationLoop(null)` sur `visibilitychange hidden` + relance sur `visible`. Le GPU s'arrête totalement quand l'écran est verrouillé.
- **ENERGY_SAVER universel mobile** (`performance.ts`) : `state.ENERGY_SAVER = true` forcé dans `applyPreset()` (pas seulement dans `detectBestPreset()`) pour couvrir les utilisateurs de retour dont `loadSettings()` restaurait l'ancienne valeur `false`. Exception : preset Ultra mobile (Snapdragon Elite).
- **Fix `processLoadQueue` hardcodé** (`terrain.ts`) : `slice(0, 4)` → `slice(0, Math.max(1, state.MAX_BUILDS_PER_CYCLE))`. Le preset ne contrôlait pas le débit réel — corrigé.
- **Limites tileCache mobiles** (`tileCache.ts`) : Cache réduit pour mobile par tier (ultra: 350, performance: 180, balanced: 120 vs 800/400/300 desktop). `trimCache()` exporté pour purge immédiate sur changement de preset.
- **Cap PIXEL_RATIO_LIMIT 2.0** (`performance.ts`) : Écrans OLED 3× ne nécessitent pas plus de 2× pour la cartographie.
- **Fix Stats.js init timing** (`scene.ts` + `VRAMDashboard.ts`) : `VRAMDashboard.init()` s'exécutait avant `initScene()` créant `state.stats` → FPS counter non affiché. `state.vramPanel?.setVisible(state.SHOW_STATS)` appelé après création Stats.js. 188 tests ✅.

#### Sprint 6 — PerfRecorder : Module d'analyse de performance
- **`VRAMDashboard.ts`** : Intégration `PerfRecorder` — buffer circulaire 600 échantillons (5 min à 500ms). Interface `PerfSample` + `PerfSession` exportées.
- **Bouton ⏺/⏹** dans le panel VRAM : démarre/arrête l'enregistrement. `Stop + Copier` exporte le JSON dans le presse-papier pour analyse IA.
- **FPS rolling** (`scene.ts` + `state.ts`) : `state.currentFPS` alimenté par un compteur de frames (fenêtre 1s) dans le render loop. Affiché dans le panel VRAM.
- **Données capturées** : fps, textures, geometries, drawCalls, triangles, tiles, zoom, isProcessingTiles, isUserInteracting, energySaver, timestamp relatif.
- **CSS** (`style.css`) : `.vram-record-btn`, `.vram-record-btn--active`, `.vram-record-status` avec design tokens.

#### Sprint 6 — Recalibration Presets + Détection GPU enrichie
- **Architecture simplifiée** : Suppression de la double-couche "preset + caps mobile". Les valeurs de chaque tier sont maintenant directes et universelles. Seul Ultra conserve des ajustements mobiles légers (shadow 2048, RANGE 8 sur Snapdragon Elite).
- **Presets recalibrés pour le marché mobile** :
  - `eco` — vieux mobile (MAX_ALLOWED_ZOOM: 14)
  - `balanced` (STD — Galaxy A53) : RESOLUTION 64→32, VEGETATION_DENSITY 2000→500, WEATHER_DENSITY 2000→1000
  - `performance` (High — Galaxy S23) : RANGE 8→5, SHADOW_RES 2048→1024, MAX_BUILDS_PER_CYCLE 4→2 (baked-in)
  - `ultra` — PC bureau / RTX / Apple M / Snapdragon Elite (inchangé)
- **`detectBestPreset()` enrichi** (`performance.ts`) : 52 patterns GPU couverts (vs 8). Intel HD/UHD par génération (HD 520/620+), Intel Arc, Intel Iris Xe, AMD Vega iGPU, AMD RX par série (RDNA/Polaris), NVIDIA GTX par série numérique, Snapdragon Elite (Adreno 830+), Mali-G68/G78 explicites. Fallback : ≥8 cores CPU → `balanced` (pas `eco`).
- **`tileCache.getMaxCacheSize()` aligné** : Tailles basées sur RANGE effectif (performance RANGE=5 → 121 tuiles → cache 180).

---

## [5.11.0-wip] - 2026-03-27
### 🚀 Audit Production Play Store + Navigation Tactile + Accessibilité + Android

#### Sprint 0 — Prérequis
- **Version bump** : `package.json` → `5.11.0`, `versionCode: 511 / "5.11.0"` dans `android/app/build.gradle`.
- **Play Console** : Compte développeur créé, vérification identité complétée.

#### Sprint 1 — Android Release Build
- **signingConfigs.release** : Chargement via `keystore.properties` (hors Git). Template `android/keystore.properties.template` fourni.
- **R8/ProGuard** : `minifyEnabled true` + `shrinkResources true`. `proguard-rules.pro` complété avec règles Capacitor, WebView JS Interface, AndroidX, stack traces.
- **16 KB page size** : `android.zipAlign.16KB=true` dans `gradle.properties` (Android 15+).
- **Edge-to-Edge** : `android:enableOnBackInvokedCallback="true"`, barres système transparentes, `windowLayoutInDisplayCutoutMode=shortEdges` dans `styles.xml`.
- **Fix Vitest 4** : `poolOptions.forks.singleFork` → `singleFork: true` (warning de dépréciation supprimé).

#### Sprint 2 — Sécurité & Code
- **npm audit** : 2 critiques → 0, 13 high production → 0. Overrides `jsdom ^25`, `qs ^6.14.1`, `tough-cookie ^4.1.3`. Upgrade vitest → 4.1.2 (fix `flatted` HIGH).
- **7 `@ts-ignore` supprimés** : Remplacés par `src/vite-env.d.ts` (virtual:pwa-register), `src/types/global.d.ts` (Battery API, webkitCompassHeading), `src/types/gpxparser.d.ts` (types complets gpxparser). Suppressions spurieuses retirées (Stats, pmtiles.FileSource, import dynamique).
- **CSP header** : `<meta http-equiv="Content-Security-Policy">` complet dans `index.html`. Whitelist : MapTiler, SwissTopo, IGN/geopf.fr, OpenStreetMap, Overpass (domaine racine + sous-domaines), overpass.kumi.systems, open-meteo.com, cloud.maptiler.com (img-src).
- **Service Worker** : `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`. Noms de caches versionnés `maptiler-cache-v5.11`, `swisstopo-cache-v5.11`, `CACHE_NAME = suntrail-tiles-v5.11`.
- **Fuite clé API** : Suppression du `console.log("[Geocoding] URLs:", ...)` dans `utils.ts` qui loggait l'URL complète incluant `state.MK`.

#### Sprint 2.5 — Navigation Tactile Google Earth
- **`src/modules/touchControls.ts`** : Module autonome 190 lignes. Intercepte `pointerdown` en phase CAPTURE (avant OrbitControls), désactive `controls.enabled = false`, réactive à la fin.
- **Diagnostic racine** : Three.js r160 OrbitControls utilise PointerEvents exclusivement. Les tentatives précédentes (TouchEvents) étaient inopérantes.
- **1 doigt** : Pan horizontal avec inertie (`INERTIA = 0.88`) — glissement après lâcher.
- **2 doigts** : Pinch = zoom · twist = rotation azimut · centre-X = pan · centre-Y = tilt (inclinaison via `THREE.Spherical.phi`).
- **Vitesse** : `PAN_SPEED = 1.8` (+ rapide qu'OrbitControls par défaut pour compenser l'absence d'inertie initiale).
- **Paramètres** : `PAN_SPEED`, `TILT_SPEED`, `INERTIA`, `ROT_DEADZONE` ajustables en tête de fichier.
- **`scene.ts`** : `initTouchControls()` branché après OrbitControls init. `disposeTouchControls()` dans `disposeScene()`.

---

#### Sprint 3 — Accessibilité & UX Légale
- **Prominent Disclosure GPS** : `gpsDisclosure.ts` — modale WCAG avec focus trap, traduite 4 langues, stockée `localStorage`. Appelée avant `Geolocation.getCurrentPosition()`. Obligatoire Play Store.
- **axe-core** : 7 tests WCAG 2.1 AA — GPS Disclosure, Navigation Bar, Bottom Sheet, FAB GPS (`src/test/a11y.test.ts`).
- **Touch targets** : `icon-btn-sm` 34→48px · `#compass-fab` 44→48px · `.status-widget/.top-widget` min-height 48px · `.coords-btn` min-height 48px.
- **Contraste accent** : `--accent: #3b7ef8` → `#4a8ef8` (ratio 4.44 → ~5.0, WCAG AA).
- **Aria-labels** : `compass-fab`, `layers-fab`, `gps-main-btn`, `top-pill-main`, `net-status-icon`, `sos-main-btn`, `timeline-toggle-btn` — `role="button"` + `tabindex="0"`.
- **Auto-hide** : 5s → 10s (TalkBack a plus de temps pour naviguer).

#### Sprint 3.5 — Android Immersive + Foreground Service REC
- **Immersive mode** : `MainActivity.java` — `WindowInsetsController.hide(statusBars())` dans `onWindowFocusChanged()`. La barre système (heure, batterie) est masquée.
- **RecordingService.java** : Foreground Service `foregroundServiceType="location"`, `START_STICKY`, notification persistante — empêche Android de tuer l'app pendant l'enregistrement.
- **RecordingPlugin.java** : Plugin Capacitor `startForeground()` / `stopForeground()` — contrôlé depuis JS.
- **AndroidManifest.xml** : `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS` + `<service>` déclaré.
- **`foregroundService.ts`** : Wrapper JS + persistence `localStorage` — snapshot du REC à chaque point GPS. Toast d'alerte si l'app a été tuée pendant l'enregistrement.

#### Fixes UX Sprint 3-4
- **Mode 2D (Eco)** : Timeline et bouton 🕒 masqués (`display:none`). Altitude supprimée du panneau coordonnées (toujours 0 en 2D). Fermeture propre de la timeline au switch vers Eco.
- **Timeline slider temps réel** : `state.isInteractingWithUI = true` pendant le drag → render loop reste actif → ombres se déplacent en temps réel sans mouvement de caméra.
- **Stats de performance** : Suppression du doublon `vram-toggle`. `VRAMDashboard.setVisible(val)` remplace `toggle()` — synchronisation exacte avec `state.SHOW_STATS` dès l'init. Plus de désynchronisation toggle ON / panel caché.

---

## [5.10.0] - 2026-03-27
### 🌐 Multi-GPX, i18n FR/DE/IT/EN, Dashboard VRAM — Validé utilisateur

#### Internationalisation (Sprint 1 + 1-bis)
- **I18nService** : Singleton léger (`src/i18n/I18nService.ts`) avec `t(key)`, `setLocale()`, interpolation `{{var}}`, fallback FR → clé brute.
- **4 langues** : `fr.json` (source of truth, ~200 clés), `de.json`, `it.json`, `en.json` — termes de randonnée/cartographie soignés.
- **Couverture complète** : Strings JS dynamiques (toasts, aria-labels, empty states) + templates HTML statiques via `data-i18n`.
- **Mécanisme HTML** : `I18nService.applyToDOM(root)` appliqué automatiquement dans `BaseComponent.hydrate()` — tous les composants traduits sans code supplémentaire.
- **Live reload** : Abonnement `localeChanged` dans `BaseComponent` — l'UI se traduit instantanément au changement de langue.
- **Sélecteur de langue** : Combobox FR/DE/IT/EN dans SettingsSheet, persistance via `state.lang` (localStorage).
- **`<html lang>`** : Mis à jour dynamiquement via EventBus `localeChanged`.
- **14 tests i18n** ajoutés.

#### Multi-GPX (Sprint 2)
- **Refonte State** : `rawGpxData`/`gpxMesh`/`gpxPoints` (mono) → `gpxLayers: GPXLayer[]` + `activeGPXLayerId`. Palette `GPX_COLORS` (8 couleurs cycliques).
- **terrain.ts** : `addGPXLayer()`, `removeGPXLayer()`, `toggleGPXLayer()`, `updateAllGPXMeshes()`, `clearAllGPXLayers()`.
- **TrackSheet** : Liste réactive des tracés (nom, couleur, stats, toggle 👁, suppression ×). Import multi-fichiers (attribut `multiple`). Clic → flyTo + profil.
- **profile.ts** : `updateElevationProfile(layerId?)` avec résolution du layer actif.
- **scene.ts** : Origin shift itère sur tous les layers + sync `layer.points` après shift. Flag `state.isFlyingTo` bloque l'origin shift pendant l'animation flyTo — élimine les coordonnées stales entre imports successifs.
- **FlyTo robuste** : Coords calculées depuis lat/lon brut à chaque appel (immunisé contre les changements d'`originTile`).
- **Terrain Draping** : `gpxDrapePoints()` — densification ×4 entre waypoints GPS + clamping `Y = max(terrainAlt, elevGPX) + 30m`. Re-draping automatique à +3s/+6s après import. Le tracé suit le dénivelé réel du terrain rendu.
- **9 tests Multi-GPX** ajoutés (133/135 total, 2 pré-existants tileLoader).

#### Dashboard VRAM Pro (Sprint 3)
- **VRAMDashboard** : composant standalone, overlay `position:fixed` sur la carte (top:130px). Métriques temps réel à 500ms : géométries, textures GPU, draw calls, triangles, tuiles actives, workers.
- **Overlay unifié FPS+VRAM** : un seul toggle "Stats de performance" dans Réglages → contrôle simultanément FPS (Stats.js Three.js) et métriques GPU.
- **Seuils d'alerte** : toast ⚠️ si textures > limite profil (eco=50 / balanced=150 / performance=300 / ultra=500). Cooldown 30s anti-spam.
- **`state.vramPanel: VRAMDashboard | null`** : stub mort depuis v5.7 remplacé par implémentation réelle.
- **10 tests** `vramDashboard.test.ts`.

#### Qualité & Fixes Post-validation (Sprint 4 + 3-bis)
- **145/145 tests** — objectif 140+ dépassé. Fix `tileLoader.test.ts` (signature `getElevationUrl → {url,sourceZoom}`).
- **i18n live-reload complet** : toutes les strings dynamiques créées en JS (`innerHTML`, `textContent`) équipées de `data-i18n` → `applyToDOM()` les met à jour au changement de locale. `sun.ts` : `applySolarPhaseLabel()` + listener `localeChanged` pour les phases solaires (Plein jour / Heure Dorée / Crépuscule / Nuit).
- **Couverture i18n étendue** : Solar (phases, statuts, stats), Search placeholder, WeatherExpert, TrackSheet empty state.
- **0 erreurs TypeScript** strict.

## [5.9.0] - 2026-03-27
### 🎨 UI Refonte Qualité — Design Tokens, Accessibilité, Gestures & Haptics

#### Design System
- **Design Tokens CSS** : Ajout de variables CSS systématiques dans `:root` — `--space-1` à `--space-6` (grille 4px), `--text-xs` à `--text-xl` (échelle normalisée 10→24px), `--radius-sm` à `--radius-xl`, `--transition-fast/normal/slow`. Les valeurs hardcodées dans `style.css` ont été remplacées par les tokens.
- **Migration Styles Inline** : ~50 blocs `style.cssText` répartis sur 6 composants (`ConnectivitySheet`, `ExpertSheets`, `LayersSheet`, `SearchSheet`, `TrackSheet`, `TopStatusBar`) migrés vers des classes CSS namespaced (`.conn-*`, `.exp-*`, `.lyr-*`, `.srch-*`, `.trk-*`). Correction au passage du bug `var(--t2)` → `var(--text-2)` dans ExpertSheets.

#### EventBus & Performance
- **Sheet Lifecycle Events** : Ajout de `sheetOpened`/`sheetClosed` dans l'`EventMap` typé. `SheetManager` émet ces événements à chaque ouverture/fermeture.
- **Suppression du Polling** : Le `setInterval(300ms)` de `NavigationBar` (sync des tabs actifs) remplacé par des subscriptions `eventBus`. Réduction de la charge CPU et batterie.

#### Accessibilité (ARIA)
- **ARIA complet sur 10 composants** : `role="tablist"/"tab"` + `aria-selected` sur la nav bar, `role="switch"` + `aria-checked` sur tous les toggles, `aria-value*` sur les sliders, `aria-label` sur tous les boutons icônes, `aria-live="polite"` sur les zones de mise à jour dynamique (GPS, REC, météo).
- **Focus Trap** : Quand une sheet s'ouvre, le focus Tab est piégé à l'intérieur (cycle Tab/Shift+Tab). À la fermeture, le focus retourne à l'élément déclencheur.
- **Touche Escape** : Ferme la sheet active depuis le clavier.
- **Sheets dialogues** : `role="dialog"`, `aria-modal="true"`, `aria-labelledby` ajoutés dynamiquement par `SheetManager`.

#### Gestures
- **Swipe-to-dismiss Sheets** : Chaque sheet dispose d'un drag handle (barre grise). Swipe vers le bas ≥60px ou vélocité ≥0.3px/ms → fermeture animée avec feedback haptique.
- **Swipe-to-dismiss Timeline** : La timeline (`#bottom-bar`) dispose du même drag handle injectable en JS. Swipe down → fermeture et réapparition des boutons FAB.
- **Fix FAB/Timeline overlap** : Remplacement du sélecteur CSS `~` (cassé selon l'ordre DOM) par `body.timeline-open .fab-stack` pour masquer les FABs quand la timeline est ouverte.

#### Composants
- **SharedAPIKeyComponent** : Extraction du formulaire de clé MapTiler dupliqué en 3 endroits (SettingsSheet, ConnectivitySheet, setup screen) vers un `BaseComponent` réutilisable. Synchronisation automatique via `state.subscribe('MK')`.
- **Loading States** : Spinners et états désactivés sur les 3 opérations async — géocodage (SearchSheet), import GPX (TrackSheet), download zone (ConnectivitySheet). Pattern `btn-loading` + `aria-busy` avec `finally` garanti.
- **Empty States** : États vides illustrés (icônes SVG monoline) dans TrackSheet (aucun parcours) et SearchSheet (état initial + aucun résultat).

#### Haptic Feedback (Android)
- **`@capacitor/haptics` v8.0.1** installé. Nouveau helper `src/modules/haptics.ts` avec graceful fallback web.
- **Permission VIBRATE** ajoutée à `AndroidManifest.xml` (était manquante — bloquait tout le feedback).
- **Mapping ciblé** : `medium` sur les swipes (sheets + timeline), `success` sur import GPX réussi / download terminé / sauvegarde clé API. Les haptics trop fréquents (open/close au clic, tabs, toggles) ont été supprimés.

## [5.8.17] - 2026-03-26
### 🛠️ Slope Visualization Fix & UI Cleanup
- **Slope Calculation Correction**: Fixed a critical bug where slopes appeared completely red (exaggerated) at zoom levels above 14 (LOD 15+). The issue was caused by normal map calculations using the requested zoom level instead of the actual elevation data zoom (capped at 14).
  - `getElevationUrl()` now returns `{url, sourceZoom}` to track the real data resolution
  - Worker receives `elevSourceZoom` parameter for accurate pixel size calculation
  - Normal maps are now correctly computed regardless of display zoom level
- **UI Simplification**: Removed the redundant GPU stats button from the top status bar. Performance statistics are still accessible via Settings > Advanced Parameters > "Stats de performance (FPS)".

### 📱 Mobile Fixes
- **GPS Accuracy Display**: Added `userLocationAccuracy` to the reactive state. The Connectivity panel now displays the real GPS accuracy (in meters) instead of always showing "--".
- **Compass Button**: Fixed the North alignment button. It now smoothly animates the camera to face North (0°) with a 500ms ease-out animation, instead of just showing a toast message.
- **Timeline FAB Hiding**: The floating action buttons (GPS, Layers, Compass) now automatically hide when the timeline panel is open, preventing UI overlap.
- **Recording Permissions**: The app now properly requests and handles GPS permissions on mobile devices before starting track recording.

## [5.8.16] - 2026-03-25
### 🛠️ GPS Recording & Live Tracking
- **Reactive Recording Fix**: Resolved a critical issue where GPS recording only captured the first point. Switched from `.push()` to array re-assignment (`[...]`) to ensure the reactive state notifies UI listeners of new points.
- **Live 3D Track Mesh**: Implemented `updateRecordedTrackMesh()`. The engine now renders a dynamic, pulsing red 3D tube in the scene as the user moves, providing immediate visual feedback of the recorded path.
- **Pulsing REC Indicator**: Added a persistent, pulsing red "REC" indicator in the Top Status Bar during recording. 
- **Recording Timer**: Integrated a live chronometer in the status bar to track recording duration at a glance.
- **UI Interactivity**: The REC indicator is now clickable, providing a shortcut back to the "Parcours" sheet.

## [5.8.15] - 2026-03-25
### 🌲 Vegetation & Tile Continuity
- **Deterministic Placement Engine**: Replaced all `Math.random()` calls with a custom `pseudoRandom` function seeded by global tile coordinates. This permanently eliminates "net cuts" (seams) between adjacent tiles.
- **Banding Elimination**: Removed the hard row-by-row tree limit. Forests are now distributed across the entire tile surface using purely probabilistic density, fixing the "empty bands" at the bottom of high-zoom tiles.
- **Refined Spatial Jitter**: Implemented deterministic jitter to maintain organic appearance while ensuring perfect boundary alignment.
- **Fixed State Tests**: Updated performance tests to match the new 8000 density standard for the Ultra preset.

## [5.8.14] - 2026-03-24
### 🌲 Vegetation Quality & Anti-Banding
- **Dithered Scan Engine**: Implemented randomized pixel sampling within the scan grid to permanently eliminate Moiré patterns and "horizontal banding" at high zoom levels.
- **Continuous Forest Filter**: Expanded SwissTopo detection to include both dark symbols and the light-green forest background. This ensures a consistent tree carpet even at LOD 17/18 where symbols are sparse.
- **Ultra Preset Balance**: Reduced Ultra vegetation density to 8000 to maintain high performance while ensuring visual quality through better distribution.
- **Enhanced Jitter**: Doubled the spatial randomization range to break all visible grid alignments.

## [5.8.13] - 2026-03-24
### 🌲 Vegetation & Distribution
- **Probabilistic Placement**: Implemented a probability-based distribution to eliminate horizontal banding and gaps at high zoom levels.
- **Improved Jitter**: Increased spatial randomization to break up grid-like patterns appearing at extreme LODs.

## [5.8.11] - 2026-03-24
### 🌲 Vegetation & Realism
- **Density Normalization**: Implemented a zoom-aware scaling for forest density. Trees are now normalized based on the physical area of the tile, ensuring that forests look consistent from LOD 15 up to LOD 18 without overcrowding.
- **Micro-adjustment**: Set minimum tree count per tile to 100 to maintain some vegetation presence even at extreme zooms.

## [5.8.10] - 2026-03-24
### 🌲 Vegetation & Performance
- **Reverted Forest Density**: Default tree counts restored to stable values (Balanced: 2000, Performance: 8000, Ultra: 12000) to maintain visual balance and performance.
- **Stable Scan Resolution**: Reverted vegetation scanner to 64x64 resolution for improved frame stability.
- **Advanced SwissTopo Forest Filter**: Implemented a "symbol-based" detection logic for SwissTopo. The engine now specifically targets the darker forest symbols (< 195 luminance) while strictly excluding the brighter backgrounds and uniform green sport fields.
- **Ultra-Strict Lawn Exclusion**: Added radical checks for "pure green" and vivid saturation to ensure sports fields, golf courses, and gardens remain tree-free.

## [5.8.9] - 2026-03-24
### 🌲 Vegetation Precision
- **Anti-Lawn Filter Refinement**: Improved chromatic discrimination between alpine forests and manicured urban lawns using greenness purity ratios.

## [5.8.8] - 2026-03-24
### 🌲 Vegetation Precision
- **Anti-Lawn Filter**: Implemented a strict chromatic filter to distinguish between natural forests and manicured grass (football fields, golf courses, gardens).
- **Luminance & Saturation Tuning**: Reduced brightness threshold and added vivid green detection to prevent false-positive tree placement on bright sports surfaces.

## [5.8.7] - 2026-03-24
### 🌲 Vegetation & Environment
- **Massive Forest Density**: Increased default tree density across all presets (Balanced: 4000, Performance: 10000, Ultra: 18000).
- **Adaptive Scan Engine**: Implementation of a high-resolution vegetation scanner (up to 128x128) allowing for truly dense forests.
- **Tree Scaling Refinement**: Adjusted tree scales and random jitter for a fuller, more organic forest appearance.
- **Settings Versioning**: Bumped state version to 5.8.7 to ensure proper settings migration.

## [5.8.6] - 2026-03-24
### 🛠️ Navigation & Performance
- **Adaptive Zoom Engine**: Implementation of a "smart jump" logic for LOD transitions. When teleporting or moving fast, the engine now skips intermediate zoom levels to instantly match the camera altitude.
- **Cinematic flyTo Refinement**: Improved target altitudes for teleportation. Peaks now aim for 3.5km (LOD 16/17) and cities for 8km (LOD 15/16) for immediate immersion.
- **State Stability**: Fixed `MAX_ALLOWED_ZOOM` handling in the reactive state to prevent zoom blocking during manual interactions.

## [5.8.5] - 2026-03-24
### 🛠️ 3D Buildings & Infrastructure
- **MapTiler Buildings Integration**: Fixed API URL to use dedicated `buildings` tileset and implemented native handling for overzoomed tiles (native data capped at Z14).
- **Intelligent Fallback**: Fixed fallback logic to trigger on 400 Bad Request errors, ensuring OSM Overpass takes over immediately if MapTiler fails.
- **Height-Aware Placement**: Improved building base altitude detection using relief sampling, ensuring structures are correctly grounded.
- **RTX Shadows**: Maintained geometry merging while enabling high-performance shadow casting for all building meshes.

## [5.8.4] - 2026-03-24
### 🛠️ Hydrology & Water Rendering
- **3D Hydrology Restoration**: Full restoration of dynamic 3D lakes and rivers meshes extracted from OSM Overpass API.
- **Seamless Water Engine**: Implementation of a global wave system using absolute world coordinates. This eliminates tile seams and moiré patterns.
- **Giant Roller Waves**: Replaced grid-like waves with natural, directional roller waves for a more realistic alpine lake appearance.
- **SwissTopo Detection**: Enhanced chromatic detection logic to correctly identify and render water even on light-colored SwissTopo maps.

## [5.8.3] - 2026-03-24
### 🛠️ Precision & Long-Distance Navigation
- **Origin Shift Implementation**: Implementation of a dynamic world recentering system (35km threshold). This eliminates floating-point jitter during long-distance crossings.
- **Atomic Translation**: All global scene objects (Camera, Sun, GPS Marker, GPX Tracks, Forests, and Labels) are now seamlessly offset during recentering.
- **UI Logic cleanup**: Removal of debug logs and refinement of the shift trigger conditions.

## [5.8.2] - 2026-03-24
### 🛠️ Restoration & Expert Features
- **Solar & Weather Restoration**: Réintégration de la logique dynamique pour l'Analyse Solaire et le Dashboard Météo. Les données sont de nouveau extraites et affichées en temps réel.
- **Advanced Settings**: Regroupement des réglages techniques (LOD, Fog, API Key, PMTiles) dans une section "Paramètres Avancés" collapsible.
- **Geolocation Unification**: Migration vers `@capacitor/geolocation` pour une expérience de positionnement identique et robuste sur PC et Mobile.
- **GPX Import Fix**: Rétablissement de la fonctionnalité d'importation de tracés dans l'onglet Parcours.
- **Mobile UX Refinement**: Ajustement du positionnement du bouton GPS (Top-Right) et du radar pour éviter les chevauchements sur petit écran. Timeline centrée et adaptative.

## [5.8.1] - 2026-03-22
### 🛠️ UI Fixes & Stability
- **Fix Logic Bindings** : Rétablissement des connexions JavaScript pour la sélection des calques et des presets de performance dans le nouveau système de tiroirs.
- **Search Reliability** : Correction de l'affichage des résultats de recherche et fiabilisation de la sélection des sommets.
- **Crash Fix** : Suppression des références obsolètes dans `startApp()` qui bloquaient le thread principal au chargement.

## [5.8.0] - 2026-03-22
### 🎨 Modern Mobile UI (v5.8)
- **Bottom Navigation Bar** : Suppression des boutons flottants épars au profit d'une barre de navigation fixe avec 4 onglets : *Carte, Recherche, Parcours, Réglages*.
- **Système de Bottom Sheets** : Toutes les interfaces coulissent désormais depuis le bas avec une animation fluide, optimisée pour l'usage à une main.
- **Top Bar Moderne** : Intégration d'un dashboard central affichant l'altitude temps réel, le niveau de détail (LOD) et un widget météo interactif.
- **Backdrop Intelligent** : Ajout d'un overlay permettant la fermeture intuitive des panneaux au clic extérieur.

## [5.7.4] - 2026-03-23
### 🗺️ Unification Mondiale & Sécurité API
- **Unification Bas-Zoom (LOD <= 10)** : Harmonisation de l'affichage à grande échelle. L'application utilise désormais une source unique pour le monde entier à bas niveau de zoom.
- **Fail-safe MapTiler (Auto-OSM)** : Implémentation d'une détection dynamique des erreurs 403 (clés invalides/expirées). Basculement automatique sur OpenStreetMap.
- **Fix Saut de Grille** : Correction du bug de recentrage lors des changements de source automatiques.

... (Historique tronqué pour lisibilité)
