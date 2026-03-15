# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## ✅ Terminé (v4.6.6)
- [x] **Moteur de Recherche Sommets** : Indexation locale intelligente (Overpass) avec cache 7 jours.
- [x] **Vol Cinématique (`flyTo`)** : Trajectoire parabolique sécurisée avec anti-collision terrain.
- [x] **Altitude Panoramique Auto** : Stabilisation en LOD 14 (12km) lors de l'arrivée sur un sommet.
- [x] **Moteur de Suivi Ultra-Fluide** : Interpolation haute fréquence (60 FPS) pour un suivi GPS sans saccades.
- [x] **Stabilisation de Boussole Pro** : Zone morte et amortissement lourd pour éliminer les tremblements.
- [x] **Transition Diagonale Unifiée** : Approche cinématique vers l'utilisateur finissant en vue de dessus.
- [x] **Parabole du Tilt** : Inclinaison dynamique selon le LOD pour cacher le vide de l'horizon.
- [x] **Ultra-Battery Save** : Toggle 30 FPS global et mode "Deep Sleep" (0 FPS) en arrière-plan.
- [x] **Fog Dynamique** : Intégration du voile atmosphérique dans les presets de performance.

## 🚀 Prochainement (v4.7) - Mobilité & Offline
- [ ] **Gestion Offline** : Système de mise en cache des tuiles pour une utilisation sans réseau.
- [ ] **Mode Éco Automatique** : Activation automatique de l'économie d'énergie sous 20% de batterie.
- [ ] **Optimisation VRAM Mobile** : Nettoyage encore plus agressif des textures non visibles.

## 🧭 Sécurité & Alpinisme (v4.8)
- [ ] **Carte des Pentes (Inclinomètre 3D)** : Coloration dynamique du relief selon l'inclinaison (Aide avalanche).
- [ ] **SOS SMS Low-Bandwidth** : Générateur de message de secours ultra-léger.
- [ ] **Gestion GPX Avancée** : Profil altimétrique dynamique et suivi de progression le long de la trace.

## 🌍 Internationalisation & Données
- [ ] **Adaptation Hors-Suisse** : Intégration de sources d'élévation mondiales gratuites (SRTM/Copernicus).
- [x] **Basculement MapTiler Geocoding** : Remplacement de Nominatim par MapTiler pour la recherche et la météo.
- [x] **Auto-Détection de Source** : Basculement intelligent selon la zone géographique.

## ✨ Immersion Visuelle Pro (v4.9)
- [x] **Zoom Européen** : Vue continentale fluide avec paliers de LOD 7-9 (v4.5.34).
- [ ] **Hydrologie Dynamique** : Rendu des plans d'eau avec shaders de réflexion basés sur les données OSM.
- [ ] **Végétation Avancée** : Diversification des modèles d'arbres instanciés selon la zone (forêt vs zone urbaine).

## 📱 Écosystème & Connectivité
- [ ] **Sync Web-to-Mobile** : Préparation de parcours sur grand écran et transfert fluide vers l'application.
- [ ] **Companion App (Watch)** : Extension pour montres connectées (Data-view : Altitude, Cap, Prochain WP).

## 🏗️ Vision & Architecture (v5.0+)
- [x] **Audit de Performance & Presets** : Optimisation complète des paliers de qualité et du moteur de chargement (v4.5.35).
- [ ] **Audit de Sécurité & Maintenabilité** : Revue globale de la sécurité et de la structure du code.
- [ ] **Modularisation (Split Produit)** : Étudier le découpage en modules distincts pour spécialisation :
    - *SunTrail Explorer* (Rando/Alpi : focus GPS, Offline, Sécurité).
    - *SunTrail Architect* (Analyse Solaire : focus ombres précises, intégration BIM/Modèles).
    - *SunTrail Weather Station* (Widget météo 3D expert).
