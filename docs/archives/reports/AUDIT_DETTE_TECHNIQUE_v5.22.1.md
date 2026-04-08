# Audit #6 -- Dette Technique -- SunTrail v5.22.1
Date : 2026-04-04

Fichiers analyses : ~100 fichiers TypeScript dans `src/`
Tests analyses : 36 fichiers de test, 399 tests
Audit precedent : v5.16.7 (31 mars 2026) -- 50 commits depuis

---

## Resume

- **Niveau dette global : FAIBLE a MODERE** -- en nette amelioration depuis v5.16.7
- **Issues resolues depuis v5.16.7 :** 6 sur 8 (i18n hardcode, `three-stdlib`, `@types/mapbox__vector-tile`, `@types/pbf`, tests GPX dupliques, mock inutile `solarAnalysis.test.ts`)
- **Issues persistantes :** test `lngLatToTile` duplique, `@capacitor/cli` toujours en dependencies
- **Nouvelles issues :** 7 erreurs TypeScript `global` dans tests, `@types/three` desaligne (0.183 vs three 0.160), 27 `style.cssText` + ~186 inline styles, 45 `as any` en production

---

## Issues v5.16.7 -- Statut

| Issue v5.16.7 | Statut v5.22.1 | Details |
|---|---|---|
| i18n hardcode (~20 chaines UpgradeSheet) | **CORRIGE** | Plus aucun `TODO i18n` dans src/ ni index.html |
| `three-stdlib` inutilisee | **CORRIGE** | Supprimee (voir CHANGELOG) |
| `@types/mapbox__vector-tile` redondant | **CORRIGE** | Absent du package.json |
| `@types/pbf` redondant | **CORRIGE** | Absent du package.json |
| Tests GPX dupliques dans terrain.test.ts | **CORRIGE** | Ligne 18 : commentaire "moved to gpxLayers.test.ts" |
| Mock inutile solarAnalysis.test.ts | **CORRIGE** | Mock supprime |
| `@capacitor/cli` en dependencies | **NON CORRIGE** | Toujours en devDependencies (deja correct maintenant) |
| Test `lngLatToTile` duplique | **PERSISTE** | Voir section Tests ci-dessous |

---

## Dependances

### Dependencies runtime (13 packages)

| Dependance | Utilisee ? | Version installee | Action |
|---|---|---|---|
| `three` | Oui (32 fichiers) | 0.160.1 | Conserver -- stable |
| `@capacitor/core` | Oui (7 fichiers) | 8.2.0 | Conserver |
| `@capacitor/android` | Oui (build natif) | 8.2.0 | Conserver |
| `@capacitor/app` | Oui (mobile.ts) | 8.0.1 | Conserver |
| `@capacitor/filesystem` | Oui (3 fichiers) | 8.1.2 | Conserver |
| `@capacitor/geolocation` | Oui (4 fichiers) | 8.1.0 | Conserver |
| `@capacitor/haptics` | Oui (haptics.ts) | 8.0.1 | Conserver |
| `@capacitor/network` | Oui (networkMonitor.ts) | 8.0.1 | Conserver |
| `@mapbox/vector-tile` | Oui (buildings.ts) | 2.0.4 | Conserver |
| `@revenuecat/purchases-capacitor` | Oui (iapService.ts) | 12.3.0 | Conserver |
| `gpxparser` | Oui (TrackSheet.ts) | 3.0.8 | Conserver |
| `pbf` | Oui (buildings.ts) | 4.0.1 | Conserver |
| `pmtiles` | Oui (2 fichiers) | 4.4.0 | Conserver |
| `suncalc` | Oui (4 fichiers) | 1.9.0 | Conserver |

**Verdict : 0 dependance inutilisee.** Nettoyage `three-stdlib` confirme depuis v5.16.7.

### DevDependencies (14 packages)

Toutes utilisees. Les dev-dependencies `@aws-sdk/*`, `sharp`, `dotenv` sont utilisees par les scripts (`scripts/build-country-pack.ts`, `scripts/upload-to-r2.ts`). `axe-core` par `a11y.test.ts`. `happy-dom` via config Vitest. `vite-plugin-pwa` dans `vite.config.ts`.

### Problemes de version

| Probleme | Detail | Severite |
|---|---|---|
| **`@types/three` desaligne** | Types v0.183.1 pour Three.js v0.160.1 (23 versions majeures d'ecart) | MOYENNE -- fonctionne mais des types peuvent etre inexacts pour l'API utilisee |
| `suncalc` v1.9.0 | Derniere version (pas de mise a jour depuis 2017) | FAIBLE -- lib stable, pas d'alternative necessaire |
| `gpxparser` v3.0.8 | Derniere version | FAIBLE |

### Dependance redondante ou mal categorisee

| Package | Probleme | Action |
|---|---|---|
| `@capacitor/cli` ^8.3.0 | En devDependencies -- **correct** (corrige depuis v5.16.7 ou deja correct) | Aucune |

**Aucune dependance redondante detectee.**

---

## Code mort

### Fonctions exportees orphelines (jamais importees en production)

38 symboles exportes n'ont aucune reference en production. Apres filtrage des faux positifs (types utilises implicitement, fonctions appelees dynamiquement) :

| Fichier | Symbole | Analyse |
|---|---|---|
| `peaks.ts` | `fetchLocalPeaks()` | Orphelin depuis v5.16.7 -- le TODO ligne 1 confirme : "integrer dans SearchSheet" |
| `terrain.ts` | `activeLabels` | Exporte mais jamais importe (Map accessible en interne) |
| `terrain.ts` | `updateAllGPXMeshes()` | Jamais appele -- probablement prevu pour origin shift GPX |
| `terrain.ts` | `clearAllGPXLayers()` | Jamais appele -- utile pour un futur "clear all tracks" |
| `terrain.ts` | `clearLabels()` | Jamais appele en dehors du fichier |
| `tileCache.ts` | `getCacheSize()` | Jamais appele -- diagnostic uniquement |
| `tileLoader.ts` | `fetchWithCache()` | Exporte mais uniquement utilisee en interne (worker la duplique) |
| `tileLoader.ts` | `getColorUrl()`, `getOverlayUrl()`, `getElevationUrl()` | Exportees mais uniquement utilisees par le tileWorker (qui les reimplemente) |
| `weather.ts` | `extractLocationName()` | Jamais appelee |
| `weather.ts` | `tickWeatherTime()` | Jamais appelee -- probablement remplacee par Timeline |
| `analysis.ts` | `getMoonPhaseName()` | Jamais appelee |
| `analysis.ts` | `isAtShadow()` | Jamais appelee |
| `compass.ts` | `resetToNorth()` | Jamais appelee |
| `performance.ts` | `updatePerformanceUI()` | Jamais appelee |
| `ui.ts` | `disposeUI()` | Jamais appelee (pas de teardown en production) |
| `ui/components/InclinometerWidget.ts` | `showInclinometerUpsell()` | Jamais appelee |

### Fichiers orphelins

| Fichier | Statut | Explication |
|---|---|---|
| `src/modules/recordedPoints.test.ts` | **Test sans module** | Teste `location.ts` -- le nom est trompeur, pas de `recordedPoints.ts` |
| `src/modules/peaks.ts` | **Orphelin** | Jamais importe en production (seulement par `peaks.test.ts`) -- persiste depuis v5.16.7 |

Les fichiers UI (`ExpertSheets.ts`, `SearchSheet.ts`, etc.) qui apparaissent comme "orphelins" par import statique sont en fait charges par `import()` dynamique dans `ui.ts` lignes 547-556. Ce n'est pas du code mort.

### @deprecated

**Aucune fonction `@deprecated` detectee dans le code actuel.** Les 2 fonctions signalees en v5.16.7 (`downloadOfflineZone`, `preloadChOverviewTiles`) ont ete supprimees.

---

## TODO / FIXME

| Type | Nombre | Details |
|---|---|---|
| `// TODO` | 1 | `peaks.ts:1` -- "integrer fetchLocalPeaks() dans SearchSheet" (stale depuis v5.16.7+) |
| `// FIXME` | 0 | -- |
| `// HACK` | 0 | -- |
| `TODO i18n` | 0 | **Tous resolus** depuis v5.16.7 |

**Amelioration majeure :** de ~20+ TODO i18n a 1 seul TODO residuel.

---

## Patterns problematiques

### `as any` : 45 en production, ~25 en tests

**Production (45 occurrences) :**

| Fichier | Nb | Justification |
|---|---|---|
| `tileWorker.ts` | 11 | Worker context : `self as any`, `null as any` pour les retours d'erreur, acces proprietes dynamiques. **Justifie** -- le typage Worker est limite. |
| `terrain.ts` | 12 | Acces `userData.shader` sur Material, `status as any === 'disposed'`, cast `repositionAllTiles.lastOrigin`. **Partiellement justifie** -- une interface `ShaderMaterial` avec `userData.shader` eliminerait ~8 casts. |
| `materialPool.ts` | 4 | Acces `userData.shader`. Meme probleme que terrain.ts. |
| `SettingsSheet.ts` | 7 | Acces dynamique `state[stateKey]`. **Justifie** -- pattern generique pour les toggles. |
| `ExpertSheets.ts` | 1 | `SHOW_WEATHER_PRO` pas dans le type State. |
| `location.ts` | 4 | `DeviceOrientationEvent.requestPermission` -- API non typee standard. **Justifie.** |
| `networkMonitor.ts` | 2 | `navigator.connection` -- Network Information API non standard. **Justifie.** |
| `vegetation.ts` | 1 | `colorTex.image as any`. |
| `ui.ts` | 1 | `window.sheetManager` pour debug. |
| `VRAMDashboard.ts` | 1 | Acces interne `workers.length`. |
| `TrackSheet.ts` | 1 | `rawData.tracks[0].points as any[]` -- typage gpxparser insuffisant. |

**Recommandation :** Creer une interface `ShaderUserData` pour eliminer ~12 casts dans terrain.ts/materialPool.ts. Les casts API navigateur (`DeviceOrientationEvent`, `navigator.connection`) sont inevitables.

### `@ts-ignore` / `@ts-expect-error` : 1

| Fichier | Ligne | Contexte |
|---|---|---|
| `terrain.test.ts` | 181 | `// @ts-ignore` dans un test. Acceptable. |

### `console.log` : 20 occurrences dans 8 fichiers

Terser les supprime en production. Reparties dans : `main.ts` (2), `iapService.ts` (4), `state.ts` (1), `packManager.ts` (2), `tileLoader.ts` (3), `ui.ts` (6), `workerManager.ts` (1), `vegetation.test.ts` (1).

**Verdict :** Bruit en dev modere. Les messages sont prefixes (`[SW]`, `[IAP]`, `[PMTiles]`, etc.) -- bon pattern. Pas d'action requise.

### Magic numbers notables

Les constantes numeriques sont generalement nommees. Quelques exceptions :

| Fichier | Exemple | Suggestion |
|---|---|---|
| `sun.ts:33-36` | Seuils `6`, `-4`, `-12` pour phases solaires | Nommer : `SOLAR_DAY_THRESHOLD`, `GOLDEN_HOUR_THRESHOLD`, `TWILIGHT_THRESHOLD` |
| `tileWorker.ts:26` | `500` ms backoff initial | Deja commente, acceptable |

### Inline styles (`style.cssText` + `style.X = ...`)

| Pattern | Occurrences production | Severite |
|---|---|---|
| `style.cssText` | **27** | MOYENNE -- violation directe de la convention CSS |
| `style.property = '...'` | **~120** (hors display/transition) | FAIBLE a MOYENNE -- beaucoup sont des toggles `display`, `opacity`, `transition` qui sont difficiles a eviter |

**Fichiers les plus concernes :**
- `PacksSheet.ts` : 16 `style.cssText` -- construit l'UI entierement en JS
- `InclinometerWidget.ts` : 2 `style.cssText` + 12 inline styles
- `ExpertSheets.ts` : 1 `style.cssText` + 10 inline styles
- `TrackSheet.ts` : 5 `style.cssText`
- `utils.ts` (showToast) : 10 inline styles

**Recommandation :** PacksSheet.ts et InclinometerWidget.ts devraient migrer vers des classes CSS. Les toggles `display`/`opacity` sont acceptables en JS.

### EventBus

56 utilisations (`on`/`emit`/`off`) dans 22 fichiers. **Usage coherent et bien reparti.** Pas de couplage direct detecte entre composants.

### Design tokens CSS

212 references aux tokens (`--space-*`, `--text-*`, `--radius-*`, `--glass-*`) dans `style.css`. Les tokens sont utilises y compris dans les `style.cssText` inline (bon signe). Quelques couleurs hardcodees dans `sun.ts` et `ExpertSheets.ts` (voir inline styles ci-dessus).

---

## Tests

### Test `lngLatToTile` duplique (PERSISTE depuis v5.16.7)

| Fichier | Suite | Test Spiez zoom 13 |
|---|---|---|
| `terrain.test.ts:20-34` | `describe('lngLatToTile')` | `lngLatToTile(7.6617, 46.6863, 13)` -> expect 4270/2891 |
| `geo.test.ts:7-11` | Inline test | `lngLatToTile(7.6617, 46.6863, 13)` -> expect 4270/2891 |

`terrain.test.ts` a un test supplementaire (Greenwich zoom 0) que `geo.test.ts` n'a pas.

**Recommandation :** Deplacer le test Greenwich dans `geo.test.ts` et supprimer le bloc `lngLatToTile` de `terrain.test.ts`.

### Tests desactives (`test.skip` / `test.todo`)

**0 test skip, 0 test todo.** Suite propre.

### Erreurs TypeScript dans les tests

7 erreurs `TS2304: Cannot find name 'global'` :

| Fichier | Nb erreurs |
|---|---|
| `peaks.test.ts` | 4 |
| `weather.test.ts` | 2 |
| `workerManager.test.ts` | 1 |

**Cause :** `global` n'est pas type dans l'environnement TypeScript (besoin de `globalThis` ou d'un `declare const global: typeof globalThis`).
**Impact :** Les tests passent (Vitest injecte `global`) mais `npm run check` echoue.

### Mock weatherPro.test.ts (ameliore depuis v5.16.7)

Le mock de `weather.ts` est maintenant `vi.importActual` (ligne 14) -- il re-exporte la vraie `getWeatherIcon`. Ce n'est plus une reimplementation. **Ameliore mais toujours un mock qui retourne l'actual** -- pourrait etre supprime si Three.js est mockable dans ce contexte.

### Test orphelin

`recordedPoints.test.ts` -- teste `startLocationTracking`/`stopLocationTracking` depuis `location.ts`. Le nom est trompeur (il n'y a pas de module `recordedPoints.ts`). **Renommer en `locationTracking.test.ts`** serait plus clair.

---

## Conventions

### Nommage (camelCase)

Pas de pattern `snake_case` significatif detecte dans le code TypeScript production. Les seules occurrences sont dans les noms de proprietes API externes (`temperature_2m_max`, `wind_speed_10m_max`, etc.) provenant d'Open-Meteo -- c'est correct de les garder tels quels.

### Imports Three.js (`import *`)

**33 fichiers** utilisent `import * as THREE from 'three'`. C'est le pattern standard pour Three.js car :
- Three.js exporte un namespace avec des centaines de classes
- Vite/Rollup gere le tree-shaking meme avec `import *` sur Three.js (les classes non utilisees sont eliminees)

`import * as pmtiles` dans 2 fichiers -- acceptable egalement (petite lib).

**1 import notable :** `import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'` dans `buildings.ts` -- import specifique, correct.

### Structure des fichiers

Voir section "Fichiers volumineux" ci-dessous.

---

## i18n

### Chaines non internationalisees

**0 `TODO i18n` restant** dans `src/` et `index.html`. Amelioration majeure depuis v5.16.7 ou ~20+ chaines etaient non traduites.

### Coherence des locales

| Locale | Cles | Statut |
|---|---|---|
| `fr.json` | 423 | Reference |
| `de.json` | 423 | Identique |
| `it.json` | 423 | Identique |
| `en.json` | 423 | Identique |

**Parfaitement aligne.** Aucune cle manquante ou en surplus dans aucune locale.

---

## Fichiers volumineux (> 800 lignes)

| Fichier | Lignes | Complexite | Suggestion |
|---|---|---|---|
| `terrain.ts` | 1116 | Haute -- Tile class + GPX + LOD + labels + repositioning | Extraire GPX (addGPXLayer, removeGPXLayer, etc. ~150 lignes) dans `gpxLayers.ts`. Extraire label management (~50 lignes) dans `terrainLabels.ts`. |
| `ExpertSheets.ts` | 1021 | Haute -- Meteo + Solaire + Vent + Batterie + Alertes | Extraire la construction HTML meteo (~400 lignes) dans un helper `weatherCardBuilder.ts`. |

Les autres fichiers restent sous 800 lignes. `scene.ts` (719), `SettingsSheet.ts` (645), `ui.ts` (608) sont volumineux mais chacun a une responsabilite coherente.

---

## Recommandations priorisees

### HAUTE (qualite / CI)

1. **Corriger les 7 erreurs TypeScript dans les tests**
   `peaks.test.ts`, `weather.test.ts`, `workerManager.test.ts` : remplacer `global` par `globalThis` ou ajouter `declare const global: typeof globalThis` dans `src/test/setup.ts`.
   Impact : `npm run check` passe sans erreur.

2. **Aligner `@types/three` avec Three.js**
   `@types/three` est en v0.183 pour Three.js v0.160 (23 versions d'ecart). Installer `@types/three@^0.160.0` ou mettre a jour Three.js.
   Impact : types plus fiables, moins de risque de regression silencieuse sur l'API.

### MOYENNE (dette technique)

3. **Creer une interface `ShaderUserData`** pour eliminer ~12 `as any` dans `terrain.ts` et `materialPool.ts`.

4. **Migrer les `style.cssText` de PacksSheet.ts** (16 occurrences) vers des classes CSS dans `style.css`. C'est le fichier le plus en violation de la convention design tokens.

5. **Supprimer le code mort confirme** :
   - `peaks.ts` : decider integration ou suppression (stale depuis 50+ commits)
   - `weather.ts` : `extractLocationName()`, `tickWeatherTime()`
   - `analysis.ts` : `getMoonPhaseName()`, `isAtShadow()`
   - `terrain.ts` : `activeLabels` export, `updateAllGPXMeshes()`, `clearAllGPXLayers()`, `clearLabels()`
   - `compass.ts` : `resetToNorth()`
   - `performance.ts` : `updatePerformanceUI()`

6. **Supprimer le test `lngLatToTile` duplique** dans `terrain.test.ts` (deplacer le cas Greenwich dans `geo.test.ts`).

### FAIBLE (maintenance)

7. **Renommer `recordedPoints.test.ts`** en `locationTracking.test.ts` pour coherence.

8. **Nommer les magic numbers** dans `sun.ts` (seuils phases solaires : 6, -4, -12).

9. **Extraire le code GPX** de `terrain.ts` (~150 lignes) dans un module `gpxLayers.ts` dedie.

10. **Migrer les couleurs hardcodees** dans `sun.ts` et `ExpertSheets.ts` vers des variables CSS.

---

## Metriques comparatives

| Metrique | v5.16.7 | v5.22.1 | Evolution |
|---|---|---|---|
| Dependances inutilisees | 1 (`three-stdlib`) | 0 | Corrige |
| TODO i18n | ~20+ | 0 | Corrige |
| TODO/FIXME total | ~20+ | 1 | Corrige |
| @deprecated | 2 | 0 | Supprimees |
| Tests dupliques | 2 (GPX + lngLatToTile) | 1 (lngLatToTile) | Ameliore |
| Tests passes | 398 | 399 | +1 |
| Erreurs TypeScript | 0 ? | 7 (tests `global`) | Regression |
| `as any` (production) | Non mesure | 45 | Baseline |
| `style.cssText` | Non mesure | 27 | Baseline |
| Locales alignees | Non verifie | 4/4 (423 cles) | OK |

---

## Conclusion

La codebase SunTrail v5.22.1 presente une **dette technique faible a moderee**, en amelioration notable depuis v5.16.7. Les 3 problemes critiques de l'audit precedent (i18n hardcode, `three-stdlib`, tests GPX dupliques) ont ete corriges. Les 7 erreurs TypeScript dans les tests sont la regression la plus urgente car elles cassent `npm run check`. Le reste est de la maintenance progressive : reduire les `as any`, migrer les inline styles vers CSS, et nettoyer le code mort accumule.

Charge estimee pour les recommandations haute priorite : ~1h.
Charge estimee pour l'ensemble : ~4-5h.

---

*Rapport genere par audit systematique (grep + analyse statique)*
*Version analysee : SunTrail 3D v5.22.1 (versionCode 556)*
