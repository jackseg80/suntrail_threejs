# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [5.4.7] - 2026-03-18
### 🚀 Stabilisation & Performance RTX (i9/RTX 4080)
- **Moteur de Bâtiments 3D (v5.4.7)** : 
    - **Fusion de Géométrie** : Toutes les maisons d'une tuile sont fusionnées en un seul objet 3D, divisant par 100 les calculs de la carte graphique.
    - **Correction Z-Mirror** : Résolution du bug mathématique qui plaçait les bâtiments "dans les lacs". Alignement parfait avec les routes.
    - **Densité Ultra** : Augmentation à 150 bâtiments par tuile pour le profil Ultra.
- **Régulateur Overpass Intelligent** : 
    - **File d'attente LIFO** : Les requêtes Overpass sont traitées en priorité pour ce que vous regardez actuellement.
    - **Fallback OSM Nominatim** : Si l'API MapTiler est bloquée (Erreur 403), la recherche bascule automatiquement sur OpenStreetMap pour garantir un service continu.
    - **Anti-Spam Mouvement** : Les requêtes sont suspendues pendant le déplacement de la caméra et reprennent automatiquement à l'arrêt.
- **Hydrologie Haute Précision** :
    - **Filtre de Pente & Dominante** : Le shader d'eau ne s'active désormais que sur les zones parfaitement plates ET à dominante bleue, éliminant le "bleu" sur les champs blancs ou enneigés.
- **Interface & Dashboard** :
    - **Station Expert Complète** : Ajout du graphique de température sur 24h et synchronisation des éphémérides (Lune, Soleil, Heures Dorées).
    - **Label LOD Hybride** : Fusion du niveau de zoom et de la météo en un seul indicateur dynamique (ex: `SWISS: Lvl 15 | 12°C ☀️`).
    - **Raycasting Spatial** : Portée de clic étendue à 500km pour interagir avec le relief même depuis la stratosphère.
- **Maintenance Qualité** :
    - Nettoyage complet des erreurs TypeScript (`tsc --noEmit` à 100% vert).
    - Mise à jour de la suite de tests Vitest (63 tests validés).

---

## [5.0.1] - 2026-03-18
### 🚀 Performance V5 & Vol Orbital
- **WebWorkers Engine** : Migration du fetch et décodage des tuiles vers un pool de 8 Workers asynchrones pour une fluidité absolue.
- **LOD 6 Support** : Extension du zoom arrière jusqu'au niveau 6, permettant des vues continentales spectaculaires.
- **Ciel Orbital** : Atmosphère étendue à 10 000 km pour supporter les vols de très haute altitude.
- **Architecture Hybride** : Rétablissement du moteur visuel stable v4.9.1 (WebGL) combiné à la puissance brute de la V5.

... [rest of changelog remains the same] ...
