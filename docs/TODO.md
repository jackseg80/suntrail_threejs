# SunTrail 3D - Roadmap Révisée (v5.10.0)

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

## 🌐 Priorité 4 : Expansion & Multi-GPX (v5.10) — EN COURS 🚧
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

> ⚠️ **Dette connue** : Les ~60 strings statiques dans `index.html` (templates HTML) ne sont pas encore traduites. Voir Sprint 1-bis.

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
- [x] **`VRAMDashboard`** : Panel monospace (géométries, textures, draw calls, triangles, tuiles actives, workers) dans Paramètres Avancés.
- [x] **Seuils d'alerte** : Toast ⚠️ si textures > limite profil (eco=50, balanced=150, perf=300, ultra=500) — cooldown 30s.
- [x] **Toggle** : Checkbox dans `<details>` Paramètres Avancés → `state.vramPanel.toggle()`.
- [x] **10 tests** `vramDashboard.test.ts` — seuils, cooldown, toggle, formatTriangles.

### Sprint 4 — Tests & Qualité v5.10 ✅ TERMINÉ
- [x] **145/145 tests** — objectif 140+ atteint ✅
- [x] **Tests i18n** : 14 tests ✅
- [x] **Tests Multi-GPX** : 9 tests ✅
- [x] **Tests VRAM Dashboard** : 10 tests ✅
- [x] **Fix tileLoader.test.ts** : Signature `getElevationUrl` → `{url, sourceZoom}` (v5.8.17) ✅
- [x] **`npm run check`** : 0 erreurs TypeScript ✅

---

## 🏁 Priorité 4-bis : Audit Production & Google Play Store (v5.10-RC)
*Objectif : Version déployable sur Google Play Store. À faire APRÈS les 4 sprints de v5.10.*

### A. Android / Build Release
- [ ] **targetSdk 35** : Mettre à jour `build.gradle` (actuellement 36, vérifier compatibilité Capacitor 8.2 ✅).
- [ ] **Support 16 KB page size** : Activer `android.zipAlign.16KB=true` dans `gradle.properties` (obligatoire depuis Nov 2025 pour Android 15+).
- [ ] **Keystore Release** : Générer `suntrail.keystore`, sécuriser hors Git, configurer `signingConfigs.release` dans `build.gradle`.
- [ ] **R8/ProGuard** : Activer `minifyEnabled true` + `shrinkResources true` en release, écrire `proguard-rules.pro` pour Capacitor.
- [ ] **AAB Build** : Valider `./gradlew bundleRelease` — Play Store n'accepte pas d'APK.
- [ ] **versionCode/versionName** : Bumper à `versionCode: 510`, `versionName: "5.10.0"`.
- [ ] **Edge-to-Edge** : targetSdk 35 force le mode edge-to-edge Android — vérifier l'UI (bottom nav, status bar).

### B. Légal & Play Console
- [ ] **Privacy Policy** : Créer page (GitHub Pages ou domaine) détaillant collecte GPS, export GPX, APIs tierces (MapTiler, SwissTopo, IGN, OSM), pas de serveur SunTrail.
- [ ] **Section Data Safety** : Remplir dans Play Console — localisation précise (foreground), pas de partage tiers, données sur appareil uniquement.
- [ ] **Content Rating (IARC)** : Questionnaire Play Console — cible "Tout public".
- [ ] **Vérification identité développeur** : Biométrique (particulier) ou D-U-N-S (entreprise) — délai jusqu'à 30 jours, à lancer en avance.
- [ ] **Prominent Disclosure Localisation** : Modale explicative AVANT la demande de permission GPS (obligatoire Play Store).

### C. Audit Performances
- [ ] **Lighthouse** : Score ≥ 90 Performance, ≥ 90 Accessibility, ≥ 90 Best Practices — sur build de production.
- [ ] **Core Web Vitals** : LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- [ ] **Memory Leak Audit** : Profiler Android Studio sur 1h de navigation — vérifier `disposeObject()` exhaustivité.
- [ ] **Battery Test** : 1h d'utilisation continue preset Balanced — mesurer drain batterie.
- [ ] **Content Security Policy** : Ajouter header CSP dans `index.html` (actuellement absent).

### D. Audit Accessibilité
- [ ] **TalkBack** : Navigation complète de l'app avec TalkBack activé — tous les éléments interactifs annoncés.
- [ ] **Touch Targets** : Vérifier que tous les boutons font ≥ 48×48dp (Accessibility Scanner Google).
- [ ] **Contrastes** : Ratio ≥ 4.5:1 sur tous les textes — vérifier glassmorphism + texte blanc.
- [ ] **axe-core** : Intégrer dans les tests Vitest pour audit a11y automatisé.

### E. Audit Code & Sécurité
- [ ] **`npm run check`** : 0 erreur TypeScript strict — résoudre tous les `@ts-ignore` résiduels.
- [ ] **Dépendances obsolètes** : `npm audit` — résoudre vulnerabilités critiques/hautes.
- [ ] **gpxParser** : Vérifier maintenance active (actuellement `@ts-ignore` sur l'import) — évaluer remplacement si abandonné.
- [ ] **API Keys** : Confirmer que `state.MK` n'est jamais loggué/exporté dans les builds release.
- [ ] **Service Worker** : Audit de la stratégie de cache Workbox — invalider le cache proprement lors de mise à jour de version.

### F. Play Store Listing
- [ ] **Closed Testing (14 jours)** : Créer track Closed Testing avec ≥ 20 testeurs — obligatoire pour nouveaux développeurs.
- [ ] **Screenshots** : Préparer captures pour tous les form factors (phone portrait, tablet).
- [ ] **Feature Graphic** : Visuel 1024×500px.
- [ ] **Descriptions** : Courte (80 cars max) + longue optimisée SEO, en FR + EN minimum.
- [ ] **CI/CD** : Configurer GitHub Actions pour build AAB automatique sur chaque tag de release.

## 🔗 Priorité 5 : Intégrations Plateformes Sport (v5.11)
*Impact : Import naturel des tracés depuis les outils que les randonneurs utilisent déjà.*

- [ ] **Strava** : Import des activités via OAuth + API Strava. Synchronisation automatique des nouveaux tracés.
- [ ] **Komoot** : Import des tours planifiés et réalisés via API Komoot.
- [ ] **Garmin Connect** : Sync des activités et waypoints via API Garmin Health.
- [ ] **Suunto / Polar / Apple Health** : Évaluer la faisabilité et la priorité selon l'audience cible.
- [ ] **Format FIT natif** : Lecture directe des fichiers `.fit` (Garmin) en plus du GPX.

## 📊 Priorité 6 : Analyse Données Sport Avancée (v6.x — à définir ensemble)
*Impact : Transformer SunTrail en outil d'analyse de performance, pas seulement de visualisation.*

> ⚠️ **À co-concevoir** : Le périmètre exact est à affiner ensemble avant implémentation.

- [ ] **Overlay Fréquence Cardiaque** : Colorisation du tracé selon les zones cardiaques (Z1–Z5).
- [ ] **Corrélation Terrain / Effort** : Croisement pente, altitude, vitesse et données physiologiques.
- [ ] **Données Montre** : Import HR, SpO2, cadence, puissance depuis montres (Garmin, Apple Watch, Polar…).
- [ ] **Analyse Post-Effort** : Dashboard récapitulatif par segment (VAM, dénivelé/bpm, zones d'effort).
- [ ] **À définir ensemble** : Format des données entrantes, profondeur de l'analyse, UX de visualisation.

## 🚀 Priorité 7 : La Révolution AR (v6.0)
*Impact : Immersion totale et aide à l'orientation futuriste.*

- [ ] **Moteur AR Natif** : Superposition du moteur 3D sur le flux caméra via Capacitor.
- [ ] **Occlusion Topographique** : Masquage des étiquettes derrière le relief réel.

## ⏳ Backlog & Recherche (Indéfini)
- [ ] **Waypoints & Partage** : Marquage personnel et Deep Linking (URL synchronisée).
- [ ] **Mode Nuit Avancé** : Pollution lumineuse urbaine (NASA).
- [x] **v5.6.8** : Détection Galaxy A53 (Mali GPU) et réglages par défaut sécurisés.
- [x] **v5.5.15** : Suivi GPS haute précision et lissage Swisstopo style.
- [x] **v5.4.7** : Fusion de géométrie bâtiments RTX (144 FPS).
