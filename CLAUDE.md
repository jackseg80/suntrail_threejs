# SunTrail — Guide IA (v5.27.13)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-04-11 suite à la correction Anti-Glitch GPS (v5.27.13).

## Projet

App cartographique 3D mobile-first pour la randonnée alpine.
Android natif (Capacitor) + PWA. Freemium (RevenueCat).

**Stack** : TypeScript strict · Three.js r160 · Vite 5 · Capacitor 6 · RevenueCat

## ⚠️ Règles & Décisions Actées (v5.27.13)

### 🚀 Protocole de Release (IMPÉRATIF)
1. **Version Name** : Incrémenter dans `package.json` (ex: 5.27.12 → 5.27.13).
2. **Version Code** : Incrémenter **TOUJOURS** le `versionCode` dans `android/app/build.gradle`.
3. **Changelog** : Mettre à jour `CHANGELOG.md`.
4. **Git** : Taguer la version (`git tag vX.Y.Z`) et pusher les tags.

### Architecture & GPS
- **Single Source of Truth** : Le service natif Android (`RecordingService.java`) est l'unique source de vérité pour l'enregistrement.
- **Buffer Natif** : Les points sont stockés en SQLite (Room) côté Android pour survivre aux kills.
- **Distance** : Formule **Haversine** (précision < 0.5%).
- **D+ / D-** : Algorithme d'**Hystérésis avec seuil de 2m** (Garmin/Suunto style).
- **Lissage** : Moyenne mobile 3 points sur l'altitude GPS.
- **Filtrage GPS (v5.27.13)** : 
  - Rejeter tout point GPS avec saut vertical > 200m.
  - Rejeter tout point GPS avec saut horizontal > 1km en < 10s (Anti-Champignon).
  - Tri chronologique obligatoire avant traitement et export.
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
