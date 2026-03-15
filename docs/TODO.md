# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## ✅ Terminé (v4.4.1)
- [x] **Fix Clic Haute Altitude** : Relevé opérationnel dès le lancement (35km).
- [x] **Correctif Ombres** : Projection pro sur 50km.
- [x] **Sécurité 2D** : Blocage intelligent des relevés en mode plan plat.
- [x] **Météo Avancée** : Isotherme 0°C et prévisions 6h.

## ✅ Terminé (v4.5.46)
- [x] **Shader Light GPU** : Division par 4 des lectures de textures sur le relief pour les mobiles milieu de gamme.

## ✅ Terminé (v4.5.45)
- [x] **Végétation Ultra-Light** : Scan adaptatif des forêts divisant par 16 la charge CPU en mode Balanced.

## ✅ Terminé (v4.5.44)
- [x] **Chargement Adaptatif** : Le moteur ajuste le batching et le cache selon la puissance de l'appareil.
- [x] **Zéro Saccade** : Segmentation drastique des tâches CPU lors des déplacements.
- [x] **Optimisation VRAM Bâtiments** : Fusion des géométries pour réduire les Draw Calls.

## ✅ Terminé (v4.5.42)
- [x] **Anti-Collision Sol Pro** : Repositionnement fluide et chargement forcé sous la caméra pour une stabilité absolue.
- [x] **Fix Calendrier & Ombres** : Restauration de la simulation solaire via l'input de date.
- [x] **Restauration Bâtiments** : Retour au moteur Overpass/OSM pour garantir la visibilité mondiale.

## ✅ Terminé (v4.5.29)
- [x] **Stabilisation Critique** : Correction des écrans noirs via Origin Shift sécurisé.
- [x] **Performance 120 FPS** : Cache spatial pour l'altitude.
- [x] **Dashboard Expert** : Panneau majestueux avec éphémérides et sécurité.
- [x] **Boussole Interactive** : Reset Nord cinématique fluide (800ms).
- [x] **Optimisation OSM** : Bouclier de flux multi-serveur (Anti-429).
- [x] **Fix Mobile** : Calendrier lisible et layout portrait.

## ✅ Terminé (v4.5.70)
- [x] **Moteur de Suivi Ultra-Fluide** : Interpolation haute fréquence (60 FPS) pour un suivi GPS sans saccades.
- [x] **Stabilisation de Boussole Pro** : Zone morte et amortissement lourd pour éliminer les tremblements.
- [x] **Transition Diagonale Unifiée** : Approche cinématique vers l'utilisateur finissant en vue de dessus.
- [x] **Parabole du Tilt** : Inclinaison dynamique selon le LOD pour cacher le vide de l'horizon.
- [x] **Ultra-Battery Save** : Toggle 30 FPS global et mode "Deep Sleep" (0 FPS) en arrière-plan.
- [x] **Fog Dynamique** : Intégration du voile atmosphérique dans les presets de performance.

## 🚀 Prochainement (v4.6) - Immersion & Sommets
- [ ] **Moteur de Recherche Sommets** : Indexation locale des principaux pics et cols (Overpass).
- [ ] **Vol Automatique** : Animation de vol fluide vers le lieu recherché.
- [ ] **Cartes POI** : Affichage des détails techniques (Altitude, Massif) du sommet cliqué.

## 🌍 Internationalisation & Données (Priorité)
- [ ] **Adaptation Hors-Suisse** : Intégration de sources d'élévation mondiales gratuites (SRTM/Copernicus).
- [x] **Basculement MapTiler Geocoding** : Remplacement de Nominatim par MapTiler pour la recherche et la météo.
- [x] **Auto-Détection de Source** : Basculement intelligent selon la zone géographique.

## 🔋 Optimisations & Mobilité (v4.7)
- [x] **Mode "Sentinelle"** : Réduction du FPS et Deep Sleep intégrés (v4.5.52).
- [ ] **Gestion Offline** : Système de mise en cache des tuiles pour une utilisation sans réseau.

## 🧭 Sécurité & Alpinisme (v4.8)
- [x] **Suivi GPS Directionnel** : Refonte totale avec cône de vue et centrage rando.
- [x] **Orientation Temps Réel** : Intégration DeviceOrientation pour une boussole réactive.
- [ ] **Carte des Pentes (Inclinomètre 3D)** : Coloration dynamique du relief selon l'inclinaison.
- [ ] **SOS SMS Low-Bandwidth** : Générateur de message de secours ultra-léger.
- [ ] **Gestion GPX Avancée** : Profil altimétrique dynamique et suivi de progression.

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
- [ ] **Tests de Régression Visuelle** : Automatisation de la validation du rendu 3D.
- [ ] **Modularisation (Split Produit)** : Étudier le découpage en modules distincts pour spécialisation :
    - *SunTrail Explorer* (Rando/Alpi : focus GPS, Offline, Sécurité).
    - *SunTrail Architect* (Analyse Solaire : focus ombres précises, intégration BIM/Modèles).
    - *SunTrail Weather Station* (Widget météo 3D expert).

## 💼 Stratégie Business & Diversification
- [ ] **Monétisation B2C** : Modèle Freemium.
- [ ] **Sponsorisation POI** : Affichage de refuges partenaires.
