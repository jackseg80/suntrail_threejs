# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## 🏁 En cours (v3.9.2) - Végétation & Analyse
- [ ] **Profil d'Altitude Interactif** : Graphique de dénivelé dynamique synchronisé avec la trace GPX en 3D.
- [ ] **Forêts & Arbres 3D** : Génération de végétation 3D (InstancedMesh) basée sur la couverture forestière.

## ✅ Terminé (v3.9.1)
- [x] **Sonde Solaire** : Outil d'analyse au clic (durée d'ensoleillement 24h avec occlusion relief).
- [x] **Stabilisation Solaire** : Alignement du vecteur sonde avec le moteur 3D et prévention auto-occlusion.
- [x] **Refonte Interface Sonde** : Panneau agrandi, échelle au 1/4 d'heure, légende et fermeture au clic extérieur.
- [x] **Extraction Pixel Terrain** : Stockage CPU `pixelData` pour analyse instantanée.
- [x] **Tests Unitaires d'Analyse** : Validation Vitest du ray-marching et du décodage Terrain-RGB.

## ✅ Terminé (v3.8.4)
- [x] Optimisation de l'ergonomie mobile (LOD sous la recherche, boussole abaissée).
- [x] Boussole 3D Native Multi-Canvas Stabilisée (Rotation par caméra secondaire).
- [x] Partage de Vue (Deep Linking via URL Hash).
- [x] Moteur de recherche gratuit (Nominatim).
- [x] Optimisation des seuils de zoom (LOD) et hystérésis.


## 🌟 Version 4.0 - Réalité Augmentée & Moteur Avancé
- [ ] **Moteur d'Analyse Solaire Avancé** : Refonte de l'algorithme d'occlusion pour une précision métrique (Horizon Mapping ou interpolation bi-linéaire des textures d'élévation).
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
