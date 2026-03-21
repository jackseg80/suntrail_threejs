# Infrastructure de Tests - SunTrail Three.js

Cette application utilise désormais **Vitest** et **JSDOM** pour garantir la stabilité du moteur 3D et des calculs géographiques.

## 🚀 Comment lancer les tests

Pour exécuter la suite de tests complète :
```bash
npm test
```

Pour lancer les tests en mode "watch" (pendant le développement) :
```bash
npx vitest
```

## 📊 Couverture des tests (63 tests validés)

### 🌍 Terrain & Géographie (`terrain.test.ts`, `geo.test.ts`)
- **Conversion Mercator** : Validation des calculs Lng/Lat vers tuiles (zoom 0 à 13).
- **Décodage d'Altitude** : Vérification de la formule RGB -> Mètres (MapTiler).
- **Import GPX** : Transformation des traces GPS en courbes 3D avec gestion de l'exagération.
- **Projections Spatiales** : Calcul des positions monde relatives.

### 🧭 Navigation & Suivi (`location.test.ts`, `compass.test.ts`)
- **Suivi GPS** : Interpolation 60 FPS et centrage haute précision.
- **Boussole Swisstopo** : Filtre passe-bas et amortissement de rotation.
- **Anti-Collision** : Sécurité de la caméra par rapport au relief.

### ☀️ Système Solaire & Analyse (`sun.test.ts`, `analysis.test.ts`)
- **Cycles Jour/Nuit** : Phases (Heure Dorée, Heure Bleue, etc.) et éclairage dynamique.
- **Sonde Solaire** : Analyse d'horizon et cumul d'ensoleillement sur 24h.

### 🚀 Performance & Workers (`workerManager.test.ts`, `memory.test.ts`)
- **Pool de Workers** : Initialisation et gestion asynchrone des tâches.
- **Gestion Mémoire** : Nettoyage VRAM récursif via `disposeObject`.

### 🌲 Environnement & Urbanisme (`vegetation.test.ts`, `buildings.test.ts`, `weather.test.ts`)
- **Végétation** : Sélection des essences par altitude.
- **Bâtiments** : Fusion de géométries et extrusion OSM.
- **Météo** : Moteur de particules et physique du vent.

### ⚙️ État & UI (`state.test.ts`, `ui.test.ts`)
- **State Management** : Intégrité de l'état global centralisé.
- **UI** : Gestion des panneaux, menus et modales SOS.

## 🤖 Intégration Continue (CI)

Les tests sont automatiquement exécutés via **GitHub Actions** à chaque push sur la branche `main`. Si un test échoue, le déploiement sur GitHub Pages est automatiquement bloqué pour éviter toute régression en production.
