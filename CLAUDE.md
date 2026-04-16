# SunTrail — Guide IA (v5.29.1)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-04-15 suite à la v5.29.1 (Accès PRO & Chrono GPS).

## Projet

App cartographique 3D mobile-first pour la randonnée alpine.
Android natif (Capacitor) + PWA. Freemium (RevenueCat).

**Stack** : TypeScript strict · Three.js r160 · Vite 5 · Capacitor 6 · RevenueCat

## ⚠️ Règles & Décisions Actées (v5.28.42)

### 🚀 Protocole de Release (IMPÉRATIF)
1. **Version Name** : Incrémenter dans `package.json` (ex: 5.27.5 → 5.27.6).
2. **Version Code** : Incrémenter **TOUJOURS** le `versionCode` dans `android/app/build.gradle` (ex: 587 → 588). Google Play rejette tout build avec un version code déjà utilisé.
3. **Changelog** : Mettre à jour `CHANGELOG.md` et `TODO.md`.
4. **Git** : Taguer la version (`git tag vX.Y.Z`) et pusher les tags.

### 📚 Index de Documentation (Essentiel pour l'IA)

| Domaine | Document de Référence | Contenu |
| :--- | :--- | :--- |
| **État & Logique** | [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Proxy State, EventBus, **Calcul Haversine**, Hystérésis 2m. |
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
- **D+ / D-** : Algorithme d'**Hystérésis avec seuil de 3m** (Garmin standard) via `calculateHysteresis()`. Source de vérité unique pour les tracés et le profil (v5.28.20).
- **Lissage** : Moyenne mobile 3 points sur l'altitude GPS (v5.28.5).
- **Filtrage GPS (v5.28.5)** : Rejeter tout point GPS avec saut vertical > 200m (si intervalle < 10s), distance horizontale < 2.5m (anti-champignon), ou vitesse > 600km/h.
- **Moteur de Terrain (v5.28.42)** : 
    - **Clé Unique** : Doit TOUJOURS inclure `MAP_SOURCE` (ex: `source_x_y_z`) pour éviter les superpositions de couches Swisstopo/OpenTopo.
    - **Gestion Mémoire** : Libérer explicitement la VRAM via `texture.dispose()` dans le cycle de vie `Tile.dispose()`.
    - **LOD Asymétrique** : Ghost Tiles uniquement lors du Zoom-In. Purge immédiate au Zoom-Out.
- **TubeGeometry Stabilité (v5.28.34)** : Utiliser `centripetal` pour les splines. Rendu temps réel à 1500 segments max. Simplification RDP avec epsilon 1.0. **Debouncing 100-150ms** sur les mises à jour pour fluidifier la navigation.
- **Cache Unifié (v5.28.33)** : `suntrail-tiles-v28` synchronisé entre thread principal et workers. Garantit l'affichage instantané des packs hors-ligne et PMTiles.
- **Remplissage Visuel (v5.28.42)** : Quota de tuiles par frame (40 sur PC, 8-12 sur mobile) et pulse ultra-rapide sur PC (30ms) pour un affichage nerveux.


## Structure du Projet
- `src/modules/iapService.ts` : Liaison RevenueCat ↔ Google Play.
- `src/modules/config.ts` : Résolution centralisée des clés API (Gist/Env).
- `src/modules/boundedCache.ts` : Moteur de cache LRU pour les données RAM (OSM).
- `src/modules/ui/components/InclinometerWidget.ts` : Inclinomètre interactif (viseur mobile + GPS).
- `src/modules/ui/components/TrackSheet.ts` : Gestion des tracés et REC libre.
- `src/modules/ui/components/ConnectivitySheet.ts` : Mode hors-ligne (limite 1 zone free).
- `src/modules/ui/components/TimelineComponent.ts` : Solaire (calendrier Pro).
- `src/modules/scene.ts` : Moteur de rendu et boucle principale.
- `src/modules/cameraManager.ts` : Gestion de la caméra, animations flyTo et resize.

## Tests & Qualité
- **Unitaires (Vitest)** : `npm test` (500+ tests). Sécurise `scene.ts`, `touchControls.ts`, `ui.ts`. Exécutés en CI.
- **E2E (Playwright)** : `npx playwright test --ui` pour validation manuelle locale uniquement (Onboarding, GPS, Expert).
- **Mocks** : `src/test/setup.ts` pour WebGL. `ui.test.ts` utilise des timers fictifs.
- **Audit v5.28.2** : Couverture moteur 3D et interactions tactiles désormais validée.
