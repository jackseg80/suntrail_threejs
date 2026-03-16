# 🚀 SunTrail 3D - Roadmap Stratégique (v4.7.3+)

Ce document définit la trajectoire technologique de SunTrail pour devenir un moteur géospatial de référence, alliant accessibilité web et performances natives.

## ✅ Terminé (v4.7.6)
- [x] **Suivi GPS Sphérique** : Interpolation ultra-lisse et protection Gimbal Lock.
- [x] **Tests Robustes** : Création de `location.test.ts` et 100% de succès Vitest.
- [x] **Gestion Offline** : Scraper de zone (6km) et badge de statut.

---

## 🧭 Étape 1 : Sécurité & Outils Alpins (v4.8) - EN COURS
*Objectif : Transformer le relief en un outil d'aide à la décision critique.*
- [x] **Carte des Pentes (Inclinomètre Shader)** :
    - [x] Créer un shader custom pour les tuiles de terrain.
    - [x] Calculer la pente locale dans le fragment shader.
    - [x] Appliquer une coloration : Jaune (30°) / Orange (35°) / Rouge (40°+).
    - [x] Ajouter un toggle "Carte des pentes" instantané.
- [ ] **Gestion GPX Pro** :
    - [ ] Affichage du profil altimétrique dynamique.
    - [ ] Calcul de la pente en temps réel le long de la trace.
- [ ] **SOS SMS Low-Bandwidth** : Générateur de message (Lat/Lon, Alt, Batt).

## 🌍 Étape 2 : Expansion & Immersion (v4.9)
*Objectif : Sortir des Alpes et enrichir le rendu visuel.*
- [ ] **Données Mondiales (SRTM/Copernicus)** : Intégration de sources d'élévation globales pour la France et l'Europe (hors Suisse).
- [ ] **Hydrologie Dynamique** : Rendu des lacs et rivières avec shaders de réflexion basés sur les données OSM.
- [ ] **Végétation Bio-Fidèle** : Diversification des essences d'arbres et adaptation de la densité selon la zone géographique.

## ⚡ Étape 3 : La Révolution Hybride WebGL/WebGPU (v5.0)
*Objectif : Atteindre la fluidité de Google Earth via une architecture de pointe.*
- [ ] **Sélecteur de Moteur Intelligent** : Détection automatique `navigator.gpu` pour basculer entre WebGL (compatibilité) et WebGPU (performance).
- [ ] **Architecture WebWorkers** : Déportation totale du décodage des tuiles et du calcul de relief sur les cœurs CPU secondaires (Zéro freeze UI).
- [ ] **Compute Shaders (WebGPU)** : Utilisation du GPU pour générer instantanément les maillages de terrain et la végétation.
- [ ] **Textures Compressées (KTX2)** : Streaming de tuiles 5x plus rapide grâce au support natif GPU (Basis Universal).

---

## 📱 Vision Produit & Écosystème
- [ ] **Companion App (Watch)** : Extension pour montres connectées (données critiques : Altitude, Cap).
- [ ] **Modularisation** : Séparation technique des branches "Explorer" (Rando) et "Architect" (Solaire).
- [ ] **Monétisation** : Modèle Freemium pour les fonctions de sécurité avalanche.
