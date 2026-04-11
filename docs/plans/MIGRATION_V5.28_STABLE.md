# Plan de Migration SunTrail (v5.27.7 -> v5.28.1 Stable)

## État Actuel (v5.27.7 Isolée)
- Base stable validée par l'utilisateur.
- Rendu 2D/3D fonctionnel au LOD 12+.
- Cache isolé (`suntrail-tiles-v277`) pour éviter la corruption.
- Build TypeScript propre (`npm run check` OK).

## Fonctionnalités à réintégrer (par ordre de priorité)

### 1. Optimisation GPS (Performance)
- **Algorithme RDP** : Implémenter la simplification Ramer-Douglas-Peucker pour les tracés 3D (évite les saccades sur les longs parcours).
- **Filtrage Jitter** : Porter les améliorations de filtrage horizontal et de tri temporel des points.

### 2. Robustesse GPS (Expérience Utilisateur)
- **Auto-pause** : Détection d'immobilité pour suspendre l'enregistrement.
- **Persistance Temps Réel** : Utiliser `@capacitor/preferences` pour sauvegarder chaque point reçu (évite les pertes en cas de crash/kill de l'app).
- **Unification native** : Déléguer le filtrage lourd au service natif Android (v5.28.1).

### 3. Mode Hors-ligne v3 (Stabilisation)
- **Multi-Layer Packs** : Finaliser le support des archives PMTiles contenant Couleur + Élévation + Overlay dans un seul fichier.
- **Warmup non-bloquant** : Charger les headers de packs en arrière-plan au démarrage.

### 4. UI & Cosmétique
- **Signalisation 3D** : Restaurer les icônes de signalétique (losanges) sans casser la hiérarchie de rendu.
- **Widget Inclinomètre** : Stabiliser le drag-and-drop et le rafraîchissement.

## Mandats Techniques (Anti-Régression)
- **PAS de hierarchy attachment** : `scene.add(group)` et non `mesh.add(group)`.
- **PAS de mesh fade en 2D** : Opacité 100% immédiate pour éviter les trous blancs.
- **PAS de suppression différée** : Remplacer les maillages instantanément dans `buildMesh`.
- **Throttling intelligent** : Forcer `updateVisibleTiles` lors des changements de mode pour garantir le remplissage du centre.

## Prochaines Étapes pour la nouvelle session
1. Lire ce plan.
2. Appliquer les optimisations GPS (RDP).
3. Installer et configurer `@capacitor/preferences`.
4. Réintégrer l'unification GPS Native.
