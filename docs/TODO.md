# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## 🏁 En cours (v3.7.6)
- [x] Optimisation des seuils de zoom (LOD) et hystérésis (v3.7.6).
- [x] Correction du Z-Fighting (Offset vertical 10cm).
- [x] Stabilité visuelle sur mobile (Logarithmic Depth Buffer).
- [x] Optimisation drastique des requêtes MapTiler (Plan de Sauvetage).
- [x] Cache Persistant (Cache API) pour les tuiles de relief.
- [x] Recherche gratuite via Nominatim (OpenStreetMap).
- [x] Statistiques Session (Réseau vs Cache).
- [x] GPS Hybride résilient (Web + Mobile).
- [x] Carte des Pentes > 30° (Sécurité Swisstopo).
- [ ] Ajouter une boussole 3D en bas de l'écran.

## 🚀 Prochaine version (v3.8) - Immersion & Analyse
- [ ] **Forêts & Arbres 3D** : Génération de végétation 3D (InstancedMesh) basée sur la couverture forestière.
- [ ] **Sonde Solaire** : Outil d'analyse au clic (durée d'ensoleillement 24h).
- [ ] **Partage de Vue (Deep Linking)** : Partage de position/heure via URL.

## 🌟 Version 4.0 - Réalité Augmentée & Moteur Avancé
- [ ] **Moteur QuadTree LOD** : Refonte du système de tuiles pour mixer les résolutions (ex: Zoom 15 au centre, Zoom 11 au loin).
- [ ] **Zoom 15 (Ultra-Détail)** : Intégration du niveau de détail maximal (précision ~1m).
- [ ] **Signalétique Officielle Suisse** : Typage couleur des sentiers (Jaune/Rouge/Bleu).
- [ ] **Bâtiments 3D (LOD léger)** : Extrusion des bâtiments (OSM/MapTiler).
- [ ] **Météo Dynamique Temps Réel** : Intégration de données météo en direct (OpenWeather/MeteoBlue).
- [ ] **Rendu Atmosphérique** : Systèmes de particules pour la pluie/neige et shaders de couverture nuageuse dynamique sur la carte.
- [ ] **Mode Hors-ligne (Offline Zones)** : Sélectionner et télécharger une zone de terrain (textures + élévation) pour un usage sans réseau.
- [ ] **Accélération Cache** : Utilisation de l'IndexedDB pour un chargement instantané des zones sauvegardées.
- [ ] Intégration de WebXR pour le mode AR.
- [ ] Projection de la courbe solaire sur le flux caméra.
- [ ] Marqueurs de sommets en réalité augmentée.

## 🛠️ Améliorations Techniques
- [ ] **Occlusion Culling** : Ne pas charger les tuiles cachées derrière les montagnes.
- [ ] Utilisation de `InstancedMesh` pour les détails de surface (arbres, rochers).
- [ ] Support du mode hors-ligne (PWA / Cache local des tuiles).
- [ ] Transition vers `@capacitor/assets` pour toutes les plateformes (iOS inclus).

## 🎨 UX / UI
- [ ] Mode sombre/clair synchronisé avec le système.
- [ ] Partage de capture d'écran du rendu 3D.
- [ ] Graphique d'élévation dynamique pour les fichiers GPX.
