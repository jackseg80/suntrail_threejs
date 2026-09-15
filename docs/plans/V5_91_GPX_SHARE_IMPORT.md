# Plan v5.91 — Réception OS des GPX (partage / « Ouvrir avec »)

> Statut : implémenté localement. Aucun commit, tag, release ou upload Play n'est implicite.
> Périmètre : Android uniquement. Aucune API externe, aucun compte, aucun nouveau flag.

## Objectif

Permettre à SunTrail de recevoir un fichier `.gpx` partagé depuis une autre application ou ouvert
via « Ouvrir avec », puis de l'importer par le pipeline existant, sans nouvelle interface in-app.

## Décisions actées

- **Filtres ciblés d'abord** : `ACTION_VIEW` sur `application/gpx+xml` ; `ACTION_SEND` et
  `ACTION_SEND_MULTIPLE` sur `application/gpx+xml`, `application/octet-stream`, `text/xml`.
  Élargir seulement si un partage réel (Komoot) n'apparaît pas.
- **Pas de release flag** : fonction additive, sans régression de l'import existant.
- **Hors périmètre** : iOS, cloud, OAuth Strava/Wahoo, FIT, `share_target` PWA.

## Implémentation

### Android

- `android/app/src/main/AndroidManifest.xml` : trois intent-filters ajoutés sur `MainActivity`
  (`exported`, `singleTask` déjà présents) pour `ACTION_VIEW`, `ACTION_SEND`, `ACTION_SEND_MULTIPLE`.
- `android/app/src/main/java/com/suntrail/threejs/GpxImportPlugin.java` (nouveau,
  `@CapacitorPlugin(name = "GpxImport")`) :
  - `handleOnNewIntent` intercepte les intents GPX (hors deep link OAuth) ;
  - lecture de l'URI `content://`/`file://` via `ContentResolver` sur un exécuteur dédié,
    décodage BOM UTF-8/UTF-16, garde de taille 20 Mo, validation `looksLikeGpx` ;
  - publie `gpxImportReceived` avec `retainUntilConsumed = true` : l'événement est retenu
    jusqu'à l'enregistrement de l'écouteur JS, ce qui couvre le démarrage à froid sans polling.
- `MainActivity.java` : `registerPlugin(GpxImportPlugin.class)` avant `super.onCreate()`.

### JavaScript

- `src/modules/gpxImportFlow.ts` (nouveau) : `importGpxTrack(xml, fileName, deps)` centralise
  `handleGPXImport` → `archiveImport` → `importGPXLayer` → `removeGPXLayer` →
  `restoreSavedRoute` + `setRoutePlanningMode(true)`. Garde-brouillon injectable
  (`protectDraft`) et garde global `setGpxDraftGuard`.
- `src/modules/gpxImportIntake.ts` (nouveau) : `registerPlugin('GpxImport')`, écoute
  `gpxImportReceived`, mappe les erreurs natives (`not-gpx`, `too-large`, `read-failed`) vers
  l'i18n, appelle `importGpxTrack`.
- `src/modules/ui/components/TrackSheet.ts` : l'import manuel utilise désormais `importGpxTrack`
  (comportement inchangé) et enregistre le garde-brouillon.
- `src/modules/ui/trackHelpDialog.ts` (nouveau) + icône « ? » dans l'en-tête de la feuille :
  aide **par onglets adaptée au contexte** — Sortie → « Enregistrer » ; Bibliothèque →
  « Préparer » + « Importer » ; Réglages d'itinéraire (bouton dans `app.html`) → « Suivre ».
  Un seul onglet masque la barre d'onglets. Raccourci « Réglages Android » inclus.
- `GpxImportPlugin.openAppAssociationSettings` + `gpxImportIntake.openGpxAssociationSettings` :
  raccourci vers les réglages d'association Android. Android interdit de définir un gestionnaire
  par défaut par programme, l'aide explique donc le choix « Toujours » du sélecteur système.
- `src/modules/appInit.ts` : après `launchScene()`, import dynamique de `gpxImportIntake` sur
  plateforme native.
- i18n : `gpx.shareNotGpx`, `gpx.shareReadFailed`, `gpx.shareTooLarge`, `track.help.*` dans
  `fr/en/de/it`.

## Tests et preuves

- `src/modules/gpxImportFlow.test.ts` : archive avant conversion, ouverture, doublon, refus du
  garde, garde global.
- `src/modules/gpxImportIntake.test.ts` : enregistrement de l'écouteur, no-op Web, import via le
  pipeline commun, erreurs natives, échec d'import, réglages d'association.
- `src/modules/ui/trackHelpDialog.test.ts` : quatre onglets par défaut, sous-ensemble à un seul
  onglet sans barre, sous-ensemble Bibliothèque, bascule d'onglet, bouton réglages natif,
  masquage sur Web.
- `android/app/src/test/java/com/suntrail/threejs/GpxImportPluginContractTest.java` : annotation
  `@CapacitorPlugin`, nom `GpxImport`, constante d'événement, override `handleOnNewIntent`,
  méthode `openAppAssociationSettings`.
- Vérifications exécutées : `npx tsc --noEmit`, `npm run check`, `npm test`, `npm run audit:i18n`
  (exit 0), `npm run cap:sync`, `gradlew testDebugUnitTest`.

## Suivi manuel recommandé (non couvert par l'automatisation)

1. Ouvrir un `.gpx` depuis un gestionnaire de fichiers (démarrage à froid) — confirmé.
2. Partager un `.gpx` depuis une app qui en envoie un ; noter que Komoot/Wikiloc envoient une URL.
3. Vérifier l'anti-doublon (deux fois le même fichier) et le comportement Free (un seul visible).
4. Bouton « Comment importer ? » puis « Réglages Android ».
