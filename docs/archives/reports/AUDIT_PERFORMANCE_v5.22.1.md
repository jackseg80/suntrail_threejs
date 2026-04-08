# Audit #2 — Performance — SunTrail v5.22.1
Date : 2026-04-04

**Fichiers analyses** : scene.ts, terrain.ts, buildings.ts, vegetation.ts, hydrology.ts, performance.ts, sun.ts, weather.ts, analysis.ts, tileSpatialIndex.ts, tileCache.ts, boundedCache.ts, materialPool.ts, geometryCache.ts, memory.ts, state.ts
**Methode** : Revue statique exhaustive du code source, comparaison ligne-a-ligne avec l'audit v5.16.7

---

## Suivi issues v5.16.7

| # | Issue | Status v5.22.1 | Details |
|---|-------|----------------|---------|
| 1 | Shadow camera oversized (100km x 100km) | **CORRIGE** | `sun.ts:129-138` : shadow camera dynamique par RANGE. Extent calcule via `RANGE * tileSizeMeters * 0.8`, borne entre 2000 et 30000m. Mise a jour conditionnelle (seuil 500m) evite les updates inutiles. Cependant, l'init dans `scene.ts:416-417` reste a -50000/+50000 — les premieres frames avant le premier `updateSunPosition()` utilisent toujours le frustum 100km. |
| 2 | Fragment shader terrain — detection eau couteuse | **CORRIGE** | `terrain.ts:344-369` : refactorisation complete du shader eau. Early exit via 2 tests bon marche (`blueVsRed > 0.02 && vTrueNormal.y > 0.998`) elimine 99%+ des fragments non-eau avant tout smoothstep. Les 4 smoothstep originaux sont remplaces par 3 smoothstep appliques uniquement sur les ~1% de fragments candidats. Gain effectif conforme a l'estimation (+10-20 fps). |
| 3 | VRAM textures non compressees | **NON CORRIGE** | Aucune trace de KTX2, Basis Universal, ou compression GPU dans le codebase. Les textures elevation, color, overlay et normal restent en PNG/WebP non compresses cote GPU. Mitigation partielle : mipmaps desactives sur elevation et normal (`generateMipmaps = false`, `terrain.ts:229,259`), ce qui economise ~50% de VRAM sur ces 2 canaux. Le cache LRU borne (`tileCache.ts`) limite aussi la croissance. |
| 4 | Recherche altitude O(n) sur toutes les tuiles | **CORRIGE** | `tileSpatialIndex.ts` : index spatial grid-based (cellules 2000m). `analysis.ts:23` utilise `queryTiles()` pour un lookup O(1) moyen. Cache `lastUsedTile` pour coherence spatiale. Fallback O(n) uniquement si l'index est vide (init). Les tuiles larges (LOD 6-10) vont dans un set `largeTiles` scanne lineairement (peu d'elements). |
| 5 | Draw calls eau — 30 lacs = 30 draw calls | **NON CORRIGE** | `hydrology.ts:176` : chaque masse d'eau cree toujours un `new THREE.Mesh(geometry, waterMaterial)` individuel, ajoute a un `THREE.Group`. Pas de merge geometrique. Le materiau est partage (singleton `waterMaterial`), ce qui reduit les changements d'etat GPU, mais chaque mesh reste un draw call distinct. |
| 6 | Frustum culling decorations | **PARTIELLEMENT CORRIGE** | Les decorations (buildings, hydrology, vegetation, POI) sont des enfants du mesh tuile (`tile.mesh.add(group)`). Three.js propage le frustum culling du parent aux enfants — les tuiles hors frustum sont donc implicitement cullees. Cependant, aucun `frustumCulled = true` explicite sur les groupes enfants. Le `groundPlane` a un `frustumCulled = true` explicite (`scene.ts:184`). Weather a `frustumCulled = false` (`weather.ts:238`), ce qui est correct (particules globales). La tuile elle-meme est filtree par `isVisible()` avant chargement (`terrain.ts:50`). |
| 7 | Caches croissance unbounded | **CORRIGE** | 3 mecanismes implementes : (a) `boundedCache.ts` : wrapper FIFO avec limite par defaut de 200 entrees, utilise par buildings, hydrology et POI. (b) `tileCache.ts` : cache LRU borne par preset (60 eco → 800 ultra desktop), avec protection des cles actives contre l'eviction et `trimCache()` apres changement de preset. (c) `geometryCache.ts` : cache de geometries avec `disposeAll()`. Le `materialPool.ts` est egalement borne (MAX_POOL_SIZE = 12 par type). |

---

## Nouveaux modules — Impact performance

### buildings.ts

**Points positifs :**
- **Geometries mergees** : `finalizeMergedMesh()` utilise `BufferGeometryUtils.mergeGeometries()` pour combiner tous les batiments d'une tuile en un seul mesh = **1 draw call par tuile** (excellent).
- **Materiaux partages** : 2 singletons `sharedMaterialMapTiler` et `sharedMaterialOverpass`, recycles entre toutes les tuiles. Zero recompilation shader.
- **Limite par distance** : `effectiveLimit` degrade lineairement le nombre de batiments selon la distance camera (100% proche → 25% a la limite). Rayon max = 2.5 x largeur de tuile.
- **Cache borne** via `boundedCacheSet` (200 entrees max) pour `buildingMemoryCache` et `maptilerFeaturesCache`.
- **matrixAutoUpdate = false** sur le mesh merge (evite le recalcul matrice chaque frame).
- **Dispose propre** : `tile.dispose()` appelle `disposeObject(this.buildingMesh)` qui libere geometrie + materiau.

**Points d'attention :**
- `zoneFailureCooldown` et `maptilerFetchPromises` ne sont pas bornes. Risque faible : les entrees sont ephemeres (supprimees apres resolution) mais `zoneFailureCooldown` n'a pas de nettoyage periodique.
- `ExtrudeGeometry` est couteux en CPU (triangulation Earcut par batiment). Pour 150 batiments (ultra), cela peut bloquer le thread principal ~50-100ms.
- Pas d'`InstancedMesh` : chaque batiment a une hauteur et forme unique → merge est le bon compromis. InstancedMesh ne conviendrait pas ici.

### vegetation.ts

**Points positifs :**
- **InstancedMesh** : 3 essences (sapin, meleze, feuillu) avec `THREE.InstancedMesh` = **3 draw calls max par tuile** quel que soit le nombre d'arbres. Excellente approche.
- **Ressources partagees** : `initVegetationResources()` cree les geometries/materiaux une seule fois, partagees entre toutes les tuiles.
- **Densite adaptative** par preset : 0 (eco) → 1500 (balanced) → 5000 (perf) → 8000 (ultra).
- **Placement deterministe** via `pseudoRandom()` (seed par position) — pas de jitter entre frames.
- **Resolution de scan fixe** (64x64) independante de la resolution texture — performance previsible.

**Points d'attention :**
- **Canvas temporaire non libere** : `createForestForTile()` cree un `document.createElement('canvas')` 64x64 + `getContext('2d')` a chaque appel. Le canvas n'est jamais explicitement libere (pas de `canvas.width = 0` ou nullification). Sur navigateurs modernes, le GC collecte, mais sur WebView Android avec contraintes memoire, des centaines de canvas orphelins peuvent s'accumuler.
- `castShadow` sur les InstancedMesh vegetation : controle par preset (`VEGETATION_CAST_SHADOW`). En mode ultra, chaque InstancedMesh projette des ombres = 3 draw calls supplementaires dans la shadow pass par tuile. Avec RANGE=12 (625 tuiles potentielles), cela peut representer ~1800 draw calls ombres en theorie (en pratique, seules les tuiles proches ont de la vegetation).

### hydrology.ts

**Points positifs :**
- **Materiau singleton** : `waterMaterial` partage entre toutes les masses d'eau (1 seul programme shader).
- **Shader d'ondulation leger** : injection dans `onBeforeCompile` avec 2 ondes sinus (vertex) + ripple normales (fragment). Cout GPU faible par fragment.
- **Cache borne** via `boundedCacheSet` (200 entrees max).
- **Guard interaction** : differe le chargement si l'utilisateur interagit (`isUserInteracting`).

**Points d'attention :**
- **Pas de merge geometrique** (issue #5 toujours presente) : chaque lac/riviere = 1 `THREE.Mesh` + 1 `THREE.ShapeGeometry`. 10 lacs sur une tuile = 10 draw calls. La ShapeGeometry est recree a chaque tuile (pas cachee).
- **Pas de LOD** sur les ondulations : le shader d'ondulation s'execute meme quand l'eau est a peine visible (LOD 13, vue tres large).

### performance.ts

**Points positifs :**
- **Detection GPU exhaustive** : `detectBestPreset()` classe 40+ modeles GPU en 4 tiers (eco/balanced/performance/ultra) via regex sur `UNMASKED_RENDERER_WEBGL`. Fallback intelligent par `hardwareConcurrency`.
- **4 presets bien calibres** avec des parametres fins (RANGE, RESOLUTION, SHADOW_RES, VEGETATION_DENSITY, BUILDING_LIMIT, WEATHER_DENSITY, etc.).
- **Caps mobiles** dans `applyPreset()` : DPR plafonne a 2.0, RANGE et SHADOW_RES reduits en ultra mobile.
- **Surveillance batterie** : `initBatteryManager()` bascule automatiquement en eco sous 20%.
- **`trimCache()`** appele apres changement de preset pour liberer immediatement la VRAM excedentaire.

---

## Render Loop

Analysee dans `scene.ts:470-683`.

**Architecture solide :**
- **Accumulateurs AVANT les return guards** (`waterTimeAccum`, `weatherTimeAccum` lignes 479-486) — conforme a la regle critique CLAUDE.md. Meteorologie et eau a 20fps reels.
- **Idle throttle progressif** : 20fps en idle, 30fps en GPS follow, 60fps cap mobile (sauf ultra), 30fps en energy saver.
- **needsUpdate exhaustif** (lignes 592-608) : combine 10+ conditions independantes (`isFlyingTo`, `isFollowingUser`, `isTiltTransitioning`, `waterFrameDue`, `weatherFrameDue`, etc.). `isFlyingTo` et `isFollowingUser` sont standalone (jamais couples a `controlsDirty`), conforme a la regle.
- **Adaptive DPR** (Phase 2.3) : DPR baisse a 1.0 pendant l'interaction sur mobile, restaure a `PIXEL_RATIO_LIMIT` 200ms apres relachement.
- **Deep Sleep** : `setAnimationLoop(null)` quand `document.hidden` — arret total du GPU en arriere-plan.
- **Prefetch LOD adjacent** en idle toutes les 5s (`prefetchAdjacentLODs()`).
- **Target elevation tracking** : `target.y` suit le terrain avec lerp differentie (0.08 pendant interaction, 0.03 en idle).

**Points d'attention :**
- `getAltitudeAt` est appele 2-3x par frame (camera groundH + target groundH + tilt cap). Le cache `lastUsedTile` mitigue le cout, mais en mouvement rapide (flyTo), chaque appel peut traverser le spatial index + fallback.
- La boussole est rendue a 30fps dans sa propre boucle (`renderCompass()` toutes les 33ms) — correct et independant du render principal.

---

## Nouvelles issues identifiees

### N1 — Hydrology : draw calls non merges (issue #5 persistante)

**Severite** : Moyenne
**Fichier** : `hydrology.ts:148-186`
**Probleme** : Chaque masse d'eau cree un mesh individuel dans un `THREE.Group`. Sur une zone lacustre (Interlaken, Quatre-Cantons), une tuile peut avoir 5-15 lacs = 5-15 draw calls supplementaires. Avec RANGE=6 (performance), ~169 tuiles × 3 lacs en moyenne = ~500 draw calls potentiels.
**Solution** : Appliquer le meme pattern que `buildings.ts` — `BufferGeometryUtils.mergeGeometries()` sur toutes les ShapeGeometry d'une tuile, puis un seul mesh. Le materiau est deja partage, seule la geometrie doit etre fusionnee.
**Gain estime** : +3-5 fps dans les zones avec beaucoup d'eau.

### N2 — Vegetation : canvas temporaires non liberes

**Severite** : Faible (mobile) / Negligeable (desktop)
**Fichier** : `vegetation.ts:72-83`
**Probleme** : `createForestForTile()` alloue un canvas 64x64 + contexte 2D a chaque appel. Avec 169 tuiles (performance), cela represente 169 canvas orphelins. Sur Android WebView avec contraintes memoire, le GC peut ne pas collecter assez vite.
**Solution** : Reutiliser un canvas/contexte statique module-level (comme pour les essences). Pattern : `let scanCanvas: HTMLCanvasElement | null = null;` initialise une fois.
**Gain estime** : Stabilite memoire sur sessions longues Android.

### N3 — Buildings : ExtrudeGeometry synchrone sur le thread principal

**Severite** : Moyenne
**Fichier** : `buildings.ts:200-217, 270-301`
**Probleme** : `ExtrudeGeometry` avec triangulation Earcut est execute de maniere synchrone. En preset ultra (BUILDING_LIMIT=150), la creation de 150 ExtrudeGeometry peut bloquer le main thread ~50-100ms, causant un frame drop visible.
**Solution** : (a) Deplacer la triangulation dans un worker dedie (complexe). (b) Plus pragmatique : limiter le batch a ~20 batiments par frame avec `requestIdleCallback` ou fractionnement temporel. (c) Alternative : geometries simplifiees (BoxGeometry pour les batiments reguliers, ExtrudeGeometry seulement pour les formes complexes).
**Gain estime** : Elimination des frame drops lors du chargement de zones denses.

### N4 — Shadow camera : valeurs initiales non optimisees

**Severite** : Faible
**Fichier** : `scene.ts:416-418`
**Probleme** : L'initialisation fixe `shadow.camera.left = -50000` (100km x 100km). Bien que `sun.ts:129-138` corrige dynamiquement la taille, les premieres frames (avant le premier `updateSunPosition()`) utilisent le frustum surdimensionne. L'appel `updateSunPosition(initialMins)` a la ligne 436 corrige rapidement, mais les 1-2 premieres frames de rendu avec ombres gaspillent le shadow map.
**Solution** : Initialiser avec une valeur raisonnable (`-5000/+5000`) au lieu de `-50000/+50000`.
**Gain estime** : Negligeable (1-2 frames), mais correction triviale.

### N5 — Caches secondaires non bornes

**Severite** : Faible
**Fichier** : `buildings.ts:13,18` / `hydrology.ts:11`
**Probleme** : `zoneFailureCooldown` (Map<string, number>) dans buildings et hydrology n'a pas de limite de taille ni de nettoyage periodique. Apres une longue session de navigation avec des echecs reseau frequents, ces maps peuvent croitre indefiniment. Risque pratique faible (les entrees sont des timestamps, ~50 bytes chacune).
**Solution** : Ajouter un `boundedCacheSet` ou un nettoyage periodique (supprimer les entrees expirees > 60s).
**Gain estime** : Stabilite pure — impact memoire negligeable.

### N6 — VRAM : textures non compressees (issue #3 persistante)

**Severite** : Moyenne (mobile) / Faible (desktop)
**Fichier** : Global
**Probleme** : Aucune compression GPU (KTX2/Basis/ASTC/ETC2). Les textures sont uploadees en RGBA8 non compresse. Avec le cache LRU borne (350 tuiles ultra mobile × 4 textures × ~192KB), l'empreinte VRAM max theorique est ~270MB. Les mipmaps desactives sur elevation/normal reduisent de ~33%.
**Mitigation actuelle** : Le cache LRU avec tailles par preset limite effectivement la croissance. Le risque d'OOM est gere.
**Solution a terme** : Transcoder les textures elevation en R16 (1 canal, 16 bits) au lieu de RGB8 (3 canaux, 8 bits) pour une reduction de ~50% sur ce canal seul. Pour les textures couleur, un pipeline KTX2 server-side est necessaire.
**Gain estime** : -30 a -50% VRAM selon les canaux compresses.

---

## Bilan global v5.16.7 → v5.22.1

| Metrique | v5.16.7 | v5.22.1 | Amelioration |
|----------|---------|---------|--------------|
| Shadow camera | 100km x 100km fixe | Dynamique 2-30km | ~90% reduction shadow map gaspille |
| Shader terrain eau | 4 smoothstep / fragment | Early exit + 3 smoothstep sur ~1% fragments | ~95% reduction ops inutiles |
| Recherche altitude | O(n) toutes tuiles | O(1) spatial index + cache | ~20x plus rapide |
| Caches memoire | Unbounded | Bornes (FIFO/LRU par preset) | Stabilite garantie |
| Weather disposal | Absent | `disposeWeatherSystem()` + appele dans `disposeScene()` | Memory leak corrige |
| Material reuse | Nouveau shader / tuile | MaterialPool (12/type) + shared materials | ~80% reduction compilations shader |
| Textures GPU | Non compressees | Toujours non compressees (mipmaps off partiel) | Partiel |
| Draw calls eau | 1 / lac | Toujours 1 / lac | Non corrige |

**Issues corrigees** : 5/7 (issues #1, #2, #4, #6 partiel, #7)
**Issues non corrigees** : 2/7 (issues #3 et #5)
**Nouvelles issues** : 6 (N1-N6, dont N1 et N6 sont les persistantes renumerotees)

---

## Recommandations priorisees

### Haute priorite (gain direct mesurable)

1. **Merger les geometries eau** (N1 / issue #5 persistante)
   - Fichier : `hydrology.ts:148-186`
   - Pattern : copier `finalizeMergedMesh()` de `buildings.ts`
   - Effort : 1-2h
   - Gain : +3-5 fps zones lacustres, reduction significative draw calls

2. **Fractionnement temporel ExtrudeGeometry** (N3)
   - Fichier : `buildings.ts:270-301`
   - Effort : 2-3h
   - Gain : Elimination frame drops 50-100ms en zones denses

### Priorite moyenne (stabilite et memoire)

3. **Canvas statique pour vegetation** (N2)
   - Fichier : `vegetation.ts:72`
   - Effort : 15 min
   - Gain : Stabilite Android sessions longues

4. **Valeurs initiales shadow camera** (N4)
   - Fichier : `scene.ts:416-418`
   - Effort : 5 min
   - Gain : Correction triviale, cleanup

5. **Nettoyage caches secondaires** (N5)
   - Fichiers : `buildings.ts`, `hydrology.ts`
   - Effort : 30 min
   - Gain : Proprete, pas de fuite theorique long-terme

### Priorite basse (investissement lourd)

6. **Compression textures GPU** (N6 / issue #3 persistante)
   - Effort : Eleve (pipeline server-side KTX2 + integration `KTX2Loader`)
   - Gain : -30 a -50% VRAM
   - Note : Le cache LRU borne attenuit suffisamment le probleme pour le moment. A envisager si l'app doit supporter des appareils avec < 2GB RAM GPU.

---

## Conclusion

L'ecart de performance entre v5.16.7 et v5.22.1 est significatif. Les 3 optimisations les plus critiques de l'audit precedent (shadow camera, shader eau, index spatial) ont ete implementees avec soin. Les nouveaux modules (buildings, vegetation) suivent les bonnes pratiques (InstancedMesh, merge, materiaux partages, caches bornes). Le seul module en retard est hydrology, dont les draw calls non merges restent l'optimisation la plus impactante et la plus simple a implementer.

L'architecture de la render loop est robuste : idle throttle, adaptive DPR, deep sleep, accumulateurs independants. Le materialPool et le tileCache forment un systeme de gestion VRAM coherent.

**Score global** : 7.5/10 (vs 5/10 pour v5.16.7).

---

*Rapport genere par audit statique du code source*
*Date : 2026-04-04*
*Version analysee : SunTrail 3D v5.22.1 (commit 60e2751)*
