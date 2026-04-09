# SunTrail — Guide IA (v5.27.3)

> Point d'entrée unique pour tous les agents IA.
> Mis à jour le 2026-04-09 suite à la correction du décalage GPX (Origin Shift).

## Projet

App cartographique 3D mobile-first pour la randonnée alpine.
Android natif (Capacitor) + PWA. Freemium (RevenueCat).

**Stack** : TypeScript strict · Three.js r160 · Vite 5 · Capacitor 6 · RevenueCat

## ⚠️ Règles & Décisions Actées (v5.27.3)

### 🚀 Protocole de Release (IMPÉRATIF)
1. **Version Name** : Incrémenter dans `package.json` (ex: 5.26.7 → 5.26.8).
2. **Version Code** : Incrémenter **TOUJOURS** le `versionCode` dans `android/app/build.gradle` (ex: 575 → 576). Google Play rejette tout build avec un version code déjà utilisé.
3. **Changelog** : Mettre à jour `CHANGELOG.md` et `TODO.md`.
4. **Git** : Taguer la version (`git tag vX.Y.Z`) et pusher les tags.

### 📚 Index de Documentation (Essentiel pour l'IA)

| Domaine | Document de Référence | Contenu |
| :--- | :--- | :--- |
| **État & Logique** | [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Proxy State, EventBus, **Calcul Haversine**, Hystérésis 2m. |
| **Rendu & Batterie** | [docs/AI_PERFORMANCE.md](docs/AI_PERFORMANCE.md) | Deep Sleep, Throttle 20fps, DPR Cap, Presets GPU. |
| **Business & Gates** | [docs/MONETIZATION.md](docs/MONETIZATION.md) | RevenueCat, Grille Free/Pro, Logique des verrous (LOD, Solaire). |
| **Interface & UX** | [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md) | TouchControls, SheetManager, DraggablePanels. |
| **Roadmap** | [docs/TODO.md](docs/TODO.md) | Priorités Production V5 et Roadmap V6. |
| **Historique** | [docs/archives/COMPLETED_HISTORY.md](docs/archives/COMPLETED_HISTORY.md) | Tout ce qui a été fait avant la v5.26.6. |

### Monétisation & Gates
- **REC GPS** : **ENTIÈREMENT GRATUIT**. Pas de limite de temps. Sécurité d'abord.
- **Solaire** : Simulation 24h gratuite. Calendrier complet = PRO.
- **Offline** : 1 zone gratuite. Illimité = PRO.
- **LOD** : Plafond technique à 14 pour les gratuits (Toast d'upsell intégré).
- **Inclinomètre** : Feature PRO active.
- **Satellite** : Feature PRO active.
- **Alertes Sécurité** : Seront TOUJOURS gratuites (v6.0+).

### Calculs & Précision
- **Distance** : Formule **Haversine** (précision < 0.5%).
- **D+ / D-** : Algorithme d'**Hystérésis avec seuil de 2m** (Garmin/Suunto style).
- **Lissage** : Moyenne mobile 3 points sur l'altitude GPS.
- **Filtrage GPS (v5.27.2)** : Rejeter tout point GPS avec saut vertical > 200m ou distance horizontale < 2m (anti-champignon).
- **Alignement Géographique (v5.27.3)** : Recalcul obligatoire des maillages GPX lors de chaque `Origin Shift` (Floating Origin).

### Rendu & Performance
- **`renderer.setSize(w, h, false)`** — TOUJOURS le 3ème param `false`.
- **LOD 14 Toast** : Déclenché dans `scene.ts` avec debounce de 30s.
- **Deep Sleep** : La boucle de rendu s'arrête (`setAnimationLoop(null)`) quand l'app est en arrière-plan.
- **TubeGeometry Stabilité** : Utiliser `centripetal` pour les splines de tracé afin d'éviter les ooovershoots.

## Structure du Projet
- `src/modules/iapService.ts` : Liaison RevenueCat ↔ Google Play.
- `src/modules/ui/components/InclinometerWidget.ts` : Inclinomètre numérique Pro.
- `src/modules/ui/components/TrackSheet.ts` : Gestion des tracés et REC libre.
- `src/modules/ui/components/ConnectivitySheet.ts` : Mode hors-ligne (limite 1 zone free).
- `src/modules/ui/components/TimelineComponent.ts` : Solaire (calendrier Pro).
- `src/modules/scene.ts` : Moteur de rendu et gate LOD 14.

## Prochaines Étapes
1. Closed Testing Play Store (20 testeurs).
2. Screenshots marketing définitifs.
3. Passage en Production (V5.x Stable).
4. Cycle V6.0 (Trail Intelligence).
