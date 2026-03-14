# SunTrail - Guide Développeur (v4.5.35)

## Méthodologie de Développement "Partner Engineer"
Toute intervention majeure (feature ou refactor) DOIT suivre ce cycle itératif :
1.  **Analyse & Intelligence** : Analyse approfondie du besoin avec l'intelligence maximale du modèle pour identifier les impacts collatéraux et les opportunités de nettoyage.
2.  **Planification** : Création d'un plan d'action structuré (étape par étape) avant toute modification de code.
3.  **Implémentation Chirurgicale** : Une seule modification à la fois. Code propre, typé et idiomatic.
4.  **Tests & Qualité** : Création ou mise à jour systématique des tests unitaires (`vitest`). **100% de succès exigé.**
5.  **Documentation** : Mise à jour immédiate de `CHANGELOG.md`, `TODO.md` et des fichiers de doc spécifiques.
6.  **Livraison** : `npm run check` suivi d'un commit normé et d'un push après chaque étape validée.

## Architecture Technique (v4.5+)
- **State Management :** État global centralisé et strictement typé dans `state.ts`. Séparation Config vs Runtime.
- **Moteur Géographique (`geo.ts`) :** Pivot central pour toutes les conversions de coordonnées.
- **Soleil & Éphémérides :** `sun.ts` centralise tous les calculs astronomiques dans `state.ephemeris`. Aucun calcul `SunCalc` ne doit être fait ailleurs.
- **Gestion Mémoire (`memory.ts`) :** Utilisation systématique de `disposeObject()` pour prévenir les fuites de VRAM sur mobile.
- **Bâtiments & POI :** Optimisation via fusion de géométries et instanciation pour limiter les Draw Calls.
- **Données :** Usage exclusif de MapTiler (Key requise) pour le géocodage et les tuiles afin d'éviter les erreurs 429/CORS de Nominatim.

## Gestion de la Qualité (LOD & Vision)
- **Hystérésis de Zoom :** Marge de sécurité pour éviter le clignotement lors des transitions de LOD.
- **Zoom Européen :** Support du dézoom jusqu'au niveau 4 avec basculement automatique en OpenTopoMap pour la lisibilité.
- **Sécurité Caméra :** Système anti-collision sol (O(1) via cache spatial) et parabole de Tilt automatique.

## Commandes de Développement
- `npm run dev` : Serveur de dev Vite.
- `npm test` : Lancement de la suite de tests (Vitest). **Obligatoire.**
- `npm run check` : Vérification du typage TypeScript.
- `npm run build` : Build de production Web.
- `npm run cap:sync` : Synchronisation vers le projet Android.

## Tests & Mocks
- Pour les tests unitaires Three.js, mocker `WebGLRenderer` avec une classe factice dans le fichier de test pour éviter les échecs de contexte GPU.

## Stratégie de Versioning
- **Messages de Commit** : Prefixes `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`.
- **Atomicité** : Un commit = Une étape du plan validée.
