# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## ✅ Terminé (v3.9.6)
- [x] **Indicateur de Position Live** : Point bleu 3D synchronisé avec le GPS.
- [x] **Champ de Vision (Heading)** : Cône de direction basé sur la boussole magnétique.
- [x] **Mode Suivi Caméra** : Option pour garder l'utilisateur au centre de l'écran.
- [x] **Positionnement sur Relief** : Algorithme garantissant que le marqueur reste au-dessus du sol.

## 🏁 En cours (v4.0) - Randonnée HD & Immersion
- [ ] **Panneaux de Signalisation** : Affichage des icônes officielles de randonnée (Swisstopo) sur les carrefours.
- [ ] **Interface Éphémère** : Masquage automatique des contrôles pour maximiser la vue 3D.
- [ ] **Capture d'écran 3D** : Outil de partage de vue panoramique.
- [ ] **Mode Sombre/Clair** : Synchronisation avec le thème système.

## ✅ Terminé (v3.10.0)
- [x] **Cache Persistant Global** : Mise en cache locale de toutes les données (Couleur, Relief, Overlays).
- [x] **Moteur Hybride Stable** : Refactorisation complète de la classe Tile et des Shaders pour le Zoom 15.
- [x] **Correctif Démarrage** : Chargement forcé des tuiles proches dès l'initialisation.
- [x] **Robustesse Réseau** : Gestion des timeouts et des erreurs de coordonnées mondiales.
- [x] **Suppression Flash Blanc** : CSS critique injecté en HTML pour un démarrage sur fond noir.

## ✅ Terminé (v3.9.7)
- [x] **Support Zoom 15** : Niveau de détail maximal fonctionnel.
- [x] **Moteur Hybride** : Relief Z14 sur tuiles Z15 pour la stabilité mondiale.
- [x] **Sécurité Anti-Ghost** : Nettoyage asynchrone des ressources.
- [x] **Protection VRAM** : Rayon adaptatif au Zoom 15.

## ✅ Terminé (v3.9.6)
- [x] **Forêts 3D Denses** : Plantation de milliers d'arbres via `InstancedMesh`.
- [x] **Détection Adaptative** : Algorithme de détection par couleur spécifique à chaque source (CH, OpenTopo).
- [x] **Filtre de Voisinage** : Suppression des arbres isolés pour des massifs forestiers réalistes.
- [x] **Contrôle UI** : Option d'activation de la végétation dans les réglages.

## ✅ Terminé (v3.9.3)
- [x] **Brouillard Adaptatif** : Système de voile atmosphérique intelligent lié à l'altitude.
- [x] **Optimisation de l'Horizon** : Extension de la portée (250km) et bridage du dézoom (100km).
- [x] **Refonte du Picking** : Précision ~6m par Ray-marching CPU (validé v3.9.2 stable).

## ✅ Terminé (v3.9.2)
- [x] **Profil d'Altitude Interactif** : Graphique de dénivelé dynamique synchronisé avec la trace GPX en 3D.
- [x] **Précision Altimétrique** : Refonte du picking altitude via `pixelData` (fin des erreurs sur les plateaux).
- [x] **Refonte Esthétique GPX** : Tracé néon orange affiné et marqueur bleu cyan surélevé (+20m).
- [x] **Correction Synchronisation** : Recalcul des positions lors des changements de LOD/Zoom.
- [x] **Correctif Rendu** : Résolution du bug des tuiles noires (correction cache).

## ✅ Terminé (v3.9.1)
- [x] **Sonde Solaire** : Outil d'analyse au clic (durée d'ensoleillement 24h avec occlusion relief).
- [x] **Stabilisation Solaire** : Alignement du vecteur sonde avec le moteur 3D et prévention auto-occlusion.
- [x] **Refonte Interface Sonde** : Panneau agrandi, échelle au 1/4 d'heure, légende et fermeture au clic extérieur.
- [x] **Extraction Pixel Terrain** : Stockage CPU `pixelData` pour analyse instantanée.
- [x] **Tests Unitaires d'Analyse** : Validation Vitest du ray-marching et du décodage Terrain-RGB.

## ✅ Terminé (v3.8.4)
- [x] Optimisation de l'ergonomie mobile (LOD sous la recherche, boussole abaissée).
- [x] Boussole 3D Native Multi-Canvas Stabilisée (Rotation par caméra secondaire).
- [x] Partage de Vue (Deep Linking via URL Hash).
- [x] Moteur de recherche gratuit (Nominatim).
- [x] Optimisation des seuils de zoom (LOD) et hystérésis.


## 🌟 Version 4.0 - Réalité Augmentée & Moteur Avancé
- [ ] **Moteur d'Analyse Solaire Avancé** : Refonte de l'algorithme d'occlusion pour une précision métrique (Horizon Mapping ou interpolation bi-linéaire des textures d'élévation).
- [ ] **Moteur QuadTree LOD** : Refonte du système de tuiles pour mixer les résolutions (ex: Zoom 15 au centre, Zoom 11 au loin).
- [ ] **Zoom 15 (Ultra-Détail)** : Intégration du niveau de détail maximal (précision ~1m).
- [ ] **Signalétique Officielle Suisse** : Typage couleur des sentiers (Jaune/Rouge/Bleu).
- [ ] **Bâtiments 3D (LOD léger)** : Extrusion des bâtiments (OSM/MapTiler).
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
- [ ] **Interface Éphémère** : Masquage automatique des contrôles après inactivité pour maximiser la vue 3D (réapparition au clic/touch).
- [ ] Mode sombre/clair synchronisé avec le système.
- [ ] Partage de capture d'écran du rendu 3D.
- [ ] Graphique d'élévation dynamique pour les fichiers GPX.

## 💼 Stratégie Business & Diversification
- [ ] **Monétisation B2C** : Réfléchir à un modèle Freemium (Analyse solaire avancée et Offline illimité en Premium).
- [ ] **Sponsorisation POI** : Affichage de refuges et commerces partenaires sur la carte 3D.
- [ ] **Diversification Immobilière** : Créer un fork du projet pour le calcul d'ensoleillement des bâtiments (B2B).
- [ ] **Marketing Outdoor** : Préparer des visuels pour présenter le projet sur les réseaux sociaux (Instagram/LinkedIn).

