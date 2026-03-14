# ⛰️ SunTrail 3D (v4.5.11)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v4.5.11 (Stability & Pro Navigation)
- **Fluidité 120 FPS :** Optimisation majeure de la boucle de rendu. Les calculs d'altitude lourds sont désormais asynchrones, garantissant une navigation sans saccades même sur mobile.
- **Butée Sol Infranchissable :** Système de collision intelligent ancrant la cible au relief. La caméra s'arrête désormais à 100m du sol réel, empêchant toute traversée du terrain.
- **Marker GPS Haute Visibilité :** Le signal de suivi utilise un système de Sprite à taille constante à l'écran. Il reste parfaitement visible, du sentier (50m) jusqu'à l'espace (35km).
- **Anti-Téléportation :** Sécurisation de l'Origin Shift qui attend la stabilisation du zoom avant de recentrer le monde, éliminant les sauts de caméra brusques.

## ✨ Nouveautés v4.5.x (Station Météo Expert)
- **Dashboard Centralisé :** Panneau majestueux regroupant l'analyse profonde des conditions.
- **Météogramme 24h :** Graphique dynamique de l'évolution de la température et du ciel (soleil/précipitations).
- **Éphéméride & Lumière :** Calcul automatique des Heures Dorées/Bleues et affichage de la phase lunaire réelle.
- **Sécurité Montagne :** Radars de rafales, visibilité réelle (km) et probabilité de précipitations.
- **Ergonomie Responsive :** Refonte totale du dashboard pour les mobiles en mode portrait.

## ✨ Nouveautés v4.4.0 (Atmosphere & Real-time Weather)
- **Météo Dynamique :** Rendu de pluie et neige 100% GPU basé sur les données réelles (Open-Meteo).
- **Physique du Vent :** Inclinaison et vitesse des particules pilotées par les conditions réelles de la zone.

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
