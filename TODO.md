# SunTrail — TODO (v5.85.1 optimisation — validation en cours)

> Dernière mise à jour : 2026-08-13

## 🟡 v5.85.1 — performance et autonomie terrain

- [x] Boussole rendue uniquement avec une frame carte utile ; deep sleep préservé.
- [x] Remplacement du cache LRU libérant les anciennes textures ; préchargement LOD réellement
      chargé, réutilisable par la source active, non épinglé et dédupliqué ; zoom sortant corrigé.
- [x] Mesh REC live borné à 2 500 points, reconstruction longue débouncée à 5 s et trace complète
      conservée pour récupération/export.
- [x] Snapshot de récupération REC débouncé à 15 s avec flush background/STOP ; stats notification
      recalculées seulement si les points ont changé et au plus toutes les 30 s.
- [x] Stats REC de la feuille Sortie non recalculées lorsqu'elle est fermée.
- [x] Polling Free de l'inclinomètre, polling stockage et timer permanent de focus recherche supprimés.
- [x] Météo initiale et lecture de session native dupliquées supprimées ; `gpxparser` différé ; packs
      prêts avant terrain et feuilles secondaires lancées après le chemin critique WebGL.
- [x] Guidage TS/Java : projection bornée avec fallback exact ; ticker natif silencieux si inchangé,
      persistance des positions acceptées limitée à 10 s et notification à snapshot unique.
- [x] Version source `5.85.1`, Android `versionName 5.85.1` / `versionCode 904` provisoire.
- [x] Web final : `npm run check`, 1 607 tests Vitest, build, budget bundle 2,27 MiB, audit i18n
      sans clé manquante et `npm run cap:sync` réussis.
- [ ] Rejouer les 24 E2E Chromium sur un runner autorisant le lancement navigateur (`spawn EPERM`
      sur l'hôte Codex, avant exécution du code des tests).
- [ ] Exécuter tests/lint/assemblage Android avec un JDK ; cet hôte n'a ni `JAVA_HOME` ni `java`.
- [ ] Mesurer idle/carte/REC/Guidance+REC sur A53 et S23, trois runs homogènes face à v5.85.0.
- [ ] Vérifier absence de fuite WebGL/texture après 30 min de pan/zoom et changements LOD.
- [ ] Revalider le maximum Play Console avant de figer `versionCode 904` et toute publication.

## ✅ v5.85.0 — guidage Android natif clôturé

La clôture de v5.85.0 a été confirmée par le propriétaire du projet le 2026-08-13. Le détail
historique du protocole reste dans
[docs/plans/V5_85_A53_S23_FIELD_VALIDATION.md](docs/plans/V5_85_A53_S23_FIELD_VALIDATION.md) ;
v5.85.1 est désormais le chantier actif.

## ✅ v5.84.0 — moteur de suivi interne clôturé

- [x] `GuidanceEngine` pur : projection, progression robuste, restant/ETA, écart, bearing/look-ahead.
- [x] Accuracy/fraîcheur, hystérésis, cooldown et sept états de session testés.
- [x] Fixtures droite, boucle, aller-retour, épingles, croisement, bruit, saut, récupération, arrivée.
- [x] `GuidancePlanV1` séparé et migration IndexedDB v2→v3 additive.
- [x] Cues ORS/OSRM, points GPX nommés proches et dérivés approximatifs filtrés.
- [x] UI foreground, alertes visuelles/haptiques, recentrage et REC indépendant.
- [x] Qualités `full` / confirmation `approximate` / refus `not-ready` couvertes en E2E.
- [x] Gates automatisés, synchronisation Capacitor et contrôles Android consignés (0 erreur).
- [x] Validation manuelle Galaxy S23 application ouverte/mode avion/GPS bruité/lacets/REC
      acceptée par le testeur ; limites foreground confirmées.
- [x] Commit, tag et pré-release GitHub interne autorisés ; aucun téléversement Play Console.

## ✅ Correctifs CI + produit (même version 5.83.3, non publiés)

- [x] Suppression de compte (RGPD) fonctionnelle sur iOS : `confirmDialog` (modale HTML custom)
      remplace `window.confirm()` qui retourne toujours `false` sur WebKit/iOS.
- [x] Bouton timeline visible sur iPhone 12/13/14 : media query `max-width: 389px` au lieu de 390px.
- [x] Disclaimer + onboarding affichés même si la scène WebGL ne devient pas prête.
- [x] Suite E2E stabilisée : SW bloqué, preset forcé en mode test, langue `fr` forcée en test.
- [x] `npm audit` clean (override `nanoid ^3.3.17`).
- [x] `npm run check` (tsc + prettier + eslint), 1551 tests unitaires et E2E 3 navigateurs verts.

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

## ✅ Publication externe v5.82.0 — clôturée

- [x] Play Console vérifiée : le plus grand `versionCode` réellement utilisé est `896` ; `897` est
      donc attribué à v5.82.0 et le bundle signé a été généré.
- [x] Commit, tag `v5.82.0`, CI et release GitHub publique avec AAB signé vérifiés le 2026-08-09.
- [x] Publication v5.82 clôturée ; v5.83 peut démarrer.

Protocole : [docs/plans/V5_82_S23_FIELD_VALIDATION.md](docs/plans/V5_82_S23_FIELD_VALIDATION.md).
Prompt de clôture :
[docs/plans/prompts/V5_82_FIELD_RELEASE.md](docs/plans/prompts/V5_82_FIELD_RELEASE.md).

État détaillé : [docs/plans/V5_82_RESUME_STATUS.md](docs/plans/V5_82_RESUME_STATUS.md).

## ✅ v5.83.0 — Prepared Routes implémentée localement

- [x] `PreparedRouteV1`, `RouteRepository` IndexedDB et migration additive v1→v2.
- [x] Bibliothèque locale : sauvegarder, rouvrir sans réseau externe, dupliquer, favori, supprimer.
- [x] A/B accessible, waypoints éditables, inversion, ordre, suppression et undo/redo.
- [x] Difficulté ORS complète/partielle, inconnue OSRM/absente, effort, ETA et soleil.
- [x] Legacy localStorage préservé ; conversion explicite et approximative uniquement.
- [x] Release flags séparés des entitlements et traductions FR/EN/DE/IT.
- [x] 1 536 tests unitaires, build, bundle 2,20 MiB et audit i18n validés.
- [x] Runner Playwright officiel Chromium : 6 smoke et 4 scénarios Prepared Routes validés.
- [x] Correctifs terrain S23 : Boucle persistée, conflit GPX/route annulé, nom GPX et A/B
      synchronisés, difficulté inconnue sans faux pourcentage, largeur mobile et traductions dynamiques.
- [x] Deuxième passe terrain : cadrage des routes préparées, remplacement visible du GPX Free,
      protection des boucles GPX contre le recalcul A/B et contenus Bibliothèque bornés au panneau.
- [x] Build Android, tests unitaires, lint, APK debug et installation S23 (`versionCode 898`) validés.
- [x] Retest S23 du thème natif : sélecteur, calendrier et confirmation de suppression compacts,
      sans visuel SplashScreen ni contenu hors écran ; changements de langue validés sur appareil.
- [x] Retest S23 du conflit GPX/Bibliothèque : import visible sans sauvegarde préalable,
      nom/statistiques immédiats et réouverture d'une route préparée avec fly et géométrie correcte.
- [x] Contrat de trace clarifié : brouillon Préparer, trace consultée et REC indépendant ; aucune
      sélection de bibliothèque ne remplace automatiquement le brouillon.
- [x] Bandeau Préparer nommé, action explicite « Préparer cette trace », protection
      Sauvegarder/Remplacer/Annuler et commandes de visibilité avec compteur.
- [x] Tests unitaires ciblés sur arbitrage, protection du brouillon, visibilité et priorité REC.
- [x] E2E Chromium final : 4/4 Prepared Routes/IndexedDB/legacy/GPX boucle et 6/6 smoke.
- [x] `cap:sync` sans diff suivi inattendu, puis tests Android, lint et APK debug validés.
- [x] Contrat GPX clarifié : géométrie complète distincte des jalons ; boucle détectée avec
      départ, deux passages intermédiaires et arrivée superposée au départ.
- [x] Régression automatisée GPX boucle → sauvegarde → réouverture du profil ajoutée sur la
      vraie IndexedDB Chromium ; boutons Prepared Routes/visibilité unifiés avec le thème.
- [x] Retest Galaxy S23 des jalons de boucle, de la réouverture du profil et des boutons unifiés.
- [x] Correctif v5.83.1 : résumé Préparer lisible en portrait et mode carte au second clic,
      validés sur Galaxy S23.
- [x] v5.83.2 : détection de la langue système au premier démarrage (fr/de/it/en, repli fr),
      préférence sauvegardée prioritaire, tests ajoutés (1551 au total) et `npm run check` OK.
- [x] Autorisation explicite reçue : CI, AAB et publication v5.83.2 (tag + push).
- [x] v5.83.3 : langue par défaut passée au français → anglais (`state.lang`, constructeur i18n,
      repli `detectSystemLocale()`, chaîne de repli `t()` et noms de packs).

## 🟡 Programme produit engagé

- [x] **v5.83.1** — correctif d'interface Préparer ; routes, brouillon et contrat de traces
      validés sur Galaxy S23.
- [x] **v5.83.2** — détection de la langue système au premier démarrage, publiée.
- [x] **v5.83.3** — anglais par défaut, publiée.
- [x] **v5.84.0 interne** — clôturée par pré-release GitHub interne, sans déploiement Play.
- [x] **v5.85.0** — clôture confirmée ; base de référence de v5.85.1.
- [ ] **v5.85.1** — optimisations implémentées localement ; web vert, Android/E2E et terrain ouverts.
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
