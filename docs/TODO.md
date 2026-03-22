# SunTrail 3D - Roadmap Révisée (v5.6.9)

## 🚀 Priorité 1 : Optimisations & Netteté (v5.6) - ✅ TERMINÉ
*Impact : Fluidité mobile absolue et rendu topographique pro.*

- [x] **Refactoring Architectural Terrain** : Extraction de `TileCache`, `GeometryCache` et `TileLoader`.
- [x] **Normal Map Pre-computation (Worker)** : Déportation du relief vers les WebWorkers (-87% texture reads).
- [x] **Material Pooling (Shader Reuse)** : Suppression des micro-freezes de compilation.
- [x] **Objectif Tests v5.6** : 94 tests unitaires validés au vert.
- [x] **Fix Voile Rouge Éco** : Désactivation forcée des pentes en mode 2D.

## 🎯 Priorité 2 : Usage Terrain & Persistance (v5.7)
*Impact : Rendre l'application indispensable et robuste pour la randonnée réelle.*

- [x] **Système Offline-First Complet** :
    - Service Worker pour l'interception réseau et le cache persistant.
    - Support du format **PMTiles** (stockage de cartes régionales massives).
- [x] **Enregistrement de Tracé (Live Tracking)** :
    - Bouton "REC" pour enregistrer sa propre position en temps réel.
    - Export au format GPX standard.
- [x] **Persistance des Réglages (localStorage)** :
    - Sauvegarde automatique du profil de performance, de la source de carte et des unités.
- [ ] **Waypoints & Partage** :
    - Marquage de points d'intérêt personnalisés.
    - **Deep Linking** : Partage d'URL synchronisée pour une vue 3D exacte.

## ✨ Priorité 3 : Immersion & Réalité Augmentée (v5.8)
*Impact : Effets visuels "Wow" et aide à l'orientation sur le terrain.*

- [ ] **Mode AR (Réalité Augmentée)** : Superposition des sommets et sentiers sur le flux vidéo de la caméra.
- [ ] **Normal Map Pro (Phase 5)** : Résoudre le bundling PBF/MVT pour une netteté vectorielle infinie.
- [ ] **Cloud Shadows & Météo** : Projection d'ombres de nuages basées sur les données réelles d'Open-Meteo.
- [ ] **Multi-GPX** : Affichage et comparaison de plusieurs tracés simultanés.

## 🌐 Priorité 4 : Internationalisation & Diagnostics (v5.9)
*Impact : Accessibilité européenne et outils de debug professionnels.*

- [ ] **Multilingue (i18n)** : Support complet FR / DE / IT / EN pour les zones alpines.
- [ ] **Dashboard VRAM Pro** : Indicateur en temps réel de l'occupation mémoire vidéo (textures).
- [ ] **Mode Nuit Avancé** : Intégration de la pollution lumineuse urbaine (NASA).

## ✅ Historique Récent
- [x] **v5.6.8** : Détection Galaxy A53 (Mali GPU) et réglages par défaut sécurisés.
- [x] **v5.5.15** : Suivi GPS haute précision et lissage Swisstopo style.
- [x] **v5.4.7** : Fusion de géométrie bâtiments RTX (144 FPS).
