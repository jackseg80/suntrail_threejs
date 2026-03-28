# SunTrail 3D - Roadmap Révisée (v5.11.0)

## 🚀 Priorité 1 : Optimisations & Netteté (v5.6) - ✅ TERMINÉ
*Impact : Fluidité mobile absolue et rendu topographique pro.*

- [x] **Refactoring Architectural Terrain** : Extraction de `TileCache`, `GeometryCache` et `TileLoader`.
- [x] **Normal Map Pre-computation (Worker)** : Déportation du relief vers les WebWorkers (-87% texture reads).
- [x] **Material Pooling (Shader Reuse)** : Suppression des micro-freezes de compilation.
- [x] **Objectif Tests v5.6** : 94 tests unitaires validés au vert.
- [x] **Fix Voile Rouge Éco** : Désactivation forcée des pentes en mode 2D.

## 🎯 Priorité 2 : Usage Terrain & Persistance (v5.7) - ✅ TERMINÉ
*Impact : Rendre l'application indispensable et robuste pour la randonnée réelle.*

- [x] **Système Offline-First Complet** :
    - Service Worker pour l'interception réseau et le cache persistant.
    - Support du format **PMTiles** (stockage de cartes régionales massives).
- [x] **Enregistrement de Tracé (Live Tracking)** :
    - Bouton "REC" pour enregistrer sa propre position en temps réel.
    - Export au format GPX standard.
- [x] **Persistance des Réglages (localStorage)** :
    - Sauvegarde automatique du profil de performance, de la source de carte et des unités.

## ⏳ Backlog & Recherche (Indéfini)
- [ ] **Normal Map Pro (Phase 5)** : Résoudre le bundling PBF/MVT pour une netteté vectorielle infinie du relief.
- [ ] **Sentiers (MVT/PBF)** : Migration expérimentale vers les tuiles vectorielles pour une netteté infinie (Tentatives précédentes infructueuses, à isoler).
- [ ] **Cloud Shadows & Météo Pro** : Projection d'ombres de nuages dynamiques.
- [ ] **Waypoints & Partage** : Marquage personnel et Deep Linking (URL synchronisée).
- [ ] **Mode Nuit Avancé** : Pollution lumineuse urbaine (NASA).

## ✅ Priorité 3 : Qualité UI/UX (v5.9) - TERMINÉ

- [x] **Design Tokens CSS** : Variables systématiques (espacement, typographie, radius, transitions).
- [x] **Migration Styles Inline** : ~50 blocs cssText migrés vers classes CSS namespaced.
- [x] **EventBus Sheet Events** : `sheetOpened`/`sheetClosed` — suppression du polling `setInterval`.
- [x] **ARIA Accessibilité** : role, aria-label, aria-live, aria-checked, aria-value sur tous les composants.
- [x] **Focus Trap + Escape** : Navigation clavier complète dans les sheets.
- [x] **Swipe-to-dismiss** : Sheets + Timeline avec drag handle et animation translateY.
- [x] **SharedAPIKeyComponent** : Formulaire clé MapTiler unifié (3 → 1 composant).
- [x] **Loading States** : Spinners sur géocodage, import GPX, download zone.
- [x] **Empty States** : États vides illustrés (TrackSheet + SearchSheet).
- [x] **Haptic Feedback** : `@capacitor/haptics` — swipes (medium) + confirmations (success).

## 🌐 Priorité 4 : Expansion & Multi-GPX (v5.10) ✅ TERMINÉ — validé utilisateur
*Impact : Ouverture européenne, gestion multi-tracés, monitoring avancé. Version cible pour Google Play Store.*

> 🔁 **Workflow** : Chaque sprint se termine par une session de test utilisateur avant commit.

### Sprint 1 — Foundation i18n ✅ TERMINÉ (committé `bdf0fe0`)
- [x] **Service I18n** : `src/i18n/I18nService.ts` — singleton avec `t(key)`, `setLocale()`, fallback FR → clé.
- [x] **Fichiers de traduction** : 4 JSON (`fr.json` 142 clés, `de.json`, `it.json`, `en.json`).
- [x] **Extraction strings JS** : Strings créées dynamiquement en JS extraites (aria-labels, toasts, empty states, boutons créés dynamiquement).
- [x] **Intégration composants** : 9 composants + `ui.ts` + `performance.ts` branchés sur `i18n.t()`.
- [x] **Sélecteur de langue** : Combobox FR/DE/IT/EN dans `SettingsSheet`, persistance `state.lang`.
- [x] **`<html lang>` dynamique** : Mis à jour via `localeChanged` EventBus.
- [x] **Labels dynamiques** : `NavigationBar` et `TopStatusBar` re-rendent leurs labels sur `localeChanged`.
- [x] **14 tests i18n** ajoutés (124/126 total).

> ✅ **Dette résolue par Sprint 1-bis** : les ~60 strings statiques de `index.html` sont annotées `data-i18n` et traduites.

### Sprint 1-bis — i18n Templates HTML ✅ TERMINÉ (committé `05d3e76`)
- [x] **Stratégie `data-i18n`** : ~60 labels statiques annotés dans `index.html`.
- [x] **`I18nService.applyToDOM(root)`** : Parcourt `[data-i18n]` et `[data-i18n-placeholder]`, remplace `textContent` / `placeholder`.
- [x] **`BaseComponent.hydrate()`** : Appel `applyToDOM` après clonage automatique pour tous les composants.
- [x] **Abonnement `localeChanged`** dans `BaseComponent` : Re-traduit `this.element` à chaque changement de locale.
- [x] **Fusion JSON** : Blocs dupliqués (`track`, `settings`, `layers`, `weather`, `connectivity`) fusionnés dans les 4 locales.
- [x] **Couverture complète** : Settings, Track, Layers, SOS, Weather, Solar, Connectivity — tous traduits en FR/DE/IT/EN.

### Sprint 2 — Multi-GPX ✅ TERMINÉ
- [x] **Refonte State** : `rawGpxData` remplacé par `gpxLayers: GPXLayer[]` + `activeGPXLayerId`. `GPX_COLORS` palette 8 couleurs. Version bump `5.10.0`.
- [x] **Refonte `terrain.ts`** : `addGPXLayer()`, `removeGPXLayer()`, `toggleGPXLayer()`, `updateAllGPXMeshes()`, `clearAllGPXLayers()`.
- [x] **Refonte `TrackSheet.ts`** : Liste réactive, import multi-fichiers, couleurs auto, toggle/remove par layer.
- [x] **Profil d'élévation multi-tracés** : `updateElevationProfile(layerId?)` — résout le layer actif.
- [x] **Origin Shift** : `scene.ts` itère sur tous les layers + sync `layer.points` après chaque shift.
- [x] **FlyTo robuste** : `state.isFlyingTo` bloque l'origin shift pendant l'animation. Coords depuis lat/lon brut.
- [x] **Terrain draping** : `gpxDrapePoints()` — densification (×4) + clamping `max(terrainAlt, elevGPX) + 30m`. Re-draping à +3s/+6s.
- [x] **9 tests Multi-GPX** ajoutés (133/135 total).

### Sprint 3 — Dashboard VRAM Pro ✅ TERMINÉ
- [x] **Collecte métriques** : `renderer.info.memory` (geometries, textures) + `renderer.info.render` (calls, triangles) polling 500ms.
- [x] **Réanimation `vramPanel`** : `state.vramPanel: VRAMDashboard | null` — stub mort remplacé par vrai composant.
- [x] **`VRAMDashboard`** : Panel monospace overlay `position:fixed` sur la carte (top:130px). Métriques : géométries, textures GPU, draw calls, triangles, tuiles actives, workers.
- [x] **Seuils d'alerte** : Toast ⚠️ si textures > limite profil (eco=50, balanced=150, perf=300, ultra=500) — cooldown 30s.
- [x] **Overlay unifié** : Toggle "Stats de performance" contrôle FPS (Stats.js) + VRAM simultanément. Accessible depuis Réglages Avancés.
- [x] **10 tests** `vramDashboard.test.ts` — seuils, cooldown, toggle, formatTriangles.

### Sprint 3-bis — Fixes Post-validation ✅ TERMINÉ
- [x] **Overlay FPS+VRAM unifié** : `VRAMDashboard` refactorisé hors sheet → `position:fixed` sur la carte (top:130px). Un seul toggle "Stats de performance" contrôle FPS (Stats.js) + VRAM simultanément.
- [x] **i18n strings dynamiques manquantes** : Solar (phases timeline, panneau analyse, WeatherExpert), Search placeholder, TrackSheet empty state.
- [x] **Live-reload i18n** : `data-i18n` ajouté sur les éléments créés dynamiquement en JS. `sun.ts` : `applySolarPhaseLabel()` + listener `localeChanged`. Changement de locale → toute l'UI bascule instantanément, y compris les éléments JS.

### Sprint 4 — Tests & Qualité v5.10 ✅ TERMINÉ
- [x] **145/145 tests** — objectif 140+ atteint ✅
- [x] **Tests i18n** : 14 tests ✅
- [x] **Tests Multi-GPX** : 9 tests ✅
- [x] **Tests VRAM Dashboard** : 10 tests ✅
- [x] **Fix tileLoader.test.ts** : Signature `getElevationUrl` → `{url, sourceZoom}` (v5.8.17) ✅
- [x] **`npm run check`** : 0 erreurs TypeScript ✅

---

## 🚀 Priorité 5 : Publication Google Play Store (v5.11) — EN COURS

> 🔁 **Workflow** : Chaque sprint se termine par `npm test` (145/145) + `npm run check` (0 erreurs) avant commit.

### Sprint 0 — Prérequis ✅ TERMINÉ
- [x] **Version bump** : `package.json` → `5.11.0`, `versionCode: 511`, `versionName: "5.11.0"`.
- [x] **Play Console** : Compte développeur créé, vérification identité complétée.

### Sprint 1 — Android Release Build ✅ TERMINÉ
- [x] **Keystore** : `signingConfigs.release` via `keystore.properties` (hors Git). Template fourni.
- [x] **R8/ProGuard** : `minifyEnabled true` + `shrinkResources true` + règles Capacitor/WebView.
- [x] **16 KB page size** : `android.zipAlign.16KB=true` dans `gradle.properties`.
- [x] **Edge-to-Edge** : `enableOnBackInvokedCallback`, barres système transparentes, `windowLayoutInDisplayCutoutMode=shortEdges`.
- [x] **Fix Vitest 4** : `poolOptions` supprimé → `singleFork: true` au niveau `test`.

### Sprint 2 — Sécurité & Code ✅ TERMINÉ
- [x] **npm audit** : 2 critiques → 0, 13 high prod → 0. Overrides jsdom/qs/tough-cookie. Upgrade vitest 4.1.2.
- [x] **@ts-ignore** : 7 suppressions remplacées par déclarations de types propres (`vite-env.d.ts`, `global.d.ts`, `gpxparser.d.ts`).
- [x] **CSP header** : `<meta http-equiv="Content-Security-Policy">` dans `index.html` — tous les domaines cartographiques whitelistés.
- [x] **Service Worker** : `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`, caches versionnés `v5.11`.
- [x] **state.MK** : Suppression du `console.log` qui loggait l'URL avec la clé API MapTiler (`utils.ts`).

### Sprint 2.5 — Navigation Tactile Google Earth ✅ TERMINÉ
- [x] **`touchControls.ts`** : Module autonome PointerEvents. Désactive `controls.enabled` pendant le touch.
- [x] **1 doigt** : Pan horizontal avec inertie (`INERTIA = 0.88`).
- [x] **2 doigts centre-X** : Pan horizontal.
- [x] **2 doigts centre-Y** : Tilt (inclinaison phi via `THREE.Spherical`).
- [x] **2 doigts spread** : Zoom (pinch).
- [x] **2 doigts angle** : Rotation azimut (tire-bouchon).
- [x] **Paramètres** : `PAN_SPEED = 1.8`, `TILT_SPEED = 1.2`, `INERTIA = 0.88`, `ROT_DEADZONE = 0.003`.

### Sprint 3 — Accessibilité & UX Légale ✅ TERMINÉ
- [x] **Prominent Disclosure GPS** : `gpsDisclosure.ts`, modale WCAG, 4 langues, localStorage.
- [x] **TalkBack** : Aria-labels ajoutés sur tous les boutons droits. Auto-hide 5s → 10s.
- [x] **Touch Targets** : 7 éléments corrigés ≥ 48dp (icon-btn-sm, compass-fab, status-widget, coords-btn).
- [x] **Contrastes** : `--accent` #3b7ef8 → #4a8ef8 (ratio 4.44 → 5.0 WCAG AA).
- [x] **axe-core** : 7 tests WCAG 2.1 AA dans `src/test/a11y.test.ts`.

### Sprint 3.5 — Android Immersive + Foreground Service ✅ TERMINÉ
- [x] **Immersive mode** : Barre de statut masquée via `WindowInsetsController` dans `onWindowFocusChanged()`.
- [x] **Foreground Service** : `RecordingService.java` + `RecordingPlugin.java` + permissions AndroidManifest.
- [x] **Persistence REC** : `foregroundService.ts` — snapshot localStorage + toast si app interrompue.
- [x] **Mode 2D/Eco** : Timeline + bouton masqués, altitude cachée en mode plat.
- [x] **Timeline slider** : `isInteractingWithUI = true` pendant drag → render temps réel.
- [x] **Stats toggle** : `setVisible(val)` — synchronisation exacte état↔affichage.

### Sprint 4 — Audit Performance ✅ TERMINÉ
- [x] **Build production** : bundle split `three` (530kB) / `app` (194kB) / `vendor` (24kB) / `pmtiles` (18kB). Fonts async non-bloquantes (LCP).
- [x] **Lighthouse** : Accessibility **91/100** ✅, Best Practices **100/100** ✅.
  - Fixes : `role="listbox"` sur layer-grid (sélecteur JS cassé), `aria-label` sur geo-results, contraste btn-go #1555e0 (5.6:1), `.vram-label` 75% opacité (12:1), H3→H2 dans SettingsSheet.
  - Thumbnails MapTiler téléchargées localement (`public/img/maps/`) → cookie tiers supprimé.
- [x] **Core Web Vitals** : LCP **84ms** ✅ (≤2.5s), CLS **0.03** ✅ (≤0.1), INP N/A (pas d'interaction).
- [ ] **Memory Leak Audit** : 📱 À faire demain — ADB Wi-Fi + Android Studio Profiler OU Paramètres→Apps→Mémoire avant/après 30min.
- [ ] **Battery Test** : 📱 À faire demain — sans câble, 1h marche preset Balanced GPS actif, noter % avant/après. Cible ≤ 15%/h.

> ### 📱 Instructions Memory Leak Audit (toi)
> 1. Connecte ton téléphone Android en USB, active le débogage USB.
> 2. Lance Android Studio → ouvre le Profiler (View > Tool Windows > App Inspection).
> 3. Lance SunTrail sur le téléphone, sélectionne le process dans le Profiler.
> 4. Onglet **Memory** → clique "Record native allocations" ou observe le Live Memory chart.
> 5. Scénario 30 min : navigue librement, importe 3 GPX, toggle les layers, zoom in/out intensif, ouvre/ferme les sheets.
> 6. **Résultat attendu** : la heap se stabilise (courbe plate) après 5-10min. Si elle monte linéairement → noter le composant suspect.
>
> ### 🔋 Instructions Battery Test (toi)
> 1. Déconnecte le chargeur, batterie à ≥ 80%.
> 2. Preset **Balanced**, GPS actif, navigation continue 1h.
> 3. Commande de mesure : `adb shell dumpsys batterystats --reset` (avant) puis `adb shell dumpsys batterystats` (après).
> 4. Ou simplement noter le % de batterie avant/après. **Objectif** : ≤ 15% de drain/heure.

### Sprint 5 — Légal & Play Store Listing
- [x] **Privacy Policy** : `public/privacy.html` → `https://jackseg80.github.io/suntrail_threejs/privacy.html` — bilingue FR/EN, RGPD + LPD suisse, Play Store compliant.
- [ ] **Data Safety** : Remplir dans Play Console.
- [ ] **Content Rating (IARC)** : Questionnaire Play Console — cible "Tout public".
- [ ] **Screenshots** : Phone portrait + tablet pour tous les form factors.
- [x] **Feature Graphic** : Visuel 1024×500px.
- [x] **Descriptions** : Rédigées FR + EN — voir `docs/STORE_LISTING.md`.

### Sprint 6 — Optimisation Énergétique Mobile 🔋

> 🔁 **Workflow** : Chaque phase se termine par `npm test` (145/145) + `npm run check` (0 erreurs) + **test physique sur appareil** avant commit.
>
> 📋 **Contexte** : Audit complet effectué (voir CHANGELOG). 4 problèmes structurels identifiés causant un drain batterie excessif. Phase 3 (render-on-demand architectural) reportée en v5.12.

#### Phase 1 — Quick Wins (½ journée) — ✅ TERMINÉ

- [x] **1.1 Fix Deep Sleep réel** (`scene.ts`) : `renderer.setAnimationLoop(null)` sur `visibilitychange hidden` + relance sur `visible`. GPU s'arrête totalement quand l'écran est verrouillé.
- [x] **1.2 ENERGY_SAVER universel mobile** (`performance.ts`) : `ENERGY_SAVER=true` forcé dans `applyPreset()` (couvre les utilisateurs existants dont `loadSettings()` restaurait `false`). Exception : preset Ultra.
- [x] **1.3 Cap `PIXEL_RATIO_LIMIT` à 2.0 sur mobile** (`performance.ts`) : Ultra mobile seul ajustement résiduel (baked-in pour les autres tiers).
- [x] **1.4 Fix `processLoadQueue` hardcodé** (`terrain.ts`) : `slice(0, 4)` → `slice(0, state.MAX_BUILDS_PER_CYCLE)`. Bug découvert en test : le preset ne contrôlait pas le débit réel.
- [x] **tileCache limites mobiles** (`tileCache.ts`) : Cache réduit par tier mobile + `trimCache()` pour purge immédiate.
- [x] **Tests Phase 1** : 188/188 ✅. `npm run check` : 0 erreurs ✅.

> ### 📱 Test utilisateur après Phase 1
> 1. Décharge à ~80% batterie, déconnecte le chargeur.
> 2. Lance SunTrail (preset auto-détecté), navigue 15 min GPS actif, sans toucher l'écran parfois.
> 3. Vérifie en particulier : **verrouille l'écran 2 min** → la batterie ne doit plus chuter pendant ce temps.
> 4. Note le % avant/après — objectif intermédiaire : drain divisé par 2 vs baseline.

#### Phase 1-bis — Recalibration Presets + Détection GPU (½ journée) ✅ TERMINÉ

- [x] **Suppression double-couche** : Plus de "preset + caps mobile". Valeurs directes et universelles par tier.
- [x] **Presets recalibrés** : eco (MAX_ZOOM 14), balanced RESOLUTION 32 / VEGETATION_DENSITY 500, performance RANGE 5 / SHADOW_RES 1024 / MAX_BUILDS 2 (baked-in).
- [x] **`detectBestPreset()` enrichi** : 52 patterns GPU (Intel HD/UHD, Arc, Iris Xe, AMD Vega iGPU, RX par série, GTX par génération, Adreno 830+, Mali explicites). Fallback ≥8 cores CPU → balanced.
- [x] **PerfRecorder** (`VRAMDashboard.ts`) : Bouton ⏺/⏹, buffer 600 samples, export JSON clipboard, FPS affiché.
- [x] **Tests** : 188/188 ✅. `npm run check` : 0 erreurs ✅.

#### Phase 2 — Throttle des Systèmes Animés (1 journée) ✅ TERMINÉ

- [x] **2.1 Throttle eau à 20 FPS** (`scene.ts`) : Accumulateur `waterTimeAccum` — `uTime` ne s'incrémente que toutes les 50ms. `SHOW_HYDROLOGY` dans `needsUpdate` conditionné à `waterFrameDue`.
- [x] **2.2 Throttle météo à 20 FPS** (`scene.ts`) : Accumulateur `weatherTimeAccum` + `weatherAccumDelta` — `updateWeatherSystem(weatherAccumDelta)` limité à 20 FPS, delta cumulé précis.
- [x] **2.3 Adaptive DPR sur interaction** (`scene.ts`) : `controls 'start'` → `renderer.setPixelRatio(1.0)` sur mobile. `controls 'end'` + 200ms → restaure `PIXEL_RATIO_LIMIT`. Timer annulé si nouveau 'start'.
- [x] **2.4 `castShadow=false` végétation mobile** (`vegetation.ts`) : `iMesh.castShadow = state.VEGETATION_CAST_SHADOW`. Flag `VEGETATION_CAST_SHADOW` dans `PerformanceSettings` (eco: false, balanced: false, performance: true, ultra: true).
- [x] **Tests Phase 2** : 188/188 ✅. `npm run check` : 0 erreurs ✅.

> ### 📱 Test utilisateur après Phase 2 (test de validation finale)
> Reprendre le protocole Sprint 4 :
> 1. Batterie ≥ 80%, déconnectée. Preset **Balanced** (défaut), GPS actif.
> 2. Navigation continue 1h — navigue, importe un GPX, laisse l'app ouverte en mouvement.
> 3. `adb shell dumpsys batterystats` avant/après, ou noter % simple.
> 4. **Objectif cible : ≤ 15%/heure** en Balanced GPS actif.
> 5. Test bonus : preset Performance avec hydrologie active → ≤ 25%/heure.
>
> ### 🔀 Décision de version après ce test
> - **≤ 15%/h atteint** → Phase 3 reportée en v5.12, on passe au Sprint 7 (AAB + Play Store) en **v5.11**.
> - **> 15%/h malgré Phase 1+2** → Implémenter Phase 3 avant publication. Version Play Store devient **v5.12**.

#### Phase 3 — Render-on-Demand (Conditionnelle, ~2 jours) 🔀

> ⚠️ **Conditionnel** : N'implémenter que si Phase 1+2 ne suffisent pas à atteindre ≤ 15%/h. Sinon reporté en v5.12.

- [ ] **3.1 Remplacement `setAnimationLoop` → RAF demand-based** (`scene.ts`) : Supprimer `renderer.setAnimationLoop(renderLoopFn)`. Introduire `requestRender()` (flag anti-duplication) + `renderFrame()` auto-schedulé. Le GPU ne tourne **que** quand quelque chose change.
- [ ] **3.2 Déclencheurs de rendu** (`scene.ts`) : Brancher `requestRender()` sur : `controls 'change'`, `eventBus terrainReady`, tous les `state.subscribe()` à impact visuel, GPS fix, `visibilitychange → visible`.
- [ ] **3.3 Boucles indépendantes pour systèmes animés** : Eau, météo, GPS follow et sun animation ont chacun leur propre mini-loop `setInterval(requestRender, 50)` qui tourne **uniquement** quand le système est actif — remplace la détection dans `needsUpdate`.
- [ ] **3.4 Détection fin du damping** (`scene.ts`) : Compteur `idleFrames` — après N frames consécutives sans `controls 'change'`, arrêt complet du RAF.
- [ ] **3.5 Tests Phase 3** : Vérifier que le rendu redémarre correctement sur chaque déclencheur. Vérifier absence de frames fantômes. 145/145 tests.
- [ ] **Mise à jour `AGENTS.md`** : Documenter l'architecture render-on-demand, les déclencheurs, et l'anti-pattern `setAnimationLoop` dans la section "Moteur de Rendu".

---

### Sprint 6-bis — Corrections Audit Pré-Play Store 🔒

> 📋 **Contexte** : Audit complet effectué le 2026-03-28 — rapport détaillé dans `docs/AUDIT_PRESTORE.md`.  
> 🔁 **Workflow** : Chaque correctif se termine par `npm run check` (0 erreurs) + build release de vérification.

#### Critiques — Bloquants Play Store (à faire EN PREMIER)

- [x] **C0 — `.gitignore` incomplet** : `*.jks`, `*.keystore`, `android/keystore.properties` ajoutés.
- [x] **C1 — `network_security_config.xml`** : Fichier créé. Manifest : `networkSecurityConfig` + `usesCleartextTraffic="false"`.
- [x] **C4 — `android:allowBackup`** : `fullBackupContent="@xml/backup_rules"` + `backup_rules.xml` (exclut sharedpref).
- [x] **C2/C3 — Clé MapTiler + GPS en localStorage** : Stratégie (b) — `privacy.html` section 5 renforcée (sandbox Android, exclusion GDrive, HTTPS enforced).

#### Avertissements — Fortement recommandés

- [x] **W1 — ProGuard Three.js/pmtiles incomplet** : Règles OkHttp, Gson, Capacitor plugins ajoutées dans `proguard-rules.pro`.
- [x] **W2 — PWA manifest incomplet** : `display: 'standalone'`, `orientation: 'portrait'`, `background_color` dans `vite.config.js`.
- [x] **W3 — Meta tags iOS manquants** : `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `-title` dans `index.html`.
- [x] **W7 — `console.log` non strippés** : `minify: 'terser'` + `drop_console: true, drop_debugger: true` dans `vite.config.js`.

#### Optionnels (qualité post-release)

- [ ] **W4 — Catch vides** : Ajouter `console.warn('[Module] Failed silently:', e)` dans les 11 catch vides de `buildings.ts`, `hydrology.ts`, `poi.ts`, `weather.ts`. *(30 min)*
- [x] **W5 — setInterval non nettoyé** : `storageUIIntervalId` module-level + `disposeUI()` exportée pour nettoyage explicite. Intervalle dans `src/modules/ui.ts` (non dans les composants refactorisés).
- [x] **W6 — Icônes dupliquées** : `public/assets/icons/icon.png` supprimé (doublon exact de `icon_1024.png`). `vite.config.js` mis à jour pour référencer uniquement `icon_1024.png` avec `sizes: '192x192 512x512'`. Économie : -2.5 MB.
- [x] **I1 — `android:largeHeap`** : `android:largeHeap="true"` ajouté dans `<application>` du manifest.

---

### Correctifs Post-Sprint 6-bis (hors roadmap, livrés en v5.11)

- [x] **W4 — Catch vides** : `console.warn` ajouté dans les 9 catch silencieux de `buildings.ts`, `hydrology.ts`, `poi.ts`, `weather.ts` (strippés en prod par terser).
- [x] **W5 — setInterval** : `storageUIIntervalId` module-level + `disposeUI()` exportée dans `ui.ts`.
- [x] **W6 — Icônes dupliquées** : `icon.png` supprimé (-2.5 MB), `vite.config.js` unifié sur `icon_1024.png`.
- [x] **Démarrage mobile** : Délai 10-20s supprimé — render loop démarre AVANT `await loadTerrain()`. Spinner immédiat sur le bouton. `loadTerrain()` double-call supprimé. Workers : 4 max sur mobile (au lieu de 8).
- [x] **Build warnings** : Chemins `./img/maps/` → `/img/maps/` (absolus). Dynamic imports `tileLoader` → statiques. `chunkSizeWarningLimit: 600` (Three.js ~520kB). Build propre, zéro warning.

---

### Sprint 7 — Build AAB + CI/CD + Closed Testing
- [ ] **Keystore** : Générer `suntrail.keystore` + remplir `android/keystore.properties`.
- [ ] **AAB Build** : `./gradlew bundleRelease` → exit code 0.
- [ ] **Test device** : Edge-to-edge, navigation tactile, performance sur appareil physique.
- [ ] **GitHub Actions** : `.github/workflows/release.yml` — build AAB automatique sur tag.
- [ ] **Closed Testing** : Track ≥ 20 testeurs, 14 jours (obligatoire nouveaux développeurs).
- [ ] **Production** : Passage en Open Testing puis Production.

---

## 🔗 Priorité 6 : Intégrations Plateformes Sport (v6.0)
*Impact : Import naturel des tracés depuis les outils que les randonneurs utilisent déjà.*

- [ ] **Strava** : Import des activités via OAuth + API Strava. Synchronisation automatique des nouveaux tracés.
- [ ] **Komoot** : Import des tours planifiés et réalisés via API Komoot.
- [ ] **Garmin Connect** : Sync des activités et waypoints via API Garmin Health.
- [ ] **Suunto / Polar / Apple Health** : Évaluer la faisabilité et la priorité selon l'audience cible.
- [ ] **Format FIT natif** : Lecture directe des fichiers `.fit` (Garmin) en plus du GPX.

## 📊 Priorité 7 : Analyse Données Sport Avancée (v6.x — à définir ensemble)
*Impact : Transformer SunTrail en outil d'analyse de performance, pas seulement de visualisation.*

> ⚠️ **À co-concevoir** : Le périmètre exact est à affiner ensemble avant implémentation.

- [ ] **Overlay Fréquence Cardiaque** : Colorisation du tracé selon les zones cardiaques (Z1–Z5).
- [ ] **Corrélation Terrain / Effort** : Croisement pente, altitude, vitesse et données physiologiques.
- [ ] **Données Montre** : Import HR, SpO2, cadence, puissance depuis montres (Garmin, Apple Watch, Polar…).
- [ ] **Analyse Post-Effort** : Dashboard récapitulatif par segment (VAM, dénivelé/bpm, zones d'effort).
- [ ] **À définir ensemble** : Format des données entrantes, profondeur de l'analyse, UX de visualisation.

## 🚀 Priorité 8 : La Révolution AR (v6.0)
*Impact : Immersion totale et aide à l'orientation futuriste.*

- [ ] **Moteur AR Natif** : Superposition du moteur 3D sur le flux caméra via Capacitor.
- [ ] **Occlusion Topographique** : Masquage des étiquettes derrière le relief réel.

## 🔋 v5.12 — Render-on-Demand & Perf (si non fait en v5.11)

> ⚠️ Ce sprint n'existe que si la Phase 3 de Sprint 6 n'a pas été implémentée en v5.11 (résultats batterie suffisants sans elle).

- [ ] **Render-on-Demand complet** : Items 3.1 → 3.5 du Sprint 6 Phase 3 (voir ci-dessus).
- [ ] **Idle GPU suspension** : Arrêt total du contexte WebGL après 30s d'inactivité complète + reprise sur interaction.
- [ ] **Profiling mobile avancé** : Session Android Studio Profiler 30min — CPU, GPU, mémoire. Identifier les régressions éventuelles post-v5.11.

---

## ⏳ Backlog & Recherche (Indéfini)
- [ ] **Waypoints & Partage** : Marquage personnel et Deep Linking (URL synchronisée).
- [ ] **Mode Nuit Avancé** : Pollution lumineuse urbaine (NASA).
- [x] **v5.6.8** : Détection Galaxy A53 (Mali GPU) et réglages par défaut sécurisés.
- [x] **v5.5.15** : Suivi GPS haute précision et lissage Swisstopo style.
- [x] **v5.4.7** : Fusion de géométrie bâtiments RTX (144 FPS).
