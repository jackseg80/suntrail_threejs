# SunTrail - Guide Développeur (v4.3.25)

## Architecture Technique (v4.3+)
- **State Management :** État global centralisé dans `state.ts`.
- **Moteur Géographique (`geo.ts`) :** **Pivot central.** Toutes les conversions (Lat/Lon <-> Monde <-> Tuile) DOIVENT passer par ce module pour éviter les dépendances circulaires et garantir l'alignement des calques.
- **Bâtiments 3D (`buildings.ts`) :** Extrusion OSM asynchrone avec fusion de géométries (`BufferGeometryUtils`) pour limiter les Draw Calls à 1 par tuile.
- **Ombres Portées :** Utilisation impérative de `customDepthMaterial` dans `terrain.ts` pour que les ombres "voient" le relief displace par le shader.

## Gestion de la Qualité (LOD & Vision)
- **Hystérésis de Zoom :** Toujours maintenir une marge de ~800m à 1000m entre l'activation et la désactivation d'un LOD pour éviter l'effet ressort (bouncing).
- **Boost Satellite :** La source Satellite utilise des seuils de zoom anticipés (facteur 2.5x) pour offrir de la netteté plus tôt.
- **textures HD :** Utilisation systématique du suffixe `@2x` (512px) pour les sources MapTiler.
- **Sécurité Caméra :** Garde-fou d'altitude (min 30m) et bridage du Tilt (maxPolarAngle) proportionnel au zoom pour cacher les bords de carte.

## Stratégie de Versioning (Git)
- **Numérotation :** Format SEMVER (Major.Minor.Patch).
- **Tags Git :** Utilisés pour chaque sous-version stable (ex: `v4.3.15`).
- **Releases GitHub :** Réservées aux versions majeures ou "testables" (milestones). Doivent inclure les notes de version et le fichier `app-debug.apk` en asset.

## Commandes de Développement
- `npm run dev` : Serveur de dev Vite.
- `npm test` : Lancement de la suite de tests (Vitest). **Obligatoire avant chaque commit.**
- `npm run deploy` : Check TS + Build + Sync Capacitor (Android).
- `cd android; .\gradlew assembleDebug` : Génération manuelle de l'APK (nécessite `JAVA_HOME`).

## Workflow de Travail
1.  **Code** : Modifications dans `src/`.
2.  **Validation** : `npm run check` et `npm test`.
3.  **Docs** : Mise à jour systématique de `README.md`, `CHANGELOG.md` et `TODO.md`.
4.  **Sync** : `npm run deploy`.
5.  **Commit/Push** : Messages clairs avec préfixe `feat:`, `fix:`, `docs:` ou `test:`.
