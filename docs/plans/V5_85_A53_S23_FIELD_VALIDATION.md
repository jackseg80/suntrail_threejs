# v5.85 — Protocole terrain Android A53/S23

> Gate de release, pas un compte rendu anticipé. Le 2026-08-12, le Galaxy S23 a exécuté
> l'instrumentation API 36 (5/5). Toutes les validations manuelles et les sorties terrain restent
> rouges ; aucune conclusion d'autonomie ne peut être tirée sur appareil branché à 14 %.

## Matrice obligatoire

| Cible | API | Rôle | État |
|---|---:|---|---|
| appareil/émulateur bas | 24 | compatibilité minimale, Room v1→v2, notification | 🔴 non exécuté |
| Galaxy A53 | 33 | cible batterie/performance et trois sorties longues | 🔴 appareil absent |
| Galaxy S23 `SM-S911B` | 36 | cible récente, reprise/processus/permissions | 🟡 instrumentation 5/5 ; terrain rouge |

## Exécution instrumentée S23 — 2026-08-12

- Appareil : Samsung `SM-S911B`, Android 16 / API 36, build
  `S911BXXSAFZG1`; batterie 14 %, en charge, 32,3 °C.
- `app:connectedDebugAndroidTest` : **5 tests, 0 échec, 0 erreur**. Les trois tests Room couvrent
  CRUD/récupération, migration v1→v2 avec conservation de `gps_points`, et corruption fail-closed.
- Le test `:tracking` observe sur l'appareil le service foreground, sa notification, pause/reprise
  et l'arrêt REC sans arrêt de Guidance. Le test Capacitor généré vérifie seulement l'applicationId
  et ne constitue pas de couverture produit.
- Le runner Gradle désinstalle la build debug et le paquet de test à la fin ; aucun service
  SunTrail ne restait actif après l'exécution.

Installer l'APK debug v5.85.0/903 uniquement pour le test local. Activer le flag développeur
`nativeGuidance=true`, vérifier que `guidanceForeground=true`, puis accorder localisation précise
et notifications. Ne pas téléverser de bundle Play et ne pas publier.

## Préflight par appareil

1. Sauvegarder une route full et une route approximate, garder une route courte avec cues.
2. Noter modèle, API, build Android, batterie initiale, température, réseau et optimisation
   batterie. Débrancher le chargeur pour les mesures.
3. Capturer `adb shell dumpsys battery`, `dumpsys meminfo com.suntrail.threejs`,
   `dumpsys cpuinfo`, `dumpsys location`, `dumpsys activity services com.suntrail.threejs` et
   `logcat -c` avant chaque run.
4. Confirmer un seul `RecordingService` dans `:tracking`, une notification et aucune autre
   source d'enregistrement GPS.

## Scénarios fonctionnels courts

- Guidance-only : démarrer, obtenir deux bons fixes, pause/reprise, écran éteint 5 min, rallumer.
- REC-only : enregistrer des points ; démarrer/arrêter Guidance ne doit pas altérer le REC.
- Both : arrêter REC depuis UI puis notification, Guidance continue ; redémarrer REC ; arrêter
  Guidance, REC continue ; enfin arrêter les deux.
- Swipe-away et `am kill com.suntrail.threejs` (processus principal seulement) : la notification
  et `:tracking` restent actifs ; relance UI avec snapshot `recovered` et progression monotone.
- `am force-stop` est un arrêt utilisateur Android et ne doit pas être présenté comme récupérable.
- GPS coupé, mode avion, tunnel simulé/stale : `acquiring` sans fausse alerte, reprise après retour.
- Retrait permission pendant session : notification d'incident, aucune progression ; réaccorder
  depuis les réglages, relancer et vérifier reprise contrôlée.
- Supprimer la PreparedRoute active : Guidance s'arrête, REC éventuel continue.
- Corrompre/supprimer la copie Room dans un build de test : arrêt fail-closed, aucune réécriture REC.
- Stockage presque plein : incident visible, REC stoppé sans prétendre avoir sauvegardé ; nettoyer
  l'espace avant le prochain run.
- Route approximate demande confirmation ; route not-ready reste refusée.

## Trois sorties d'une heure

Sur A53 puis S23, exécuter **trois runs REC-only d'une heure**, puis **trois runs Guidance+REC
d'une heure**, sur trajet comparable. Pour chaque run, relever à T0/T30/T60 :

| Mesure | Collecte |
|---|---|
| batterie | pourcentage et mAh/charge counter si disponible |
| CPU | `dumpsys cpuinfo` + moyenne/pic observés |
| mémoire | PSS total, Java/native/graphics via `dumpsys meminfo` |
| GPS | fixes reçus/acceptés/rejetés, accuracy, stale, trous et distance |
| stabilité | ANR, crash, redémarrage service, notification absente |
| fonctionnel | progression monotone, REC points, événements Guidance |

Comparer pour chaque paire `Guidance+REC - REC-only`. Cible initiale A53 : surcoût batterie
**≤ 1 point par heure**. Signaler médiane, pire run et contexte ; ne pas conclure avec une seule
mesure.

## Artefacts de preuve

Conserver un dossier par appareil/run : métadonnées, relevés T0/T30/T60, logcat filtré
`RecordingService|RecordingPlugin|AndroidRuntime|ANR`, captures notification/écran et export de
trace. Le compte rendu doit distinguer clairement observation, mesure et interprétation.

## Gates de clôture v5.85

- 🔴 instrumentation réelle sur API 24 et 33 (API 36/S23 : 5/5 réussi) ;
- 🔴 scénarios fonctionnels A53 et S23 sans P0/P1 ;
- 🔴 12 sorties d'une heure au total (6 par appareil) avec batterie/CPU/mémoire/GPS/ANR ;
- 🔴 surcoût A53 ≤ 1 point batterie/h ou décision explicite documentée ;
- 🔴 reprise écran éteint, swipe-away et processus principal tué démontrée ;
- 🔴 indépendance REC/Guidance démontrée depuis UI et notification ;
- 🔴 absence d'ANR/crash/perte REC démontrée.

Tant qu'une gate est rouge, recommander **ne pas clôturer v5.85**, conserver
`nativeGuidance=false` par défaut et ne pas commencer v5.86.
