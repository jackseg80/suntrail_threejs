# SunTrail 3D — TODO (v5.27.1)

> Guide IA : [CLAUDE.md](../CLAUDE.md) | Historique : [COMPLETED_HISTORY.md](archives/COMPLETED_HISTORY.md)

---

## 🎯 Priorité 1 : Finalisation Production (V5.x)

- [x] **Qualité & Tests (v5.28.6)** : Infrastructure E2E Playwright opérationnelle et sécurisation du moteur 3D (scene.ts, touchControls.ts).
- [x] **Réparation Tests Intégration** : Hydrologie et PackManager corrigés.
- [x] **Robustesse Packs Pays (v5.27.1)** : Correction bug 404, catalogue v2, URLs absolues.
- [ ] **Audit Performance Mobile** : Tester via `chrome://inspect` sur Galaxy S23 (High) et A53 (STD) selon [PROTOCOL_TEST_PERF_MOBILE.md](PROTOCOL_TEST_PERF_MOBILE.md).
- [ ] **Ajustement Limites (v5.27.0)** : Adapter les limites de chargement selon les résultats de l'audit mobile.
- [x] **Optimisation Chargement (v5.26.13)** : Progressive loading avec pulses de 50ms et limites par preset.
- [x] **Optimisation PC (v5.26.9)** : Progressive Loading & Refactor Throttle.
- [x] **Validation Géo (v5.28.20)** : Unification Haversine, Hystérésis et Terrain-RGB. Audit dette technique Phase 1 & 2 terminé.
- [x] **Optimisation Batterie (v5.26.7)** : Android permission Request Ignore Battery.
- [x] **Optimisation Démarrage (v5.26.7)** : PMTiles init parallélisée.
- [x] **Optimisation Mémoire (v5.26.8)** : Nettoyage des sheets à la fermeture.
- [x] **Protocole Release (v5.26.8)** : Règle `versionCode` actée.
- [ ] **Closed Testing (14 jours)** : Atteindre les 20 testeurs actifs requis par Google Play.
- [ ] **Screenshots Marketing** : Refaire des captures soignées Phone + Tablette (actuellement placeholders).
- [ ] **Supprimer le "Mode Testeur"** : Retirer les 7 taps sur la version avant le build final.

---

## 🚀 Priorité 2 : Trail Intelligence (v6.0)

> Module d'analyse intelligente de tracés et terrain. **Alertes sécurité = TOUJOURS FREE.**

- [ ] **v6.0 — Cotation & Temps estimé** : Badge CAS T1-T6 (Pro) et Durée Munter.
- [ ] **Refactoring Profond** : Unification des caches (`tileCache`, `geometryCache`) avec `boundedCache` et audit strict des accès altitude via `getAltitudeAt` uniquement.
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
