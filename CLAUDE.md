# SunTrail — Guide IA (v5.22.0)

> Ce fichier est le **point d'entrée unique** pour tous les agents IA (Claude, Gemini, Copilot).
> Il contient les règles essentielles. Les détails sont dans les docs liées en bas de page.

## Projet

App cartographique 3D mobile-first pour la randonnée alpine.
Android natif (Capacitor) + PWA. Freemium (RevenueCat). 4 langues (FR/DE/IT/EN).

**Stack** : TypeScript strict · Three.js r160 · Vite 5 · Capacitor 6 · Vitest (399 tests) · RevenueCat

## Commandes

| Commande                 | Usage                                                     |
| ------------------------ | --------------------------------------------------------- |
| `npm run dev`            | Serveur Vite local (HMR)                                  |
| `npm run check`          | TypeScript strict (`tsc --noEmit`)                        |
| `npm test`               | Suite Vitest (398+ tests)                                 |
| `npm run build`          | Build production (Terser, code splitting)                 |
| `npm run deploy`         | `check` + `build` + `cap sync` (avant mobile)             |
| `npm run build-overview` | Génère `public/tiles/europe-overview.pmtiles` (one-shot)  |

## ⚠️ Règles Critiques

Ces règles sont le fruit d'heures de débogage. Les enfreindre cause des régressions graves.

### Rendu & Performance

- **`renderer.setSize(w, h, false)`** — TOUJOURS le 3ème param `false`. Sans lui, le canvas déborde après rotation → WebView zoom-out la page.
- **Ne JAMAIS toucher `<meta viewport>` en JS** — aggrave le bug UI minuscule sur Android WebView.
- **Accumulateurs eau/météo AVANT les return guards** dans `renderLoopFn` — sinon eau/météo à 2-3fps au lieu de 20fps.
- **`rebuildActiveTiles()` pour toggle 2D/3D**, JAMAIS `resetTerrain()` — détruit les matériaux GPU → pool vide → damier noir.
- **`isFlyingTo` et `isFollowingUser` = conditions standalone** dans `needsUpdate` — ne jamais coupler à `controlsDirty`.
- **Tout mouvement continu exempté de `isIdleMode`** — `isFlyingTo`, `isFollowingUser`, et tout futur état similaire.
- **Ne JAMAIS `tile.dispose()` immédiatement** sur un changement de LOD — utiliser les ghost tiles (fondu 1.2s).

### Sources Cartographiques

- **Sélection par 4 coins** (`isTileFullyInRegion()`) pour SwissTopo/IGN — jamais par centre seul.
- **OpenTopoMap pour LOD ≤ 10** — ne jamais appeler MapTiler à ces zooms (429 → désactivation globale).
- **`preloadChOverviewTiles()` = no-op** — ne jamais réactiver (violation politique OSM).

### Architecture

- **Réaffectation obligatoire pour les tableaux réactifs** — `state.arr = [...state.arr, item]` (Proxy ne détecte pas `.push()`).
- **Pattern EventBus pour logique d'ouverture de sheet** — ne jamais coupler à un bouton spécifique.
- **`state.isFlyingTo = true` bloque l'origin shift** — coordonnées dans la closure seraient stales sinon.

### Sécurité & Monétisation

- **Alertes sécurité TOUJOURS gratuites** — jamais derrière `state.isPro` (avalanche, windchill, nuit, orage, chaleur, visibilité, batterie).
- **Ne jamais gater la sauvegarde auto du REC GPS** — l'utilisateur perdrait ses données.
- **`MAX_ALLOWED_ZOOM` = valeur native du preset** — ne jamais l'écraser à 14 pour les gratuits. Le gate est dynamique dans `scene.ts`/`terrain.ts`.

### CSS & UI

- **Design tokens** (`--space-*`, `--text-*`, `--radius-*`) — jamais de valeurs hardcodées.
- **Jamais de `style.cssText`** ou inline styles hardcodés — utiliser les classes CSS namespaced.

## Conventions

| Aspect              | Convention                                                    |
|---------------------|---------------------------------------------------------------|
| Variables/fonctions | anglais (`camelCase`) |
| Classes | anglais (`PascalCase`) |
| Commentaires | français ou anglais selon contexte |
| UI/i18n | français par défaut, 4 locales (`src/i18n/locales/`) |
| Commits | `feat(scope):`, `fix(scope):`, `chore(scope):` |
| CSS | design tokens, glassmorphism (`--glass-*`), jamais de valeurs inline |
| Haptics | `void haptic('medium')` sur swipes/confirmations seulement, PAS sur clics |

## i18n

- 4 locales : `fr` (défaut), `de`, `it`, `en` — fichiers JSON dans `src/i18n/locales/`
- API : `i18n.t('key')`, interpolation `{{var}}`, clés imbriquées (notation pointée)
- Fallback : locale courante → `fr` → clé brute
- DOM : `data-i18n="key"` — re-traduit auto via `eventBus.on('localeChanged')`
- Ajout : ajouter dans les 4 fichiers JSON (minimum `fr.json`)

## Structure du Projet

```text
src/
├── main.ts                     # Point d'entrée — PWA SW, recovery REC, initUI()
├── style.css                   # Styles globaux (design tokens, glassmorphism)
├── i18n/                       # Service i18n + locales/ (fr, de, it, en)
├── modules/
│   ├── state.ts                # État global réactif (Proxy récursif)
│   ├── eventBus.ts             # Pub/sub transversal
│   ├── scene.ts                # Scène Three.js, render loop, needsUpdate
│   ├── terrain.ts              # Génération terrain, tuiles, LOD
│   ├── tileLoader.ts           # Fetch tuiles, sources carto, PMTiles embarqué
│   ├── tileCache.ts            # Cache LRU avec protection tuiles actives
│   ├── workerManager.ts        # Pool de workers (4 mobile / 8 desktop)
│   ├── geo.ts                  # Web Mercator, conversions coordonnées
│   ├── buildings.ts            # Bâtiments 3D (MapTiler + Overpass)
│   ├── vegetation.ts           # Forêts bio-fidèles (InstancedMesh)
│   ├── hydrology.ts            # Eau 3D (shader vagues)
│   ├── weather.ts              # Météo Open-Meteo + particules shader
│   ├── sun.ts                  # Position solaire, ombres directionnelles
│   ├── analysis.ts             # Analyse solaire (runSolarProbe)
│   ├── compass.ts              # Boussole 3D (Three.js 120px)
│   ├── location.ts             # GPS Capacitor, marqueur, REC
│   ├── profile.ts              # Profil d'élévation SVG interactif
│   ├── peaks.ts                # Sommets Overpass (cache 7j)
│   ├── poi.ts                  # Points d'intérêt
│   ├── touchControls.ts        # Gestes tactiles Google Earth (PointerEvents)
│   ├── performance.ts          # Presets GPU, détection, applyPreset()
│   ├── materialPool.ts         # Réutilisation shaders Three.js
│   ├── memory.ts               # disposeObject() — libération VRAM
│   ├── iap.ts                  # Interface IAP (showUpgradePrompt)
│   ├── iapService.ts           # RevenueCat SDK
│   ├── networkMonitor.ts       # Détection réseau event-driven
│   ├── onboardingTutorial.ts   # Tutoriel 8 slides
│   ├── ui.ts                   # Orchestrateur UI principal
│   └── ui/
│       ├── core/               # BaseComponent, ReactiveState, SheetManager
│       ├── draggablePanel.ts   # Helper drag repositionnable
│       └── components/         # NavigationBar, SearchSheet, SettingsSheet, etc.
├── workers/
│   └── tileWorker.ts           # Fetch + Normal Maps async
└── test/                       # 398+ tests Vitest
scripts/
└── build-overview-tiles.ts     # Génération europe-overview.pmtiles (one-shot)
public/tiles/
└── europe-overview.pmtiles     # ~20 MB, LOD 5-7 Europe + LOD 8-11 Suisse (gitignored)
```

## Calculs de Distance & GPS

### Formule utilisée
**Haversine** — précision < 0.5% pour les distances de randonnée (vs 44% d'erreur avec l'ancienne formule planaire).

```typescript
// src/modules/profile.ts
const R = 6371; // Rayon Terre en km
const dLat = (lat2 - lat1) * Math.PI / 180;
const dLon = (lon2 - lon1) * Math.PI / 180;
const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
```

### Comparaison avec Garmin (Fenix 7)

| Aspect | Garmin Fenix 7 | SunTrail (notre approche) |
|--------|---------------|---------------------------|
| **Formule distance** | Vincenty ou Haversine (selon firmware) | **Haversine** (choix pragmatique) |
| **Précision** | ~0.5% (Vincenty plus précis pour longues distances) | **<0.5%** (suffisant pour randonnée <50km) |
| **Performance** | Optimisé C++ sur hardware dédié | TypeScript, mais OK pour usage mobile |
| **Lissage altitude** | Kalman filter + baromètre | **Moyenne mobile 3 pts** (simplifié) |
| **D+ calcul** | Algo propriétaire (fusion GPS + baro) | **Haversine + lissage altitude** |

**Pourquoi Haversine et pas Vincenty ?**
- Vincenty est plus précis (0.5mm vs 0.5% pour Haversine) mais **500x plus lent**
- Pour des randonnées <50km, la différence est négligeable (~2m sur 10km)
- Haversine suffit largement pour l'usage visé

**Pourquoi pas de baromètre ?**
- Tous les téléphones n'ont pas de baromètre
- GPS + lissage donne des résultats acceptables pour D+

### Lissage altitude (D+/D-)
Moyenne mobile sur 3 points pour réduire le bruit GPS vertical (qui gonfle artificiellement le D+).

```typescript
// src/modules/terrain.ts et TrackSheet.ts
const smoothedAlts = points.map((p, i) => {
  if (i === 0 || i === points.length - 1) return p.alt;
  return (points[i-1].alt + p.alt + points[i+1].alt) / 3;
});
```

### Coherence des stats
- **Panneau Parcours** : Calcule avec `state.recordedPoints` (dédoublonné)
- **Tracés importés** : Même calcul Haversine + lissage
- **Profil d'élévation** : Distance 3D corrigée par ratio pour afficher la même valeur

⚠️ **IMPORTANT** : Le dédoublonnage par timestamp est crucial — sans lui, les doublons faussent la distance.

### Filtrage GPS natif (Android)

**Dans RecordingService.java**, filtres appliqués avant insertion :
- **Précision** : >50m rejeté
- **Vitesse** : >54km/h rejeté (impossible à pied)
- **Distance min** : <3m rejeté (jitter)
- **Temps min** : <1s entre points (rafales OEM)
- **Altitude** : -500m à 9000m (hors plage = rejeté)

Ces filtres sont **plus stricts que Garmin** (qui garde plus de points bruts).

## Documentation Détaillée

Consulter selon le contexte de la tâche :

| Document                   | Quand le consulter                                                                    |
|----------------------------|---------------------------------------------------------------------------------------|
| [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Architecture core, état réactif, composants UI, sources carto, moteur de tuiles, données & APIs |
| [docs/AI_PERFORMANCE.md](docs/AI_PERFORMANCE.md) | Render loop, energy saver, presets GPU, idle throttle, optimisations mobile |
| [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md) | Caméra, touch controls Google Earth, GPS, modules fonctionnels (recherche, météo, solaire, profil, etc.) |
| [docs/AI_DEBUGGING.md](docs/AI_DEBUGGING.md) | Tableau symptôme → cause → solution (50+ entrées — consulter en cas de bug) |
| [docs/AI_MONETIZATION.md](docs/AI_MONETIZATION.md) | Freemium, IAP RevenueCat, feature gates, rotation clés MapTiler, anti-spam API |
| [docs/RELEASE.md](docs/RELEASE.md) | Workflow de publication, historique versionCode, conventions de nommage |
| [docs/MONETIZATION.md](docs/MONETIZATION.md) | Stratégie business, prix, concurrence, décisions actées |
| [docs/ROADMAP_TRAIL_INTELLIGENCE.md](docs/ROADMAP_TRAIL_INTELLIGENCE.md) | Roadmap module analyse v6.0→v6.3, split Free/Pro |
