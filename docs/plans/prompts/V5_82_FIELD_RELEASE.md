# Prompt autonome — Clôturer le terrain et publier SunTrail v5.82.0

SunTrail v5.82.0 est finalisée dans le worktree et les gates automatisés sont verts. Le test
réel Galaxy S23 vient d'être effectué ou est en cours de clôture. Ne commence aucune fonction
v5.83 tant que cette étape n'est pas entièrement verte.

## Entrées

Je fournirai mes observations S23 : version Android/WebView, durée, réseau, batterie, chauffe,
scénarios testés, captures et anomalies. Commence par les structurer en preuves observées,
éléments non testés et anomalies reproductibles. Ne déduis jamais qu'un scénario est réussi
s'il n'est pas renseigné.

## Lecture et pré-check

Lis `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `TODO.md`, `CHANGELOG.md`, `docs/RELEASE.md`,
`docs/plans/V5_82_S23_FIELD_VALIDATION.md` et l'état Git. Préserve tout le travail présent ;
aucun reset, revert, stash global ou réécriture de v5.82.

## Décision terrain

- P0/P1 : suspendre la publication et v5.83, diagnostiquer, corriger au plus petit périmètre,
  ajouter une non-régression et rejouer tous les gates.
- P2 sur le flux principal : corriger avant publication ou documenter une décision explicite.
- P3 cosmétique : backlog possible avec reproduction et capture.
- Si des scénarios importants manquent, conclure « validation terrain incomplète ».

## Gates après toute correction

Exécute au minimum :

```powershell
npm run check
npm test
npm run build
npm run check:bundle
npm run audit:i18n
npm run test:e2e:smoke
```

Si Android change : synchronisation Capacitor contrôlée, tests/lint/assemble Gradle et nouveau
smoke S23 ciblé. Les erreurs console inattendues sont distinguées du bruit de test connu.

## Version et publication

- Ne suppose pas que `897` est disponible : demander ou vérifier la preuve du plus grand
  `versionCode` présent dans Play Console juste avant l'upload.
- Si un autre artefact a consommé le code, attribuer le prochain entier supérieur et réaligner
  Gradle, changelog et historique de release.
- Mettre à jour les documents pour distinguer source, tag, CI, track Play et production.
- Aucun commit, tag, push, GitHub Release ou upload Play sans autorisation explicite.
- Après autorisation, suivre `docs/RELEASE.md`, vérifier le SHA/run CI puis procéder par track
  interne/fermé et déploiement progressif.

## Bilan requis

Fournis anomalies et décisions, fichiers modifiés, résultats exacts des gates, preuve terrain,
`versionCode` réellement attribué, état Git/CI/Play et actions manuelles restantes. v5.83 ne
devient la prochaine discussion que lorsque v5.82 est publiée ou qu'une exception explicite a
été décidée.
