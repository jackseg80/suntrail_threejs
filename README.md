# ⛰️ SunTrail 3D (v5.4.7)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données MapTiler / OpenStreetMap / IGN France. Optimisé pour les configurations haute performance (RTX 4080 / i9).

## ✨ Nouveautés v5.4.x (RTX Stability & Hybrid Data)
- **Optimisation RTX & i9 :** Fusion massive des géométries de bâtiments et désactivation des mises à jour matricielles automatiques pour garantir 144 FPS constants même avec des milliers d'objets.
- **Moteur Overpass LIFO :** File d'attente intelligente traitant les requêtes OSM en priorité selon le champ de vision actuel pour un affichage instantané des détails urbains.
- **Secours de Recherche (Fallback) :** Basculement automatique sur OpenStreetMap Nominatim en cas de saturation ou de blocage de l'API MapTiler (Erreur 403).
- **Hydrologie de Précision :** Shader d'eau avancé avec filtres de pente et de chromaticité, éliminant les faux positifs sur les zones claires (champs, neige).
- **Correctif Géo-Spatial :** Résolution définitive du bug de miroir Z sur les bâtiments ; alignement parfait des volumes avec les données topographiques.

## ✨ Nouveautés v5.0.x (WebWorkers Engine)
- **Moteur Asynchrone :** Déportation complète du téléchargement et du décodage des tuiles vers un pool de 8 WebWorkers, libérant le thread principal pour une fluidité absolue.
- **Vol Orbital :** Support étendu jusqu'au LOD 6 et atmosphère jusqu'à 10 000 km pour des transitions fluides de la rue jusqu'à l'espace.

## ✨ Nouveautés v4.9.x (Expansion & Immersion)
- **Végétation Bio-Fidèle :** Diversification des forêts avec 3 essences (Feuillus, Sapins, Mélèzes) sélectionnées dynamiquement selon l'altitude réelle.
- **Support IGN France :** Basculement automatique sur les serveurs de la Géoplateforme pour une précision officielle lors du survol de l'Hexagone.

## ✨ Nouveautés v4.8.x (Safety & Precision)
- **Inclinomètre Mathématique :** Calcul de la pente réelle au pixel près (100% GPU) avec coloration de sécurité avalanche (Jaune/Orange/Rouge).

## 📱 Application Mobile (Android)
SunTrail 3D est optimisé pour les processeurs mobiles de dernière génération avec des profils de performance adaptatifs (Eco, Balanced, Performance, Ultra) et une gestion intelligente de la VRAM.

## 📄 Documentation
- [Liste des Fonctionnalités](./docs/FEATURES.md)
- [Guide des Tests](./docs/TESTS.md)
- [Historique des versions (Changelog)](./docs/CHANGELOG.md)
- [Feuille de route (TODO)](./docs/TODO.md)
- [Guide Développeur (Claude/Gemini)](./CLAUDE.md)
- [Guide Android](./docs/ANDROID.md)
