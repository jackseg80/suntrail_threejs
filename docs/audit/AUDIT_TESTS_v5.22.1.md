# Audit #1 — Sante & Couverture des Tests — SunTrail v5.22.1
Date : 2026-04-04

---

## 1. Diagnostic Vitest

### Erreur exacte

```
Error: Vitest failed to find the current suite. One of the following is possible:
- "vitest" is imported directly without running "vitest" command
- "vitest" is imported inside "globalSetup" (to fix this, use "setupFiles" instead, because "globalSetup" runs in a different context)
- "vitest" is imported inside Vite / Vitest config file
- Otherwise, it might be a Vitest bug. Please report it to https://github.com/vitest-dev/vitest/issues

 > src/test/setup.ts:32:1
    30|
    31| // --- CLEANUP ---
    32| afterEach(() => {
      | ^
    33|   vi.clearAllMocks();
    34|   vi.clearAllTimers();
```

**36 suites echouent, 0 tests executes.** Le setup file empeche tout test de s'initialiser.

### Cause racine

**Incompatibilite Vitest v4.x avec `afterEach` dans un fichier `setupFiles`.**

La configuration dans `vite.config.ts` utilise :
- `pool: 'forks'` (isolation par processus forkes)
- `globals: true` (les fonctions Vitest sont disponibles comme globaux)
- `setupFiles: ['./src/test/setup.ts']`

Le fichier `src/test/setup.ts` fait un import explicite :
```ts
import { vi, afterEach } from 'vitest';
```

Depuis Vitest v4.x (le projet utilise v4.1.2), le comportement des `setupFiles` avec le pool `forks` a change. Les fichiers de setup sont executes dans un contexte d'initialisation **avant** que la suite de test soit creee. L'appel a `afterEach()` au top-level du fichier de setup tente de s'enregistrer aupres de la suite courante, mais il n'y en a pas encore a ce stade — d'ou l'erreur "failed to find the current suite".

Ce probleme est specifique a la combinaison `pool: 'forks'` + `afterEach` au top-level d'un `setupFiles`. Avec le pool par defaut (`threads`), le contexte est different et peut fonctionner. Le passage en Vitest 4.x a change le timing d'execution des setup files dans le pool `forks`.

### Fix recommande (2 options, par ordre de preference)

**Option A — Migrer le cleanup vers la config Vitest (recommande) :**

Dans `vite.config.ts`, ajouter `onTestFinished` ou utiliser `teardownTimeout`, et retirer `afterEach` du setup file :

```ts
// src/test/setup.ts — version corrigee
import { vi } from 'vitest';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) || null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value.toString())),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  key: vi.fn((i: number) => Array.from(storage.keys())[i] || null),
  get length() { return storage.size; }
};

vi.stubGlobal('localStorage', localStorageMock);

const originalRemove = window.removeEventListener;
window.removeEventListener = function(type: string, listener: any, options?: any) {
  try {
    originalRemove.call(this as any, type as any, listener, options);
  } catch (e) {}
};

if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn();
}
```

Puis dans `vite.config.ts`, utiliser `onTestFinished` via un plugin ou ajouter `clearMocks: true` et `clearTimers: true` dans la config test :

```ts
test: {
  environment: 'happy-dom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
  include: ['src/**/*.test.ts'],
  pool: 'forks',
  mockReset: false,
  clearMocks: true,   // equivalent a vi.clearAllMocks() apres chaque test
  restoreAllMocks: false,
}
```

Note : `clearMocks: true` dans la config Vitest est l'equivalent exact du `vi.clearAllMocks()` dans le `afterEach` actuel. Pour `vi.clearAllTimers()`, les tests individuels qui utilisent `vi.useFakeTimers()` appellent deja `vi.useRealTimers()` dans leurs propres `afterEach`.

**Option B — Changer le pool (rapide mais moins ideal) :**

Dans `vite.config.ts`, changer `pool: 'forks'` en `pool: 'threads'` ou retirer la ligne. Le commentaire dit "on desactive les threads pour eviter les corruptions memoire en CI", mais si le CI ne pose pas de probleme, c'est la solution la plus rapide.

**Option C — Revenir a Vitest 3.x :**

Downgrade `vitest` et `@vitest/ui` en `^3.0.0` dans `package.json`. Non recommande car bloque l'evolution.

---

## 2. Couverture par module

### 2.1 Modules `src/modules/*.ts` — Tableau de couverture

| # | Module | Test existant | Assertions (approx.) | Notes |
|---|--------|:------------:|:--------------------:|-------|
| 1 | `state.ts` | Oui | 38 | Presets, persistance save/load, valeurs defaut. Solide. |
| 2 | `eventBus.ts` | Oui | 4 | On/off/emit + payload. Correct mais basique — pas de `once()`. |
| 3 | `scene.ts` | **Non** | — | **CRITIQUE.** Render loop, needsUpdate, idle mode — zero couverture. |
| 4 | `terrain.ts` | Oui | 28 | Tile class, updateVisibleTiles, slopes, workers. Bon. |
| 5 | `tileLoader.ts` | Oui | 12 | URLs color/elevation/overlay. Couvre les sources carto. |
| 6 | `tileCache.ts` | Oui | 28 | LRU, FIFO, eviction, protection active tiles. Excellent. |
| 7 | `workerManager.ts` | Oui | 6 | Basique — structure verifiee, pas de vrai worker teste. |
| 8 | `geo.ts` | Oui | 10 | lngLatToWorld, worldToLngLat, getTileBounds. Bon round-trip. |
| 9 | `buildings.ts` | Oui | 3 | SHOW_BUILDINGS flag + zoom threshold. Tres superficiel. |
| 10 | `vegetation.ts` | Oui | 3 | Flag + forest creation. Assertion conditionnelle faible. |
| 11 | `hydrology.ts` | **Non** | — | Shader eau 3D — aucun test. |
| 12 | `weather.ts` | Oui | 13 | fetchWeather mock + extractLocationName (9 cas). Bon. |
| 13 | `weatherUtils.ts` | Indirect | 35 | Teste via `weatherPro.test.ts`. Bonne couverture. |
| 14 | `sun.ts` | Oui | 13 | Position, phases, shadow frustum, NaN. Bon. |
| 15 | `analysis.ts` | Oui | 1 | **Minimal.** Seul `getAltitudeAt(0,0)=0` teste. `runSolarProbe` est couvert par `solarAnalysis.test.ts`. |
| 16 | `compass.ts` | Oui | 2 | Init + resetToNorth. Correct. |
| 17 | `location.ts` | Oui | 10 | Marker, centerOnUser, heading, initial state. Bon. |
| 18 | `profile.ts` | Oui | 4 | haversineDistance + updateElevationProfile basique. |
| 19 | `peaks.ts` | Oui | 7 | Fetch + cache Overpass. Bon. |
| 20 | `poi.ts` | **Non** | — | Points d'interet — aucun test. |
| 21 | `touchControls.ts` | **Non** | — | **CRITIQUE.** Gestes tactiles complexes — zero couverture. |
| 22 | `performance.ts` | Oui | 29 | detectBestPreset, applyPreset, caps mobile. Excellent. |
| 23 | `materialPool.ts` | Oui | 8 | Acquire/release/reuse + shader cleanup. Bon. |
| 24 | `memory.ts` | Oui | 8 | disposeObject recursif + null safety. Bon. |
| 25 | `iap.ts` | **Non** | — | Interface IAP (showUpgradePrompt) — aucun test. |
| 26 | `iapService.ts` | **Non** | — | RevenueCat SDK — aucun test. |
| 27 | `networkMonitor.ts` | Indirect | 20 | Teste via `test/networkMonitor.test.ts`. Tres bon (failure/success/manual/eventBus). |
| 28 | `onboardingTutorial.ts` | **Non** | — | Tutoriel 8 slides — aucun test. |
| 29 | `ui.ts` | Oui | 1 | **Minimal.** Seul `state.uiVisible === true` teste. |
| 30 | `utils.ts` | Oui | 23 | Geo detection (CH/FR/Corse), toast, throttle. Bon. |
| 31 | `haptics.ts` | **Non** | — | Wrapper Capacitor — faible risque. |
| 32 | `boundedCache.ts` | Oui | 8 | Set/evict. Correct et complet. |
| 33 | `tileSpatialIndex.ts` | Oui | 13 | Insert/remove/query/large tiles. Excellent. |
| 34 | `geometryCache.ts` | Oui | 8 | Create/cache/dispose. Bon. |
| 35 | `foregroundService.ts` | **Non** | — | Service Android — faible risque en test unitaire. |
| 36 | `packTypes.ts` | **Non** | — | Types TS — pas besoin de test. |
| 37 | `packManager.ts` | **Non** | — | Gestion packs pays — aucun test. |
| 38 | `theme.ts` | **Non** | — | Theme switcher — aucun test. |
| 39 | `acceptanceWall.ts` | **Non** | — | Wall RGPD — aucun test. |
| 40 | `gpsDisclosure.ts` | **Non** | — | Modal GPS disclosure — aucun test. |

### 2.2 Sous-modules `src/modules/ui/`

| Module | Test existant | Assertions | Notes |
|--------|:------------:|:----------:|-------|
| `ui/core/BaseComponent.ts` | Oui | 10 | Hydrate, dispose, missing template/container. Bon. |
| `ui/core/ReactiveState.ts` | Oui | 15 | Subscribe, debounce, nested, unsubscribe. Excellent. |
| `ui/core/SheetManager.ts` | Oui | 28 | Open/close/toggle, ARIA, eventBus, Escape. Excellent. |
| `ui/components/` (15 fichiers) | **Non** | — | Aucun composant UI n'a de test unitaire. |

### 2.3 Autres fichiers de test (hors modules)

| Fichier | Assertions | Notes |
|---------|:----------:|-------|
| `test/a11y.test.ts` | 17 | Audit axe-core WCAG 2.1 AA. 6 composants testes. Bon. |
| `test/solarAnalysis.test.ts` | 28 | runSolarProbe + getMoonPhaseName. Tres complet (12 cas). |
| `test/weatherPro.test.ts` | 35 | UV, comfort, freezing, wind, daily/hourly. Excellent. |
| `test/upgradeSheet.i18n.test.ts` | 3 | Verification 23 cles x 4 locales. Utile pour regressions i18n. |
| `test/networkMonitor.test.ts` | 20 | Failure/success/manual override/eventBus. Tres bon. |
| `i18n/i18nService.test.ts` | 24 | Locales, interpolation, fallback, eventBus. Excellent. |

### 2.4 Compte total

- **36 fichiers de test**
- **~389 blocs `describe`/`it`/`test`** (comptage brut)
- **~545 assertions `expect()`**

---

## 3. Modules critiques non couverts

Par ordre de criticite decroissante :

| Priorite | Module | Risque | Justification |
|:--------:|--------|--------|---------------|
| **P0** | `scene.ts` | Eleve | Coeur du rendu : render loop, needsUpdate, idle throttle, flyTo. Un bug ici casse toute l'app. |
| **P0** | `touchControls.ts` | Eleve | Gestes tactiles Google Earth : pan, pinch, rotate, tilt. Experience utilisateur fondamentale. |
| **P1** | `iap.ts` / `iapService.ts` | Eleve | Monetisation RevenueCat. Un bug = perte de revenus ou achat fantome. |
| **P1** | `packManager.ts` | Moyen | Gestion des packs pays hors-ligne. Nouveau module critique pour la v5.21. |
| **P2** | `hydrology.ts` | Moyen | Shader eau 3D — visuellement important, difficile a tester en unit. |
| **P2** | `poi.ts` | Moyen | Points d'interet — fonctionnel visible. |
| **P2** | `ui/components/*` (15 fichiers) | Moyen | Aucun composant UI teste. Les tests a11y compensent partiellement. |
| **P3** | `onboardingTutorial.ts` | Faible | Tutoriel first-run — rare apres onboarding. |
| **P3** | `theme.ts` | Faible | Theme switcher — peu de logique. |
| **P3** | `gpsDisclosure.ts` / `acceptanceWall.ts` | Faible | Modals one-shot — couvertes par tests a11y manuels. |

---

## 4. Qualite des tests

### Points forts

1. **Couverture metier solide sur les modules carto** : `tileCache.ts` (eviction LRU, protection active tiles, trim), `tileSpatialIndex.ts` (spatial hashing, large tiles), `geo.ts` (round-trip projections). Ces tests sont precis, avec des valeurs calibrees sur des coordonnees suisses reelles.

2. **Tests de performance bien structures** : `performance.test.ts` couvre systematiquement les combinaisons UA (Android/iOS/Desktop) x preset x caps (SHADOW_RES, PIXEL_RATIO, RANGE). 29 assertions couvrant les regressions de la v5.11 et v5.21.

3. **i18n bien teste** : `i18nService.test.ts` + `upgradeSheet.i18n.test.ts` couvrent les 4 locales, interpolation, fallback, et la completude des cles de l'UpgradeSheet. Bonne protection contre les regressions de traduction.

4. **Tests d'accessibilite proactifs** : `a11y.test.ts` utilise axe-core pour WCAG 2.1 AA sur 6 composants. C'est rare et appreciable pour un projet mobile-first.

5. **networkMonitor exemplaire** : 20 assertions couvrant la detection offline par echecs consecutifs, le mode manuel, l'auto-restore, et les evenements eventBus. Modele a suivre.

6. **Mocks propres** : Les mocks Capacitor (`@capacitor/geolocation`, `@capacitor/network`), Three.js (`WebGLRenderer`), et les APIs externes (fetch, Open-Meteo, MapTiler) sont bien isoles et ne polluent pas les autres tests.

### Points faibles

1. **Tests coquilles vides** :
   - `analysis.test.ts` : 1 seule assertion (`getAltitudeAt(0,0) === 0`). Le module contient `runSolarProbe()` (teste ailleurs) mais aussi `getAltitudeAt()` qui meriterait des tests avec des tuiles simulees.
   - `ui.test.ts` : 1 seule assertion (`state.uiVisible === true`). L'orchestrateur UI complet n'a pratiquement aucune couverture.
   - `buildings.test.ts` : 3 assertions dont 1 triviale (`state.BUILDING_LIMIT = 50; expect(...).toBe(50)`).

2. **Test conditionnel faible dans `vegetation.test.ts`** :
   ```ts
   if (forest === null) {
       console.log("Note: Forest is null, checking detection logic in test...");
   } else {
       expect(forest).toBeInstanceOf(THREE.Group);
   }
   ```
   Ce pattern masque les echecs. Si `createForestForTile` retourne toujours `null`, le test passe silencieusement.

3. **workerManager.test.ts superficiel** : Teste la structure de retour (`promise`, `taskId`) mais ne verifie aucun comportement reel de la pool de workers, du timeout, ou de l'annulation.

### Patterns problematiques

1. **`as any` casts (25 occurrences dans les tests)** :
   - 10 dans `vramDashboard.test.ts` (`(state as any).renderer`, `(state as any).PERFORMANCE_PRESET`, etc.)
   - 4 dans `sun.test.ts` (`state.controls = { ... } as any`)
   - 3 dans `vegetation.test.ts`, 2 dans `location.test.ts`
   
   Les casts `as any` sur `state` suggerent que le type de `state` n'expose pas tous les champs necessaires ou que les mocks sont incomplets. Un type `PartialState` ou des factory helpers seraient plus surs.

2. **`@ts-ignore` (1 occurrence)** :
   - `terrain.test.ts:181` pour un spy sur `import('./geo')`. Mineur.

3. **Tests dupliques** :
   - `lngLatToTile(7.6617, 46.6863, 13)` est teste dans **`geo.test.ts:8`** ET **`terrain.test.ts:22`** avec exactement les memes valeurs et assertions. L'un des deux devrait etre supprime (garder `geo.test.ts`).

4. **Aucun test `skip` ou `todo`** : Bonne nouvelle — aucun test n'est marque `.skip` ou `.todo`. Tous les tests defiles sont censes s'executer.

5. **Pas de test d'integration** : Tous les tests sont unitaires. Il n'y a aucun test verifiant l'interaction entre modules (ex: terrain + tileLoader + tileCache ensemble, ou scene + sun + weather en render loop).

---

## 5. Recommandations priorisees

### Priorite Immediate (bloquant)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Corriger le setup Vitest** : Retirer `afterEach` de `setup.ts`, ajouter `clearMocks: true` dans la config test. Valider que les 36 suites passent a nouveau. | 15 min | **Debloque les 389 tests** |

### Priorite Haute (v5.23)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 2 | **Ajouter des tests pour `scene.ts`** : render loop, `needsUpdate` conditions (`isFlyingTo`, `isFollowingUser`, `controlsDirty`), idle mode, setSize avec 3e param `false`. | 2-3h | Protege le coeur du rendu |
| 3 | **Ajouter des tests pour `touchControls.ts`** : pan delta, pinch zoom factor, rotation, tilt limits, inertia. Simuler via `PointerEvent`. | 2-3h | Protege l'UX tactile |
| 4 | **Etoffer `buildings.test.ts`** : Tester le fetch MapTiler/Overpass mocke, le centroide, la limite distancielle, le cache partage. | 1h | Couvre le recemment fixe (v5.22.1) |
| 5 | **Etoffer `ui.test.ts`** ou le supprimer : Le test actuel (1 assertion triviale) donne une fausse impression de couverture. Soit tester `initUI()` reellement, soit supprimer. | 1h | Honnete sur la couverture reelle |

### Priorite Moyenne (v5.24+)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 6 | **Ajouter des tests pour `iap.ts`/`iapService.ts`** : Mock RevenueCat, tester les feature gates, la restauration d'achats, les erreurs reseau. | 2h | Protege la monetisation |
| 7 | **Ajouter des tests pour `packManager.ts`** : Download, OPFS storage, catalog, IS_OFFLINE guard. | 2h | Protege le mode hors-ligne |
| 8 | **Corriger le test conditionnel `vegetation.test.ts`** : Remplacer le `if/else` par un mock deterministe qui garantit la generation de foret. | 30 min | Elimine un faux positif |
| 9 | **Supprimer le test duplique `lngLatToTile`** dans `terrain.test.ts` (lignes 21-34) — deja couvert par `geo.test.ts`. | 5 min | Reduit la confusion |
| 10 | **Reduire les `as any`** : Creer des helpers de factory (`createMockState()`, `createMockRenderer()`) pour typer proprement les mocks de `state`. | 1h | Ameliore la maintenabilite |

### Priorite Basse (backlog)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 11 | Ajouter des tests pour les 15 composants `ui/components/` | 4-6h | Couverture UI |
| 12 | Ajouter au moins 1 test d'integration (terrain + tileLoader + tileCache) | 2h | Confiance end-to-end |
| 13 | Activer la couverture (`vitest --coverage`) et ajouter un seuil dans le CI | 1h | Metrics automatisees |
| 14 | Tester `hydrology.ts` (shader output si possible) | 1h | Couverture rendu eau |

---

## 6. Resume executif

| Metrique | Valeur |
|----------|--------|
| Suites de test | 36 |
| Tests declares | ~389 |
| Assertions | ~545 |
| Tests executables | **0** (bloques par bug setup) |
| Modules avec tests | 25 / 40 (63%) |
| Modules critiques sans test | 2 (`scene.ts`, `touchControls.ts`) |
| `as any` dans les tests | 25 occurrences |
| Tests dupliques identifies | 1 (`lngLatToTile`) |
| Tests conditionnel masquant un echec | 1 (`vegetation.ts`) |
| Temps estime pour corriger le blocage | **15 minutes** |
| Temps estime pour combler les lacunes P0-P1 | **8-10 heures** |

**Verdict** : La suite de tests est quantitativement correcte (~389 tests, 545 assertions) et qualitativement bonne sur les modules carto/perf/i18n. Cependant, elle est **entierement inutilisable** depuis la mise a jour Vitest 4.x a cause d'un seul `afterEach` dans le fichier de setup. La correction est triviale (15 min). Les lacunes structurelles (scene.ts, touchControls.ts, IAP) representent un risque reel mais gerent pour la v5.23.
