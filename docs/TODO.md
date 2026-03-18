# SunTrail 3D - Roadmap & TODO

## 🚀 Priorité 1 : Optimisations "Performance Invisible" (v5.5)
*Impact : Fluidité mobile extrême et économie de batterie.*

- [ ] **Normal Map Pre-computation (Worker)** : Déplacer le calcul des pentes du GPU vers les WebWorkers. Le Worker générera une Normal Map en plus de l'altitude.
    - *Gain :* Réduction de 500% des lectures de textures dans le shader de terrain.
- [ ] **Geometry Instancing & Sharing** : Utiliser un pool de géométries partagées (une par résolution) pour toutes les tuiles au lieu d'en créer une par objet.
    - *Gain :* Réduction drastique de l'empreinte VRAM et suppression des micro-freezes de création d'objets.
- [ ] **Frustum-Priority Queue** : Modifier l'ordonnanceur de tâches pour charger en priorité absolue les tuiles dans le champ de vision direct de la caméra.
    - *Gain :* Affichage instantané lors des rotations rapides.

## 🎯 Priorité 2 : UX & Utilité (v5.6)
*Impact : Rendre l'application indispensable pour le partage et la rando.*

- [ ] **Deep Linking (Smart URL)** : Synchroniser l'URL du navigateur avec la position (lat, lon, zoom, heure, source).
    - *Usage :* Envoyer un lien direct vers une vue précise du Niesen à 18h en mode satellite.
- [ ] **Multi-GPX Trace** : Support pour l'affichage et la comparaison de plusieurs fichiers GPX simultanément.

## ✨ Priorité 3 : Immersion Visuelle (v5.7)
*Impact : L'effet "Wow" et le réalisme.*

- [ ] **Advanced Night Mode** : Couche de pollution lumineuse urbaine ("Night Lights") fusionnée dynamiquement avec les textures satellite lors du passage à la nuit.
- [ ] **Vector Trails (MVT)** : Migration des sentiers vers le format vectoriel pour une netteté parfaite (sans flou de zoom).
- [ ] **Cloud Shadows** : Projection d'ombres de nuages procédurales basées sur la couverture nuageuse réelle d'Open-Meteo.

## ✅ Terminés (v5.4.7)
- [x] **Stabilisation Bâtiments RTX** : Fusion de géométrie et correction du bug de miroir Z.
- [x] **Régulateur Overpass LIFO** : File d'attente prioritaire et fallback Nominatim pour la recherche.
- [x] **Hydrologie Sélective** : Shader d'eau intelligent excluant les champs et la neige.
- [x] **Dashboard Expert v2** : Graphique de température 24h et éphémérides photo complets.
- [x] **Moteur WebWorkers** : Migration du fetch et décodage des tuiles (Elevation/Color).
- [x] **Vol Orbital (LOD 6)** : Extension du zoom arrière pour une vue continentale.
- [x] **Ciel Étendu** : Support des très hautes altitudes (10 000 km).
- [x] **Maintenance Qualité** : Typage TypeScript et tests unitaires 100% OK.
