# ⛰️ SunTrail 3D (v4.3.0)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v4.3.0 (Bâtiments & HD)
- **Bâtiments 3D Réels :** Extrusion des volumes à partir des données OpenStreetMap. Les villages et refuges alpins prennent vie avec un rendu optimisé (Geometry Merging).
- **Qualité Satellite Supérieure :** Utilisation systématique de tuiles 512px (@2x) et seuils de zoom anticipés pour une netteté cristalline dès les premiers paliers.
- **Sécurité Caméra :** Prévention des collisions avec le sol et bridage dynamique de l'inclinaison (Tilt) en zoom élevé pour une immersion sans failles.
- **Synchronisation Totale :** Les sentiers de randonnée et calques de pentes sont désormais alignés jusqu'au niveau de détail 18.

## ✨ Nouveautés v4.2.3 (Analytique Solaire)
- **Solar Insight Dashboard :** Nouvel outil d'analyse complet avec calcul du lever de soleil réel (tenant compte du relief) et cumul d'ensoleillement.
- **Timeline Interactive :** Visualisation instantanée de l'ombre portée à une heure précise.

## ✨ Nouveautés v4.1.x (Immersion & UX)
- **Interface Éphémère :** Masquage automatique des contrôles pour une immersion totale.
- **Signalétique Interactive :** Panneaux de randonnée cliquables (Données OSM).
- **Capture d'écran HD :** Bouton 📸 dédié pour sauvegarder vos vues 3D.

## 📱 Application Mobile (Android)
SunTrail 3D est optimisé pour les appareils mobiles (Snapdragon Elite, Apple M-series) grâce à **Capacitor**. 

## 🧪 Tests & Qualité
- **Couverture :** 28 tests validés (Terrain, Sun, UI, Utils).
- **Architecture :** Nouveau moteur géographique modulaire (`geo.ts`).

## 📄 Documentation
- [Guide des Tests](./docs/TESTS.md)
- [Historique des versions (Changelog)](./docs/CHANGELOG.md)
- [Feuille de route (TODO)](./docs/TODO.md)
- [Guide Android](./docs/ANDROID.md)
