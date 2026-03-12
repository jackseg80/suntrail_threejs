# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [3.7.1] - 2026-03-12 (Optimisation des Coûts)
### Changé
- **Réduction de Portée (Eco-Range) :** Ajustement du `state.RANGE` sur les presets pour limiter la consommation de tuiles MapTiler (économie de ~40% de requêtes).
- **Cache Local Boosté :** Doublement de la taille du cache LRU (800 tuiles sur PC / 200 sur Mobile) pour minimiser les rechargements réseau.
- **Optimisation Swisstopo :** Correction de l'URL WMTS pour le calque des pentes et sécurisation du chargement des tuiles.

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
