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

## 📊 Couverture des tests (28 tests)

### 🌍 Terrain & Géographie (`terrain.test.ts`)
- **Conversion Mercator** : Validation des calculs Lng/Lat vers tuiles (zoom 0 à 13).
- **Décodage d'Altitude** : Vérification de la formule RGB -> Mètres (MapTiler).
- **Import GPX** : Transformation des traces GPS en courbes 3D (`Vector3`) avec gestion de l'exagération du relief.
- **Gestion du Monde** : Calcul des positions relatives par rapport à la tuile d'origine.

### ☀️ Système Solaire (`sun.test.ts`)
- **Cycles Jour/Nuit** : Validation des phases (Aube, Zénith, Heure Bleue, Heure Dorée, Nuit).
- **Éclairage Dynamique** : Mise à jour de l'intensité et de la couleur de `sunLight` selon l'heure simulée.
- **Interface Temporelle** : Mise à jour du DOM (horloge, aiguille solaire, indicateurs de phase).

### 🛠️ Utilitaires & Logique Métier (`utils.test.ts`)
- **Géofencing** : Détection précise des frontières suisses.
- **Performance** : Test du système de `throttle` pour limiter la charge CPU.
- **UI Feedback** : Validation du système de notifications (Toasts) avec limite de messages.

### ⚙️ État & UI (`state.test.ts` & `ui.test.ts`)
- **Persistence** : Chargement de la clé API depuis le `localStorage`.
- **Interactions** : Ouverture/Fermeture des panneaux de réglages et menus de calques.

## 🤖 Intégration Continue (CI)

Les tests sont automatiquement exécutés via **GitHub Actions** à chaque push sur la branche `main`. Si un test échoue, le déploiement sur GitHub Pages est automatiquement bloqué pour éviter toute régression en production.
