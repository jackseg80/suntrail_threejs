# 🚀 SunTrail 3D - Roadmap & TODO

Ce fichier liste les fonctionnalités et améliorations prévues pour les prochaines versions.

## 🏁 En cours (v3.5.x)
- [x] Migration complète vers TypeScript.
- [x] Optimisation de la mémoire GPU (disposeScene).
- [x] Heures Magiques (Dorée/Bleue).
- [x] Réorganisation pro du projet (src/, docs/, public/).
- [ ] Ajouter une boussole 3D en bas de l'écran.

## 🌟 Version 4.0 - Réalité Augmentée & Offline
- [ ] **Mode Hors-ligne (Offline Zones)** : Sélectionner et télécharger une zone de terrain (textures + élévation) pour un usage sans réseau.
- [ ] **Accélération Cache** : Utilisation de l'IndexedDB pour un chargement instantané des zones sauvegardées.
- [ ] Intégration de WebXR pour le mode AR.
- [ ] Projection de la courbe solaire sur le flux caméra.
- [ ] Marqueurs de sommets en réalité augmentée.

## 🛠️ Améliorations Techniques
- [ ] Utilisation de `InstancedMesh` pour les détails de surface (arbres, rochers).
- [ ] Support du mode hors-ligne (PWA / Cache local des tuiles).
- [ ] Transition vers `@capacitor/assets` pour toutes les plateformes (iOS inclus).

## 🎨 UX / UI
- [ ] Mode sombre/clair synchronisé avec le système.
- [ ] Partage de capture d'écran du rendu 3D.
- [ ] Graphique d'élévation dynamique pour les fichiers GPX.
