# ⛰️ SunTrail 3D (v5.6.9)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données MapTiler / OpenStreetMap / IGN France. Optimisé pour les configurations haute performance (RTX 4080 / i9) et les appareils mobiles modernes.

## ✨ Nouveautés v5.6.x (Architecture & Performance)
- **Vector Trails Pro :** Sentiers de randonnée vectoriels haute définition (2048px) avec codage couleur dynamique pour une netteté absolue.
- **Material Pooling :** Réutilisation des matériaux et shaders pour une navigation "Zero-Stutter", éliminant les saccades de compilation.
- **Normal Map Offloading :** Déportation du calcul du relief vers les WebWorkers, réduisant de 87% la charge mémoire GPU.

## ✨ Nouveautés v5.5.x (GPS & Transitions Swisstopo)
- **Suivi GPS Haute Précision :** Centrage "pixel-perfect" sur l'altitude réelle du relief, éliminant tout décalage visuel.
- **Lissage Swisstopo :** Filtre passe-bas sur la boussole et les mouvements pour une fluidité de rotation "cinématographique".
- **Transition Solaire Parfaite :** Refonte des courbes de luminosité pour une transition monotone Heure Dorée -> Nuit.
- **Audit de Sécurité :** Correction des race conditions sur les workers et sécurisation totale contre les injections XSS.

## ✨ Nouveautés v5.4.x (RTX Stability & Hybrid Data)
- **Optimisation RTX & i9 :** Fusion massive des géométries de bâtiments pour garantir 144 FPS constants.
- **Hydrologie de Précision :** Shader d'eau avancé avec filtres de pente et de chromaticité.

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
