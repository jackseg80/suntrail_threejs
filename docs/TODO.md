# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## ✅ Terminé (v4.4.1)
- [x] **Fix Clic Haute Altitude** : Relevé opérationnel dès le lancement (35km).
- [x] **Correctif Ombres** : Projection pro sur 50km.
- [x] **Sécurité 2D** : Blocage intelligent des relevés en mode plan plat.
- [x] **Météo Avancée** : Isotherme 0°C et prévisions 6h.

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

## 🚀 Prochainement (v4.6)
- [ ] **Moteur de Recherche Sommets** : Indexation offline des principaux pics et cols.
- [ ] **Vol Automatique** : Animation de vol fluide vers le lieu recherché.
- [ ] **Cartes POI** : Affichage des détails techniques du sommet cliqué.

## ✅ Terminé (v4.4.1)
- [x] **Météo Dynamique** : Système de particules GPU pour la pluie et la neige.
- [x] **Physique du Vent** : Inclinaison et vitesse des effets basées sur l'API réelle.
- [x] **Dashboard Météo Pro** : KPIs, flèche de vent et localisation automatique.
- [x] **Simulateur d'Effets** : Contrôles manuels pour le test visuel.

## ✅ Terminé (v4.3.65)
- [x] **2D Turbo Mobile** : Optimisation drastique des FPS en haute altitude via MeshBasicMaterial.
- [x] **Fix Production Build** : Résolution des erreurs de scope shader.

## ✅ Terminé (v4.3.63)
- [x] **Global Overview** : Vue régionale (LOD 12) au démarrage et à la recherche.
- [x] **Parabolic Zoom** : Trajectoire de caméra organique avec Auto-Tilt.
- [x] **2D Space Optimization** : Désactivation du relief en haute altitude.
- [x] **Compass Fix** : Restauration des points cardinaux N/S/E/O.

## ✅ Terminé (v4.3.44)

## ✅ Terminé (v4.3.26)
- [x] **Bâtiments 3D (LOD léger)** : Extrusion simplifiée des volumes urbains (OSM) avec Geometry Merging.
- [x] **Qualité Satellite HD** : Textures 512px et seuils de zoom optimisés.
- [x] **Sécurité Caméra** : Anti-collision sol et Tilt adaptatif.
- [x] **Refonte Géo** : Module modulaire `geo.ts` sans dépendances circulaires.

## ✅ Terminé (v4.2.x)
- [x] **Solar Insight Dashboard** : Nouvelle interface responsive avec KPIs et timeline interactive.
- [x] **Moteur d'Analyse Solaire Avancé** : Interpolation bi-linéaire (précision métrique).
- [x] **Détection Snapdragon Elite** : Profil Ultra automatique pour les nouveaux flagships.

## ✅ Terminé (v4.1.x)
- [x] **Interface Éphémère** : Masquage automatique des contrôles.
- [x] **Signalétique Interactive** : Panneaux cliquables.
- [x] **Capture d'écran 3D** : Export PNG sans interface.

## 🏁 Prochainement (v4.6+) - Immersion & Services
- [ ] **Moteur de Recherche Sommets** (v4.6) : Indexation offline des principaux pics et cols.
- [ ] **Vol Automatique** : Animation de vol fluide vers le lieu recherché.
- [ ] **Cartes POI** : Affichage des détails techniques du sommet cliqué.

## 🌍 Internationalisation & Données (Priorité)
- [ ] **Adaptation Hors-Suisse** : Intégration de sources d'élévation mondiales gratuites (SRTM/Copernicus) pour garantir la précision hors des Alpes suisses.
- [x] **Basculement MapTiler Geocoding** : Remplacement de Nominatim par MapTiler pour la recherche et la météo (v4.5.34).
- [x] **Auto-Détection de Source** : Basculement intelligent sur la meilleure source de données disponible selon la zone géographique.

## 🔋 Optimisations & Mobilité (v4.7)
- [ ] **Mode 2D par défaut** : Option pour forcer le rendu 2D sur les appareils peu puissants ou pour économiser la batterie en rando.
- [ ] **Mode "Sentinelle"** : Réduction du FPS (30 au lieu de 120) et désactivation des calculs d'ombres quand la batterie est < 20%.
- [ ] **Gestion Offline** : Système de mise en cache des tuiles pour une utilisation sans réseau (fondamental en montagne).

## 🧭 Sécurité & Alpinisme (v4.8)
- [x] **Suivi GPS Directionnel** : Refonte totale avec cône de vue et centrage rando (v4.5.36).
- [x] **Orientation Temps Réel** : Intégration DeviceOrientation pour une boussole réactive (v4.5.36).
- [ ] **Carte des Pentes (Inclinomètre 3D)** : Coloration dynamique du relief selon l'inclinaison (Aide à la décision avalanche).
- [ ] **SOS SMS Low-Bandwidth** : Générateur de message de secours ultra-léger avec coordonnées GPS et état système.
- [ ] **Gestion GPX Avancée** : Import/Export de traces, profil altimétrique dynamique et suivi de progression.

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
