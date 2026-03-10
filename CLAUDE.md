# 🤖 CLAUDE.md (Guide Assistant IA)

Ce fichier définit les standards de développement et l'architecture de **SunTrail** pour les assistants IA (Gemini, Claude, etc.).

## 🏗️ Architecture du Projet

Le projet est modulaire et utilise des **ES Modules** (JS moderne).
- **`main.js`** : Point d'entrée, lance l'initialisation de l'UI.
- **`src/modules/state.js`** : Source unique de vérité pour l'état global (caméra, scène, coordonnées).
- **`src/modules/terrain.js`** : Logique de conversion géographique (Mercator), chargement des tuiles MapTiler et génération des maillages 3D.
- **`src/modules/sun.js`** : Calcul de la position du soleil (SunCalc) et mise à jour de la lumière directionnelle.
- **`src/modules/scene.js`** : Initialisation de Three.js, rendu et contrôles (OrbitControls).
- **`src/modules/ui.js`** : Gestion du DOM, événements et recherche (géocodage).

## 🛠️ Commandes de Développement

- **Serveur local :** `npm run dev` (Vite)
- **Build de production :** `npm run build`
- **Installation :** `npm install`

## 📏 Règles de Code et Standards

- **JavaScript :** ES6+, modules natifs, pas de framework (Vanilla JS).
- **Three.js :** 
    - Garder la `RESOLUTION` à 256 pour un bon équilibre entre détail et performance.
    - Utiliser `state.originTile` pour ancrer le monde 3D et éviter les erreurs de précision flottante.
    - Toujours disposer (`dispose()`) des géométries et matériaux lors de la suppression des tuiles.
- **Performances :** Limiter le `range` de chargement des tuiles pour préserver le GPU.
- **Variables Globales :** Interdites. Utiliser l'objet `state` importé depuis `state.js`.

## 🌐 Services Externes

- **MapTiler :** Fournisseur unique de tuiles (Terrain-RGB et Satellite).
- **SunCalc :** Utilisé pour la précision astronomique.

---
En cas de modification structurelle, mettre à jour ce fichier.
