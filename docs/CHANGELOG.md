# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [4.3.64] - 2026-03-14
### 🎨 UI & Réglages Fins
- **Stats Performance :** Repositionnement du compteur FPS directement sous le bouton des réglages pour une meilleure ergonomie.
- **Preset Performance+ :** Augmentation du rayon de vue (`RANGE`) à 5 tuiles pour le preset "Performance" (High).
- **Stabilité LOD 12 :** Élargissement des seuils de transition pour garantir une vue régionale stable même avec une caméra inclinée.

## [4.3.63] - 2026-03-14
### 🚀 Navigation & Immersion Initiale
- **Vue Globale au Démarrage :** L'altitude initiale est désormais fixée à 35 km, déclenchant automatiquement une vue régionale en **LOD 12** pour une meilleure mise en contexte.
- **Saut Géographique HD :** La recherche de lieu et le centrage GPS réinitialisent maintenant l'altitude à 35 km (LOD 12), évitant d'arriver "au sol" dans le flou.
- **Optimisation 2D Spatiale :** Désactivation du chargement de l'élévation et réduction du maillage à 2 triangles pour les zooms <= 10 (gain massif de VRAM et bande passante).
- **Parabole de Zoom Pro :** La trajectoire de la caméra suit désormais une courbe parabolique qui redresse la vue vers la verticale à haute altitude (Auto-Tilt).
- **Boussole Restaurée :** Retour des points cardinaux (N, S, E, O) en haute définition sur l'interface 3D.
- **Stabilité LOD :** Le niveau de détail est désormais calculé sur la distance réelle à la cible, éliminant les clignotements lors des rotations.

## [4.3.44] - 2026-03-14
### ✨ Optimisation Finale & Stabilité
- **Version Cumulative :** Regroupement de toutes les optimisations de performance et corrections de stabilité mondiale (Origin Shift, Lat/Lon Fix).
- **README Refonte :** Mise à jour de la documentation pour refléter le nouvel état du moteur "Zero-Stutter".

## [4.3.43] - 2026-03-14
### 🛠️ Stabilité & Robustesse Mondiale
- **Inversion Lat/Lon Fix :** Correction d'une inversion critique des coordonnées dans le re-centrage du monde (Origin Shift), résolvant les écrans noirs.
- **LOD Calibration :** Recalibration complète des seuils de zoom pour une vue plus nette et détaillée plus tôt lors de la descente (Zoom 14 dès 20km).
- **Sûreté Géographique :** Désactivation automatique des calques spécifiques à la Suisse (Sentiers, Pentes) hors zone ou à haute altitude pour éliminer les erreurs 400.
- **Ultra Range :** Augmentation du rayon de vue (`RANGE`) à 8 tuiles pour le preset Ultra (RTX 4080).
- **Interface Lisible :** Amélioration du contraste du menu "Vitesse de Chargement" pour une meilleure visibilité.
- **Tests Unitaires :** Mise à jour et extension de la suite de tests (51 tests au vert) couvrant la sécurité géographique et les nouveaux paramètres.

## [4.3.26] - 2026-03-14
### 🚀 Fluidité Extrême & Zero Latence
- **Séquençage des Détails :** Implémentation d'une file d'attente prioritaire pour l'affichage des tuiles. Le terrain s'affiche d'abord, suivi des POI (+50ms), des bâtiments (+150ms) et de la forêt (+300ms), éliminant les pics de 140ms lors des zooms.
- **Gestion Statique des Ombres :** Désactivation de l'auto-update des ombres pendant le mouvement de la caméra. La Shadow Map n'est mise à jour que lors du changement de position du soleil (économie GPU massive).
- **Optimisation GPX :** Système de mise à jour adaptative de la géométrie du tracé. La reconstruction n'est déclenchée que si l'épaisseur change de plus de 20%, supprimant les gels CPU lors des transitions de LOD.
- **Bâtiments Batchés :** L'extrusion des bâtiments OSM est désormais fragmentée en micro-tâches asynchrones (lots de 20) pour ne jamais bloquer le fil principal.
- **Cache d'Altitude Spatial :** Ajout d'une localité spatiale (lastTile cache) pour la fonction `getAltitudeAt`, optimisant drastiquement la sécurité anti-collision de la caméra à 60fps.
- **Végétation Éco :** Réduction de la résolution de scan (48x48) et suppression des calculs de voisinage pour un gain de performance de 40% sur la génération des forêts.

## [4.3.25] - 2026-03-13
### 🔧 Stabilisation & Rendu Final
- **Ombres Géométriques :** Correction majeure permettant au relief de projeter des ombres réelles sur lui-même (customDepthMaterial). Les vallées sont maintenant plongées dans l'ombre des sommets de façon réaliste.
- **LOD Symétriques :** Réglage fin de l'hystérésis pour des transitions de zoom naturelles et sans effet de ressort.
- **Nettoyage Code :** Suppression de tous les logs de debug et optimisation des imports pour un build de production ultra-léger.
- **Z-Buffer Logarithmique :** Activation par défaut pour supprimer tout scintillement (flickering) sur le relief lointain.

## [4.3.0] - 2026-03-13
### 🏗️ Bâtiments 3D & Haute Définition
- **Bâtiments OSM :** Intégration de l'extrusion 3D des bâtiments avec gestion des fondations pour les pentes de montagne. Optimisation via fusion de géométries (1 seul draw call par tuile).
- **Boost de Résolution :** Passage aux textures 512px (@2x) et ajustement des seuils de LOD pour une netteté satellite immédiate.
- **Caméra Intelligente :** Système anti-collision sol (marge 30m) et limitation du Tilt (inclinaison) proportionnelle au zoom pour cacher l'horizon vide.
- **Refonte Géo :** Migration vers un module `geo.ts` centralisé pour supprimer les dépendances circulaires et stabiliser le rendu.
- **Sentiers HD :** Alignement des calques Swisstopo jusqu'au LOD 18.

## [4.2.6] - 2026-03-13
### 🕹️ Ergonomie Mobile Avancée
- **Rotation Multi-Touch libre :** Remplacement de MapControls par une instance OrbitControls configurée manuellement. La rotation à deux doigts (Twist) est désormais asymétrique et beaucoup plus fluide, ne nécessitant plus de point fixe.
- **Réactivité Doublée :** Augmentation du Damping Factor (0.1) pour un feeling de glisse plus nerveux et précis.
- **Robustesse TS :** Correction des erreurs de typage liées aux nouveaux contrôles pour garantir un build APK sans faille.

## [4.2.4] - 2026-03-13
### 📊 Solar Insight Dashboard
- **Analyse Interactive :** La timeline est désormais cliquable pour déplacer instantanément le soleil à l'heure choisie et visualiser l'ombre portée.
- **KPIs Avancés :** Affichage du lever de soleil réel (tenant compte du relief) et du cumul total d'ensoleillement.
- **Rapport Exportable :** Nouveau bouton de copie pour extraire les données d'analyse (coordonnées, cumul, lever).
- **Interface Premium :** Nouveau design du panneau d'analyse avec dégradés solaires et indicateurs de précision.

## [4.2.0] - 2026-03-13
### ☀️ Analyse Solaire Haute Précision
- **Interpolation Bi-linéaire :** Nouveau moteur de calcul d'altitude offrant une précision métrique et un lissage parfait entre les points de données.
- **Échantillonnage 5 min :** Passage à 288 tests d'occlusion par analyse (vs 96 auparavant) pour un cumul d'ensoleillement ultra-précis.
- **Ray-Marching Adaptatif :** Algorithme d'occlusion affiné (pas de 100m + accélération adaptative) pour détecter les crêtes les plus fines sur 50km.
- **Optimisation UI :** Calculs asynchrones par lots pour maintenir la fluidité de l'interface pendant l'analyse.

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
