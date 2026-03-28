# Infrastructure de Tests - SunTrail Three.js

Cette application utilise désormais **Vitest** et **JSDOM** pour garantir la stabilité du moteur 3D et des calculs géographiques.

## 🚀 Comment lancer les tests

Pour exécuter la suite de tests complète :
```bash
npm test
```

Pour lancer les tests en mode "watch" (pendant le développement) :
```bash
npx vitest
```

## 📊 Couverture des tests (188 tests validés — v5.11.0)

### 🌍 Terrain & Géographie (`terrain.test.ts`, `geo.test.ts`, `tileCache.test.ts`, `tileLoader.test.ts`)
- **Conversion Mercator** : Validation des calculs Lng/Lat vers tuiles (zoom 0 à 13).
- **Décodage d'Altitude** : Vérification de la formule RGB -> Mètres (MapTiler).
- **Cache de Tuiles** : LRU/FIFO, taille max par preset, `trimCache()` purge immédiate.
- **URLs de tuiles** : Génération correcte pour SwissTopo, IGN, OSM, overzooming.
- **Projections Spatiales** : Calcul des positions monde relatives.

### 🧭 Navigation & Suivi (`location.test.ts`, `compass.test.ts`)
- **Suivi GPS** : Interpolation 60 FPS et centrage haute précision.
- **Boussole Swisstopo** : Filtre passe-bas et amortissement de rotation.
- **Anti-Collision** : Sécurité de la caméra par rapport au relief.

### ☀️ Système Solaire & Analyse (`sun.test.ts`, `analysis.test.ts`, `profile.test.ts`)
- **Cycles Jour/Nuit** : Phases (Heure Dorée, Heure Bleue, etc.) et éclairage dynamique.
- **Sonde Solaire** : Analyse d'horizon et cumul d'ensoleillement sur 24h.
- **Profil d'Élévation** : Calcul du dénivelé + / - par layer GPX.

### 🚀 Performance & Workers (`workerManager.test.ts`, `memory.test.ts`, `materialPool.test.ts`, `performance.test.ts`)
- **Pool de Workers** : Initialisation et gestion asynchrone des tâches, timeouts.
- **Gestion Mémoire** : Nettoyage VRAM récursif via `disposeObject`.
- **Material Pool** : Réutilisation des shaders, reset des textures et uniforms.
- **Presets** : Valeurs recalibrées par tier mobile (eco/balanced/performance/ultra), détection GPU, ENERGY_SAVER universel mobile, caps Ultra mobile (shadow 2048, RANGE 8).

### 🌲 Environnement & Urbanisme (`vegetation.test.ts`, `buildings.test.ts`, `weather.test.ts`)
- **Végétation** : Sélection des essences par altitude.
- **Bâtiments** : Fusion de géométries et extrusion OSM.
- **Météo** : Moteur de particules et physique du vent.

### ⚙️ État, UI & Composants (`state.test.ts`, `ui.test.ts`, `ReactiveState.test.ts`, `BaseComponent.test.ts`)
- **State Management** : Intégrité de l'état global, versioning localStorage, presets.
- **UI** : Gestion des panneaux, menus et modales SOS.
- **Reactive State** : Proxy JS récursif, souscriptions, abonnements composants.
- **Base Component** : Cycle de vie, hydratation templates, nettoyage abonnements.

### 🌐 i18n (`i18nService.test.ts`) — 14 tests
- **Service i18n** : `t(key)`, fallback FR → clé brute, interpolation `{{var}}`.
- **4 langues** : FR/DE/IT/EN, résolution clés imbriquées.

### 🗺️ Multi-GPX & Tracés (`gpxLayers.test.ts`) — 9 tests
- **GPXLayer** : Import multi-fichiers, couleurs auto, toggle/remove.
- **Terrain Draping** : Densification ×4 + clamping sur altitude réelle.

### 📊 Dashboard VRAM & PerfRecorder (`vramDashboard.test.ts`) — 17 tests
- **VRAM Dashboard** : Seuils d'alerte par preset, cooldown 30s, toggle visibility.
- **PerfRecorder** : Buffer circulaire 600 samples, start/stop/export, métadonnées session.

### ♿ Accessibilité (`a11y.test.ts`) — 7 tests
- **axe-core** : 7 tests WCAG 2.1 AA — GPS Disclosure, NavigationBar, BottomSheet, FAB GPS.

### 📦 Divers (`eventBus.test.ts`, `recordedPoints.test.ts`, `geometryCache.test.ts`, `peaks.test.ts`, `utils.test.ts`)
- **EventBus** : Émission, abonnement, désabonnement.
- **Live Tracking** : Enregistrement de points GPS, reset session.
- **Geometry Cache** : Réutilisation des PlaneGeometry par résolution.
- **Peaks** : Fetch et cache Overpass API, filtrage par distance.

## 🤖 Intégration Continue (CI)

Les tests sont automatiquement exécutés via **GitHub Actions** à chaque push sur la branche `main`. Si un test échoue, le déploiement sur GitHub Pages est automatiquement bloqué pour éviter toute régression en production.
