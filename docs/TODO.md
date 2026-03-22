# SunTrail 3D - Roadmap Révisée (v5.7.2)

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

## ⏳ Backlog & Recherche (Indéfini)
- [ ] **Waypoints & Partage** :
    - Marquage de points d'intérêt personnalisés.
    - **Deep Linking** : Partage d'URL synchronisée pour une vue 3D exacte.

## ✨ Priorité 3 : Modern UX & Excellence Visuelle (v5.8)
*Impact : Interface professionnelle, ergonomie mobile "One-Hand" et relief ultra-net.*

- [ ] **Refonte UI "Minimalist Alpin"** :
    - Remplacement des boutons flottants par un **système de Navigation Bar basse**.
    - Utilisation de **Bottom Sheets** (tiroirs coulissants) pour les réglages et calques.
    - Uniformisation du design (Glassmorphism, Blur, Espacements).
- [ ] **Normal Map Pro (Phase 5)** : Résoudre le bundling PBF/MVT pour une netteté vectorielle infinie du relief.
- [ ] **Cloud Shadows & Météo Pro** : Projection d'ombres de nuages dynamiques.

## 🌐 Priorité 4 : Expansion & Multi-GPX (v5.9)
*Impact : Ouverture européenne et gestion de groupes.*

- [ ] **Multi-GPX** : Affichage et comparaison de plusieurs tracés simultanés.
- [ ] **Multilingue (i18n)** : Support complet FR / DE / IT / EN.
- [ ] **Dashboard VRAM Pro** : Monitoring précis pour la stabilité sur anciens mobiles.

## 🚀 Priorité 5 : La Révolution AR (v6.0)
*Impact : Immersion totale et aide à l'orientation futuriste.*

- [ ] **Moteur AR Natif** : Superposition du moteur 3D sur le flux caméra via Capacitor.
- [ ] **Occlusion Topographique** : Masquage des étiquettes derrière le relief réel.

## ⏳ Backlog & Recherche (Indéfini)
- [ ] **Waypoints & Partage** : Marquage personnel et Deep Linking (URL synchronisée).
- [ ] **Mode Nuit Avancé** : Pollution lumineuse urbaine (NASA).
- [x] **v5.6.8** : Détection Galaxy A53 (Mali GPU) et réglages par défaut sécurisés.
- [x] **v5.5.15** : Suivi GPS haute précision et lissage Swisstopo style.
- [x] **v5.4.7** : Fusion de géométrie bâtiments RTX (144 FPS).
