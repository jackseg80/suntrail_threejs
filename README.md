# ⛰️ SunTrail 3D (v4.3.63)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v4.3.63 (Navigation & Immersion HD)
- **Décollage Global :** Démarrage et recherche de lieux en vue régionale HD (LOD 12) pour un meilleur contexte géographique.
- **Trajectoire Parabolique :** Zoom intelligent (Auto-Tilt) qui redresse la vue vers la 2D en montant et l'incline vers le relief en descendant.
- **Turbo Space Engine :** Rendu 2D ultra-léger pour les hautes altitudes (Space View), économisant 50% de ressources.
- **Boussole Interactive :** Boussole 3D native avec points cardinaux HD.
- **LOD Stable :** Calcul de résolution insensible à l'inclinaison pour une image calme et stable.

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
