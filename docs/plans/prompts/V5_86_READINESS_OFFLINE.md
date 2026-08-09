# Prompt autonome — SunTrail v5.86.0 Prêt à partir & corridor hors ligne

Travaille après publication et stabilisation du guidage natif v5.85. Réalise un bilan avant
départ utile même sans météo et un corridor offline centré sur la route, avec décisions
Free/Pro déjà fixées.

## Audit préalable

Lis instructions, roadmap, plan, PreparedRoute, GuidanceEngine, météo, solaire, tileLoader,
CacheStorage, Service Worker/Workbox, OPFS/PMTiles, packs, ZoneSelector et monétisation. Ne crée
pas un cache parallèle. Cartographie les responsabilités et quotas avant de coder.

## Readiness en couches

Créer un `RouteReadinessReport` déterministe par sections indépendantes :

- `route` local : distance, D+, durée, effort, difficulté/couverture ;
- `light` local : départ, ETA, coucher du soleil, marge et segments disponibles ;
- `offline` local : couverture corridor/pack, taille et obsolescence ;
- `conditions` réseau optionnel : météo/neige/vent, source et fraîcheur ;
- `device` Android optionnel : GPS, permissions, notifications, batterie.

Chaque section expose available/stale/unknown/error. Le rapport s'affiche immédiatement avec le
noyau local, puis s'enrichit ; aucune requête météo ne bloque le CTA. Unknown n'est jamais sûr.

## Expérience « Prêt à partir ? »

- Décision lisible sans score pseudo-scientifique unique.
- Route, durée/D+, difficulté/effort, ETA/marge de jour et offline au premier niveau.
- Avertissements essentiels gratuits, sources/fraîcheur et actions correctives.
- Parking/transports, eau/refuges et équipement seulement si les sources ont une couverture
  identifiable ; sinon inconnu ou absent explicitement.
- CTA Démarrer la sortie, même si les enrichissements réseau manquent.

## Corridor décidé

- Free : une zone manuelle existante **plus un corridor actif** de 1 km, remplaçable après
  confirmation. Le nouveau corridor supprime/remplace uniquement l'ancien corridor Free.
- Pro : plusieurs corridors, largeurs 0,5/1/2 km.
- Pas de téléchargement automatique sur réseau mobile.
- Estimation taille/tuiles, progression, reprise, annulation, retry borné, intégrité, version,
  couverture partielle et espace insuffisant.
- Réutiliser une tuile déjà dans pack/cache sans duplication inutile.
- Le suivi de géométrie fonctionne sans fond de carte avec avertissement.

## Coordination stockage

Documenter et implémenter : Workbox=shell, CacheStorage normal=opportuniste,
CacheStorage offline=zone/corridor, OPFS=packs, IndexedDB=métadonnées/index. Fournir un service
de quota/suppression qui ne purge jamais silencieusement une route.

## Hors périmètre

Sync de tuiles, compte, matcher natif background, nouvelles sources pays et prédictions IA.

## Tests et gates

- Rapport identique pour entrées/horloge fixées ; données stale/unknown testées.
- Calcul corridor, antimeridien ou rejet explicite, limites de volume et couverture mesurée.
- Interruption/reprise, quota, cache corrompu, remplacement Free et coexistence zone/packs.
- E2E préparer → readiness sans réseau → télécharger → reload mode avion → démarrer guidance.
- Tests appareil Android et tous les gates web/Capacitor/Gradle pertinents.

Mettre à jour architecture, UX, performance, monétisation et protocole offline. Ajouter flags
`routeReadiness`/`routeCorridor`. Le bilan distingue tests réels/simulés et ne déclare jamais
une couverture complète non mesurée. Aucun Git/release externe sans autorisation.
