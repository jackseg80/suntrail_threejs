# Prompt autonome — SunTrail v6.1.0 Lumière utile & préparation photo

Travaille après v6.0 et la baseline locale v5.87. Renforce la préparation d'une randonnée avec les
données solaires et terrain déjà présentes, sans compte, synchronisation, nouvelle API payante ou
promesse de conditions réelles.

## Audit d'abord

Lis `CLAUDE.md`, `ROADMAP.md`, `docs/MONETIZATION.md`, `docs/READINESS_OFFLINE.md`, les services
solaires, `SolarProbeSheet`, `runSolarProbe`, l'overlay d'ombre et les tests existants. Cartographie
les données réellement calculées : position, date/fuseau, lever/coucher, azimut, heure dorée,
relief/ombre et fraîcheur des conditions. Ne présente jamais une donnée absente comme calculée.

## Mission

- Pour la route ou le point actuellement consulté, rendre lisibles lever/coucher, azimut, heure
  dorée et, si le modèle terrain le permet, les portions prévues au soleil ou à l'ombre.
- Relier départ planifié, ETA et section `light` du readiness avec date de calcul, source et états
  `available`, `stale`, `unknown` ou `error` cohérents.
- Garder la lecture du jour courant disponible en Free. La comparaison de dates/heures et le
  calendrier restent Pro uniquement lorsqu'ils correspondent à une capacité déjà réellement
  implémentée ; l'absence d'option ne déclenche ni faux verrou ni upsell.
- Fournir un résumé textuel accessible à côté du canvas, avec unités, fuseau et limites clairs.

## Garde-fous

- Pas de Voie lactée, pollution lumineuse, modèle de saison, export image, réseau social, cloud
  ou tracking de position.
- Aucune promesse « soleil garanti », visibilité garantie ou météo fiable : terrain et météo
  éventuelle restent deux sources distinctes.
- Aucun calcul WebGL/3D permanent si le panneau est fermé ; préserver budgets batterie, offline,
  REC et Guidance.
- Le parcours débutant Rechercher → Préparer → Prêt à partir → Démarrer ne gagne aucune étape.

## Acceptation

- Cas déterministes de lever/coucher, azimut, heure dorée, fuseaux et changement d'heure.
- Résultat explicite lorsqu'il manque une position, une date, une route ou une donnée terrain.
- Mobile et desktop : lecture utile, focus, lecteur d'écran, reduced motion et textes longs.
- E2E de préparation existants inchangés ; check, tests, build, bundle, i18n, Capacitor et gates
  Android appropriés passent. Validation S23/A53 si le rendu ou les interactions Android changent.

Mettre à jour architecture, UX, monétisation et documentation des limites. Aucun commit, tag,
push, release, secret ou déploiement sans accord explicite.
