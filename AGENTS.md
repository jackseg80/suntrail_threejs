# SunTrail - Base de Connaissance (v5.8.2)

Ce fichier sert de mémoire long-terme pour les agents IA travaillant sur SunTrail. Il consigne les décisions architecturales critiques et les solutions aux problèmes complexes.

## 🧠 Architecture Core

### État Global & Persistance (`state.ts`)
- **Pivot Central** : Toute la configuration (LOD, sources, presets) réside dans l'objet `state`.
- **Réactivité (v5.8.0)** : L'objet `state` est désormais enveloppé dans un **Proxy JS récursif** (`ReactiveState.ts`). Les composants s'abonnent aux changements via `state.subscribe('path', callback)`.
- **Persistance** : Sauvegarde automatique dans `localStorage`. 
- **Versioning (v5.8.0)** : Le système inclut désormais un contrôle de version (`CURRENT_SETTINGS_VERSION`). Si une version obsolète est détectée lors du chargement, les réglages sont réinitialisés pour éviter les corruptions.
- **Event Bus (`eventBus.ts`)** : Utilisé pour briser les dépendances circulaires entre `terrain.ts` et `scene.ts`. Permet de déclencher des événements transversaux (ex: `terrainReady`, `flyTo`).

### Interface & Composants (v5.8.0)
- **Architecture Découplée** : La logique UI est extraite de `ui.ts` vers des classes spécialisées (`src/modules/ui/components/`).
- **BaseComponent** : Classe abstraite gérant le cycle de vie (hydratation via `<template>`, rendu, nettoyage des abonnements).
- **SheetManager** : Singleton gérant l'exclusivité des tiroirs coulissants (Bottom Sheets). Un seul tiroir peut être ouvert à la fois.
- **Glassmorphism** : Style visuel unifié basé sur des variables CSS (`--glass-*`) avec flou de profondeur (20px) et saturation optimisée.

### Moteur de Tuiles & Performance (`terrain.ts` / `tileLoader.ts`)
- **WebWorkers Pool** : 8 workers asynchrones (`tileWorker.ts`) pour le fetch et le calcul des Normal Maps (relief).
- **Material Pooling (`materialPool.ts`)** : Réutilisation des shaders pour éviter les micro-saccades de compilation Three.js (v5.6.4).
- **Gestion Mémoire (`memory.ts`)** : Utilisation stricte de `disposeObject()` pour libérer la VRAM lors du déchargement des tuiles.
- **Offline-First & PMTiles** : Support PWA (Service Worker) et lecture de fichiers `.pmtiles` locaux pour un usage sans réseau (v5.7.0).

### Données & APIs
- **Bâtiments 3D** : Migration de Overpass (OSM) vers **MapTiler Buildings API** (v4.5.37) pour la stabilité et la rapidité. Fusion des géométries par tuile pour minimiser les Draw Calls.
- **Sentiers (MVT)** : Utilisation de tuiles vectorielles (**MVT/PBF**) au lieu de raster pour une netteté infinie et un rendu stylisé (v5.6.5).
- **Végétation Bio-Fidèle** : Sélection des essences d'arbres (feuillus, sapins, mélèzes) basée sur l'altitude réelle de la tuile (v4.9.1).

## 🔋 Performance & Mobile

### Optimisations Énergétiques
- **Battery API** : Basculement automatique en mode "Eco" si la batterie descend sous les 20% (v5.7.1).
- **Deep Sleep** : Arrêt total du rendu (0 FPS) via la `Visibility API` quand l'onglet est masqué ou le téléphone verrouillé.
- **2D Turbo** : Mode spécifique avec élévation zéro et maillage plat (2 triangles/tuile), bridé à 30 FPS.

### Adaptabilité Matérielle
- **Light Shader** : Shader simplifié pour GPU Mali/Adreno mid-range, divisant par 4 la charge GPU (v4.5.46).
- **Adaptive Scan** : Réduction du pas de scan pour la végétation sur les appareils mobiles pour préserver le CPU (v4.5.45).

## 🕹️ Navigation & UX

### Mouvements de Caméra
- **Cinematic flyTo** : Trajectoire en "cloche" (parabolique) avec interpolation `easeInOutCubic` et vérification anti-collision en temps réel (v4.6.0).
- **Tilt Parabola** : L'inclinaison maximale de la caméra est dynamique ; elle atteint son pic au LOD 14 et se redresse automatiquement vers le sol à haute altitude pour masquer l'horizon vide (v4.5.56).
- **Google Earth Style** : Rotation mobile "Twist" à deux doigts avec verrouillage du Tilt pendant l'interaction pour éviter les mouvements brusques (v4.5.37).

### GPS & Orientation
- **Origin Shift (Précision GPS)** : Recentrage dynamique complet du monde 3D (Seuil 35km) incluant la translation atomique de tous les objets : Caméra, Soleil, Marqueur, GPX, Forêts et Étiquettes pour une précision absolue longue distance (v5.8.3).
- **Lissage Boussole** : Filtre passe-bas (10%) sur les données de l'API `DeviceOrientation` pour supprimer les tremblements du cône de vue.

## 🗺️ Stratégies Cartographiques Spécifiques

### Unification Globale (LOD <= 10)
- **Problème** : Effet "patchwork" (Suisse verte, France blanche, Allemagne brune) à petite échelle.
- **Solution** : Forçage d'une source unique (MapTiler Topo ou OSM) au LOD <= 10. Les sources de précision (Swisstopo/IGN) ne s'activent qu'au LOD 11+ (v5.7.4).

### Sécurité API & Fallback OSM
- **Détection 403** : Détection dynamique des erreurs de clé MapTiler invalide (v5.7.4).
- **Auto-Switch** : Basculement instantané et global vers **OpenStreetMap Standard** si MapTiler est bloqué ou inaccessible.

## 🛠️ Guide de Débogage

| Symptôme | Cause Probable | Solution |
|----------|----------------|----------|
| Tuiles Noires (Est) | Clé MapTiler invalide/403 | Vérifier `state.MK` ou laisser le fallback OSM agir. |
| Saut de carte au dézoom | `updateVisibleTiles` sans args | S'assurer de passer la position caméra ou laisser le fallback par défaut (v5.7.4). |
| Voile rouge en 2D | Pentes activées par erreur | Vérifier le flag `is2DGlobal` dans `updateVisibleTiles`. |
| Bâtiments dans les lacs | Erreur Z-Mirror | Vérifier la correction d'altitude relative au relief dans `buildings.ts`. |

## 🚀 Commandes de Maintenance
- `npm test` : Lancer la suite de 102 tests unitaires (Vitest).
- `npm run check` : Vérifier le typage TypeScript (strict).
- `npm run deploy` : Suite complète avant livraison mobile.
