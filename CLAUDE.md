# 🤖 CLAUDE.md (Guide Assistant IA)

Ce fichier définit les standards de développement et l'architecture de **SunTrail v2.5** pour les assistants IA.

## 🏗️ Architecture du Projet

Le projet utilise une architecture **Orientée Objet** pour la gestion du terrain.
- **`src/modules/terrain.js`** : Contient la classe `Tile`. Chaque tuile gère son propre chargement, son maillage et son effet de fondu (`Fade-in`).
- **`src/modules/scene.js`** : Gère la boucle de rendu et l'**Auto-Zoom**. Implémente une logique de compensation d'origine pour des transitions fluides entre niveaux Swisstopo.
- **`src/modules/state.js`** : État global réactif. `state.originTile` est l'ancre du monde 3D.
- **`src/modules/ui.js`** : Gestion du DOM et synchronisation de la trace GPX.
- **`src/modules/sun.js`** : Calculs astronomiques via SunCalc.

## 🚀 Concepts Clés (v2.5)

1. **LOD (Level of Detail) :**
   - **Géométrique :** Résolution adaptative (128 à 32 segments) selon la distance caméra-tuile.
   - **Zoom :** Changement automatique du niveau de tuile MapTiler (12, 13, 14) selon l'altitude.
2. **Gestion de l'Origine :** L'origine flottante est mise à jour lors des déplacements importants (>10km) pour maintenir la précision. Les positions des objets existants sont compensées mathématiquement pour éviter les sauts visuels.
3. **Mise en cache :** `dataCache` (Map) stocke les textures pour un rechargement instantané.
4. **Précision Altitude :** Récupérée via Raycasting sur la géométrie physique (CPU displacement).

## 📏 Standards de Code

- **Performance :** Toujours utiliser `dispose()` sur les géométries, textures et matériaux dans `Tile.dispose()`.
- **Coordonnées :** Toujours utiliser `lngLatToWorld` et `worldToLngLat` pour toute conversion spatiale.
- **Stabilité :** Ne pas modifier la logique de positionnement des tuiles sans tester l'alignement aux bords (Gaps).

## 🌐 Services

- **MapTiler :** Terrain-RGB v2 et Swisstopo.
- **SunCalc :** Précision solaire.

---
Dernière mise à jour : v2.5 stable.
