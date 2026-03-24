# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [5.8.3] - 2026-03-24
### 🛠️ Precision & Long-Distance Navigation
- **Origin Shift Implementation**: Implementation of a dynamic world recentering system (35km threshold). This eliminates floating-point jitter during long-distance crossings.
- **Atomic Translation**: All global scene objects (Camera, Sun, GPS Marker, GPX Tracks, Forests, and Labels) are now seamlessly offset during recentering.
- **UI Logic cleanup**: Removal of debug logs and refinement of the shift trigger conditions.

## [5.8.2] - 2026-03-24
### 🛠️ Restoration & Expert Features
- **Solar & Weather Restoration**: Réintégration de la logique dynamique pour l'Analyse Solaire et le Dashboard Météo. Les données sont de nouveau extraites et affichées en temps réel.
- **Advanced Settings**: Regroupement des réglages techniques (LOD, Fog, API Key, PMTiles) dans une section "Paramètres Avancés" collapsible.
- **Geolocation Unification**: Migration vers `@capacitor/geolocation` pour une expérience de positionnement identique et robuste sur PC et Mobile.
- **GPX Import Fix**: Rétablissement de la fonctionnalité d'importation de tracés dans l'onglet Parcours.
- **Mobile UX Refinement**: Ajustement du positionnement du bouton GPS (Top-Right) et du radar pour éviter les chevauchements sur petit écran. Timeline centrée et adaptative.

## [5.8.1] - 2026-03-22
### 🛠️ UI Fixes & Stability
- **Fix Logic Bindings** : Rétablissement des connexions JavaScript pour la sélection des calques et des presets de performance dans le nouveau système de tiroirs.
- **Search Reliability** : Correction de l'affichage des résultats de recherche et fiabilisation de la sélection des sommets.
- **Crash Fix** : Suppression des références obsolètes dans `startApp()` qui bloquaient le thread principal au chargement.

## [5.8.0] - 2026-03-22
### 🎨 Modern Mobile UI (v5.8)
- **Bottom Navigation Bar** : Suppression des boutons flottants épars au profit d'une barre de navigation fixe avec 4 onglets : *Carte, Recherche, Parcours, Réglages*.
- **Système de Bottom Sheets** : Toutes les interfaces coulissent désormais depuis le bas avec une animation fluide, optimisée pour l'usage à une main.
- **Top Bar Moderne** : Intégration d'un dashboard central affichant l'altitude temps réel, le niveau de détail (LOD) et un widget météo interactif.
- **Backdrop Intelligent** : Ajout d'un overlay permettant la fermeture intuitive des panneaux au clic extérieur.

## [5.7.4] - 2026-03-23
### 🗺️ Unification Mondiale & Sécurité API
- **Unification Bas-Zoom (LOD <= 10)** : Harmonisation de l'affichage à grande échelle. L'application utilise désormais une source unique pour le monde entier à bas niveau de zoom.
- **Fail-safe MapTiler (Auto-OSM)** : Implémentation d'une détection dynamique des erreurs 403 (clés invalides/expirées). Basculement automatique sur OpenStreetMap.
- **Fix Saut de Grille** : Correction du bug de recentrage lors des changements de source automatiques.

... (Historique tronqué pour lisibilité)
