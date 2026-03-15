# ⛰️ SunTrail 3D (v4.5.46)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données MapTiler / OpenStreetMap.

## ✨ Nouveautés v4.5.46 (Extreme Performance & Stability)
- **Fluidité 120 FPS Adaptative :** Chargement segmenté et cache adaptatif selon la puissance de l'appareil (Eco, Balanced, Ultra).
- **Végétation Ultra-Light :** Réduction massive de la charge CPU lors de la génération des forêts sur mobile.
- **Anti-Collision Sol Pro :** Système de sécurité garantissant que la caméra ne traverse jamais le relief, avec chargement forcé du sol sous les pieds.
- **Suivi GPS Directionnel :** Boussole temps réel avec cône de vue (DeviceOrientation API) et rotation automatique de la carte.
- **Diagnostics Matériels :** Détection et affichage dynamique du GPU et du CPU au démarrage.
- **Support Safe-Areas :** Interface optimisée pour les écrans à encoche et barres système Android/iOS.
- **Bâtiments OSM Optimisés :** Fusion des géométries pour un rendu urbain fluide (1 seul Draw Call par tuile).


## ✨ Nouveautés v4.3.x (Turbo Mobile & Space View)
- **2D Turbo Engine :** Rendu spatial (LOD <= 10) garantissant 120 FPS à haute altitude.
- **Trajectoire Parabolique :** Zoom intelligent (Auto-Tilt) qui redresse la vue vers la 2D en montant.
- **Ombres de Montagne Réelles :** Les sommets projettent des ombres réalistes sur les vallées (50km de portée).

## 📱 Application Mobile (Android)
SunTrail 3D est optimisé pour les processeurs de dernière génération (Snapdragon Elite, Apple M4) avec des profils de performance automatiques.

## 📄 Documentation
- [Guide des Tests](./docs/TESTS.md)
- [Historique des versions (Changelog)](./docs/CHANGELOG.md)
- [Feuille de route (TODO)](./docs/TODO.md)
- [Guide Développeur (Claude)](./CLAUDE.md)
- [Guide Android](./docs/ANDROID.md)
