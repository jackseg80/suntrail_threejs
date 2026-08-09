# Prompt autonome — SunTrail v5.85.0 Guidage Android robuste

Travaille après le jalon interne v5.84, avec GuidanceEngine et fixtures validés. Porte la source
de vérité du guidage
dans les briques Java/Room existantes afin de fonctionner écran éteint, sans réseau et après
interruption, sans réécrire le REC.

## Audit natif obligatoire

Lis service `:tracking`, RecordingService/Plugin, Room/DAO, manifest, notifications, permissions,
WakeLock, récupération, bridge JS et tous tests. Exécute la baseline web et Android. Les tests
Android générés `Example*` ne comptent pas comme couverture.

## Architecture additive

- Sessions `guidance`, `recording`, `both` ; anciennes API REC mappées recording-only.
- Ajouter route/session à Room avec migrations et export de schéma.
- Copier une géométrie validée ; original PreparedRoute inchangé.
- Porter matcher/machine d'état v5.84 côté Java avec mêmes fixtures et tolérances de parité.
- Snapshot conforme au contrat partagé : `progressMeters`, `remainingMeters`,
  `crossTrackMeters`, ETA, bearing, accuracy, `positionAgeMs` et statut incluant `recovered`.
- Persister de quoi reprendre après WebView/process principal tué.
- Une seule source FusedLocation et aucune double écriture GPS.

## Terrain/background

- Foreground service location conforme aux API ciblées et démarré depuis activité visible.
- Notification persistante : état/distance et actions pause/stop sûres.
- Alertes visuelles, haptique et notification hors trace ; pas de voix turn-by-turn.
- Stop guidance en gardant REC, stop REC en gardant guidance, terminer les deux.
- GPS coupé, permission révoquée, position stale, route supprimée et stockage plein.
- Écran éteint, mode avion, swipe-away, WebView tuée et relance.

## Seuils

Centraliser seuils dynamiques, hystérésis, temps soutenu, cooldown et arrivée. Les valeurs v5.84
sont un point de départ, affinées par replays terrain. Ne jamais alerter sur accuracy hors plafond
ou position stale. Documenter chaque changement de seuil avec fixture.

## Tests obligatoires

- JUnit matcher/machine d'état/parité fixtures.
- Room sur appareil : CRUD, migration, reprise et corruption contrôlée selon recommandations Android.
- Instrumentation service/notification/actions indépendantes et bridge.
- API 24, 33, 36 ; A53 et S23 physiques.
- Trois runs d'une heure REC-only puis guidance+REC sur la même trace/conditions : rapporter
  batterie par heure, CPU, mémoire, GPS et ANR. Cible initiale ≤ +1 point de batterie/heure sur A53.
- Aucun passage en production sur émulateur seul.

## Hors périmètre

Voix turn-by-turn, recalcul automatique complexe, partage live, Wear OS et nouveau moteur REC.

Cette version porte la première promesse publique de guidage complet. Tous les gates
web/Capacitor/Gradle/lint/instrumentation doivent passer. Ajouter flag `nativeGuidance`,
documentation algorithme/Room/permissions/notification/récupération et protocole terrain. Ne
commit/tag/push/publie pas sans autorisation. Un appareil physique manquant rend la release non
généralisable et doit être signalé comme gate rouge.
