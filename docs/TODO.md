# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## 🏁 En cours (v3.6.x)
- [x] Détection automatique du GPU (Performance Presets).
- [x] Système de File d'Attente Prioritaire (Flux de chargement).
- [x] Cache de Géométries Partagé (Réutilisation mémoire).
- [x] Organisation Pro du projet (Dossiers /src, /docs, /public).
- [x] Suite de tests automatisés (Vitest).
- [ ] Ajouter une boussole 3D en bas de l'écran.

## 🚀 Prochaine version (v3.7) - Immersion & Analyse
- [ ] **Forêts & Arbres 3D** : Génération de végétation 3D (InstancedMesh) basée sur la couverture forestière pour visualiser l'ombre réelle sur les sentiers.
- [ ] **Sonde Solaire** : Outil d'analyse au clic permettant de calculer la durée d'ensoleillement sur 24h pour un point précis (avec recommandations rando).
- [ ] **Partage de Vue (Deep Linking)** : Mise à jour de l'URL avec les coordonnées et l'heure pour partager une simulation via un lien.
- [ ] Ajouter une boussole 3D en bas de l'écran.

## 🌟 Version 4.0 - Réalité Augmentée & Environnement Avancé
- [ ] **Bâtiments 3D (LOD léger)** : Extrusion des bâtiments (OSM/MapTiler) pour les zones habitées et refuges, optimisée pour mobile.
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
