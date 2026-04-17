# SunTrail — Performance & Optimisation (v5.29.31)

> Stratégies de rendu, budget énergie et presets GPU. Point d'entrée : [CLAUDE.md](../CLAUDE.md)

---

## Gestion de l'Énergie (v5.29.31)

- **Deep Sleep** : Suspension totale du rendu (`renderer.setAnimationLoop(null)`) lorsque l'application passe en arrière-plan (`visibilitychange hidden`) ou que l'écran est verrouillé. Zéro consommation GPU/CPU au repos.
- **Throttling Dynamique** :
    - **Météo & Eau** : Shaders et particules limités à **20 FPS** (échantillonnage toutes les 50ms) pour économiser le GPU, indépendamment du framerate global.
    - **Idle Mode** : Si aucune interaction n'est détectée pendant 800ms, le rendu tombe à **20 FPS** (sauf pendant un `flyTo` ou `followUser`).
    - **Deep Sleep Inactif** : Si inactivité > 30s, le rendu tombe à **~1.5 FPS** (v5.29.3).
    - **Energy Saver** : Mode 30 FPS constant pour une économie batterie maximale (cible ≤ 15%/h en rando).
- **DPR Cap** : Le `devicePixelRatio` est capé à **2.0** maximum sur mobile. Les écrans ultra-haute résolution (S23/S24 3×/4×) sont bridés pour éviter un surcoût de rendu invisible.
- **Adaptive Resolution** : Pendant les manipulations (pan/zoom/rotate), la résolution tombe à 1.0 (DPR) pour garantir la fluidité, puis remonte à la cible 200ms après l'arrêt.
- **Texture Upload Budgeting (v5.29.31)** : Limitation du temps passé à instancier les textures GPU à **6ms par frame**. Empêche les micro-saccades lors de l'arrivée massive de nouvelles tuiles (chargement asynchrone étalé).

---

## Pipeline de Rendu & Workers

- **Material Pooling** : Réutilisation systématique des shaders via `materialPool.ts` pour éviter les micro-saccades de compilation Three.js.
- **WebWorkers Pool** : 4 workers (mobile) / 8 workers (desktop) pour le calcul des Normal Maps et le fetch des tuiles. Thread principal dédié exclusivement à l'UI et au rendu.
- **Dithered Vegetation** : Utilisation de `InstancedMesh` avec shader d'apparition progressive pour supprimer le pop-in visuel des forêts.
- **GPU-driven Weather** : Positions des particules calculées intégralement dans le vertex shader via `uTime`.
- **Fast-Path Shaders (v5.29.31)** : Optimisation du calcul des pentes par élimination des fonctions trigonométriques (`acos`) au profit de produits scalaires directs.

---

## Presets GPU (`performance.ts`)

L'application détecte le GPU via `UNMASKED_RENDERER_WEBGL`.

| Preset | Cible Hardware | Caractéristiques |
|---|---|---|
| **Eco** | Vieux mobile (Mali-G52, Adreno 5xx) | 2D forcé, pas de végétation/bâtiments, range 3 |
| **Balanced** | Mid-range 2021 (A53, Intel HD 620) | Range 4, Végétation (sans ombre), Bâtiments, 30fps |
| **Performance** | Flagship mobile (S23, GTX 1050) | Range 6, Ombres végétation, Hydrologie, 60fps |
| **Ultra** | PC bureau / Snapdragon Elite | Range 12, Ombres 4k, Météo dense, 60fps+ |

---

## Optimisations Startup (v5.21.1)

- **Lazy-loading UI** : `initUI()` hydrate uniquement les éléments critiques au démarrage. Les 10 "sheets" secondaires sont chargées de manière asynchrone après le premier frame (gain de ~100kB sur le bundle initial).
- **Objets Scratch THREE** : Utilisation de variables module-level pré-allouées (`_vec3`, `_quat`, etc.) dans les boucles critiques (TouchControls, Sun) pour éliminer le Garbage Collection lié aux `new THREE.Vector3()`.
- **CSS Composited** : Animations (REC pulse, loading shimmer) utilisant uniquement `transform` et `opacity` pour garantir 60fps sur l'UI sans repaint.
