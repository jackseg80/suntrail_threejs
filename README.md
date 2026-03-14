# ⛰️ SunTrail 3D (v4.3.44)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v4.3.44 (Stabilité Mondiale & Fluidité)
- **Zero-Stutter Engine :** Séquençage asynchrone des détails (Arbres, Bâtiments, POI) et limitation du maillage par cycle pour une fluidité constante (120 FPS stables sur RTX 4080).
- **Navigation Spatiale Robuste :** Correction du re-centrage du monde (Origin Shift) et des inversions de coordonnées pour une exploration sans limite de la Suisse vers le monde entier.
- **LOD Haute Définition :** Recalibration des seuils pour afficher les détails 3D beaucoup plus haut (Zoom 14 dès 20km).
- **Gestion Éco des Ombres :** Mise à jour des ombres uniquement sur mouvement du soleil, économisant 80% de ressources GPU lors de l'exploration.
- **Réglages Expert :** Nouveau panneau permettant de piloter la densité de végétation et la vitesse de chargement séquentiel.
- **Sûreté Géographique :** Filtrage intelligent des calques locaux (Wanderwege) pour éviter les erreurs hors-zone.

## ✨ Nouveautés v4.3.25 (Optimisation & Rendu)
- **Ombres de Montagne Réelles :** Les sommets projettent désormais des ombres réalistes sur les vallées (Custom Depth Material), offrant une immersion digne des versions les plus abouties.
- **Bâtiments 3D (OSM) :** Intégration fluide de l'extrusion urbaine avec gestion des fondations pour les terrains escarpés.
- **Netteté Satellite HD :** Utilisation systématique de tuiles 512px (@2x) et seuils de zoom anticipés.
- **Stabilité Totale :** Correction des effets de rebond (hystérésis) et bouclier anti-collision sol pour la caméra.
- **Architecture Pro :** Nouveau moteur géographique modulaire (`geo.ts`) et nettoyage complet des dépendances circulaires.

## ✨ Nouveautés v4.2.3 (Analytique Solaire)
- **Solar Insight Dashboard :** Nouvel outil d'analyse complet avec calcul du lever de soleil réel et cumul d'ensoleillement métrique.
- **Timeline Interactive :** Visualisation instantanée de l'ombre portée à une heure précise.

## ✨ Nouveautés v4.1.x (Immersion & UX)
- **Interface Éphémère :** Masquage automatique des contrôles pour une immersion totale.
- **Signalétique Interactive :** Panneaux de randonnée cliquables avec informations de lieu.

## 📱 Application Mobile (Android)
SunTrail 3D est optimisé pour les processeurs de dernière génération (Snapdragon Elite, Apple M4) avec des profils de performance automatiques.

## 📄 Documentation
- [Guide des Tests](./docs/TESTS.md)
- [Historique des versions (Changelog)](./docs/CHANGELOG.md)
- [Feuille de route (TODO)](./docs/TODO.md)
- [Guide Développeur (Claude)](./CLAUDE.md)
- [Guide Android](./docs/ANDROID.md)
