# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [4.1.1] - 2026-03-13
### 🔧 Fiabilité & Robustesse
- **Clic POI Précis :** Optimisation du Raycasting (threshold et recherche directe) pour garantir la détection des clics sur les panneaux, même sur mobile.
- **Visibilité en Pente :** Augmentation de l'altitude des panneaux (+25m) pour éviter qu'ils ne soient masqués par le relief dans les zones escarpées.
- **Overpass Robust :** Réduction des timeouts et basculement intelligent entre serveurs pour mieux gérer la saturation de l'API OSM.
- **Signalétique Universelle :** Tous les panneaux sont désormais cliquables, avec un libellé par défaut ("Signalétique de randonnée") pour les objets sans tag "name".

## [4.1.0] - 2026-03-13
### 🚀 Immersion & Interaction
- **Interface Éphémère :** Les contrôles se masquent automatiquement après 5 secondes d'inactivité pour libérer la vue 3D. Réapparition instantanée au toucher ou mouvement.
- **Signalétique Interactive :** Les panneaux de randonnée 3D sont désormais cliquables. Une notification affiche le nom du lieu ou du carrefour.
- **Capture d'écran HD :** Nouveau bouton 📸 pour capturer la vue 3D actuelle (sans interface) et l'enregistrer localement.
- **Support Thème Système :** Synchronisation automatique avec le mode Sombre/Clair de l'OS (iOS/Android/Desktop).

## [4.0.3] - 2026-03-13
### 🚀 Optimisations Flagships
- **Galaxy S23 Ready :** Augmentation de la densité du maillage à 160 pour le profil "High", offrant un relief plus ciselé sur les écrans haute résolution.
- **Typage TypeScript :** Correction des erreurs d'assignation dans le module POI pour un déploiement sans faille.

## [4.0.2] - 2026-03-13
### 🚀 Turbo & WebP
- **Format WebP :** Migration vers le format WebP pour toutes les sources MapTiler, réduisant le poids des tuiles de 30 à 50% (chargement mobile ultra-rapide).
- **Chargement Parallèle :** Augmentation du parallélisme à 12 requêtes simultanées (au lieu de 6).
- **Robustesse Overpass :** Système de file d'attente globale et Mega-Zones (Z10) pour l'API OSM, garantissant 100% de succès sans erreur 429.

## [4.0.1] - 2026-03-13
### ✨ Fluidité d'Exploration
- **Seuils de Zoom Adaptatifs :** Le Zoom 13 est désormais maintenu jusqu'à 8km d'altitude (au lieu de 15km), rendant le survol des régions beaucoup plus léger et rapide.
- **Hystérésis Opti :** Ajustement des paliers pour éviter les clignotements lors de la descente vers le Zoom 14 et 15.

## [4.0.0] - 2026-03-13
### ✨ Randonnée HD
- **Signalétique 3D :** Affichage automatique des panneaux de signalisation de randonnée (données OSM) directement sur le relief.
- **Synchronisation Terrain :** Les panneaux sont ancrés dynamiquement sur le relief hybride du Zoom 15.

## [3.10.0] - 2026-03-13
### 🧱 Consolidation & "Bétonnage"
- **Cache Persistant Global :** Mise en cache automatique de toutes les données (Relief, Couleur, Sentiers, POI). Accélération majeure du démarrage et support du mode hors-ligne.
- **Moteur Hybride Stable :** Refonte de la classe Tile et des Shaders pour un Zoom 15 fluide et parfaitement aligné mondialement.
- **Suite de Tests Étendue :** Ajout de tests unitaires (Vitest) validant la précision de l'altitude au Zoom 15.
- **Protection Anti-Fantôme :** Sécurisation des chargements asynchrones éliminant les glitches visuels.
- **Splash Screen Opti :** Suppression du flash blanc au démarrage via un style CSS critique.
- **Bridage Robuste :** Clamping strict des coordonnées de tuiles pour éliminer les erreurs 404.

## [3.9.7] - 2026-03-13
### ✨ Ajouté
- **Ultra-LOD (Zoom 15) :** Détails topographiques extrêmes avec une résolution de ~1.5m par pixel (Suisse).
- **Seuils Adaptatifs :** Transition fluide vers le Zoom 15 dès que la caméra descend sous les 5km d'altitude.

### 🚀 Optimisations & Fixes
- **Relief Hybride Z15 :** Correction des erreurs 400 MapTiler en utilisant le relief du Zoom 14 ré-échantillonné dynamiquement pour les tuiles du Zoom 15.
- **Végétation Hybride :** Adaptation du moteur de plantation pour aligner parfaitement les arbres sur le relief hybride du Zoom 15.
- **VRAM L15 :** Bridage automatique du rayon de chargement à 2 tuiles lors de l'utilisation du Zoom 15 pour éviter la saturation mémoire.

## [3.9.6] - 2026-03-13
