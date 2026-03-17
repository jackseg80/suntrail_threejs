# 🚀 SunTrail 3D - Roadmap Stratégique (v4.7.3+)

Ce document définit la trajectoire technologique de SunTrail pour devenir un moteur géospatial de référence, alliant accessibilité web et performances natives.

## ✅ Terminé (v4.9.0)
- [x] **Suivi GPS Sphérique** : Interpolation ultra-lisse et protection Gimbal Lock.
- [x] **Tests Robustes** : Création de `location.test.ts` et 100% de succès Vitest.
- [x] **Gestion Offline** : Scraper de zone (6km) et badge de statut.
- [x] **Sécurité & Outils Alpins** : Inclinomètre Shader, GPX Pro et SOS SMS.

---

## 🌍 Étape 2 : Expansion & Immersion (v4.9) - EN COURS
*Objectif : Sortir des Alpes et enrichir le rendu visuel.*
- [x] **Données Mondiales (SRTM/Copernicus)** : Intégration de sources d'élévation globales et flux IGN France (Plan/Satellite).
- [x] **Hydrologie Dynamique** : Rendu des lacs et rivières avec shaders de réflexion basés sur la détection de couleur (v5.4.1).
- [x] **Végétation Bio-Fidèle** : Diversification des essences d'arbres (Feuillus, Sapins, Mélèzes) et adaptation automatique selon l'altitude (v4.9.1).

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
