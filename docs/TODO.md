# SunTrail 3D — TODO (v5.28.37)

> Guide IA : [CLAUDE.md](../CLAUDE.md) | Historique : [COMPLETED_HISTORY.md](archives/COMPLETED_HISTORY.md)

---

## 🎯 Priorité 1 : Finalisation Production (V5.x)

- [x] **Superposition & Transitions LOD (v5.28.37)** : Correction du bug de superposition (camera.y), retour au fondu symétrique et optimisation `Tile.dispose()`.
- [x] **Gestion des GPX (v5.28.28)** : Reverse geocoding pour nommage automatique + renommage interactif à l'arrêt.
- [x] **Navigation Tactile (v5.28.27)** : Implémentation du double-tap pour zoomer.
- [x] **UI Réglages (v5.28.26)** : Correction des curseurs de Résolution (LOD) et Rayon de rendu.
- [x] **Qualité & Tests (v5.28.6)** : Infrastructure E2E Playwright opérationnelle et sécurisation du moteur 3D (scene.ts, touchControls.ts).
- [x] **Réparation Tests Intégration** : Hydrologie et PackManager corrigés.
- [x] **Robustesse Packs Pays (v5.27.1)** : Correction bug 404, catalogue v2, URLs absolues.
- [ ] **Audit Performance Mobile** : Tester via `chrome://inspect` sur Galaxy S23 (High) et A53 (STD) selon [PROTOCOL_TEST_PERF_MOBILE.md](PROTOCOL_TEST_PERF_MOBILE.md).
- [ ] **Ajustement Limites (v5.27.0)** : Adapter les limites de chargement selon les résultats de l'audit mobile.
- [x] **Optimisation Chargement (v5.26.13)** : Progressive loading avec pulses de 50ms et limites par preset.
- [x] **Optimisation PC (v5.26.9)** : Progressive Loading & Refactor Throttle.
- [x] **Validation Géo (v5.28.20)** : Unification Haversine, Hystérésis et Terrain-RGB. Centralisation Recherche (GeocodingService) et Feature Flags.
- [x] **Audit dette technique (v5.28.20)** : Phases 1, 2, 3 & 4 terminées.
- [x] **Optimisation Batterie (v5.26.7)** : Android permission Request Ignore Battery.
- [x] **Optimisation Démarrage (v5.26.7)** : PMTiles init parallélisée.
- [x] **Optimisation Mémoire (v5.26.8)** : Nettoyage des sheets à la fermeture.
- [x] **Protocole Release (v5.26.8)** : Règle `versionCode` actée.
- [ ] **Closed Testing (14 jours)** : Atteindre les 20 testeurs actifs requis par Google Play.
- [ ] **Screenshots Marketing** : Refaire des captures soignées Phone + Tablette (actuellement placeholders).
- [ ] **Supprimer le "Mode Testeur"** : Retirer les 7 taps sur la version avant le build final.

---

## 🚀 Priorité 2 : Trail Intelligence & Routing (v6.0)

> Module d'analyse intelligente et planification d'itinéraires. **Alertes sécurité = TOUJOURS FREE.**

- [ ] **v6.0 — Le Planificateur Intelligent (Komoot-Style)** :
    - [ ] **Moteur de Routing** : Intégration de l'API MapTiler Direction pour tracer sur les sentiers existants (OSM).
    - [ ] **Édition 3D** : Interface permettant de cliquer sur la carte pour ajouter/déplacer des waypoints.
    - [ ] **Stats en direct** : Distance, dénivelé et temps estimé mis à jour pendant le tracé.
- [ ] **v6.0 — Analyse & Temps estimé** : 
    - [ ] **Méthode Munter** : Calcul automatique de la durée basée sur la distance et le D+.
    - [ ] **Cotation CAS** : Badge de difficulté T1-T6 basé sur la pente (Pro).
- [ ] **v6.1 — Exposition solaire & Segments** : Barre ombre/soleil détaillée par km (Pro).
- [ ] **v6.2 — Alertes sécurité & Heure de départ** : Avalanche, windchill, nuit sur tracé (Toutes FREE).
- [ ] **v6.3 — Score condition & Estimation physio** : Hydratation, calories, VAM cible (Pro).
- [ ] **v6.4 — Mode Photo Pro** : Capture sans UI avec watermark SunTrail.

---

## 💡 Brainstorming Notifications (Post-v5.x)
- [ ] Bouton "Arrêter REC" inline dans la notification persistante.
- [ ] Alerte batterie faible pendant REC.
- [ ] Alerte coucher de soleil approchant pendant rando.
- [ ] Résumé post-rando (Pro).
