# Documentation SunTrail

Cet index sépare les références qui décrivent la version actuelle, les spécifications techniques
encore applicables, les plans futurs et les archives historiques.

## Commencer ici

1. [README du projet](../README.md) : présentation, plateformes, installation et limites.
2. [Fonctionnalités actuelles](FEATURES.md) : inventaire canonique de la version 5.88.0.
3. [Guide IA et état de release](../CLAUDE.md) : règles de travail, version et garde-fous.
4. [Architecture](AI_ARCHITECTURE.md) : services, événements, état et stockages.
5. [Navigation et UX](AI_NAVIGATION_UX.md) : Explorer, Préparer, Sortie, Bibliothèque et Plus.

## Références actives

| Domaine | Document | Rôle |
| :--- | :--- | :--- |
| Fonctionnalités | [FEATURES.md](FEATURES.md) | Ce qui existe, où, pour qui et avec quelles limites. |
| Architecture | [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) | Modules, flux, événements et persistance. |
| Rendu/performance | [AI_PERFORMANCE.md](AI_PERFORMANCE.md) | Constantes, budgets, cache, rendu et mesures 5.88. |
| Navigation/UX | [AI_NAVIGATION_UX.md](AI_NAVIGATION_UX.md) | Contrats d'interaction et responsabilités des écrans. |
| UI | [AI_UI_STYLE_GUIDE.md](AI_UI_STYLE_GUIDE.md) | Composants, accessibilité et responsive. |
| Débogage | [AI_DEBUGGING.md](AI_DEBUGGING.md) | Diagnostic des symptômes et outils de développement. |
| Monétisation | [MONETIZATION.md](MONETIZATION.md) | Matrice Free/Pro et décisions commerciales. |
| Traces | [TRACK_STORAGE.md](TRACK_STORAGE.md) | Archives REC/import pleine fidélité et migration legacy. |
| Guidage Android | [GUIDANCE_ANDROID.md](GUIDANCE_ANDROID.md) | Service natif, Room, notification et reprise. |
| Fallback Web | [GUIDANCE_FOREGROUND.md](GUIDANCE_FOREGROUND.md) | Moteur TypeScript utilisé hors Android ou si le natif est coupé. |
| Préparation hors ligne | [READINESS_OFFLINE.md](READINESS_OFFLINE.md) | Rapport avant départ, corridor et responsabilités de cache. |
| Android | [ANDROID_LINT.md](ANDROID_LINT.md) | Edge-to-edge, R8 et avertissements connus. |
| Publication | [RELEASE.md](RELEASE.md) | Préflight, versions, AAB et actions externes. |
| Fiche Store | [STORE_LISTING.md](STORE_LISTING.md) | Texte marketing multilingue aligné sur les capacités actuelles. |
| Protocoles | [protocols/PROTOCOL_TEST_RAPIDE.md](protocols/PROTOCOL_TEST_RAPIDE.md) | Contrôle fonctionnel court. |
| Protocoles | [protocols/PROTOCOL_TEST_COMPLET.md](protocols/PROTOCOL_TEST_COMPLET.md) | Contrôle fonctionnel/terrain étendu. |
| Performance mobile | [PROTOCOL_TEST_PERF_MOBILE.md](PROTOCOL_TEST_PERF_MOBILE.md) | Mesures A53/S23 reproductibles. |

Les priorités se trouvent dans [TODO.md](../TODO.md) et la séquence produit dans
[ROADMAP.md](../ROADMAP.md). Le [CHANGELOG](../CHANGELOG.md) reste la chronologie des versions.

## Statut des autres dossiers

- `plans/` contient des décisions, protocoles de version et travaux futurs. Une version dans le
  titre décrit le périmètre du plan, pas nécessairement l'état courant du produit.
- `plans/prompts/` contient des prompts d'implémentation ou des relais. Les prompts 5.x terminés
  sont des preuves historiques, pas des instructions actives.
- `archives/` contient des documents volontairement figés. Leurs chiffres, flags, limites et
  checklists ne doivent jamais être utilisés pour décrire la version actuelle.
- `outputs/` à la racine contient des preuves locales d'appareils ou de performance et n'est pas
  une documentation produit stable.

## Règle de mise à jour

Lorsqu'une fonction change, mettre à jour au minimum `FEATURES.md`, le document technique du
domaine, les quatre traductions si le texte est visible dans l'application, puis `README.md` si la
promesse utilisateur change. Une release modifie aussi `CHANGELOG.md`, `TODO.md`, `CLAUDE.md`,
`GEMINI.md` et les versions Android/npm conformément à `RELEASE.md`.
