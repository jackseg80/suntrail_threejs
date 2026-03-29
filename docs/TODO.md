# SunTrail 3D - Roadmap Révisée (v5.11.2)

## 🐛 Bugs Critiques Découverts en Conditions Réelles (v5.13 — priorité haute)

### Bug #1 — Crash REC sans permission GPS préalable

**Symptôme** : Ouvrir TrackSheet → cliquer REC sans avoir activé le GPS via le bouton position → l'app plante.
**Workaround actuel** : Appuyer d'abord sur le bouton GPS (position) qui demande la permission, puis utiliser REC.

**Cause probable** : `startLocationTracking()` dans TrackSheet appelle `Geolocation.getCurrentPosition()` ou `Geolocation.watchPosition()` sans vérifier si la permission est accordée. Sur Android, appeler l'API Geolocation sans permission = exception non catchée = crash.

**Fix recommandé** :
- [ ] **Demander la permission GPS au démarrage** (après Acceptance Wall, avant que l'utilisateur puisse toucher REC). Modèle : même pattern que `requestGPSDisclosure()` mais avec demande réelle de permission (`Geolocation.requestPermissions()`).
- [ ] **Ou** : dans le handler REC de `TrackSheet.ts`, vérifier `Geolocation.checkPermissions()` avant de démarrer. Si `denied` ou `prompt` → déclencher `requestGPSDisclosure()` + `Geolocation.requestPermissions()` en séquence.
- [ ] **Guard dans `startLocationTracking()`** : wrapper tout le bloc dans un try/catch avec message utilisateur clair si permission refusée.

---

### Bug #2 — Perte de données REC : enregistrement tronqué + GPX non sauvegardé ⚠️ CRITIQUE

**Symptôme** : Randonné 43 min / 3.8 km, téléphone en poche en REC. À l'ouverture : REC arrêté à ~3.4 km, GPX absent.

**Cause identifiée — double problème** :

**Problème A — Limite 30 min Freemium** : Le timer `REC_FREE_LIMIT_MS` (30 min) a stoppé automatiquement l'enregistrement. L'utilisateur n'a pas vu le toast (téléphone en poche). C'est le comportement attendu MAIS :

**Problème B — Gate export bloque la sauvegarde automatique** : Dans `TrackSheet.ts`, le timer auto-stop appelle `exportRecordedGPX()` qui contient le gate `if (!state.isPro) { showUpgradePrompt('export_gpx'); return; }`. Résultat : le GPX n'est **jamais sauvegardé**, les données sont perdues. **C'est un bug sévère — l'utilisateur perd ses données.**

**Fix obligatoire** :
- [ ] **Séparer "sauvegarde automatique" et "export manuel Pro"** : La sauvegarde au STOP (auto ou limite) doit toujours fonctionner, même pour les utilisateurs gratuits. Seul l'export manuel via le bouton "Exporter" est Pro.
- [ ] Dans `TrackSheet.ts` : créer `saveRecordedGPXInternal()` (sans gate Pro) appelé par l'auto-stop et le STOP manuel. Le bouton "Exporter GPX" dans l'UI reste Pro-only.
- [ ] **Notification visible** quand la limite 30 min approche : avertissement à T-5 min (toast persistant ou vibration) pour que l'utilisateur sache que l'enregistrement va s'arrêter.
- [ ] **Revoir l'UX de la limite** : Au lieu de supprimer les données, les sauvegarder toujours localement. Afficher "Passer à Pro pour continuer l'enregistrement" sans perdre ce qui a été enregistré.

> ⚠️ **Note pour l'agent IA** : Le fichier à corriger est `src/modules/ui/components/TrackSheet.ts`. La méthode `exportRecordedGPX()` a un gate `isPro` ligne ~346. L'auto-stop timer est dans le handler `recBtn` click. Corriger en priorité avant toute publication en production.

---

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
- [ ] **GPX Export — Share Sheet Android (Option 2)** : Remplacer/compléter `Filesystem.writeFile()` par `@capacitor/share` → Share Sheet Android native (Komoot, WhatsApp, Files, Google Drive…). L'utilisateur choisit la destination. Nécessite `npm install @capacitor/share` + `npx cap sync`. Implémenter dans `exportRecordedGPX()` de `TrackSheet.ts` : écrire d'abord dans un fichier temp (`Directory.Cache`), puis appeler `Share.share({ files: [uri] })`.

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
- [x] **Memory Leak Audit** : ✅ Validé S23 — pas de fuite idle (courbe plate Live Telemetry), GC actif (675→506 textures), RAM stable après 3 min. Voir `docs/PROFILING_RESULTS.md`.
- [x] **Battery Test S23 (Performance)** : ✅ Deep Sleep fps=0 validé. CPU idle 0%. Drain pire cas ~18%/h (écran allumé en continu, preset High) → usage rando réel estimé 3-5%/h (écran éteint 80% du temps). Non-bloquant Play Store.
- [x] **Fix controls.update() stuck** : ✅ Guard temporel 800ms dans `needsUpdate` + `tiltAnimating` extrait du bloc tilt. `controls.update()` toujours appelé (damping physique), résultat ignoré après 800ms.
- [x] **Fix idle throttle global 20fps** : ✅ Guard `isIdleMode` dans `renderLoopFn` — si pas d'interaction depuis 800ms, render limité à 20fps. Couvre tiltAnimating + isProcessingTiles + tilesFading. Résout 45-48fps GPU en idle sur Android.
- [x] **Loading indicator 1er démarrage** : ✅ `#map-loading-overlay` dans `index.html` — affiché après setup-screen, caché quand `isProcessingTiles → false` (1ères tuiles). Fallback 2s (cache chaud) + timeout 15s (réseau lent).
- [x] **Fix météo 20fps réels** : ✅ Cause identifiée — accumulateurs `weatherTimeAccum` placés après le guard idle → ne s'incrémentaient que sur les frames rendues → météo à ~5fps visuels au lieu de 20fps. Fix : accumulateurs déplacés avant tous les guards. Météo fluide à 20fps sans plein régime. `tickWeatherTime` supprimé (non nécessaire).
- [x] **Fix export GPX Android** : ✅ `link.click()` + Blob URL ignoré silencieusement par WebView Android. Fix : `@capacitor/filesystem` → `Filesystem.writeFile(Directory.Documents)`. Auto-export au STOP (si ≥ 2 points). Bouton "Exporter" supprimé (redondant). Fichier dans *Files > Android > data > com.suntrail.threejs > files > Documents*.
- [x] **Test Galaxy A53 (Balanced/STD) — Batterie marche réelle** : ✅ −6%/30min = ~12%/h (poche, Deep Sleep, GPS passif). Objectif ≤ 15%/h atteint. C'est l'appareil cible mid-range (Mali-G68 / Exynos 1280). Décision : **Sprint 7 en v5.11** autorisé.
- [x] **Test Galaxy A53 — Profiling technique complet** : ✅ Session 5 (PerfRecorder + Live Telemetry) + Session 6 (Phase B flame chart + memory heap). Aucune fuite. Long Tasks attendus sur Exynos 1280. Voir `docs/PROFILING_RESULTS.md`.
- [ ] **Test Galaxy S23 — Phase B Chrome DevTools** : flame chart + memory heap. Cible `renderLoopFn < 16ms` (ENERGY_SAVER=false). Voir Session 7 dans `docs/PROFILING_RESULTS.md`.

> ### 📱 Protocole Profiling SunTrail — 3 phases simultanées
>
> **Pourquoi 3 phases ?** Three.js tourne dans la WebView. Android Studio s'arrête à la frontière WebView pour la logique JS/WebGL. Il faut combiner les outils.
>
> | Phase | Faisable sur PC ? | Faisable sur Android ? | Décisive pour Play Store |
> |-------|:-----------------:|:---------------------:|:------------------------:|
> | **A** — Batterie + RAM native | ❌ Non | ✅ Oui | ✅ Oui (bloquante) |
> | **B** — Flame chart JS | ⚠️ Smoke test (localhost) | ✅ Oui (`chrome://inspect`) | ⚠️ Partielle |
> | **C** — PerfRecorder | ✅ Smoke test (vérifie l'outil) | ✅ Données réelles | ⚠️ Partielle |
>
> > **Sur PC** : Phase C permet de vérifier que le PerfRecorder fonctionne et que le throttle eau/météo est observable. Phase B sur localhost confirme les *fréquences* (toutes les 50ms) mais pas les *timings absolus* (GPU PC ≫ GPU mobile). **La Phase A est irremplaçable sur Android — c'est elle qui décide.**
>
> ---
>
> #### Phase A — Android Studio Live Telemetry (batterie + RAM native) 📱 ANDROID UNIQUEMENT
>
> > ⚠️ Android Studio NE voit PAS les objets Three.js (VRAM textures/géométries) — ils sont en mémoire native GPU. Utiliser Phase C pour ça.
>
> 1. `adb shell dumpsys batterystats --reset` **avant** de lancer l'app.
> 2. Lance SunTrail → preset **Balanced** (auto-détecté).
> 3. Ouvre **Live Telemetry** (🟠 icône tableau de bord) — laisse tourner en continu.
> 4. Surveiller :
>    - **Energy** : doit être basse au repos, pics brefs sur interaction. Constant élevé = bug.
>    - **Memory → Native** : doit se stabiliser < 2 min après chargement. Montée linéaire = memory leak.
>    - **Network** : rafales lors des LOD changes (normal), silence entre.
> 5. Après 10 min de navigation : **verrouille l'écran 2 min** → Energy doit tomber à zéro (Deep Sleep v5.11).
> 6. `adb shell dumpsys batterystats` → chercher `Estimated power use` dans la sortie.
> 7. **Objectif batterie** : ≤ 15%/heure en preset Balanced GPS actif.
>
> **System Trace** (🔴) si tu vois des micro-saccades : montre exactement si c'est le GPU qui sature ou Android qui préempte. Utile pour diagnostiquer le jank lors du chargement des tuiles.
>
> ---
>
> #### Phase B — Chrome DevTools Performance (JS frame budget) ⚠️ ANDROID PRÉFÉRABLE
>
> > Chrome DevTools franchit la frontière WebView — le seul outil qui voit le code Three.js en contexte mobile réel.
> >
> > Sur **Android** : `chrome://inspect` → sélectionne le process SunTrail → Inspect (timings réels GPU mobile).
> > Sur **PC** (smoke test) : ouvrir directement `localhost:5173` dans Chrome → Performance Record. Les *fréquences* de throttle (50ms) sont vérifiables, mais les timings absolus (ms/frame) ne sont pas représentatifs.
>
> 1. Sur PC, ouvre `chrome://inspect` → sélectionne le process SunTrail → **Inspect**.
> 2. Onglet **Performance** → ⏺ Record → pan/zoom 10 sec → ⏹ Stop.
> 3. Ce qu'on cherche dans la flame chart :
>    - `renderLoopFn` : doit prendre < 16ms (60fps) ou < 33ms (30fps ENERGY_SAVER)
>    - `updateWeatherSystem` : doit n'apparaître que toutes les ~50ms (throttle Phase 2)
>    - Frames **rouges** → jank → noter la fonction responsable
>    - `updateVisibleTiles` : pics normaux lors des changements de LOD
> 4. Onglet **Memory** → Heap snapshot avant/après 10 min pour détecter les JS leaks.
>
> ---
>
> #### Phase C — PerfRecorder intégré (corrélation fps ↔ VRAM ↔ tiles) ← **COMMENCER ICI**
>
> > C'est le plus précis pour SunTrail car il voit les données internes du moteur (drawCalls, textures, isProcessingTiles).
> >
> > ✅ **Peut se faire sur PC** comme smoke test préliminaire : vérifie que le PerfRecorder fonctionne, que le throttle eau/météo est observable et que les métriques sont cohérentes. Reprendre sur Android pour les données décisives (VRAM réelle GPU mobile).
>
> 1. Dans SunTrail → **Réglages avancés** → toggle **"Stats de performance"** → le panel VRAM apparaît.
> 2. Clique **⏺** dans le panel VRAM → l'enregistrement démarre (buffer 600 samples × 500ms = 5 min max).
> 3. Scénario de test (~5 min) :
>    - 1 min : navigation libre (pan/zoom, change de LOD)
>    - 1 min : immobile (pas d'interaction) → les fps doivent baisser (throttle eau/météo)
>    - 1 min : importe un GPX → observe isProcessingTiles + textures
>    - 1 min : active l'hydrologie → observe waterFrameDue en action (fps ne monte pas à 60)
>    - 1 min : verrouille l'écran → fps doit tomber à 0 (Deep Sleep)
> 4. Clique **⏹** → JSON dans le presse-papier.
> 5. **Colle le JSON dans le chat** → analyse automatique (corrélation fps/textures/isProcessingTiles).
>
> ---
>
> #### Décision post-test
>
> | Résultat Phase A | Action |
> |-----------------|--------|
> | ≤ 15%/h + heap stable | → Sprint 7 (AAB + Play Store) en **v5.11** ✅ |
> | > 15%/h malgré Phase 1+2 | → Phase 3 render-on-demand avant publication (**v5.12**) |
> | Heap native monte linéairement | → Memory leak — investiguer avant tout |

### Sprint 5 — Légal & Play Store Listing
- [x] **Privacy Policy** : `public/privacy.html` → `https://jackseg80.github.io/suntrail_threejs/privacy.html` — bilingue FR/EN, RGPD + LPD suisse, Play Store compliant.
- [x] **Data Safety** : Remplir dans Play Console.
- [ ] **Content Rating (IARC)** : Questionnaire Play Console — cible "Tout public".
- [ ] **Screenshots** : Phone portrait + tablet pour tous les form factors.
- [x] **Feature Graphic** : Visuel 1024×500px.
- [x] **Descriptions** : Rédigées FR + EN — voir `docs/STORE_LISTING.md`.

---

### Sprint 5-bis — Stratégie Business & Monétisation ✅ DÉCISIONS ACTÉES

> 📋 **Stratégie complète finalisée** : voir `docs/MONETIZATION.md` (29 mars 2026)
> Toutes les décisions sont tranchées. Reste l'implémentation technique.

#### Décisions actées (D1–D6)

- [x] **D1 — Freemium** : tier gratuit (LOD ≤ 14, solaire ±2h, 1 GPX, REC 30min, offline 1 zone) + Pro €19.99/an
- [x] **D2 — Clé MapTiler bundlée + Flex** : clé unique dans `.env`, plan Flex pay-as-you-go (0$ jusqu'à 100k tiles/mois)
- [x] **D3 — Zéro publicité**
- [x] **D4 — Marché FR + CH** dès Sprint 7 (Plan IGN v2 = 0€, même modèle que SwissTopo)
- [x] **D5 — iOS v6.x** (build Capacitor séparé, pas de blocage Sprint 7)
- [x] **D6 — Plan IGN v2 (0€)** — SCAN 25 écarté (coût + complexité)

#### Implémentation Freemium ✅ TERMINÉ (v5.12)

- [x] **Plugin RevenueCat** : `@revenuecat/purchases-capacitor` v12.3.0 + `npx cap sync`
- [x] **`state.isPro: boolean`** : `state.ts` + `saveProStatus()` / `loadProStatus()` (clé séparée `suntrail_pro`)
- [x] **`iapService.ts`** : RevenueCat — initialize / syncProStatus / purchase / restore / getPrices
- [x] **`iap.ts`** : `showUpgradePrompt()` → UpgradeSheet, `grantProAccess()` / `revokeProAccess()`
- [x] **Gate LOD** : `performance.ts` — `MAX_ALLOWED_ZOOM` cappé à 14 si `!isPro`
- [x] **Gate Satellite** : `LayersSheet.ts` — bloqué si `!isPro`
- [x] **Gate GPX multi-tracés** : `TrackSheet.ts` — bloqué si `!isPro && layers >= 1`
- [x] **Gate export GPX** : `TrackSheet.ts` — bloqué si `!isPro`
- [x] **Gate REC 30min** : `TrackSheet.ts` — auto-stop + toast si `!isPro`
- [x] **Upgrade Sheet** : `UpgradeSheet.ts` — paywall UI avec prix réels RevenueCat
- [x] **Clé MapTiler bundlée** : `VITE_MAPTILER_KEY` dans `.env` + auto-skip setup screen
- [x] **Clé RevenueCat** : `VITE_REVENUECAT_KEY=goog_...` dans `.env` (clé Android réelle)
- [x] **Acceptance Wall** : `acceptanceWall.ts` — disclaimer sécurité alpine, versionnée `v1`
- [x] **BILLING permission** : `AndroidManifest.xml` — `com.android.vending.BILLING`

#### Gates Freemium manquants (v5.13)

- [ ] **Gate solaire** : `TimelineComponent.ts` — limiter le curseur à ±2h si `!isPro`
- [ ] **Gate offline** : `ConnectivitySheet.ts` — limiter à 1 zone si `!isPro`

#### Partenariats (post-lancement, après 10k téléchargements)

- [ ] **MapTiler** : partnerships@maptiler.com — accord revendeur / tarif startup
- [ ] **SAC/CAS** : info@sac-cas.ch — licence bulk membres (150k membres)
- [ ] **CAF/FFCAM** : contact@ffcam.fr — 380k membres France

---

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

### Correctifs & features Post-Sprint 6-bis (hors roadmap, livrés en v5.11)

- [x] **W4 — Catch vides** : `console.warn` ajouté dans les 9 catch silencieux de `buildings.ts`, `hydrology.ts`, `poi.ts`, `weather.ts` (strippés en prod par terser).
- [x] **W5 — setInterval** : `storageUIIntervalId` module-level + `disposeUI()` exportée dans `ui.ts`.
- [x] **W6 — Icônes dupliquées** : `icon.png` supprimé (-2.5 MB), `vite.config.js` unifié sur `icon_1024.png`.
- [x] **Démarrage mobile** : Délai 10-20s supprimé — render loop démarre AVANT `await loadTerrain()`. Spinner immédiat sur le bouton. `loadTerrain()` double-call supprimé. Workers : 4 max sur mobile (au lieu de 8).
- [x] **Build warnings** : Chemins `./img/maps/` → `/img/maps/` (absolus). Dynamic imports `tileLoader` → statiques. `chunkSizeWarningLimit: 600` (Three.js ~520kB). Build propre, zéro warning.
- [x] **mobile-web-app-capable** : Ajout du meta tag `mobile-web-app-capable` (Android Chrome) aux côtés du meta Apple (toujours requis iOS Safari). Supprime le warning de console Chrome.

#### Toggle 2D/3D (v5.11 UX majeur)

- [x] **Bouton 2D/3D** : Premier bouton de la nav bar bas. Toggle instantané (`rebuildActiveTiles()` + `updateVisibleTiles()`). Label dynamique "2D"/"3D". Haptique light. Persisté en localStorage.
- [x] **`state.IS_2D_MODE`** : Flag indépendant du preset. Découple le mode d'affichage de la qualité de rendu.
- [x] **ENERGY_SAVER par tier** (décision design) : eco/balanced → 30fps par défaut (mid-range). **performance/ultra → 60fps par défaut** (flagship — l'utilisateur mérite ses perfs). Toggle manuel toujours disponible dans Réglages Avancés.
- [x] **`fetchAs2D = zoom <= 10` uniquement** : Le mode IS_2D_MODE ne skipppe plus le fetch d'élévation pour LOD > 10. Le mode 2D contrôle l'*affichage* (mesh plat), pas les *données*. Switch 2D→3D instantané sans re-fetch.
- [x] **Bug écran blanc** : `rebuildActiveTiles()` remplace `resetTerrain()` pour le toggle — meshes reconstruits en place (fondu 500ms), scène jamais vide.
- [x] **Bug damier sombre/clair** : Même fix — matériaux rendus au pool via `oldMesh` au lieu d'être détruits par `disposeObject`. Pool jamais vide, pas de recompilation shader.
- [x] **Bug tuiles plates/volantes LOD 14+** : Tuiles chargées en 2D sans élévation détectées (`!pixelData && zoom > 10`), cache invalidé, force re-fetch avec vraies données. 190/190 tests ✅.

---

### 📊 Protocole Profiling v5.11 — À REPRENDRE (context pour nouvelle discussion)

> **État** : App v5.11 feature-complete. Sprint 6 Phase 1+2 déployés. Résultat du test batterie détermine si Phase 3 (render-on-demand) est nécessaire avant Play Store.
>
> **Décision Play Store** :
> - ≤ 15%/h en preset Balanced GPS actif → Sprint 7 directement (**v5.11**)
> - > 15%/h → Phase 3 render-on-demand avant publication (**v5.12**)

#### Contexte à donner à l'agent dans la nouvelle discussion :

```
Je veux faire le protocole de profiling perf de SunTrail v5.11.
J'ai Android Studio Profiler ouvert + Chrome DevTools disponible.
Voir docs/TODO.md section "Protocole Profiling v5.11" pour le détail.
App sur appareil physique Android connecté en USB (débogage activé).
```

#### Que peut-on faire sur PC vs Android ?

| Phase | PC (localhost) | Android (physique) | Valeur |
|-------|:--------------:|:------------------:|--------|
| **C** PerfRecorder | ✅ Smoke test | ✅ Données réelles | Sur PC : vérifie que le throttle eau/météo est observable (fréquences). Sur Android : VRAM réelle GPU mobile. |
| **B** Flame chart | ⚠️ Fréquences OK, timings non représentatifs | ✅ Timings réels | Sur PC : confirme que `updateWeatherSystem` apparaît bien toutes les 50ms. |
| **A** Batterie + RAM native | ❌ Impossible | ✅ Seul appareil valide | **Irremplaçable — décide du Sprint 7 vs v5.12.** |

#### Rappel du protocole (3 phases simultanées) :

**Phase C — PerfRecorder intégré** ← **COMMENCER ICI (possible sur PC)**
1. Réglages avancés → **Stats de performance** → panel VRAM s'affiche
2. Cliquer **⏺** → enregistrement démarre (buffer 600 samples, 5 min)
3. Scénario : 1 min navigation | 1 min immobile | 1 min import GPX | 1 min hydrologie | 1 min écran verrouillé
4. Cliquer **⏹** → JSON dans presse-papier
5. **Coller le JSON dans le chat** → l'agent analyse (corrélation fps/textures/isProcessingTiles)
> Sur PC : vérifier que `fps` baisse en immobile (throttle), que `isProcessingTiles` pulse lors du GPX, que `fps` → 0 sur verrouillage.
> Sur Android : mêmes vérifications + valeurs VRAM/drawCalls représentatives du hardware cible.

**Phase B — Chrome DevTools Performance** (`chrome://inspect` sur Android, ou `localhost:5173` sur PC)
- Record → pan/zoom 10s → Stop → analyser flame chart
- `renderLoopFn` < 16ms (60fps) ou < 33ms (30fps ENERGY_SAVER)
- `updateWeatherSystem` toutes les ~50ms (throttle Phase 2 actif)
- Frames rouges → jank → noter la fonction responsable
> Sur PC : les timings absolus ne sont pas représentatifs (RTX 4080 ≫ GPU mobile) mais les *fréquences* du throttle sont vérifiables.

**Phase A — Android Studio Live Telemetry** (batterie + RAM native) 📱 ANDROID UNIQUEMENT
- Ouvrir Live Telemetry (🟠)
- `adb shell dumpsys batterystats --reset` avant le test
- Preset **Balanced** (auto-détecté), GPS actif, navigation 10-15 min
- Verrouiller l'écran 2 min → Energy doit tomber à 0 (Deep Sleep)
- `adb shell dumpsys batterystats` → chercher `Estimated power use`
- **Objectif : ≤ 15%/heure**

- [x] **Phase A — Batterie** : ✅ S23 −10%/30min (GPS+REC, Deep Sleep 90%). A53 −6%/30min (GPS passif, Deep Sleep 100%). Objectif ≤ 15%/h atteint sur les deux appareils.
- [x] **Décision** : ✅ **Sprint 7 en v5.11.** Phase 3 render-on-demand reportée en v5.12.
- [x] **Phase C — PerfRecorder JSON** : ✅ Session 5 A53 — 377 samples, Deep Sleep validé, energySaver=true. Voir PROFILING_RESULTS.md.
- [x] **Phase B — Flame chart A53** : ✅ Session 6 — throttle météo OK, workers OK, Long Tasks attendus Exynos 1280, aucune fuite mémoire.
- [x] **Phase B — Flame chart S23** : ✅ Session 7 — 60fps stables < 16ms, scripting 19%, Long Tasks quasi nuls (Adreno 740), throttle météo 50ms déterministe, fix v5.11.1 confirmé (flyTo/follow plus à 20fps). Goulot = CPU synchrone (refreshTerrain). Non bloquant.

---

### Sprint 7 — Build AAB + CI/CD + Closed Testing *(débloqué par Sprint 5-bis)*

> ⏱ **Séquençage** : Closed Testing dure 14 jours (obligatoire 1ère fois uniquement). Profiter de ce délai pour développer v5.12 en parallèle. Les updates suivantes passent en production en quelques heures sans closed testing.

#### Actions manuelles ✅ TERMINÉES

- [x] **Keystore** : `suntrail.keystore` généré (CN=Jacques Segalla, O=SunTrail, C=CH) + `keystore.properties` rempli
- [x] **GitHub Secrets** : 6 secrets configurés (KEYSTORE_BASE64, STORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS, VITE_MAPTILER_KEY, VITE_REVENUECAT_KEY)
- [x] **CI/CD** : `.github/workflows/release.yml` opérationnel — `git tag vX.Y.Z` → AAB signé + GitHub Release automatique
- [x] **Play Console** : App créée, package `com.suntrail.threejs`
- [x] **Internal Testing** : AAB v5.12.5 (versionCode 514) uploadé et fonctionnel sur Galaxy Tab S8
- [x] **RevenueCat** : App Android ajoutée avec clé `goog_`, entitlement `SunTrail 3D Pro`

#### Reste à faire avant Production

**Play Console — configuration**
- [ ] **Fiche Play Store** : screenshots (min 2, portrait 1080×1920) + feature graphic (1024×500)
- [x] Icône 512×512 : `public/assets/icons/icon_512.png` ✅
- [x] Textes FR + EN : `docs/STORE_LISTING.md` ✅
- [x] **Classification contenu (IARC)** : questionnaire → Tout public
- [x] **Data Safety** : GPS + achats via Play Billing
- [ ] **Compte marchand** : IBAN + identité (pour recevoir les paiements)
- [ ] **Produits IAP** : `suntrail_pro_annual` (€19.99/an), `suntrail_pro_monthly` (€2.99/mois), `suntrail_pro_lifetime` (€49.99)
- [ ] **Lier RevenueCat ↔ Play Console** : Service Account JSON (docs.revenuecat.com/docs/service-credentials)
- [ ] **Mettre l'app en GRATUIT** (actuellement "Payant" — le revenu vient des IAP, pas du téléchargement)

**Closed Testing (14 jours obligatoires)**
- [ ] Passer de Internal Testing → Closed Testing
- [ ] Ajouter 20 testeurs (famille/amis Android, Reddit r/Randonnée, groupes Facebook rando)
- [ ] Diffuser le lien opt-in

**Production**
- [ ] Après 14 jours closed testing → Mise en production

---

## 🔧 Priorité 5-ter : Corrections Techniques Post-Lancement (v5.13)

### Amélioration Détection GPU / Presets

**Constat** : Galaxy Tab S8 (Snapdragon 898 / Adreno 730) a pris le preset `balanced` (STD) au lieu de `performance` (High). Sous-classement = expérience dégradée pour un appareil qui peut faire mieux.

- [ ] **Audit `detectBestPreset()`** : Vérifier la couverture Adreno 730 (Snapdragon 898) dans `performance.ts`. Le pattern actuel couvre Adreno 830+ pour Ultra — Adreno 730 doit mapper sur `performance`.
- [ ] **Données de référence manquantes** : Tester sur Tab S8 et noter le renderer string exact retourné par WebGL (`getGpuInfo()` → `renderer`). L'ajouter dans `detectBestPreset()`.
- [ ] **Fallback CPU amélioré** : Le fallback `≥8 cores → balanced` est trop conservateur pour les tablettes haut de gamme. Envisager un fallback basé sur `deviceMemory` (API Web) + cores combinés.
- [ ] **PerfRecorder data** : Utiliser le VRAMDashboard en session de 5 min sur Tab S8 pour exporter un JSON et corréler FPS/preset/appareil.

> 📋 **Note pour l'agent IA** : Demander à l'utilisateur de lancer `console.log(getGpuInfo())` sur la Tab S8 depuis les DevTools Android (chrome://inspect) pour obtenir le renderer string exact avant d'éditer `detectBestPreset()`.

### Stratégie MapTiler — Audit Consommation Clé API

**Constat** : Toutes les sessions (gratuit + Pro) partagent une seule clé bundlée. À mesure que l'audience grandit, le quota risque d'être dépassé ou le coût de s'envoler.

- [ ] **Mesurer la consommation réelle** : Activer les statistiques dans le dashboard MapTiler Cloud → noter tiles/jour après 1 semaine de Closed Testing.
- [ ] **Identifier les sources gratuites** : SwissTopo (`geo.admin.ch`) et Plan IGN v2 (`data.geopf.fr`) ne consomment **pas** de quota MapTiler. Si 80%+ des sessions sont CH+FR, le problème est moindre que prévu.
- [ ] **Décider du modèle à l'échelle** :
  - Option A — Clé unique + plan Flex (0$ tant que < 100k tiles/mois) : viable jusqu'à ~200 DAU FR/CH
  - Option B — Clé Pro séparée (plan Starter $25/mois) débloquée par l'achat Pro : les Pro paient indirectement les tiles haute résolution (LOD 18, satellite)
  - Option C — Proxy serveur (filtre les requêtes, masque la clé) : infrastructure à maintenir
- [ ] **Contacter MapTiler** : partnerships@maptiler.com — tarif startup, accord revendeur. SunTrail est une vitrine de leur stack (SwissTopo + IGN + satellite). Levier de négociation réel.

---

## 🎓 Priorité 5-bis : Onboarding & Aide au Premier Démarrage (v5.13) *(après Closed Testing)*
*Impact : Réduction du taux d'abandon — un utilisateur qui comprend l'app en 60 secondes est un utilisateur qui reste.*

- [ ] **Tooltip "Premier tracé"** : À l'import du 1er GPX, afficher une bulle pointant vers le bouton profil d'élévation et la simulation solaire — les 2 features différenciantes à découvrir.
- [ ] **Overlay tutorial interactif** : 4-5 étapes séquentielles au 1er lancement (après Acceptance Wall) :
  - Étape 1 : "Naviguez avec vos doigts — pincez pour zoomer, glissez pour tourner"
  - Étape 2 : "Importez un tracé GPX depuis vos randonnées"
  - Étape 3 : "Simulez le soleil à n'importe quelle heure"
  - Étape 4 : "Activez Pro pour débloquer le détail maximum"
  - Bouton "Passer" disponible dès la 1ère étape
- [ ] **Indicateur "Nouveauté"** : Badge rouge sur le bouton Timeline après 1er lancement, disparaît à l'ouverture.
- [ ] **Empty state GPX** : Dans TrackSheet, si aucun tracé → message d'invitation + bouton import GPX mis en avant (au lieu d'une liste vide).
- [ ] **Aide contextuelle** : Icône ⓘ sur les features Pro bloquées → tooltip expliquant pourquoi c'est Pro (pas juste le lock icon).
- [ ] **Stockage** : Flag `suntrail_onboarding_v1` en localStorage — ne s'affiche qu'une fois.

---

## 🔗 Priorité 6 : Intégrations Plateformes Sport (v6.0) *(après lancement Play Store)*
*Impact : Import naturel des tracés depuis les outils que les randonneurs utilisent déjà.*

- [ ] **Strava** : Import des activités via OAuth + API Strava. Synchronisation automatique des nouveaux tracés.
- [ ] **Komoot** : Import des tours planifiés et réalisés via API Komoot.
- [ ] **Garmin Connect** : Sync des activités et waypoints via API Garmin Health.
- [ ] **Suunto / Polar / Apple Health** : Évaluer la faisabilité et la priorité selon l'audience cible.
- [ ] **Format FIT natif** : Lecture directe des fichiers `.fit` (Garmin) en plus du GPX.

## 📊 Priorité 7 : Analyse Données Sport Avancée (v6.x — à définir ensemble) *(après lancement)*
*Impact : Transformer SunTrail en outil d'analyse de performance, pas seulement de visualisation.*

> ⚠️ **À co-concevoir** : Le périmètre exact est à affiner ensemble avant implémentation.

- [ ] **Overlay Fréquence Cardiaque** : Colorisation du tracé selon les zones cardiaques (Z1–Z5).
- [ ] **Corrélation Terrain / Effort** : Croisement pente, altitude, vitesse et données physiologiques.
- [ ] **Données Montre** : Import HR, SpO2, cadence, puissance depuis montres (Garmin, Apple Watch, Polar…).
- [ ] **Analyse Post-Effort** : Dashboard récapitulatif par segment (VAM, dénivelé/bpm, zones d'effort).
- [ ] **À définir ensemble** : Format des données entrantes, profondeur de l'analyse, UX de visualisation.

## 🚀 Priorité 8 : La Révolution AR (v6.0) *(vision long terme)*
*Impact : Immersion totale et aide à l'orientation futuriste.*

- [ ] **Moteur AR Natif** : Superposition du moteur 3D sur le flux caméra via Capacitor.
- [ ] **Occlusion Topographique** : Masquage des étiquettes derrière le relief réel.

## 🔋 v5.12 — Render-on-Demand & Perf (si non fait en v5.11)

> ⚠️ Ce sprint n'existe que si la Phase 3 de Sprint 6 n'a pas été implémentée en v5.11 (résultats batterie suffisants sans elle).

- [ ] **Render-on-Demand complet** : Items 3.1 → 3.5 du Sprint 6 Phase 3 (voir ci-dessus).
- [ ] **Idle GPU suspension** : Arrêt total du contexte WebGL après 30s d'inactivité complète + reprise sur interaction.
- [ ] **Profiling mobile avancé** : Session Android Studio Profiler 30min — CPU, GPU, mémoire. Identifier les régressions éventuelles post-v5.11.
- [ ] **Budget-temps mesh par frame** : Remplacer `MAX_BUILDS_PER_CYCLE` (compteur fixe) par un budget-temps (~8ms/frame) dans `processLoadQueue()`. Élimine les Long Tasks lors des transitions LOD sur Exynos 1280. Détecté en Session 6 Phase B.
- [ ] **materialPool — recycling shader complet (Balanced-spécifique)** : +98 programmes shader sur A53 Balanced (Session 6), absent sur S23 Performance (Session 7, +8 seulement). Cause probable : variantes shader des matériaux légers Balanced. Investiguer quels chemins créent des shaders hors pool sur le preset Balanced. Taille marginale (486 kB) mais optimisation propre.

---

## ⏳ Backlog & Recherche (Indéfini)
- [ ] **Waypoints & Partage** : Marquage personnel et Deep Linking (URL synchronisée).
- [ ] **Mode Nuit Avancé** : Pollution lumineuse urbaine (NASA).
- [x] **v5.6.8** : Détection Galaxy A53 (Mali GPU) et réglages par défaut sécurisés.
- [x] **v5.5.15** : Suivi GPS haute précision et lissage Swisstopo style.
- [x] **v5.4.7** : Fusion de géométrie bâtiments RTX (144 FPS).
