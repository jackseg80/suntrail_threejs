# SunTrail — Guide IA (v5.28.1)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-04-11 suite à l'unification de la logique GPS (v5.28.1).

## Projet

App cartographique 3D mobile-first pour la randonnée alpine.
Android natif (Capacitor) + PWA. Freemium (RevenueCat).

**Stack** : TypeScript strict · Three.js r160 · Vite 5 · Capacitor 6 · RevenueCat

## ⚠️ Règles & Décisions Actées (v5.28.1)

### 🚀 Protocole de Release (IMPÉRATIF)
1. **Incrémentation** : Utiliser `npm run bump` (synchronise package.json et build.gradle).
2. **Changelog** : Mettre à jour `CHANGELOG.md`.
3. **Git** : Taguer la version (`git tag vX.Y.Z`) et pusher les tags.

### Architecture & GPS
- **Single Source of Truth** : Le service natif Android (`RecordingService.java`) est l'unique source de vérité pour l'enregistrement ET le filtrage.
- **Buffer Natif** : Les points sont stockés en SQLite (Room) côté Android pour survivre aux kills.
- **Filtrage GPS (v5.28.1 - NATIF)** : 
  - Rejeter points (0,0).
  - Rejeter sauts verticaux > 200m.
  - Rejeter micro-mouvements < 3m (Anti-jitter).
  - Détection auto-pause : immobilité < 3m pendant 10s.
- **JS Responsibility** : Le code JS ne fait plus de filtrage de données brutes. Il s'occupe de l'affichage, de la persistance UI et du tri chronologique final.

### Rendu & Performance
- **Simplification RDP (v5.28.0)** : Algorithme Ramer-Douglas-Peucker appliqué sur le tracé en cours pour alléger le maillage 3D.
- **`renderer.setSize(w, h, false)`** — TOUJOURS le 3ème param `false`.
- **TubeGeometry Stabilité** : Utiliser `centripetal` pour les splines. Toujours trier par `timestamp` avant génération.
- **Alignement Géographique (v5.27.3)** : Recalcul obligatoire des maillages GPX lors de chaque `Origin Shift` (Floating Origin).
- **Inclinomètre (v5.27.5)** : Raycasting 3D pour mesure sous le réticule. Anticipation de 15m en mode suivi basée sur `userHeading`.

### Rendu & Performance
- **Tuiles (v5.27.6)** : L'injection des packs (seeding) vers le CacheStorage est asynchrone pour ne pas bloquer le thread principal.
- **`renderer.setSize(w, h, false)`** — TOUJOURS le 3ème param `false`.
- **LOD 14 Toast** : Déclenché dans `scene.ts` avec debounce de 30s.
- **Deep Sleep** : La boucle de rendu s'arrête (`setAnimationLoop(null)`) quand l'app est en arrière-plan.
- **TubeGeometry Stabilité** : Utiliser `centripetal` pour les splines de tracé afin d'éviter les ooovershoots. Toujours trier par `timestamp` avant génération.

## Structure du Projet
- `src/modules/iapService.ts` : Liaison RevenueCat ↔ Google Play.
- `src/modules/ui/components/InclinometerWidget.ts` : Inclinomètre interactif (viseur mobile + GPS).
- `src/modules/ui/components/TrackSheet.ts` : Gestion des tracés et REC libre.
- `src/modules/ui/components/ConnectivitySheet.ts` : Mode hors-ligne (limite 1 zone free).
- `src/modules/ui/components/TimelineComponent.ts` : Solaire (calendrier Pro).
- `src/modules/scene.ts` : Moteur de rendu et gate LOD 14.

## Prochaines Étapes
1. Closed Testing Play Store (20 testeurs).
2. Screenshots marketing définitifs.
3. Passage en Production (V5.x Stable).
4. Cycle V6.0 (Trail Intelligence).
