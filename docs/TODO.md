# 🚀 SunTrail 3D - Roadmap Stratégique (v4.7.3+)

Ce document définit la trajectoire technologique de SunTrail pour devenir un moteur géospatial de référence, alliant accessibilité web et performances natives.

## ✅ État Actuel (Terminé - v4.7.3)
- [x] **Moteur de Recherche Sommets** : Indexation locale intelligente (Overpass) et cache 7 jours.
- [x] **Suivi GPS Ultra-Lisse** : Interpolation 60 FPS et boussole stabilisée (Deadzone).
- [x] **Gestion Offline** : Scraper de zone (6-10km) et détection de statut réseau.
- [x] **Optimisation Batterie** : Mode Deep Sleep (0 FPS) et toggle 30 FPS global.
- [x] **Stabilité & Clean Code** : Refonte du module UI et suppression de l'horizon instable.

---

## 🧭 Étape 1 : Sécurité & Outils Alpins (v4.8)
*Objectif : Transformer le relief en un outil d'aide à la décision critique.*
- [ ] **Carte des Pentes (Inclinomètre Shader)** : Coloration dynamique du relief selon l'inclinaison (Jaune 30° / Orange 35° / Rouge 40°+) pour le risque avalanche.
- [ ] **Gestion GPX Pro** : Profil altimétrique dynamique et calcul de la pente en temps réel le long de la trace.
- [ ] **SOS SMS Low-Bandwidth** : Générateur de message de secours ultra-léger (Lat/Lon, Altitude, État Batterie).

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
