# SunTrail - Guide Développeur (v5.7.4)

## Environnement & Langue
- **Langue :** Toutes les interactions et réponses doivent être en **Français**.
- **Système :** Travail sur **Windows** (utiliser PowerShell pour les commandes shell).

## Méthodologie de Développement "Partner Engineer"
Toute intervention majeure (feature ou refactor) DOIT suivre ce cycle itératif :
1.  **Analyse & Intelligence** : Analyse approfondie du besoin. Consulter **`AGENTS.md`** pour l'historique technique et architectural lié au module visé.
2.  **Planification** : Création d'un plan d'action structuré (étape par étape) avant tout code.
3.  **Implémentation Chirurgicale** : Une seule modification à la fois. Code propre et typé.
4.  **Tests & Qualité** : Mise à jour des tests unitaires (`vitest`). **100% de succès exigé.**
5.  **Validation Visuelle & Utilisateur** : L'IA décrit les changements, propose un scénario de test manuel (ex: "Allez à tel endroit") et attend une validation explicite de l'utilisateur.
6.  **Documentation** : Mise à jour de `CHANGELOG.md`, `TODO.md` et `README.md`.
7.  **Livraison** : `npm run check` suivi d'un commit normé et d'un push.

## Architecture Technique (v5.7.4)
- **State Management :** État global centralisé et strictement typé dans `state.ts`.
- **Moteur WebWorkers :** Pool de 8 workers pour le fetch/décodage des tuiles (performance asynchrone).
- **Event Bus :** Utilisation de `eventBus.ts` pour découpler les modules (Terrain <-> Scène).
- **Suivi GPS Ultra-Lisse :** Utilisation de l'interpolation haute fréquence (60 FPS) dans la render loop (`centerOnUser`). Les capteurs ne font que mettre à jour les données dans le `state`.
- **Moteur de Sommets (`peaks.ts`) :** Extraction Overpass API avec système de cache local (7 jours). Les sommets sont triés par altitude.
- **Vol Cinématique (`flyTo`) :** Trajectoire parabolique avec interpolation `easeInOutCubic` et anti-collision terrain dynamique.
- **Optimisation Batterie :** Mode "Deep Sleep" via Visibility API (stop rendu si caché) et bridage 30 FPS via `clock.getDelta()`.
- **Gestion Mémoire (`memory.ts`) :** Utilisation systématique de `disposeObject()` pour prévenir les fuites de VRAM.
- **Sécurité API :** Détection dynamique des erreurs 403 (MapTiler) et fallback automatique vers **OpenStreetMap Standard**.

## Gestion de la Qualité (LOD & Vision)
- **Unification Globale :** Forçage d'une source unique (MapTiler/OSM) pour tout le monde au LOD <= 10 pour éviter l'effet patchwork.
- **Parabole de Tilt :** Inclinaison bridée selon le LOD (pic à LOD 14, redressement vers le sol) pour masquer le vide de l'horizon.
- **Visibilité 2D :** Marqueur GPS forcé en `renderOrder: 9999` et altitude Y élevée pour rester visible sur les tuiles plates.
- **Hystérésis de Zoom :** Marge de sécurité pour éviter le clignotement lors des transitions de LOD.

## Qualité Technique & Typage
- **Typage Strict :** L'usage de `any`, `@ts-ignore` ou `@ts-expect-error` est STRICTEMENT INTERDIT. Préférer les interfaces précises ou les types génériques.
- **Performance Mobile :** Toujours vérifier l'impact CPU/GPU (voir sections Adaptive Scan et Light Shader dans `AGENTS.md`).

## Commandes de Développement
- `npm run dev` : Serveur de dev Vite.
- `npm test` : Lancement de la suite de tests (Vitest). **Obligatoire.**
- `npm run check` : Vérification du typage TypeScript.
- `npm run deploy` : Suite complète (Check + Build + Cap Sync).

## Tests & Mocks
- Pour les tests unitaires Three.js, mocker `WebGLRenderer` avec une classe factice dans le fichier de test pour éviter les échecs de contexte GPU.

## Stratégie de Versioning
- **Messages de Commit** : Prefixes `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`.
- **Atomicité** : Un commit = Une étape du plan validée.
