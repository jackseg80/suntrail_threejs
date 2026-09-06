# Stockage des traces pleine fidélité (v5.87.0)

> État au 2026-09-02 : version source `5.87.0` / Android `907`, clôturée et publiée sur GitHub
> avec son AAB signé. Aucun upload Play n'est inclus et 907 n'est pas déclaré consommé sur Play.

## Responsabilités séparées

| Donnée | Source canonique | Rôle |
| --- | --- | --- |
| Trace REC ou import GPX enregistré | IndexedDB `suntrail-tracks` | Géométrie ordonnée complète et métadonnées durables |
| Route préparée | `RouteRepository` / `suntrail-prepared-routes` | Intention de planification, readiness et guidage |
| Session REC native en cours | Room + `rec_state.json` | Tampon récupérable avant finalisation durable |
| Historique legacy des cinq derniers GPX/REC | `localStorage` | Source de migration additive et compatibilité avec le client précédent |
| Calque 3D actif | `state.gpxLayers` | Vue transitoire, jamais source canonique de l'archive |

Ouvrir une trace ne crée pas une route préparée. L'action explicite « Créer l'itinéraire »
effectue cette conversion. Le catalogue utilise un adaptateur échantillonné à 200 points pour la
mini-carte, mais chaque ouverture, export et conversion repart de la géométrie canonique.

## Contrat `StoredTrackV1`

Une trace contient une identité stable, une origine (`recording`, `gpx-import` ou
`legacy-migration`), un nom Unicode, une couleur, la géométrie et ses champs optionnels réellement
connus (`ele`, `timestamp`, `accuracy`), les statistiques avec leur provenance, les bounds, la
qualité et les dates de création/modification. Aucun timestamp, altitude ou niveau de précision
absent n'est fabriqué.

Les identités sont déterministes : un REC natif réutilise l'identifiant de course Room ; un import
utilise une empreinte de sa géométrie, qui exclut volontairement le nom. Un STOP rejoué ou un
réimport identique remplace donc la même archive au lieu de créer un doublon.

## IndexedDB et atomicité

`TrackRepository` reçoit une `IDBFactory`, ce qui permet une base isolée par test. La base
`suntrail-tracks` v1 contient :

- `tracks` : en-têtes versionnés et métadonnées ;
- `trackChunks` : blocs ordonnés de 1 000 points, indexés par `trackId` ;
- `meta` : marqueurs de migration reprenable.

Le remplacement d'un en-tête et de tous ses blocs se fait dans une même transaction
`readwrite`. Un abort laisse la version précédente intacte. Les erreurs distinguent stockage
indisponible, quota, enregistrement corrompu, ouverture bloquée, transaction interrompue et version
inconnue. Une trace corrompue est exclue de la liste et signalée dans les diagnostics ; elle n'est
jamais supprimée automatiquement.

## Migration legacy

La migration `legacy-localstorage-migration-v1` est copy-first et reprenable entrée par entrée.
Elle conserve les cinq entrées legacy et le `localStorage` d'origine pendant cette release. Les
points disponibles sont copiés, `originalPointCount` conserve le nombre historique connu et la
géométrie est marquée `approximate`; timing, altitude et précision restent `unknown` lorsque le
format précédent ne permet pas de les établir. Une entrée invalide est inscrite dans le marqueur
d'échec sans empêcher la reprise des autres.

## Finalisation REC native

La finalisation suit cet ordre : STOP et flush natif, lecture des points Room complets, nommage ou
abandon explicite, transaction `TrackRepository`, accusé de succès, puis seulement suppression du
marqueur et des points Room. En cas de quota ou d'échec transactionnel, l'accusé n'est pas envoyé
et la session reste récupérable. L'abandon explicite et un enregistrement trop court sont, eux,
acquittés sans créer d'archive.

## Contrat Free / Pro

La persistance et la pleine fidélité ne consultent aucun entitlement. Free conserve toutes les
traces locales, peut les ouvrir, renommer, supprimer et convertir une par une, avec un seul tracé
de Bibliothèque visible sur la carte. Pro ajoute le multi-affichage et l'export fichier. Un
downgrade ne modifie ni la base ni les géométries. La seule limite est le quota réel de l'appareil ;
aucun nettoyage silencieux n'est autorisé.

## Preuves et limites de clôture

Les tests unitaires couvrent CRUD, ordre des blocs, concurrence, rollback, quota, corruption,
version inconnue, Unicode, 12 345 points, champs absents et migration interrompue/reprise. Chromium
réel couvre import GPX, catalogue, rechargement, mode hors ligne et réouverture. Les tests JVM,
lint Android et assemblage debug valident le bridge et le service.

Sur Galaxy S23/API 36, un import de 219 points et deux REC de 17 et 10 points ont été archivés en
pleine fidélité, conservés après réinstallation `adb install -r`, ouverts individuellement en Free
et laissés intacts avec la route préparée. Le STOP depuis l'interface et depuis la notification a
conservé une seule archive nommable ; le retour automatique au premier plan, corrigé ensuite pour
les restrictions Android 14+, reste un retest terrain recommandé. Le téléphone ne contenait
aucune entrée `suntrail_gpx_history_v1`, donc la migration legacy réelle et la pression de quota
restent des preuves automatisées, pas des observations sur cet appareil. Aucun test instrumenté
effaçant Room ou `TrackingPrefs` n'a été lancé.
