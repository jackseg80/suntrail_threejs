# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [3.9.6] - 2026-03-13
### ✨ Ajouté
- **Indicateur de Position Live :** Affichage d'un marqueur 3D (point bleu) représentant la position GPS réelle de l'utilisateur.
- **Indicateur de Direction (Heading) :** Cône de vision dynamique synchronisé avec la boussole magnétique de l'appareil (iOS & Android).
- **Mode Suivi Automatique :** Nouveau bouton "Suivre ma position" permettant de garder la caméra centrée sur l'utilisateur durant ses déplacements.
- **Positionnement Intelligent :** Le marqueur utilise un mix entre l'altitude GPS et l'altitude du relief local pour rester visible même en cas de signal GPS imprécis.

## [3.9.4] - 2026-03-12
### ✨ Ajouté
- **Forêts 3D Denses :** Système de végétation haute performance capable d'afficher jusqu'à 12 000 arbres par tuile.
- **Analyse de Voisinage :** Algorithme intelligent supprimant les arbres isolés pour ne garder que de véritables massifs forestiers cohérents.
- **Détection par Source :** Paramétrages spécifiques pour Swisstopo et OpenTopoMap afin de garantir une plantation précise selon le style de carte.

### ✨ Améliorations
- **Performances Végétation :** Utilisation d'`InstancedMesh` et limitation de l'affichage au Zoom 14.
- **Gestion des Ressources :** Destruction systématique (GPU dispose) des forêts lors du nettoyage des tuiles pour prévenir la saturation VRAM.
- **Optimisation du Picking :** Limitation de la portée du Ray-marching à la distance de visibilité réelle (FOG_FAR).
- **Contrôle Utilisateur :** Ajout d'une option pour activer/désactiver les forêts 3D dans les réglages.
- **Auto-Performance :** Détection des GPU haut de gamme (Adreno 7xx+) pour activer automatiquement le profil Performance.

## [3.9.3] - 2026-03-12
### ✨ Ajouté
- **Brouillard Adaptatif :** Système de brouillard linéaire dynamique lié à la distance de la caméra.
- **Voile Atmosphérique :** Nouveau curseur de réglage (plage 20-100km).
- **Filtrage Anisotrope :** Activation de l'anisotropie maximale sur les textures pour une netteté parfaite à angle rasant.

### ✨ Améliorations
- **Seuils Ultra-LOD :** Déclenchement du Zoom 14 dès 15km d'altitude pour éliminer tout flou lors de la descente.
- **Portée Horizon :** Extension du plan de coupe lointain (`far`) à 250km.
- **Optimisation Dézoom :** Bridage du dézoom maximal à 100km.
- **Chargement Résilient :** Isolation du relief ; le terrain s'affiche désormais même en cas d'erreur de chargement de l'image satellite.

## [3.9.2] - 2026-03-12
### ✨ Ajouté
- **Profil d'Altitude Interactif :** Nouveau panneau dynamique affichant le dénivelé d'un tracé GPX.
- **Synchronisation 3D :** Survol du graphique synchronisé avec un marqueur sphérique sur la carte.

### ✨ Améliorations
- **Esthétique GPX :** Tracé affiné avec effet néon orange/rouge haute intensité.
- **Marqueur de Profil :** Pastille bleu cyan lumineuse, agrandie et surélevée de 20m pour rester visible au-dessus du tracé.
- **Stabilité LOD :** Recalcul dynamique des positions monde lors des changements de niveau de détail ou de recentrage.

### 🛠️ Qualité & Maintenance
- **Refonte des Tests :** Suite de 34 tests validés couvrant le picking, la sonde solaire et le profil d'altitude.
- **Correction TypeScript :** Résolution des erreurs de types et nettoyage des imports inutilisés pour un build de production propre.
- **Ray-marching CPU :** Implémentation d'un algorithme haute précision (~6m) pour le picking altitude, contournant les limites du Raycaster natif.

## [3.9.1] - 2026-03-12
### ✨ Ajouté
- **Sonde Solaire (Analyse 24h) :** Nouvel outil d'analyse permettant de calculer la durée d'ensoleillement réelle d'un point cliqué, en tenant compte de l'obstruction par les montagnes environnantes.
- **Ray-marching CPU :** Implémentation d'un algorithme de suivi de rayon performant pour détecter l'occlusion solaire sur une portée de 40km.
- **Interface d'Analyse :** Panneau agrandi avec échelle temporelle (quarts d'heure), légende des couleurs et fermeture intelligente au clic extérieur.
- **Tests de Validation :** Ajout d'une suite de tests unitaires pour le module d'analyse (`analysis.test.ts`) garantissant la précision des calculs d'altitude et d'occlusion.

### ✨ Améliorations
- **Alignement Solaire :** Synchronisation parfaite entre le vecteur de calcul de la sonde et le rendu visuel des ombres.
- **Extraction Pixel Terrain :** La classe `Tile` stocke désormais les données brutes d'élévation (`pixelData`) pour un accès CPU instantané sans solliciter le GPU.

## [3.8.5] - 2026-03-12
### ✨ Améliorations
- **Contrôle de l'Interface :** Ajout d'options dans les réglages pour masquer/afficher les statistiques de performance et les informations de navigation (LOD, coordonnées).
- **Correctif Ombres :** Restauration des paramètres de la caméra d'ombre (Near/Far) pour assurer la visibilité des ombres sur de grandes distances.

## [3.8.4] - 2026-03-12
### ✨ Améliorations
- **Boussole 3D Stabilisée :** Refonte du système de rotation. La boussole utilise désormais une caméra secondaire synchronisée sur le vecteur de vue, assurant une précision parfaite en lacet (yaw) et en tangage (pitch).
- **Alignement Monde :** Recalage des points cardinaux sur les axes réels de la scène (Nord à -Z).
- **Ergonomie Mobile :** 
  - Repositionnement de l'indicateur de zoom (LOD) juste sous la barre de recherche pour une meilleure visibilité.
  - Abaissement de la boussole 3D pour éviter les zones de confort du pouce et libérer le centre de l'écran.

## [3.8.3] - 2026-03-12 (Raffinement Mobile)
### Changé
- **Ergonomie Mobile :** Repositionnement des statistiques de performance sous le bouton réglages et remontée de la boussole au-dessus de la barre de temps.
- **Transparence Boussole :** Utilisation d'un second canvas HTML indépendant pour éliminer les zones de découpe et assurer une transparence parfaite sur la carte.

---

## [3.8.2] - 2026-03-12 (Instrumentation & Partage)
### Ajouté
- **Boussole 3D Native :** Implémentation d'un second renderer Three.js indépendant pour une boussole haute visibilité avec points cardinaux (N, E, S, O).
- **Deep Linking :** Synchronisation automatique de l'URL avec les coordonnées GPS, le niveau de zoom et l'heure de simulation.
- **Moteur Nominatim :** Passage à la recherche de lieux via OpenStreetMap (gratuit et illimité).

### Changé
- **Refonte UI :** Repositionnement des contrôles pour une meilleure ergonomie (Stats en haut-gauche, Boussole en bas-droite, GPS sous les calques).
- **LOD & Stabilité :** Optimisation des seuils de zoom et correction du Z-Fighting (offset 10cm) pour une fluidité visuelle parfaite sur mobile.

---

## [3.7.6] - 2026-03-12 (Zoom Naturel)
### Ajouté
- **Gestion du Cache :** Nouveau bouton dans les réglages pour vider manuellement le cache persistant des tuiles.
- **Mise à jour de Clé API :** Possibilité de modifier et sauvegarder une nouvelle clé MapTiler Cloud directement depuis l'interface, sans rechargement.

### Changé
- **Sécurité :** Masquage de la clé API dans le panneau de réglages.

---

## [3.7.6] - 2026-03-12 (Zoom Naturel)
### Changé
- **Optimisation LOD :** Ajustement des seuils de zoom automatique pour des transitions plus douces (Zoom 14 activé plus près du sol).
- **Hystérésis Zoom :** Élargissement des zones tampons pour supprimer le clignotement entre niveaux de détail lors de l'inclinaison caméra.

---

## [3.7.5] - 2026-03-12 (Stabilité Visuelle Mobile)
### Corrigé
- **Z-Fighting & Scintillements :** Implémentation d'un décalage vertical (offset de 10cm) sur l'ancien maillage durant les transitions. Supprime les fourmillements visuels lors des mouvements de caméra sur mobile.
- **Cycle de Vie Tile :** Correction d'un bug dans la classe `Tile` (méthode `isVisible`) qui causait un écran noir.

---

## [3.7.4] - 2026-03-12 (Conformité & Transparence)
### Ajouté
- **Statistiques Réseau :** Affichage en temps réel des requêtes économisées grâce au cache (Compteurs Réseau vs Cache).
- **GPS Hybride :** Support automatique du GPS Web (navigateur) si Capacitor n'est pas disponible.
- **Accessibilité DOM :** Correction des avertissements de sécurité Chrome sur les formulaires de mot de passe (clés API).

### Changé
- **Cache API :** Optimisation du système de stockage pour une meilleure gestion de l'espace disque.

---

## [3.7.3] - 2026-03-12 (Gestion du Stockage)
### Ajouté
- **Cache Persistant (Cache API) :** Stockage permanent des tuiles de relief MapTiler sur le disque local. Une zone déjà visitée ne consomme plus **aucune** requête réseau lors des prochaines sessions.
- **Moteur de Recherche Gratuit :** Migration de MapTiler Geocoding vers **Nominatim (OpenStreetMap)** pour supprimer les coûts liés à la barre de recherche.

### Changé
- **Réduction de Portée (Eco-Range) :** Ajustement du rayon de chargement des tuiles pour économiser ~40% de requêtes par mouvement.
- **Cache LRU Boosté :** Augmentation de la mémoire vive allouée aux tuiles (800 tuiles PC / 200 Mobile).

---

## [3.7.0] - 2026-03-12 (Sécurité & Clarté)
### Ajouté
- **Carte des Pentes (> 30°)** : Intégration du calque officiel Swisstopo pour identifier les zones à risque.
- **Shader Multi-Calques** : Support de la superposition simultanée de plusieurs textures (Terrain + Sentiers + Pentes).
- **Hystérésis GPS** : Bridage temporel du changement automatique de source pour éviter les clignotements aux frontières.

### Changé
- **Transitions Invisibles** : Implémentation d'une suppression différée des maillages (superposition de 500ms) éliminant 100% des flashs blancs.
- **Chargement Résilient** : L'échec d'un calque optionnel (ex: pentes hors Suisse) ne bloque plus l'affichage du relief.

---

## [3.6.2] - 2026-03-12 (Confort Mobile)
### Ajouté
- **Media Queries Responsives :** Adaptation de l'interface pour les écrans mobiles étroits (< 600px).
- **Optimisation Barre de Recherche :** Largeur dynamique et marges accrues pour éviter le chevauchement des boutons `settings` et `layer`.

### Changé
- **Taille des Contrôles :** Réduction de la taille des boutons et menus sur mobile pour maximiser la visibilité de la carte.

---

## [3.6.1] - 2026-03-12 (Fluidité Critique)
### Ajouté
- **Système de File d'Attente (Priority Queue) :** Chargement asynchrone des tuiles bridé au niveau CPU pour maintenir des FPS constants (144 FPS sur RTX 4080).
- **Priorisation par Distance :** Les tuiles les plus proches de la caméra sont chargées et affichées en premier.
- **Cache de Géométries Partagé :** Réutilisation massive des objets `PlaneGeometry` pour réduire la consommation mémoire et le temps de création des maillages.

### Changé
- **Parallélisme Adaptatif :** Chargement réseau de 6 tuiles en simultané sans blocage du thread principal.
- **Interpolation LOD :** Suppression des flashs blancs lors des changements de résolution grâce à une gestion intelligente de l'opacité.

### Corrigé
- **Normales & Ombres :** Correction du calcul des ombres portées en revenant à des géométries à taille réelle (suppression du `mesh.scale` déformant).

---

## [3.6.0] - 2026-03-12 (L'Intelligence Adaptative)
### Ajouté
- **Auto-Performance (GPU Detection) :** Nouveau module `performance.ts` détectant le GPU via WebGL pour adapter les réglages au matériel.
- **Presets de Performance :** Introduction de 4 profils (Éco, Standard, High, Ultra) simplifiant l'expérience utilisateur.
- **Mode Expert :** Transition automatique en profil "Custom" lors de la manipulation manuelle des réglages.
- **Mise à jour UI :** Intégration de boutons de presets rapides dans le panneau latéral.

### Changé
- **LOD & Shadows :** Paramétrage granulaire des résolutions de maillage et d'ombres par profil de performance.

---

## [3.5.1] - 2026-03-12 (Qualité & Organisation)
### Ajouté
- **Tests Automatisés :** Mise en place d'une suite de 28 tests unitaires et d'intégration avec **Vitest** et **JSDOM**.
- **Couverture Critique :** Validation des calculs GPS, cycles solaires, import GPX et décodage d'altitude RGB.
- **CI/CD Robuste :** Intégration des tests dans le workflow GitHub Actions (blocage du déploiement en cas d'erreur).

### Changé
- **Restructuration Pro :** Réorganisation complète du projet (Dossiers `/src`, `/docs`, `/public`).
- **Standardisation :** Séparation du code source, de la documentation et des assets statiques.

---

## [3.5.0] - 2026-03-12 (L'Ère de la Stabilité)
### Ajouté
- **Migration TypeScript :** Refonte totale de la structure logicielle (.js -> .ts). Typage strict de l'état global et des interfaces Three.js.
- **Heures Magiques :** Système d'ambiance dynamique (Golden Hour & Blue Hour) avec interpolation des couleurs du ciel, de la lumière et du brouillard.
- **GPS Natif :** Intégration du plugin `@capacitor/geolocation` pour Android, remplaçant l'API Web instable.
- **Assets Pro :** Automatisation de la génération des ressources Android (74 fichiers d'icônes et splash screens).
- **Workflow Deploy :** Script `npm run deploy` (Check -> Build -> Sync).

### Changé
- **Gestion Mémoire :** Implémentation du nettoyage GPU via `disposeScene()` et d'un cache de textures dynamique (100 tuiles Mobile / 400 PC).

---

## [3.4.0] - 2026-03-11 (Immersion & UX)
### Ajouté
- **Landing Page :** Écran d'accueil stylisé avec aide contextuelle pour les clés MapTiler Cloud.
- **Notifications :** Feedback visuel (Toasts) lors des changements de résolution du maillage (LOD).
- **Stabilité :** Utilisation des previews statiques officielles pour les vignettes du sélecteur de calques.

---

## [3.3.0] - 2026-03-10 (Refonte Mobile & Tactile)
### Ajouté
- **UI "Touch-First" :** Nouvelle interface ergonomique avec boutons larges et panneau de réglages coulissant.
- **Contrôles Adaptatifs :** Utilisation de `OrbitControls` sur mobile et `MapControls` sur PC.
- **Boussole 3D :** Indicateur d'orientation synchronisé avec la caméra.

---

## [3.1.0] - [3.2.0] - 2026-03-08 (Cartographie Avancée)
### Ajouté
- **Fusion de Calques :** Algorithme de mélange (mix) dans le shader pour superposer les sentiers Swisstopo sur n'importe quel fond de carte.
- **Moteur de Sommets :** Base de données locale des cimes alpines avec étiquetage dynamique en 3D.
- **Analyse de Performance :** Intégration d'un moniteur FPS et d'un compteur de mémoire VRAM.

---

## [3.0.0] - 2026-03-05 (Le Grand Horizon)
### Ajouté
- **Multi-Résolution :** Support du Zoom 9 permettant une visibilité topographique jusqu'à l'horizon.
- **Ombres de Montagne :** Optimisation de la Shadow Map pour des ombres portées réalistes sur de grandes distances.
- **Auto-Source :** Basculement automatique Swisstopo/OpenTopoMap selon la position géographique.

---

## [2.0.0] - [2.5.0] - 2026-02-15 (La Révolution Technique)
### Ajouté
- **Moteur par Tuiles (Tile System) :** Passage d'un maillage unique à un système de tuiles dynamiques avec cache LRU.
- **GPU Displacement :** Décodage de l'élévation RGB directement dans le Vertex Shader (gain de performance majeur).
- **Intégration GPX :** Support des tracés de randonnée avec calcul automatique du dénivelé cumulé.
- **Picking Altitude :** Système de lecture des données d'élévation au clic pour une précision métrique.

### Corrigé (La Guerre des Coordonnées)
- Migration vers la projection **Web Mercator (EPSG:3857)** rigoureuse pour aligner parfaitement le relief, les sentiers et les traces GPX.
- **Anti-Spike Filter :** Implémentation d'un filtre Médian 3x3 pour supprimer les "pics" de relief causés par le Canvas Farbling (Brave Browser).

---

## [1.0.0] - 2026-02-01 (La Genèse)
### Ajouté
- **Moteur de base :** Initialisation du rendu Three.js et intégration de SunCalc pour la course du soleil.
- **Interface primitive :** Curseur de temps simple et recherche de lieu basique.

---

### 💡 Anecdotes & Défis Techniques
- **Le Mystère des Pics :** Découverte que certains navigateurs injectent du "bruit" dans les données d'image pour empêcher le tracking (Fingerprinting). Ce bruit créait des montagnes de 9000m de haut. Résolu par un filtrage spatial intelligent.
- **L'Inversion de Mercator :** Long combat contre l'inversion de l'axe Y entre les tuiles cartographiques et le système de coordonnées de Three.js.
