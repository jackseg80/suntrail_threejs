# SunTrail — Guide IA (v5.29.30)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-04-17 suite à la v5.29.30 (Reliability & Performance Update).

## Projet

App cartographique 3D mobile-first pour la randonnée alpine.
Android natif (Capacitor) + PWA. Freemium (RevenueCat).

**Stack** : TypeScript strict · Three.js r160 · Vite 5 · Capacitor 6 · RevenueCat

## ⚠️ Règles & Décisions Actées (v5.29.30)

### 🚀 Protocole de Release (IMPÉRATIF)
1. **Version Name** : Incrémenter dans `package.json` (ex: 5.27.5 → 5.27.6).
2. **Version Code** : Incrémenter **TOUJOURS** le `versionCode` dans `android/app/build.gradle` (ex: 587 → 588). Google Play rejette tout build avec un version code déjà utilisé.
3. **Changelog** : Mettre à jour `CHANGELOG.md` et `TODO.md`.
4. **Git** : Taguer la version (`git tag vX.Y.Z`) et pusher les tags.

### 📚 Index de Documentation (Essentiel pour l'IA)

| Domaine | Document de Référence | Contenu |
| :--- | :--- | :--- |
| **État & Logique** | [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Proxy State, EventBus, **Calcul Haversine**, Hystérésis 5m. |
| **Rendu & Batterie** | [docs/AI_PERFORMANCE.md](docs/AI_PERFORMANCE.md) | Deep Sleep, Throttle 20fps, DPR Cap, Presets GPU. |
| **Business & Gates** | [docs/MONETIZATION.md](docs/MONETIZATION.md) | RevenueCat, Grille Free/Pro, Logique des verrous (LOD, Solaire). |
| **Interface & UX** | [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md) | TouchControls, SheetManager, DraggablePanels. |
| **Roadmap** | [docs/TODO.md](docs/TODO.md) | Priorités Production V5 et Roadmap V6. |
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
- `src/modules/config.ts` : Résolution centralisée des clés API (Gist/Env).
- `src/modules/profile.ts` : Graphique d'élévation (v5.29.30: Priorité aux données raw GPX).
- `src/modules/scene.ts` : Moteur de rendu et boucle principale.
- `src/modules/cameraManager.ts` : Gestion de la caméra, animations flyTo et resize.

## Tests & Qualité
- **Unitaires (Vitest)** : `npm test` (500+ tests). Sécurise `scene.ts`, `touchControls.ts`, `ui.ts`.
- **E2E (Playwright)** : `npx playwright test --ui` (Onboarding, GPS, Expert).
- **Mocks** : `src/test/setup.ts` pour WebGL. `ui.test.ts` utilise des timers fictifs.
