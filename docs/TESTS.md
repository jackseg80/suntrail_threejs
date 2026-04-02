# Infrastructure de Tests - SunTrail 3D

**Vitest** + **happy-dom** — 398 tests, 36 fichiers (v5.19.6)

## Comment lancer les tests

```bash
npm test              # Suite complète
npx vitest            # Mode watch (développement)
npx vitest run -t "nom du test"  # Un test spécifique
```

## Couverture des tests (398 tests — 36 fichiers)

### Terrain & Géographie (`terrain.test.ts`, `geo.test.ts`, `tileCache.test.ts`, `tileLoader.test.ts`, `tileSpatialIndex.test.ts`, `boundedCache.test.ts`)

- Conversion Mercator (Lng/Lat → tuiles, zoom 0 à 13)
- Décodage d'altitude RGB → mètres (MapTiler Terrain-RGB)
- Cache de tuiles LRU/FIFO, protection tuiles actives, `trimCache()`
- URLs de tuiles (SwissTopo, IGN, OSM, OpenTopoMap, overzooming)
- Sélection source par 4 coins (`isTileFullyInRegion()`)
- Index spatial des tuiles

### Navigation & Suivi (`location.test.ts`, `compass.test.ts`)

- Suivi GPS (interpolation 60 FPS, centrage haute précision)
- Boussole (filtre passe-bas, amortissement rotation, reset-to-North)

### Solaire & Analyse (`sun.test.ts`, `analysis.test.ts`, `solarAnalysis.test.ts`, `profile.test.ts`)

- Cycles jour/nuit (Heure Dorée, Heure Bleue, etc.)
- Sonde solaire (analyse d'horizon, cumul ensoleillement 24h)
- Profil d'élévation (D+/D-, pente, distance haversine)

### Performance & Workers (`workerManager.test.ts`, `memory.test.ts`, `materialPool.test.ts`, `performance.test.ts`)

- Pool de workers (init, tâches async, timeouts)
- Gestion mémoire (`disposeObject` VRAM récursif)
- Material pool (réutilisation shaders, reset textures/uniforms)
- Presets GPU (eco/balanced/performance/ultra), détection GPU, ENERGY_SAVER

### Environnement (`vegetation.test.ts`, `buildings.test.ts`, `weather.test.ts`, `weatherPro.test.ts`)

- Végétation (essences par altitude, placement déterministe)
- Bâtiments (fusion géométries, extrusion OSM)
- Météo (particules, physique vent, prévisions Pro 3 jours)

### État, UI & Composants (`state.test.ts`, `ui.test.ts`, `ReactiveState.test.ts`, `vramDashboard.test.ts`, `utils.test.ts`)

- State management (intégrité, versioning localStorage, presets)
- UI (panneaux, menus, modales SOS)
- Reactive State (Proxy récursif, souscriptions)
- VRAM Dashboard (seuils d'alerte, PerfRecorder buffer circulaire)

### i18n (`i18nService.test.ts`, `upgradeSheet.i18n.test.ts`)

- Service i18n (`t(key)`, fallback FR → clé brute, interpolation `{{var}}`)
- 4 langues (FR/DE/IT/EN), clés imbriquées
- Validation clés i18n UpgradeSheet (4 locales)

### Multi-GPX & Tracés (`gpxLayers.test.ts`, `recordedPoints.test.ts`)

- GPXLayer (import multi-fichiers, couleurs auto, toggle/remove)
- Terrain draping (densification ×4, clamping altitude)
- Enregistrement GPS (points, reset session)

### Réseau (`networkMonitor.test.ts`)

- Détection réseau event-driven (Capacitor + web fallback)
- Transitions online/offline, override manuel

### Accessibilité (`a11y.test.ts`)

- 13 tests WCAG 2.1 AA via axe-core (GPS Disclosure, NavigationBar, BottomSheet, FAB GPS, onboarding, settings)

### Divers (`eventBus.test.ts`, `geometryCache.test.ts`, `peaks.test.ts`)

- EventBus (émission, abonnement, désabonnement)
- Geometry Cache (réutilisation PlaneGeometry par résolution)
- Peaks (fetch/cache Overpass, filtrage par distance)

## Intégration Continue

Tests exécutés automatiquement via **GitHub Actions** à chaque push sur `main`. Si un test échoue, le déploiement est bloqué.
