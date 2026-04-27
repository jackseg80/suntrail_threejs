# SunTrail 3D — Workflow de Publication

> Guide pour les agents IA et le développeur. Suivre dans l'ordre exact.

---

## 🚀 Publication d'une nouvelle version (workflow standard)

### Étape 1 — Incrémenter le versionCode (OBLIGATOIRE)

> ⚠️ **Toujours consulter le tableau historique ci-dessous** pour connaître le dernier versionCode utilisé et incrémenter de 1.

Dans `android/app/build.gradle` :

```groovy
versionCode 521        // ← TOUJOURS last_value + 1 (voir tableau historique)
versionName "5.13.1"   // ← version sémantique visible par l'utilisateur (ex: 5.13.1)
```

> ⚠️ **Règles strictes :**
> - Play Store refuse tout AAB avec un versionCode déjà utilisé — **même si l'upload a échoué**
> - versionCode = entier **strictement croissant**, jamais de gap, jamais de réutilisation
> - versionName = version lisible (ex: `5.13.0`) — ne doit **pas** inclure de suffixe (-ct, -fix)
> - Le tag git **peut** avoir un suffixe (ex: `v5.13.0-ct`) mais versionName reste propre

### Étape 2 — Commit + Tag

```bash
git add android/app/build.gradle
git commit -m "chore: bump versionCode XXX→YYY, versionName X.Y.Z"
git push origin main
git tag vX.Y.Z          # Format obligatoire : v{majeur}.{mineur}.{patch} ou v{x}.{y}.{z}-{suffix}
git push origin vX.Y.Z  # Ce push déclenche le CI
```

> ⚠️ **Pattern CI** : `.github/workflows/release.yml` se déclenche sur `git tag v*.*.*`
> Les suffixes sont autorisés : `v5.13.0-ct`, `v5.12.9-fix`, etc.
> Un tag sans `v` au début (**ex: `5.13.0`**) ne déclenche **PAS** le CI.

Le tag déclenche automatiquement `.github/workflows/release.yml`.

### Étape 3 — Attendre le CI (~5 min)

GitHub → Actions → "Build Android AAB" → vérifier que le run passe.

L'AAB signé est disponible dans : **GitHub → Releases → vX.Y.Z → app-release.aab**

### Étape 4 — Upload Play Console

1. [play.google.com/console](https://play.google.com/console) → SunTrail 3D
2. Selon la cible :
   - **Tests internes** → pour tester soi-même (immédiat)
   - **Tests fermés** → pour les 20 testeurs (14 jours obligatoires 1ère fois)
   - **Production** → après validation closed testing
3. Créer une release → Téléverser l'AAB → Notes de version → Examiner → Déployer

---

## 📋 Historique des versionCodes

| versionCode | versionName | Tag git | Track Play Store | Date |
|-------------|-------------|---------|-----------------|------|
| 512 | 5.11.1 | v5.12.0 | CI test — clé RevenueCat `test_` (crash) | 2026-03-29 |
| 512 | 5.11.1 | v5.12.1 | CI test — fix CRLF gradlew | 2026-03-29 |
| 512 | 5.11.1 | v5.12.2 | CI test — fix permissions GitHub Release | 2026-03-29 |
| 512 | 5.11.1 | v5.12.3 | CI test — clé RevenueCat `goog_` | 2026-03-29 |
| 513 | 5.12.3 | v5.12.4 | Tests internes — 1er upload Play Console | 2026-03-29 |
| 513 | 5.12.3 | v5.12.5 | Setup screen auto-skip (clé bundlée) | 2026-03-29 |
| 514 | 5.12.5 | v5.12.5-fix | Tests internes — app fonctionnelle Galaxy Tab S8 | 2026-03-29 |
| 515 | 5.12.6 | v5.12.6 | Fix timeline 2D + regression widget display order | 2026-03-29 |
| 516 | 5.12.7 | v5.12.7 | Fix bouton timeline accessible en 2D au démarrage | 2026-03-29 |
| 517 | 5.12.8 | v5.12.8 | Fix REC crash GPS + perte données auto-stop + persistence filesystem | 2026-03-29 |
| 518 | 5.12.9 | v5.12.9 | Mode testeur 7 taps (isPro RAM non persisté) | 2026-03-29 |
| 519 | 5.12.9 | v5.12.9-ct | Tests fermés — Closed Testing soumis à Google | 2026-03-29 |
| **520** | **5.13.0** | **v5.13.0** | Upsell LOD 14 contextuel (toast debounce 30s) | 2026-03-29 |
| 521 | 5.13.1 | v5.13.1 | Upsell contextuel complet (badge satellite, hint timeline, REC T-5min) | 2026-03-30 |
| 522 | 5.13.2 | v5.13.2 | Toggle Pro testeur dans Réglages Avancés (Closed Testing) | 2026-03-30 |
| 523 | 5.13.3 | v5.13.3 | Analyse Solaire Pro — 12 champs, 4 blocs UI, graphique SVG, 16 tests | 2026-03-30 |
| 524 | 5.13.4 | v5.13.4 | UpgradeSheet 3 plans + toast durée corrigée (CSS animation supprimée) | 2026-03-30 |
| 525 | 5.13.5 | v5.13.5 | Fix layout overflow bouton Pro solaire + plans UpgradeSheet égaux | 2026-03-30 |
| 526 | 5.13.6 | v5.13.6 | Station Météo Pro — 5 blocs, 3 jours, alertes montagne, 33 tests | 2026-03-30 |
| 527 | 5.13.7 | v5.13.7 | Conformité Play Store — disclaimer entité gouvernementale + liens sources officielles | 2026-03-30 |
| 528 | 5.13.8 | v5.13.8 | Fix GPS autoSelectMapSource + Fix SOS bloqué + SMS SOS | 2026-03-30 |
| 529 | 5.13.9 | v5.13.9 | Ghost tiles LOD (fin flash blanc) + prefetch LOD±1 idle + adaptive batch | 2026-03-30 |
| **530** | **5.14.0** | **v5.14.0** | **AbortController fetches tuiles + indicateur de chargement** | **2026-03-30** |
| 531 | 5.15.0 | v5.15.0 | Bugfixes altitude/IAP/LOD + OpenTopoMap LOD 6-10 + 2D/3D FAB + SOS + inclinomètre responsive | 2026-03-30 |
| 532 | 5.16.0 | v5.16.0 | Tutoriel onboarding 6 slides + bouton Aide dans Réglages | 2026-03-31 |
| 533 | 5.16.1 | v5.16.1 | ID Testeur dans Réglages + protocoles de test rapide & complet | 2026-03-31 |
| 534 | 5.16.2 | v5.16.2 | Fix bords du monde vides + bande vide LOD 11+ Schaffhausen/Tessin | 2026-03-31 |
| 535 | 5.16.3 | v5.16.3 | Fix root cause bande vide : bbox France lon < 9.6 → 8.3 + Corse séparée | 2026-03-31 |
| 536 | 5.16.4 | v5.16.4 | Fix scroll haut panneaux météo/solaire (race trapFocus 50ms) + scrollbars fines glassmorphism + fix HTML template settings (</div> orphelin → Sources & version invisibles) + 7-tap Pro tester implémenté + protocoles testeurs complets (15 parties) | 2026-03-31 |
| 537 | 5.16.5 | v5.16.5 | SHOW_STATS désactivé par défaut + section perf optionnelle (power user) dans protocoles + Google Form script corrigé (addScaleItem, addTextItem) | 2026-03-31 |
| 538 | 5.16.6 | v5.16.6 | fix: prix lifetime fallback 49.99→99.99 dans iapService.ts | 2026-03-31 |
| **539** | **5.16.7** | **v5.16.7** | **Audit Lighthouse 100/100/100 — a11y (aria-labels, focus-visible, contraste WCAG AA), SEO (meta-description, robots.txt, viewport), UI (touch targets 48px+, z-index, toggles/sliders agrandis)** | **2026-03-31** |
| **540** | **5.16.8** | **v5.16.8** | **GPU Adreno 730→performance, prix upgrade fix, eco masque 3D/timeline, tilt animation 2D↔3D, profil élévation tiroir swipe, fix orientation mobile** | **2026-03-31** |
| **541** | **5.17.0** | **v5.17.0** | **Audit dette technique + optimisations performance : i18n UpgradeSheet, shadow camera dynamique, spatial index O(1), shader eau early-exit, memory leaks fix, code mort supprimé** | **2026-04-01** |
| 542 | 5.18.0 | v5.18.0 | UX majeure : prix dynamiques localisés, recherche refonte (classification + montagnes Overpass + filtres), ground plane anti-blanc montagne, météo avec nom de lieu, inclinomètre toggle, boussole temps réel, redirect Play Store web, sheets fermeture au clic carte | 2026-04-01 |
| **543** | **5.19.0** | **v5.19.0** | **Caméra terrain-aware (LOD par hauteur au-dessus du sol, tilt caps dynamiques, flyTo adaptatif), protection anti-spam 429 MapTiler/OSM avec backoff, rotation de clés MapTiler distante via GitHub Gist** | **2026-04-01** |
| **544** | **5.19.1** | **v5.19.1** | **5 bugfixes UX (météo ville, soleil mondial, rotation viewport, REC GPS recovery, inclinomètre interactif), panels déplaçables (timeline/profil/coords-pill), backoff exponentiel Overpass** | **2026-04-01** |
| 545 | 5.19.2 | v5.19.2 | Panneau Pro refondu, fix prix RevenueCat, rotation clés MapTiler (GitHub Gist + enabled/disabled), protection anti-spam 429 (backoff geocoding/Overpass/tuiles), purge cache corrompues, terrain-aware LOD + tilt dynamique + flyTo adaptatif | 2026-04-01 |
| 546 | 5.19.3 | v5.19.3 | Fix timeline bloquée sous nav bar, ENERGY_SAVER forcé OFF pour performance/ultra, RANGE 5→6 preset high | 2026-04-01 |
| 547 | 5.19.4 | v5.19.4 | Stabilisation LOD (lerp pondéré + cooldown 800ms), résolution adaptative idle-only (plus de bandes blanches), geocoding 403 ne désactive plus MapTiler | 2026-04-01 |
| 548 | 5.19.5 | v5.19.5 | Perf: cache API worker (1x au lieu de 1x/tuile), isVisible/getAltitudeAt cachés par frame, suppression résolution adaptative (tuiles noires), revert skipNormalMap (tuiles noires 2D→3D) | 2026-04-02 |
| **549** | **5.19.6** | **v5.19.6** | **Tutoriel onboarding v2 : 8 slides (recherche, météo, REC GPS, outils d'analyse, offline), grilles verticales, responsive desktop/mobile, bump storage key v1→v2** | **2026-04-02** |
| 550 | 5.20.1 | v5.20.1 | Fix store listing confidentialité EN, bump versionCode | 2026-04-02 |
| **551** | **5.20.2** | **v5.20.2** | **Tuiles embarquées Europe LOD 5-7 + Suisse LOD 8-11 (PMTiles 20 MB), seed cache worker, backoff MapTiler 429, elevation fallback, roadmap Trail Intelligence → v6** | **2026-04-02** |
| **552** | **5.20.3** | **v5.20.3** | **Fix overlay sentiers mondial : couche IGN TRANSPORT.WANDERWEGE inexistante → Waymarked Trails OSM (GR, GRP, sentiers balisés), couverture mondiale** | **2026-04-02** |
| **553** | **5.21.0** | **v5.21.0** | **Packs Pays hors-ligne (PMTiles IAP) : Suisse + Alpes françaises, PacksSheet, packManager mount/unmount, iapService packs, catalog.json, skirt tuiles (fix joint blanc), sous-options settings, audit moteur 60fps mobile, tiltCap LOD 14** | **2026-04-02** |
| **554** | **5.21.1** | **v5.21.1** | **Fix packs offline critiques : OPFS download (FileSource sans réseau), catalog embarqué fallback, IS_OFFLINE guard après sources locales, suppression LOD gating Pro, PMTiles deux niveaux, fix i18n storageEmpty** | **2026-04-03** |
| **555** | **5.22.0** | **v5.22.0** | **Mode clair/sombre : sélecteur 3 options (Clair/Sombre/Auto), theme.ts, tokens CSS sémantiques (--canvas-*, --toast-*, --overlay-bg, --shadow-*), bloc [data-theme="light"], persistance themePreference, event themeChanged. Fix 9 tests stales (PRESETS v5.21 + ENERGY_SAVER non forcé).** | **2026-04-04** |
| **556** | **5.22.1** | **v5.22.1** | **Fix mode clair : preset ECO/STD/HIGH/ULTRA actif visible à l'ouverture des réglages (updateAllUI manquait PERFORMANCE_PRESET), timebar date+play lisibles (tokens CSS), SOS text var(--text), sélecteur thème rafraîchi via sheetOpened.** | **2026-04-04** |
| **557** | **5.22.2** | **v5.22.2** | **Audits qualité #1→#7 : fix Vitest bloqueur (afterEach pool:forks), @types/three aligné r160, icon_1024 PWA, data_extraction_rules Android 12+, merge géométries eau (1 draw call), canvas réutilisé vegetation, shadow frustum 50k→5k, buildings cache borné, prefers-reduced-motion CSS+JS, landmarks ARIA, skip-to-content, FABs i18n aria, privacy.html RGPD corrigée (GPS + tiers manquants)** | **2026-04-04** |
| **558** | **5.22.3** | **v5.22.3** | **Fix sentiers invisibles LOD 16-18 (Pro) : MAX_TRAIL_LOD 15 supprimé, plafonds par source — SwissTopo wanderwege Z18, Waymarked Trails Z17. Roadmap v6.4 sentiers vectoriels.** | **2026-04-04** |
| **559** | **5.23.0** | **v5.23.0** | **GPS natif background : RecordingService enregistre via FusedLocationProviderClient (indépendant WebView), WakeLock partiel, persistance getFilesDir(), appStateChange flush immédiat, merge JS+natif dédup 500ms, exemption batterie OEM, stopWithTask=false** | **2026-04-04** |
| **560** | **5.23.1** | **v5.23.1** | **Fix UX REC : suppression REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (ouvrait Settings Android au tap REC), retrait appel automatique — WakeLock seul suffisant. Compliance Play Store.** | **2026-04-04** |
| **561** | **5.23.2** | **v5.23.2** | **Fix bannière upsell post-REC : btn-go (width:100%) écrasait flex, texte s'affichait vertical — ajout solar-upsell-btn (width:auto; margin-top:0)** | **2026-04-04** |
| **562** | **5.23.3** | **v5.23.3** | **Roadmap brainstorming notifications (coucher soleil, batterie faible, anti-oubli REC, progression enrichie) + catalog pack Suisse v2 (lodRange 8-14, 716MB)** | **2026-04-04** |
| **563** | **5.23.4** | **v5.23.4** | **Fix recovery REC : prompt de restauration n'apparaissait pas au relancement (timing — recordingRecovered émis avant TrackSheet.render()). Vérification immédiate de recoveredPoints au render() + ouverture auto de la TrackSheet.** | **2026-04-04** |
| **564** | **5.23.5** | **v5.23.5** | **Bouton "Arrêter REC" dans la notification Android (BroadcastReceiver) + détection service natif orphelin au démarrage (native points sans snapshot localStorage)** | **2026-04-04** |
| 565 | 5.24.0 | v5.24.0 | Reprise transparente du REC après crash : si service natif encore actif au démarrage (isRunning()), recharge les points + réactive state.isRecording sans prompt (plus de "tracé importé" parasite). Prompt Restaurer/Supprimer réservé au cas service mort. | 2026-04-04 |
| 592 | 5.28.4 | v5.28.4 | SunTrail v5.28.4 Stable - Geo refactoring and draping unification | 2026-04-11 |
| 593 | 5.28.5 | v5.28.5 | Refonte complète des bâtiments 3D (échantillonnage multi-points, fondations adaptatives, visibilité étendue selon preset) | 2026-04-11 |
| 610 | 5.28.23 | — | Version de base avant fix double-tap | 2026-04-12 |
| 611 | 5.28.26 | v5.28.26 | Fix LOD/Range sliders limits in index.html | 2026-04-12 |
| 612 | 5.28.27 | v5.28.27 | **Double-tap to zoom**, zoomToPoint function, haptic feedback | 2026-04-12 |
| 613 | 5.28.27 | v5.28.27-rev2 | Tentative fix conflit versionCode (Échec : déjà utilisé) | 2026-04-12 |
| **650** | **5.28.27** | **v5.28.27-final** | Jump de sécurité (613+) pour résoudre conflits persistants Play Console | 2026-04-12 |
| **751** | **5.38.2** | **v5.38.2** | **Production (Tuiles + Gradle Fix)** | **2026-04-21** |
| **750** | **5.38.1** | **v5.38.1** | **GPS Robustness Stable** | **2026-04-21** |
| **730** | **5.32.14** | **v5.32.14-final** | **LOD audit, adaptive GPX, Anisotropy, Fix Profile 3D, Build Toolchain Fix** | **2026-04-19** |
| 727 | 5.32.14 | v5.32.14 | Audit LOD: Unified Geometries, Adaptive GPX Simplification, Anisotropic Filtering, Fix Profile Marker 3D | 2026-04-19 |
| 726 | 5.32.13 | v5.32.13 | Refined LOD Balance (tilt-aware), fixed scene.test.ts, i18n consolidation | 2026-04-19 |
| **712** | **5.31.2** | **v5.31.2** | **Fix notification (affichage forcé stats 0.00km + logs + réactivité 10s)** | **2026-04-18** |
| **711** | **5.31.1** | **v5.31.1** | **Fix notification 0km (unités) + Ajout dénivelé négatif (D-) dans la notification persistante Android** | **2026-04-18** |
| **710** | **5.31.0** | **v5.31.0** | **Stable release (Jump VersionCode 700 + consolidation polissage UI/UX)** | **2026-04-18** |
| **765** | **5.40.16** | **v5.40.16** | **Final Release Ready (Capacitor Config Fix)** | **2026-04-27** |
| **764** | **5.40.15** | **v5.40.15** | **Technical Cleanup & Worker Typing** | **2026-04-27** |
| **763** | **5.40.14** | **v5.40.14** | **Audit Google Play Store (App Name + Battery Perm removal)** | **2026-04-27** |
| **762** | **5.40.13** | **v5.40.13** | **Production (Correctif Signalétique Suisse)** | **2026-04-27** |
| 664 | 5.29.27 | v5.29.27 | Optimisations 2D Galaxy A53 et robustesse Zoom | 2026-04-16 |


> À compléter à chaque release. Ne jamais laisser ce tableau vide.

---

## 📐 Conventions de nommage

| Concept | Format | Exemple | Règle |
|---|---|---|---|
| `versionCode` | Entier séquentiel | `520` | +1 à chaque upload Play Console, jamais réutilisé |
| `versionName` | `X.Y.Z` | `5.13.0` | Version lisible, sans suffixe, visible dans l'app |
| Tag git | `vX.Y.Z` ou `vX.Y.Z-suffix` | `v5.13.0`, `v5.12.9-ct` | Doit commencer par `v` pour déclencher le CI |
| Branch | `main` | — | Toujours pusher sur main avant de tagger |

**Relation entre tag et versionCode :**
- Un même versionName peut avoir plusieurs tags si besoin (ex: bugfix mid-release)
- Mais chaque upload Play Console = nouveau versionCode, même si versionName reste identique
- Ex: `v5.12.9` (versionCode 518) et `v5.12.9-ct` (versionCode 519) ont le même versionName

**Tracks Play Console (noms français) :**
| Nom FR Play Console | Alias anglais | Usage |
|---|---|---|
| Tests internes | Internal Testing | Dev + proches ≤100, instantané |
| Tests fermés | Closed Testing / Alpha | 20+ testeurs, 14j obligatoires 1ère fois |
| Tests ouverts | Open Testing / Beta | Public avec lien |
| Production | Production | Tout le monde |

---

## 🔑 Secrets & Clés (jamais dans Git)

| Variable | Où | Usage |
|---|---|---|
| `VITE_MAPTILER_KEY` | `.env` + GitHub Secret | Tiles MapTiler bundlées |
| `VITE_REVENUECAT_KEY` | `.env` + GitHub Secret | IAP RevenueCat Android (`goog_`) |
| `KEYSTORE_BASE64` | GitHub Secret | Signature AAB |
| `STORE_PASSWORD` | GitHub Secret | Mot de passe keystore |
| `KEY_PASSWORD` | GitHub Secret | Mot de passe clé |
| `KEY_ALIAS` | GitHub Secret | `suntrail` |

**Fichiers locaux hors Git :**
- `android/suntrail.keystore` — sauvegarder hors repo (cloud chiffré)
- `android/keystore.properties` — contient les mots de passe en clair
- `.env` — contient toutes les clés API

---

## ⚙️ Build local (sans CI)

```bash
# 1. Build web
npm run build

# 2. Sync Capacitor
npx cap sync android

# 3. Build AAB signé
JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease --no-daemon
# (depuis android/)

# AAB généré dans :
# android/app/build/outputs/bundle/release/app-release.aab
```

---

## 🔗 RevenueCat — Configuration

| Paramètre | Valeur |
|---|---|
| Projet | SunTrail |
| App Android | `com.suntrail.threejs` |
| Entitlement | `SunTrail 3D Pro` |
| Offerings | monthly / yearly / lifetime |
| SDK key (Android) | `goog_uNvY...` (dans `.env`) |
| Service Account JSON | ✅ Configuré — lié dans RevenueCat → App Settings → Google Play |

---

## 📱 Tracks Play Store

| Track | Usage | Délai review |
|---|---|---|
| **Tests internes** | Toi + quelques proches (≤100) | Instantané |
| **Tests fermés** | 20+ testeurs, 14 jours obligatoires (1ère fois) | Instantané |
| **Open Testing** | Beta publique | Quelques heures |
| **Production** | Tout le monde | Quelques heures |

> Le passage Tests fermés → Production est obligatoire pour les nouveaux développeurs.
> Après la 1ère production, toutes les updates passent directement sans délai.

---

## ✅ Checklist avant chaque release production

- [ ] `versionCode` incrémenté dans `build.gradle`
- [ ] `npm run check` → 0 erreur TypeScript
- [ ] `npm test` → suite verte
- [ ] AAB buildé et signé par CI
- [ ] Testé sur appareil physique (Galaxy Tab S8 ou équivalent)
- [ ] Notes de version rédigées (FR + EN)
- [ ] Screenshots à jour si nouvelles features visuelles
