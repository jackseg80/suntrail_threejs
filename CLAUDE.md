# SunTrail — Guide IA (v5.34.6)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-04-19 suite à la v5.34.6 (Network Stability & Perfs).


## Projet

App cartographique 3D mobile-first spécialisée randonnée (Three.js + Capacitor).
- **Core** : LOD adaptatif, PMTiles, Offline-first, Support GPX.
- **Hydrologie v5.34.0** : Refonte totale via Vector Tiles PBF (SwissTopo/MapTiler) et technique du "Texture Mask". Zéro Z-fighting, précision au pixel, adéquation relief parfaite.
- **Végétation v5.33.1** : Détection sémantique vectorielle (SwissTopo/MapTiler), filtrage par BBox optimisé (v5.34.0).
- **LOD v5.32.18** : Moteur zero-latency, nettoyage agressif dézoom, optimisations 2D.


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
- **Cache Unifié (v5.28.33)** : `suntrail-tiles-v28` synchronisé entre thread principal et workers.


## Structure du Projet
- `src/modules/iapService.ts` : Liaison RevenueCat ↔ Google Play.
- `src/modules/recordingService.ts` : (v5.29.37) Logique orchestrée d'enregistrement GPS.
- `src/modules/gpxService.ts` : (v5.29.37) Import/Export et utilitaires GPX.
- `src/modules/config.ts` : Résolution centralisée des clés API (Gist/Env).
- `src/modules/profile.ts` : Graphique d'élévation (v5.29.30: Priorité aux données raw GPX).
- `src/modules/scene.ts` : Moteur de rendu et boucle principale.
- `src/modules/cameraManager.ts` : Gestion de la caméra, animations flyTo et resize.

## Tests & Qualité
- **Unitaires (Vitest)** : `npm test` (600+ tests). Sécurise `iapService.ts`, `recordingService.ts`, `scene.ts`.
- **E2E (Playwright)** : `npx playwright test --ui` (Onboarding, GPS, Expert).
- **Mocks** : `src/test/setup.ts` pour WebGL. `ui.test.ts` utilise des timers fictifs.
