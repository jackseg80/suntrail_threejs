# SunTrail — Performance & Mobile (v5.19.6)

> Référence détaillée pour agents IA. Point d'entrée : [CLAUDE.md](../CLAUDE.md)

---

## Optimisations Énergétiques (v5.11)

- **Battery API** : Basculement auto en mode "Eco" si batterie < 20%.
- **Deep Sleep réel (v5.11)** : `renderer.setAnimationLoop(null)` sur `visibilitychange hidden` — arrêt total du GPU. Handler stocké en variable module-level, supprimé dans `disposeScene()`. IMPORTANT : le `return` inline était insuffisant.
- **Throttle eau/météo (v5.11 Phase 2)** : `waterTimeAccum` et `weatherTimeAccum` (accumulateurs en ms) dans `scene.ts`. `uTime` de l'eau s'incrémente uniquement quand `waterFrameDue` (toutes les 50ms = 20 FPS max). `updateWeatherSystem` uniquement quand `weatherFrameDue` avec `weatherAccumDelta`.
- **⚠️ RÈGLE CRITIQUE — Accumulateurs AVANT les guards (v5.11.1)** : `waterTimeAccum` et `weatherTimeAccum` doivent être incrémentés **avant** tout `return` guard dans `renderLoopFn`. Si placés après → eau/météo à ~5fps au lieu de 20fps.
- **Idle Throttle Global (v5.11.1)** : Guard `isIdleMode` limite le render à 20fps quand `!isUserInteracting && !isFlyingTo && !isFollowingUser && !(isWeatherActive && weatherFrameDue) && now - lastInteractionTime >= 800ms`. `lastInteractionTime` mis à jour dans `controls 'end'` ET `onEnd` de `initTouchControls`.
- **⚠️ RÈGLE `isIdleMode`** : Tout état produisant un mouvement continu de caméra **doit** figurer dans la condition `isIdleMode` **ET** comme condition standalone dans `needsUpdate`. Liste actuelle : `isFlyingTo`, `isFollowingUser`.
- **flyTo / `needsUpdate` standalone (v5.11.1)** : La RAF `animateFlight` appelle `controls.update()` en interne → `controlsDirty = false` côté renderLoopFn. `state.isFlyingTo` et `state.isFollowingUser` sont des conditions **standalone** dans `needsUpdate`. **Ne jamais recoupler à `controlsDirty`**.
- **controls.update() stuck WebView Android (v5.11.1)** : `OrbitControls.update()` retourne `true` indéfiniment sur WebView Android. Fix : résultat inclus dans `needsUpdate` uniquement pendant 800ms après `lastInteractionTime`. `tiltAnimating` source séparée.
- **Météo GPU-driven (v5.11.1)** : Positions calculées dans le vertex shader depuis `uTime`. Ne jamais réintroduire `tickWeatherTime`.
- **Loading Overlay 1er démarrage (v5.11.1)** : `#map-loading-overlay` — fond noir + spinner, `z-index: 50`. Affiché dès `suntrail:sceneReady`, caché quand `isProcessingTiles → false`. Fallback 2s, timeout max 15s. Le setup screen a été supprimé en v5.20 (clé bundlée `.env` + Gist = résolution automatique).
- **Adaptive DPR (v5.11 Phase 2)** : `controls 'start'` → `setPixelRatio(1.0)`. `controls 'end'` + 200ms → restaure `state.PIXEL_RATIO_LIMIT`. Conditionné à `isMobileDevice`.
- **VEGETATION_CAST_SHADOW (v5.11 Phase 2)** : `false` pour eco/balanced, `true` pour performance/ultra.
- **ENERGY_SAVER par tier (v5.11)** : eco/balanced → `true`. **performance/ultra → `false`**. Le toggle manuel dans Réglages Avancés permet l'ajustement. `applyPreset()` force `true` sur eco/balanced mobile.
- **IS_2D_MODE (v5.11)** : Flag indépendant du preset. Tuiles TOUJOURS fetchées avec élévation pour LOD > 10 (`fetchAs2D = zoom <= 10`) — switch 2D→3D instantané.
- **Toggle 2D/3D (v5.11)** : `rebuildActiveTiles()` reconstruit les meshes EN PLACE. **Ne jamais appeler `resetTerrain()`**. Détecte les tuiles sans élévation, invalide leur cache et les recharge.
- **IS_2D_MODE verrouillé en LOD ≤ 10 (v5.11.2)** : `NavigationBar.ts` souscrit à `state.ZOOM`. Quand `ZOOM ≤ 10` : bouton disabled, `IS_2D_MODE` forcé à `true`, `_modeBeforeLowZoom` mémorise.
- **2D Turbo** : Élévation zéro, maillage plat (2 triangles/tuile), bridé à 30 FPS.
- **FPS Rolling (v5.11)** : `state.currentFPS` dans le render loop (fenêtre 1s). Utilisé par PerfRecorder et panel VRAM.
- **processLoadQueue corrigé (v5.11)** : `slice(0, Math.max(1, state.MAX_BUILDS_PER_CYCLE))` au lieu de `slice(0, 4)`.

---

## Presets — Tiers du Marché Mobile (v5.11)

Valeurs directes et universelles, sans double-couche "preset + caps" :

| Preset | Cible | RANGE | Shadow | MAX_ZOOM | Notes |
|--------|-------|-------|--------|----------|-------|
| **eco** | Mali-G52, Adreno 5xx, Intel HD 4xx | 3 | OFF | 14 | `body.preset-eco` masque 2D/3D et timeline |
| **balanced** (STD) | Galaxy A53 | 4 | 256 | 16 | RESOLUTION 32, végétation density 500 |
| **performance** (High) | Galaxy S23, GTX 1050 | 5 | 1024 | 18 | MAX_BUILDS 2 |
| **ultra** (PC) | PC / Snapdragon Elite | max | max | 18 | Sur mobile Elite : shadow≤2048, RANGE≤8 |

Seuls ajustements mobiles résiduels dans `applyPreset()` : ENERGY_SAVER (batterie), Ultra shadow/range, PIXEL_RATIO≤2.0.

---

## Détection GPU (v5.11)

`detectBestPreset()` couvre 52 patterns GPU : Intel HD/UHD par génération, Intel Arc/Iris Xe, AMD Vega iGPU, AMD RX (RDNA/Polaris), NVIDIA GTX par série, Snapdragon Elite (Adreno 830+), Mali par modèle. Adreno 730+ = `performance` (v5.16.8). Fallback : ≥8 cores CPU → `balanced`, sinon `eco`. `detectBestPreset()` ne modifie plus `state.ENERGY_SAVER` directement — c'est fait dans `applyPreset()`.

---

## PerfRecorder (v5.11)

`VRAMDashboard` intègre un enregistreur de sessions. Bouton ⏺/⏹ dans le panel VRAM. Buffer circulaire 600 échantillons (5 min à 500ms). Export JSON presse-papier. Données : fps, textures, geometries, drawCalls, triangles, tiles, zoom, isProcessingTiles, isUserInteracting, energySaver.

---

## Adaptabilité Matérielle

- **Light Shader** : Shader simplifié pour GPU Mali/Adreno mid-range (÷4 charge GPU).
- **Adaptive Scan** : Réduction du pas de scan végétation sur mobile.
