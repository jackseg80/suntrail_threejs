# SunTrail 3D - Roadmap & TODO

## 🚀 Priorité 1 : Optimisations "Performance Invisible" (v5.6)
*Impact : Fluidité mobile extrême et économie de batterie.*

- [ ] **Normal Map Pre-computation (Worker)** : Déplacer le calcul des normales du GPU vers les WebWorkers.
- [ ] **Geometry Instancing & Sharing** : Utiliser un pool de géométries partagées (une par résolution) pour toutes les tuiles.

## ✅ Terminés (v5.5.0)
- [x] **Audit de Sécurité & Fiabilité** : Correction race condition workers, accès window lazy, et suppression propriétés privées Three.js.
- [x] **Sécurité XSS Recherche** : Migration vers création d'éléments DOM sécurisés.
- [x] **Performance loadQueue** : Migration vers un `Set` pour des suppressions en O(1).
- [x] **Découplage Architectural** : Mise en place de l'Event Bus pour casser les cycles terrain <-> scene.
- [x] **Stabilisation Bâtiments RTX** : Fusion de géométrie et correction du bug de miroir Z.
