# 🤖 CLAUDE.md (Guide Assistant IA) - SunTrail v3.0

Ce fichier définit les standards de développement pour le moteur **SunTrail v3.0**.

## 🏗️ Architecture Technique

1. **Terrain & Tuiles (`terrain.js`) :**
   - Classe `Tile` : Gère le cycle de vie (Idle -> Loading -> Loaded -> Disposed).
   - Multi-Grilles : Coexistence de tuiles de différents zooms (Z9 pour l'horizon, Z12-14 pour le détail).
   - Positionnement : Utilisation de coordonnées normalisées 0-1 pour un alignement parfait entre niveaux.
   - GPX : La logique de rendu du mesh GPX (`updateGPXMesh`) réside ici pour éviter les dépendances circulaires avec `ui.js`.

2. **Scène & Contrôles (`scene.js`) :**
   - Boucle de rendu : Inclut `animateTiles` (fondu) et `stats.update`.
   - Contrôles Adaptatifs : `isMobileDevice()` décide entre `MapControls` (translation) et `OrbitControls` (pivot).
   - Origine Flottante : Recentrage du monde tous les 15-20 km pour maintenir la précision des flottants (Z-fighting prevention).

3. **État Global (`state.js`) :**
   - Source unique de vérité. Ne jamais utiliser de variables globales hors de cet objet.

## 🚀 Concepts Clés v3.0

- **Hystérésis :** Utilisé pour les seuils de zoom et les frontières géographiques pour éviter le clignotement (flickering).
- **Anti-Burst :** Délai aléatoire sur les `fetch` pour respecter les quotas API.
- **VRAM Monitor :** Panneau Stats personnalisé surveillant `textures + geometries` pour valider le nettoyage (`dispose`).

## 📏 Standards de Code

- **Mémoire :** Tout objet Three.js créé doit être libéré via `.dispose()` dans `Tile.dispose()`.
- **CORS/429 :** Les échecs réseau doivent être gérés silencieusement dans `Tile.load()`.
- **Conversions :** Utiliser exclusivement `lngLatToWorld` et `worldToLngLat`.

---
Dernière mise à jour : 11 Mars 2026 (v3.0).
