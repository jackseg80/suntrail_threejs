# SunTrail - Guide Développeur (v4.6.6)

## Méthodologie de Développement "Partner Engineer"
Toute intervention majeure (feature ou refactor) DOIT suivre ce cycle itératif :
1.  **Analyse & Intelligence** : Analyse approfondie du besoin avec l'intelligence maximale du modèle pour identifier les impacts collatéraux et les opportunités de nettoyage.
2.  **Planification** : Création d'un plan d'action structuré (étape par étape) avant toute modification de code.
3.  **Implémentation Chirurgicale** : Une seule modification à la fois. Code propre, typé et idiomatic.
4.  **Tests & Qualité** : Création ou mise à jour systématique des tests unitaires (`vitest`). **100% de succès exigé.**
5.  **Documentation** : Mise à jour immédiate de `CHANGELOG.md`, `TODO.md` et `README.md`.
6.  **Livraison** : `npm run check` suivi d'un commit normé et d'un push après chaque étape validée.

## Architecture Technique (v4.6+)
- **State Management :** État global centralisé et strictement typé dans `state.ts`.
- **Suivi GPS Ultra-Lisse :** Utilisation de l'interpolation haute fréquence (60 FPS) dans la render loop (`centerOnUser`). Les capteurs ne font que mettre à jour les données dans le `state`.
- **Moteur de Sommets (`peaks.ts`) :** Extraction Overpass API avec système de cache local (7 jours). Les sommets sont triés par altitude.
- **Vol Cinématique (`flyTo`) :** Trajectoire parabolique avec interpolation `easeInOutCubic` et anti-collision terrain dynamique.
- **Optimisation Batterie :** Mode "Deep Sleep" via Visibility API (stop rendu si caché) et bridage 30 FPS via `clock.getDelta()`.
- **Gestion Mémoire (`memory.ts`) :** Utilisation systématique de `disposeObject()` pour prévenir les fuites de VRAM.

## Gestion de la Qualité (LOD & Vision)
- **Parabole de Tilt :** Inclinaison bridée selon le LOD (pic à LOD 14, redressement vers le sol) pour masquer le vide de l'horizon.
- **Visibilité 2D :** Marqueur GPS forcé en `renderOrder: 9999` et altitude Y élevée pour rester visible sur les tuiles plates.
- **Hystérésis de Zoom :** Marge de sécurité pour éviter le clignotement lors des transitions de LOD.

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
