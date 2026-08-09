# SunTrail — TODO (version source v5.82.0)

> Dernière mise à jour : 2026-08-09

## ✅ v5.82.0 — Fondations UX finalisées

- [x] Mode Planifier, navigation, recherche, onboarding, réglages et accessibilité implémentés dans le worktree.
- [x] `npm run check` et 1 491 tests unitaires validés le 2026-08-08.
- [x] Les 6/6 smoke Chromium et le scénario débutant Planifier isolé passent.
- [x] Revue visuelle validée en 360, 390, 768, 900 et 1280 px, y compris textes longs DE/IT et états transitoires.
- [x] Bibliothèque annonce honnêtement les traces récentes et ne promet pas encore la persistance des routes planifiées.
- [x] Build de production, budget bundle et audit i18n validés le 2026-08-08.
- [x] Synchronisation Capacitor, tests Android, lint Android et APK debug validés.
- [x] Changelog daté et versions alignées à `5.82.0` / Android `897` après les gates.

## ✅ Validation terrain v5.82.0 clôturée

- [x] Validation manuelle Galaxy S23 acceptée le 2026-08-09 : aucun P0/P1 signalé.
- [x] Observation Sortie/Bibliothèque classée P2 : redondance transitoire prévue, à résoudre
  fonctionnellement par la bibliothèque locale `PreparedRoute` de v5.83.

## 🧭 Publication externe v5.82.0 — préparée

- [x] Play Console vérifiée : le plus grand `versionCode` réellement utilisé est `896` ; `897` est
  donc attribué à v5.82.0 et le bundle signé a été généré.
- [ ] Commit, tag, CI, test interne/fermé puis déploiement progressif.
- [ ] Ne démarrer v5.83 qu'après la clôture complète de cette publication.

Protocole : [docs/plans/V5_82_S23_FIELD_VALIDATION.md](docs/plans/V5_82_S23_FIELD_VALIDATION.md).
Prompt de clôture :
[docs/plans/prompts/V5_82_FIELD_RELEASE.md](docs/plans/prompts/V5_82_FIELD_RELEASE.md).

État détaillé : [docs/plans/V5_82_RESUME_STATUS.md](docs/plans/V5_82_RESUME_STATUS.md).

## 🟡 Programme produit engagé

- [ ] **v5.83.0** — planifier, évaluer et sauvegarder localement (`PreparedRoute`).
- [ ] **v5.84.0 interne** — moteur de suivi TypeScript et fixtures, sans promesse Play publique.
- [ ] **v5.85.0** — guidage Android natif robuste, écran éteint et récupération.
- [ ] **v5.86.0** — rapport Prêt à partir et corridor cartographique hors ligne.
- [ ] **v6.0.0** — compte optionnel et synchronisation PC–Android.
- [ ] **v6.1.0** — outils experts et finition professionnelle.

Voir [ROADMAP.md](ROADMAP.md) et
[docs/plans/prompts/README.md](docs/plans/prompts/README.md) pour les scopes, gates et prompts.

## 🟠 Dette à traiter dans la version qui touche le domaine

- **SettingsSheet.ts** (983 lignes) — compte/RGPD et navigation par catégories extraits en v5.82.0 ; poursuivre l'extraction des réglages de rendu lors de la prochaine modification de ce domaine.
- **SolarProbeSheet.ts** (1052 lignes, 5 % couverture) — extraire pendant v5.86/v6.1.
- **tileLoader.ts** (844 lignes) — extraire le service avant le corridor offline v5.86.
- **Zones noires AT/ES/NO LOD 14+** — corriger sans bloquer le programme produit.
- **Couverture** — atteindre au moins 60 % sans tests artificiels.
- **CI** — automatiser check, tests, build, bundle, i18n et smoke E2E.

## 🟢 Après v6.1

- couverture Slovénie/Italie/UK et nouvelles sources officielles ;
- communauté, partage live et intégrations externes ;
- guidage vocal et Wear OS ;
- photo/astro avancé ;
- WebGPU expérimental puis production après validation appareil.

## ✅ Récemment complété (v5.82.0)

- [x] **Fondations UX** — Planifier explicite, navigation par intention, recherche contextualisée, onboarding en trois écrans, réglages structurés et accessibilité renforcée.
- [x] **PWA et E2E stabilisés** — navigation multi-page préservée au rechargement et smoke Chromium validé sur build de production.

- [x] **Section Compte RGPD conservée** — La section reste visible sans session, avec un statut neutre ; les contrôles invité et Google restent masqués et sont couverts par le smoke E2E.

- [x] **Parcours invité / Google masqués** — UI OAuth, liaison Google et achat invité Web suspendus jusqu'à la fiabilisation du retour OAuth et de la restauration d'achats ; Android natif inchangé.

- [x] **Démarrage carte progressif** — l'overlay disparaît dès la première tuile 3D construite ; le reste du chargement reste visible dans la barre fine.
- [x] **Chemin critique allégé** — RevenueCat différé, double scan des packs supprimé, purge de caches non bloquante et fetch Gist mutualisé.

- [x] **Audit tests complet** — 20 fichiers de test, 277 tests ajoutés
- [x] **Bug getElevation()** — Retournait NaN si `ele=NaN` au lieu de fallback
- [x] **Bug revokeProAccess()** — Ne réinitialisait pas les flags Pro
- [x] **Couverture activée** — seuil 50%, rapport HTML, 58.25% actuels
- [x] **Tests ajoutés** : gpxTypes, iap, packCatalog, packTypes, storage, SolarLockedItem, SolarTimeline, autoHide, SharedAPIKeyComponent, UpsellModal, SOSSheet, draggablePanel, NavigationBar, LayersSheet, SearchSheet, mobile, WidgetsComponent, ConnectivitySheet, TrackSheet, WeatherSheet, SolarProbeSheet, Tile
- [x] **Tests enrichis** : compass (2→14), utils (2→16), buildings.integration (1→6), hydrology.integration (1→7), poi.integration (1→6), tileQueue (+14)
