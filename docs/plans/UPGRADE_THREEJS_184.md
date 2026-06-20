# Plan d'upgrade Three.js 0.160 → 0.184

> v5.79.0 — Prérequis pour WebGPU (v6.5/v7.0)
>
> Rédigé le 2026-06-20. Révisé après critique technique.

## Contexte

- **Actuel** : Three.js 0.160.1 (`WebGLRenderer` uniquement)
- **Cible** : Three.js 0.184.0 (24 versions d'écart)
- **Objectif final** : WebGPU-first avec fallback WebGL (v6.5 expérimental → v7.0 production)
- **Prérequis** : cette upgrade doit réussir avant toute migration WebGPU

---

## MR séparées (à faire indépendamment, après l'upgrade Three.js)

| Ordre | MR | Package | Actuel → Cible | Impact | Risque |
|---|---|---|---|---|---|
| MR-A | `upgrade/suncalc-v2` | `suncalc` | 1.9.0 → 2.0.0 | 6 modules, analyse solaire | 🟡 Breaking |
| MR-B | `upgrade/typescript-6` | `typescript` | 5.9.3 → 6.0.3 | Typage global | 🟡 Breaking |
| MR-C | `upgrade/vector-tile-v3` | `@mapbox/vector-tile` + `pbf` | 2.0.4 → 3.0.0 / 4.0.1 → 5.1.0 | Hydrologie PBF | 🟡 Breaking |
| MR-D | `upgrade/revenuecat-v13` | `@revenuecat/purchases-capacitor` | 12.3.0 → 13.2.0 | IAP Android | 🟠 Moyen |

**Règle** : ne jamais mélanger l'upgrade Three.js avec ces MR. Isoler les causes de régression.

---

## Phase A — Audit des changelogs Three.js (0.5 jour)

Recenser les breaking changes r160→r184 impactant SunTrail :

### Domaines critiques

| # | Domaine | Impact SunTrail | À vérifier dans les release notes |
|---|---|---|---|
| 1 | **Noms de chunks shader** | `onBeforeCompile` GLSL injection (terrain, depth) | `#include <begin_vertex>`, `<map_fragment>`, `<logdepthbuf_*>` — renommages ou suppressions |
| 2 | **`logarithmicDepthBuffer`** | Rendu terrain grande échelle, météo | Paramètre renommé/déprécié ? Polyfill WebGPU dispo ? |
| 3 | **ShadowMap API** | `PCFSoftShadowMap`, `shadow.bias`, `shadow.mapSize` | Changements d'API r165+ |
| 4 | **Renderer constructor** | `WebGLRenderer({ antialias, alpha, logarithmicDepthBuffer })` | Signature modifiée ? r168+ |
| 5 | **Material API** | `MeshStandardMaterial`, `MeshBasicMaterial`, `MeshDepthMaterial`, `ShaderMaterial` | Propriétés renommées/supprimées |
| 6 | **`onBeforeCompile` signature** | Callback args, `shader` object structure | Structure interne changée |
| 7 | **Texture API** | `DataTexture`, `colorSpace`, `SRGBColorSpace` | Changements r162+, renommage `encoding` → `colorSpace` |
| 8 | **Sky & examples** | `three/examples/jsm/objects/Sky.js` | Breaking changes r170+ |
| 9 | **Stats.js** | `three/examples/jsm/libs/stats.module.js` | Changements r175+ |
| 10 | **Controls** | `OrbitControls`, `MapControls` | API changes, `update()` return value |
| 11 | **InstancedMesh** | Végétation (sapin, mélèze, feuillu) | `castShadow`, `count`, `dispose` |
| 12 | **Sprites** | Compass, user dot, POI, waypoints | `Sprite`, `SpriteMaterial`, `CanvasTexture` |

### Résultat de l'audit — Breaking changes impactant SunTrail

Audit effectué le 2026-06-20 via [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) + release notes r160→r184.

| # | Version | Breaking Change | Impact | Fichier(s) | Action requise |
|---|---|---|---|---|---|
| 1 | r180 | `USE_LOGDEPTHBUF` → `USE_LOGARITHMIC_DEPTH_BUFFER` (défines internes) | 🔴 HIGH | `weather.ts:258,282,288,292` | Vérifier compilation shader météo post-r180 |
| 2 | r181→r182 | `PCFSoftShadowMap` **déprécié** → utiliser `PCFShadowMap` | 🔴 HIGH | `scene.ts:252` | `s/PCFSoftShadowMap/PCFShadowMap/` au palier r182 |
| 3 | r182→r183 | `THREE.Clock` **déprécié** → utiliser `THREE.Timer` | 🔴 HIGH | `scene.ts:586,741` | Migrer `clock.getDelta()` → `timer.getDelta()` au palier r183 |
| 4 | r182→r183 | `Sky` — correction gamma legacy retirée | 🟡 MEDIUM | `environment.ts:15` | Apparence du ciel modifiée (plus physiquement correct) |
| 5 | r180→r181 | PBR energy conservation améliorée | 🟡 MEDIUM | `materialPool.ts:63` (roughness=1.0) | Matériaux rugueux légèrement plus clairs |
| 6 | r183→r184 | `FileLoader.load()` / `ImageBitmapLoader.load()` — plus de valeur de retour | 🟡 MEDIUM | `tileWorker.ts` (worker) | Vérifier que les workers n'utilisent pas la valeur de retour |
| 7 | r179→r180 | `USE_REVERSEDEPTHBUF` → `USE_REVERSED_DEPTH_BUFFER` (défines) | 🟢 LOW | Aucun usage direct | Pas d'action |
| 8 | r174→r175 | `Controls.connect()` nécessite un élément DOM | 🟢 LOW | `cameraManager.ts` | Vérifier initialisation OrbitControls/MapControls |
| 9 | r169→r170 | `Material.type` devient statique | 🟢 LOW | Aucune modification de `type` | Vérifier pas de mutation indirecte |
| 10 | r160→r161 | `build/three.js` supprimé | ⬜ NONE | ES modules via Vite | Aucun impact |
| 11 | r162→r163 | `stencil` → `false` par défaut | ⬜ NONE | Aucun usage stencil | Aucun impact |
| 12 | r176→r177 | `ColorManagement` renommages | ⬜ NONE | Aucun usage | Aucun impact |
| 13 | r177→r178 | `MultiplyBlending`/`SubtractiveBlending` → `premultipliedAlpha` obligatoire | ⬜ NONE | Météo utilise `NormalBlending` | Aucun impact |

### Chunks shader internes — Vérification croisée

Les `#include` chunks utilisés par `onBeforeCompile` dans `Tile.ts` :
- `#include <common>` → ✅ inchangé r160→r184
- `#include <begin_vertex>` → ✅ inchangé
- `#include <map_fragment>` → ✅ inchangé
- `#include <logdepthbuf_pars_vertex>` → ✅ inchangé (défines internes renommées en r180, pas les noms de chunks)
- `#include <logdepthbuf_vertex>` → ✅ inchangé
- `#include <logdepthbuf_pars_fragment>` → ✅ inchangé
- `#include <logdepthbuf_fragment>` → ✅ inchangé

**Conclusion** : les noms de chunks utilisés par SunTrail n'ont pas changé. Les défines `USE_LOGDEPTHBUF`/`USE_LOGARITHMIC_DEPTH_BUFFER` sont internes aux chunks Three.js — le shader météo qui `#include` ces chunks sera recompilé avec les nouveaux défines automatiquement. Pas de modification nécessaire dans le code GLSL de SunTrail.

---

## Phase B — Upgrade par paliers (2.0 jours)

Ne pas sauter directement en r184. Faire 5 paliers pour isoler les régressions.

### Procédure par palier

```bash
# 1. Installer le palier
npm install three@<version> @types/three@<version>

# 2. Build + check
npm run build
npm run check          # tsc --noEmit + eslint + prettier

# 3. Tests unitaires
npm test               # 1459+ tests Vitest

# 4. Smoke test manuel (dev server)
npm run dev
# → Vérifier lancement app, rendu terrain, pas d'erreurs console

# 5. Gate Android Capacitor (dès r165)
npm run deploy         # build + cap sync
# → Déployer sur Galaxy A53 (Mali G68)
# → Vérifier rendu terrain 3D, log depth buffer actif, pas de z-fighting
```

### Paliers

| Palier | Version | Gate | Note |
|---|---|---|---|
| P1 | r160 → r165 | Build + tests + smoke desktop | Premier saut, le plus risqué |
| P2 | r165 → r170 | Build + tests + smoke desktop + **Android A53** | `logarithmicDepthBuffer` vérifié sur Mali G68 |
| P3 | r170 → r175 | Build + tests + smoke desktop + Android A53 | Sky/Stats.js changements probables |
| P4 | r175 → r180 | Build + tests + smoke desktop + Android A53 | |
| P5 | r180 → r184 | Build + tests + smoke desktop + Android A53 | Dernier palier |

**Règle stricte** : si un palier casse (build rouge, tests en échec, ou rendu visuellement incorrect), **corriger avant de passer au suivant**. Ne jamais accumuler les régressions.

### Gate Android à partir de r165

Le **test critique** à chaque palier Android :
1. Lancer l'app sur Galaxy A53
2. Zoomer sur une zone montagneuse (Alpes Suisses, zoom 14-17)
3. Vérifier **absence de z-fighting** sur les crêtes et vallées
4. Vérifier que les ombres portées fonctionnent (si SHADOWS=true)
5. Vérifier que la météo pluie/neige s'affiche correctement (teste `logdepthbuf` dans `ShaderMaterial`)
6. Vérifier le toggle 2D↔3D (pas d'écran blanc, pas de damier)

---

## Phase C — Vérification visuelle des 22 systèmes (1.5 jour)

### Checklist exhaustive

Procédure pour chaque item : ouvrir l'app en dev, activer le système, vérifier visuellement + console d'erreurs.

| # | Système | Fichier clé | Comment activer | Vérification |
|---|---|---|---|---|
| 1 | Terrain 3D (élévations) | `Tile.ts:486` | Défaut | Relief correct LOD 6→18 |
| 2 | Terrain 2D (carte plate) | `Tile.ts:485` | Toggle 2D/3D | Textures plates, pas de damier |
| 3 | Pentes (slope viz) | `Tile.ts:463-480` | `state.SHOW_SLOPES = true` | Gradient jaune→orange→rouge |
| 4 | Hydrologie animée | `Tile.ts:440-460` | `state.SHOW_HYDROLOGY = true` | Vagues bleues sur lacs |
| 5 | Overlay vectoriel | `Tile.ts:432-438` | Sur Suisse | Labels/overlay PBF |
| 6 | Ombres terrain (depth) | `materialPool.ts:47-83` | `state.SHADOWS = true` | Ombres des montagnes |
| 7 | Ombres bâtiments | `buildings.ts` | Zoom 16+ ville | Ombres des bâtiments |
| 8 | Ombres végétation | `vegetation.ts` | Zoom 16+ forêt | Ombres des arbres |
| 9 | Météo pluie | `weather.ts:244-311` | Activer météo pluie | Particules visibles, pas de crash |
| 10 | Météo neige | `weather.ts:244-311` | Activer météo neige | Flocons visibles |
| 11 | GPX 3D | `gpxLayers.ts:25-51` | Charger GPX | Tracé drapé sur relief |
| 12 | GPX 2D | `gpxLayers.ts:26-42` | Toggle 2D + GPX | Tracé plat visible |
| 13 | Sphère localisation | `location.ts:165` | Focus position | Sphère rouge + sprite |
| 14 | POI sprites | `poi.ts:507` | Zoom 16+ Suisse | Panneaux signalétiques |
| 15 | Bâtiments | `buildings.ts:19-26` | Zoom 16+ ville | Murs et toits visibles |
| 16 | Végétation InstancedMesh | `vegetation.ts:47-84` | Zoom 16+ forêt | 3 essences visibles |
| 17 | Sky / Soleil | `environment.ts` | Défaut | Ciel, cycle jour/nuit |
| 18 | Boussole (mini-renderer) | `compass.ts:26-67` | Défaut | Boussole tourne avec la caméra |
| 19 | Zone overlay | `ZoneOverlay.ts` | Sélectionner zone offline | Rectangle vert + bordures |
| 20 | Solar overlay | `solarRoute.ts` | Activer overlay solaire | Coloration ombre/soleil sur GPX |
| 21 | Fog | `environment.ts:65-99` | Défaut (grande distance) | Dégradé de brouillard |
| 22 | Profile marker | `profile.ts:374` | Ouvrir profil élévation | Marqueur cyan sur le tracé |
| 23 | Inclinomètre (raycaster) | `InclinometerWidget.ts` | `state.isPro = true` | Pente affichée correcte, pas NaN |

---

## Phase D — Tests multi-plateformes (2.5 jours)

### Préalable : Mock WebGL pour tests headless

Créer `src/test/webglMock.ts` pour `shader_smoke.test.ts` :

```typescript
// Options :
// A) vitest-webgl-canvas-mock (vérifier compatibilité Vitest 4.x)
// B) Mock manuel de HTMLCanvasElement.prototype.getContext('webgl2')
//    → stub getExtension(), getParameter(), getShaderPrecisionFormat(), etc.
// C) gl (headless WebGL via OSMesa/EGL) — plus réaliste mais plus lourd
```

À choisir pendant la Phase D selon compatibilité. L'objectif : `renderer.compile(scene, camera)` ne throw pas.

### Configurations

| # | Plateforme | GPU | Points critiques | Temps |
|---|---|---|---|---|
| D1 | Chrome Desktop Windows | Dédié (NVIDIA/AMD) | Tous les shaders, ombres | 0.25 j |
| D2 | Firefox Desktop | ANGLE | Différences WebGL | 0.25 j |
| D3 | Chrome Android Galaxy A53 | Mali G68 (Valhall) | Log depth, ombres, perf | 0.5 j |
| D4 | Android WebView Capacitor (A53) | Mali G68 | `logarithmicDepthBuffer` en WebView | 0.5 j |
| D5 | Safari iOS | iPhone récent | WebGL sur WebKit, memory limits | 0.5 j |
| D6 | Chrome Desktop `--disable-gpu` | Software | Fallback sans GPU | 0.25 j |
| D7 | Chrome Android milieu de gamme | Adreno 6xx | Vulnérabilités Adreno | 0.25 j |

### Vigilance Mali G71/G72 (Bifrost)

Les GPU Mali G71/G72 (Galaxy S9/S10, Exynos 2018-2020) rapportent `EXT_frag_depth` comme disponible mais **ignorent `gl_FragDepth`** — la valeur custom est silencieusement remplacée par la depth interpolée.

**Symptôme** : z-fighting sévère sur le terrain montagneux sans erreur console.

**Action** : pas de correction automatique (un fallback sans log depth serait pire). À la place :
1. Parser `WEBGL_debug_renderer_info` dans `performance.ts` pour détecter `Mali-G71` / `Mali-G72`
2. Logger un warning console : `[SunTrail] GPU Mali-G71 détecté — log depth buffer peut être buggué`
3. Ajouter un flag debug `state.DISABLE_LOG_DEPTH` (dans Paramètres Avancés) qui force `logarithmicDepthBuffer: false`
4. Si un utilisateur reporte du z-fighting → le guider vers ce toggle pour confirmer le diagnostic

### Tests automatisés à ajouter

| Fichier | Contenu | Quand |
|---|---|---|
| `shader_smoke.test.ts` | `renderer.compile(scene, camera)` sans throw | Phase D |
| `materialPool.test.ts` | `onBeforeCompile` attaché aux matériaux créés | Phase B (P1) |
| `renderer.test.ts` | `initScene()` crée un `WebGLRenderer` fonctionnel | Phase B (P1) |

---

## Phase E — Release (0.5 jour)

```bash
# 1. Version bump
# package.json : "5.78.9" → "5.79.0"
# android/app/build.gradle : versionCode + versionName synchronisés

# 2. CHANGELOG.md — Ajouter section [5.79.0]
# ### Changed
# - Three.js 0.160 → 0.184 (WebGLRenderer)
# - @types/three synchronisé 0.160 → 0.184
# ### Added
# - Test shader smoke (compilation headless)
# - Test materialPool onBeforeCompile
# - Détection Mali G71/G72 + warning console
# - Flag debug state.DISABLE_LOG_DEPTH

# 3. Mise à jour docs
# - CLAUDE.md : ligne version
# - GEMINI.md : ligne version
# - ROADMAP.md : marquer v5.79.0 comme complété

# 4. Commit + tag + push
git add -A
git commit -m "v5.79.0: upgrade Three.js 0.160→0.184"
git tag v5.79.0
git push --tags
```

---

## Étape 1 — Roadmap WebGPU (v6.5 → v7.0)

### Positionnement

```
v5.78.9 (actuel)     WebGLRenderer 0.160
  │
v5.79.0              WebGLRenderer 0.184   ← Étape 0 (ce plan)
  │
v6.0 - v6.2          GraphHopper, Strava, alertes sécurité
  │
v6.5                 WebGPU expérimental   ← Étape 1 (opt-in debug)
  │                    ├─ state.USE_WEBGPU (default false)
  │                    ├─ Détection navigator.gpu
  │                    ├─ Dual renderer WebGPU/WebGL
  │                    ├─ Bouton toggle debug (Paramètres Avancés)
  │                    └─ WebGL fallback automatique si !navigator.gpu
  │
v7.0                 WebGPU production
                       ├─ Migration TSL des shaders terrain
                       ├─ Shader météo en TSL
                       ├─ Polyfill log depth buffer WebGPU
                       └─ WebGPU-first, WebGL fallback
```

### Détail v6.5 (expérimental)

1. `state.USE_WEBGPU: boolean` (default `false`, persisté dans localStorage)
2. Détection `!!navigator.gpu` dans `performance.ts`
3. `initScene()` conditionnel :
   - Si `navigator.gpu` ET `state.USE_WEBGPU` → `WebGPURenderer`
   - Sinon → `WebGLRenderer` (fallback)
4. Type `state.renderer: THREE.WebGLRenderer | THREE.WebGPURenderer | null`
5. Toggle `webgpu-toggle` dans `SettingsSheet.ts` (section Paramètres Avancés, sous `debug-toggle`)
6. Si `navigator.gpu` absent → toggle grisé avec tooltip "WebGPU non supporté"

### Détail v7.0 (production)

1. Réécriture complète des shaders terrain en TSL (remplace `onBeforeCompile`)
2. Réécriture du shader météo en TSL (remplace `ShaderMaterial` GLSL)
3. Polyfill `logarithmicDepthBuffer` pour WebGPU (si dispo dans Three.js r185+)
4. WebGPU devient le renderer par défaut (WebGL fallback automatique)
5. Tests exhaustifs Android (Mali, Adreno, WebView Capacitor)

---

## Résumé des durées

| Phase | Durée | Cumul |
|---|---|---|
| A — Audit changelogs | 0.5 j | 0.5 j |
| B — Upgrade par 5 paliers | 2.0 j | 2.5 j |
| C — Vérification 22+ systèmes | 1.5 j | 4.0 j |
| D — Tests 7 plateformes | 2.5 j | 6.5 j |
| E — Release | 0.5 j | **7.0 j** |

---

## Checklist de sortie

```
[ ] Branche upgrade/threejs-184 créée
[ ] Phase A : audit changelogs complété, checklist compilée
[ ] Phase B : 5 paliers franchis, build+tests+Android OK à chaque palier
[ ] Phase C : 23 systèmes vérifiés visuellement, tous OK
[ ] Phase D : 7 configurations testées, tous OK
[ ] Phase D : Mali G71/G72 warning en place
[ ] Phase D : state.DISABLE_LOG_DEPTH toggle en place
[ ] Phase D : shader_smoke.test.ts ajouté et passe
[ ] Phase D : materialPool.test.ts vérifie onBeforeCompile
[ ] Phase D : renderer.test.ts vérifie initScene()
[ ] npm run check passe
[ ] npm test passe (1459+ tests)
[ ] npm run test:e2e passe
[ ] npm run build passe
[ ] CHANGELOG.md section [5.79.0]
[ ] CLAUDE.md / GEMINI.md version bump
[ ] ROADMAP.md v5.79.0 marqué complété
[ ] Version package.json → 5.79.0
[ ] Version android/app/build.gradle synchronisée
[ ] Commit + tag v5.79.0 + push
```
