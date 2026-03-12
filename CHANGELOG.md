# Changelog - SunTrail 3D

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

## [3.5.0] - 2026-03-12
### Ajouté
- **Migration TypeScript :** Conversion de l'intégralité du code source (.js -> .ts) pour une stabilité accrue et un meilleur typage Three.js.
- **Heures Magiques :** Détection et rendu visuel de l'Heure Dorée et de l'Heure Bleue dans `sun.ts`.
- **GPS Natif :** Intégration de `@capacitor/geolocation` pour une meilleure fiabilité sur Android.
- **Workflow Deploy :** Nouveau script `npm run deploy` automatisant Check-Type + Build + Sync.
- **Dossier Public :** Organisation structurée des assets dans `/public/assets`.

### Changé
- **Gestion Mémoire :** Implémentation de `disposeScene` et `clearCache` pour éviter les fuites GPU.
- **Cache Dynamique :** Limitation du cache à 100 tuiles sur mobile et 400 sur PC.
- **Interface :** Mise à jour du label de phase solaire en temps réel.

## [3.4.0] - 2026-03-11
### Ajouté
- Page d'accueil immersive avec guide pour la clé MapTiler.
- Notifications Toast pour l'optimisation du maillage (LOD).
- Signature Jackseg dans l'interface.

## [3.3.0] - 2026-03-10
### Ajouté
- Refonte majeure de l'UI pour le tactile (boutons larges, glassmorphism).
- Sélecteur de calques visuel avec vignettes.
- Barre temporelle ergonomique en bas de l'écran.

## [3.0.0] - 2026-03-05
### Ajouté
- Support multi-grilles pour un horizon infini.
- Ombres portées spectaculaires en montagne.
- Détection automatique de la source de carte (Swisstopo vs Reste du monde).
