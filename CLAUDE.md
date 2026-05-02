# SunTrail — Guide IA (v5.52.2)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-05-02 — v5.52.2 : GPX import limit, ORS key UI, détection Suisse, perf rebuilds, i18n complète.


## Projet

App cartographique 3D mobile-first spécialisée randonnée (Three.js + Capacitor).
- **Simulation Solaire Unique** : Calcul d'ombres portées en temps réel sur le relief, mais aussi sur les **forêts (InstancedMesh)** et les **bâtiments 3D**, offrant un réalisme topographique inégalé.
- **Analyse Topographique** : Moteur d'analyse de profil, stats de précision (D+/D-, VAM) et inclinomètre numérique pro.
- **Disponibilité Géo** : Fonctionnalités HD variables selon les pays (priorité CH/FR/IT), projet en évolution constante pour étendre la couverture des données haute fidélité.
- **Core** : LOD adaptatif, PMTiles, Offline-first, Support GPX.
- **Hydrologie v5.34.0** : Refonte totale via Vector Tiles PBF (SwissTopo/MapTiler) et technique du "Texture Mask". Zéro Z-fighting, précision au pixel, adéquation relief parfaite.
- **Végétation v5.33.1** : Détection sémantique vectorielle (SwissTopo/MapTiler), filtrage par BBox optimisé (v5.34.0).
- **LOD v5.40.40** : Fix régression v5.38.x :
  - `boost=0.5` pour OpenTopoMap → `1.2` (causait un saut de seuils LOD au changement de source autoSelectMapSource, LOD 10→12 direct)
  - `* boost` retiré de LOD 11-14 + 10-7 (incohérence avec `autoSelectMapSource`)
  - `zoom <= 11` OpenTopoMap → `zoom <= 10` (juxtaposition OpenTopoMap/swisstopo au LOD 11)
  - `forcedRadius` dynamique → fixé à 1 (5×5 tuiles → 3×3, évite chevauchement)
  - `marginFactor` dynamique → fixé à 0.2 (tuiles persistantes, superposition de sources)
  - Sous-régions CH dans `geo.ts` : trous comblés (Sud 45.7°, nouvelle 46.6-47.9/8.6-9.3 pour Uri/Schwyz, Est étendu à 47.9°)


### ⚠️ Règles de Modification de Fichiers (SÉCURITÉ)

Sur l'environnement de développement Windows/PowerShell, des erreurs d'encodage et de syntaxe se produisent fréquemment lors de l'utilisation de commandes `replace` via Shell.
1. **Zéro BOM (Byte Order Mark)** : Ne JAMAIS utiliser `Out-File` ou `Set-Content` sans précaution sur les fichiers système Android (`build.gradle`, etc.). Gradle échoue si un caractère invisible est présent au début du fichier.
2. **Méthode .NET Garantie** : Pour modifier un fichier texte, préférer l'objet .NET en PowerShell qui garantit un UTF-8 sans signature :
   `$p='path'; $c=[System.IO.File]::ReadAllText($p) -replace 'old','new'; [System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($false)))`
3. **Double-Échappement** : Les guillemets dans les commandes Shell sous Windows nécessitent souvent un triple échappement (`\"\"\"` ou `\`). Si une modification échoue ou insère des antislashs indésirables, utiliser l'outil `write_file` pour réécrire le fichier complet proprement.
4. **Validation Android Studio** : Après toute modification de `build.gradle`, vérifier la validité de la syntaxe.


### 🚀 Protocole de Release (IMPÉRATIF)
1. **Pre-check** : Exécuter `npm run check` et `npm test`.
2. **Version Name** : Incrémenter dans `package.json` (ex: 5.27.5 → 5.27.6).
3. **Version Code** : **OBLIGATOIRE** - Incrémenter le `versionCode` dans `android/app/build.gradle` (ex: 668 → 669). Google Play rejette tout doublon.
4. **VersionName Android** : Synchroniser `versionName` dans `android/app/build.gradle` avec `package.json`.
5. **Changelog** : Mettre à jour `CHANGELOG.md` et `TODO.md`.
6. **IA Context** : Mettre à jour les headers de `CLAUDE.md` et `GEMINI.md`.
7. **Git** : Committer les changements de version, taguer (`git tag vX.Y.Z`) et pusher (`git push origin main --follow-tags`).

### 📚 Index de Documentation (Essentiel pour l'IA)

| Domaine | Document de Référence | Contenu |
| :--- | :--- | :--- |
| **État & Logique** | [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Proxy State, **Mapping EventBus**, Architecture Shaders. |
| **Rendu & Batterie** | [docs/AI_PERFORMANCE.md](docs/AI_PERFORMANCE.md) | **Dictionnaire des Magic Numbers**, Deep Sleep, DPR Cap. |
| **Design & UI** | [docs/AI_UI_STYLE_GUIDE.md](docs/AI_UI_STYLE_GUIDE.md) | **Grilles 2x2**, Instruments, Charts SVG, Variables CSS. |
| **Business & Gates** | [docs/MONETIZATION.md](docs/MONETIZATION.md) | RevenueCat, Grille Free/Pro, Logique des verrous. |
| **Interface & UX** | [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md) | TouchControls, SheetManager, DraggablePanels. |
| **Débogage** | [docs/AI_DEBUGGING.md](docs/AI_DEBUGGING.md) | **Workflows de Simulation**, Troubleshooting visuel. |
| **Historique** | [docs/archives/COMPLETED_HISTORY.md](docs/archives/COMPLETED_HISTORY.md) | Tout ce qui a été fait avant la v5.26.6. |

### Monétisation & Gates (Web vs Mobile)
- **Pack Suisse HD** : **GRATUIT SUR LE WEB** (v5.27.6). Débloqué automatiquement pour tous les utilisateurs web pour garantir une expérience cartographique premium immédiate.
- **Packs Pays (Android)** : Restent des achats In-App non-consumable (RevenueCat).
- **REC GPS** : **ENTIÈREMENT GRATUIT**. Pas de limite de temps. Sécurité d'abord.
- **Solaire** : Simulation 24h gratuite. Calendrier complet = PRO.
- **Offline** : 1 zone gratuite. Illimité = PRO.
- **LOD** : Plafond technique à 14 pour les gratuits (Toast d'upsell intégré).
- **Inclinomètre** : Feature PRO active (v5.27.5 : Réticule mobile + anticipation 15m).
- **Satellite** : Feature PRO active.
- **Alertes Sécurité** : Seront TOUJOURS gratuites (v6.0+).

### Calculs & Précision
- **Distance** : Formule **Haversine** (précision < 0.5%) via `haversineDistance()`.
- **D+ / D-** : Algorithme d'**Hystérésis avec seuil de 5m** (v5.29.30) via `calculateHysteresis()`. Optimisé pour les capteurs GPS sans baromètre (A53).
- **Lissage** : Moyenne mobile **5 points** sur l'altitude GPS (v5.29.30).
- **Filtrage GPS (v5.28.5)** : Rejeter tout point GPS avec saut vertical > 200m (si intervalle < 10s), distance horizontale < 2.5m (anti-champignon), ou vitesse > 600km/h.
- **Moteur de Terrain (v5.29.30)** : 
    - **Clé Unique** : Doit TOUJOURS inclure `MAP_SOURCE` (ex: `source_x_y_z`).
    - **Switch de Source** : `resetTerrain()` systématique lors du changement de `MAP_SOURCE` + vidage de la file de chargement (anti-patchwork).
    - **Gestion Mémoire** : Libération la VRAM via `texture.dispose()` UNIQUEMENT si la tuile n'est plus dans le `tileCache`.
    - **Auto-Save Vue** : Persistance automatique de la position/zoom lors de l'arrêt de l'interaction.
- **Rendu & Batterie (v5.29.7)** :
    - **Deep Sleep** : Réduction à **~1.5 FPS** après 30s d'inactivité.
    - **Auto-Throttle** : Réduction dynamique du DPR si FPS < 15.
- **Démarrage & UI (v5.29.30)** :
    - **Parallélisation** : Lancement de la scène 3D en parallèle de l'hydratation de l'UI secondaire pour éliminer l'écran blanc.
    - **TubeGeometry Stabilité** : Utiliser `centripetal` pour les splines. Rendu temps réel à 1500 segments max.
- **GPX Track Thickness (v5.40.40)** : Épaisseur exponentielle zoom-based (Komoot-style) : `base * 2^(max(0, 18-ZOOM))` avec cap 200m (import) / 250m (recording). Fonction partagée `computeTrackThickness()`. Rebuild déclenché par `controls.end` + throttle zoom + `touchControls` (`dispatchEvent('end')`).
- **Surface Offset GPX (v5.40.40)** : `GPX_SURFACE_OFFSET = 12` utilisé partout (`drapeToTerrain`, `addGPXLayer`, rebuild) au lieu du 30 hardcodé dans `_doUpdateAllGPXMeshes`.
- **Rebuild Robuste (v5.40.40)** : `_doUpdateAllGPXMeshes` utilise `for...of` + `try/catch` par layer au lieu de `.map()` qui faisait tout échouer si un layer plantait.
- **Cache Unifié (v5.28.33)** : `suntrail-tiles-v28` synchronisé entre thread principal et workers.


## Structure du Projet
- `src/modules/iapService.ts` : Liaison RevenueCat ↔ Google Play.
- `src/modules/recordingService.ts` : (v5.29.37) Logique orchestrée d'enregistrement GPS.
- `src/modules/gpxService.ts` : (v5.29.37) Import/Export et utilitaires GPX.
- `src/modules/gpxLayers.ts` : (v5.40.19) Gestion du rendu 3D des tracés (ex-terrain.ts).
- `src/modules/routeManager.ts` : (v5.51.0) Gestionnaire d'itinéraire "zero-mode" — markers 3D (Sprite orange cliquable), auto-compute debounce 800ms, mise à jour barre + panel réglages.
- `src/modules/appInit.ts` : (v5.51.0) Orchestration du démarrage. `setupLongPress()` (500ms + SVG feedback), `setupRouteBar()` (⚙ profil/boucle/ORS + ✕ effacer).
- `src/modules/environment.ts` : (v5.40.20) Ambiance 3D, Fog, Sky, Lights (ex-scene.ts).
- `src/modules/config.ts` : Résolution centralisée des clés API (Gist/Env).
- `src/modules/profile.ts` : Graphique d'élévation (v5.29.30: Priorité aux données raw GPX).
- `src/modules/scene.ts` : Moteur de rendu et boucle principale.
- `src/modules/cameraManager.ts` : Gestion de la caméra, animations flyTo et resize.
- `src/modules/poi.ts` : (v5.40.38) Détection et rendu 3D des POIs depuis tuiles vectorielles (SwissTopo/MapTiler). 8 catégories : trail (🔶 sentiers nommés), hut (🟤 refuges), rest (🟢 haltes), attraction (🔵 curiosités), viewpoint (🔭), shelter (🏠), info (i), guidepost (Signalisation). Détection unifiée SwissTopo (class/subclass) + MapTiler. Cache PBF zone-based.

## Tests & Qualité
- **Unitaires (Vitest)** : `npm test` (669 tests). Sécurise `iapService.ts`, `recordingService.ts`, `scene.ts`, `appInit.ts`, `environment.ts`, `gpxService.ts`, `acceptanceWall.ts`, `gpsDisclosure.ts`, `onboardingTutorial.ts`, `workerManager.ts`, `gpxLayers.ts`.
- **E2E (Playwright)** : `npx playwright test --ui` (Onboarding, GPS, Expert).
- **Mocks** : `src/test/setup.ts` pour WebGL. `ui.test.ts` utilise des timers fictifs.
