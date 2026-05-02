# SunTrail 3D — TODO (v5.50.x)

> Guide IA : [CLAUDE.md](../CLAUDE.md) | Historique : [COMPLETED_HISTORY.md](archives/COMPLETED_HISTORY.md)

---

## 🎯 Priorité 1 : Finalisation Production (V5.x)

- [x] **POI Enrichis (v5.40.38)** : 8 catégories (trail, hut, rest, attraction + 4 existantes), détection SwissTopo class/subclass + MapTiler, nom affiché au clic. Suppression du faux matching `hiking`.
- [x] **Signalétique Suisse (v5.40.13)** : Filtrage permissif des couches (label/transportation_name) pour sentiers nommés.
- [x] **Transition 2D/3D** : Suppression instantanée des objets 3D lors du switch. (v5.40.13)
- [x] **Stabilité 3D (v5.40.11)** : Retour au socle stable 5.39.1 (MapTiler Z10 FR / SwissTopo Z12 CH). 3D fluide partout.
- [x] **Signalétique Enrichie (v5.40.11)** : Icônes spécifiques pour Belvédères (🔭), Abris (🏠) et Infos (i).
- [x] **Trail Picking (v5.40.11)** : Détection et affichage du nom des sentiers au clic.
- [x] **Optimisation A53 (v5.40.11)** : Bridage résolution (80%) et densité (1000) pour garantir 30 FPS.
- [x] **Persistance & 2D Défaut (v5.34.2)** : Mémorisation de la dernière vue (Pos/Zoom) et du mode 2D/3D.
- [x] **Refonte Hydrologie (v5.34.0)** : Passage au vectoriel (PBF) et technique du "Texture Mask".
- [x] **Superposition & Transitions LOD (v5.28.37)** : Correction du bug de superposition, retour au fondu symétrique.
- [x] **Gestion des GPX (v5.28.28)** : Reverse geocoding pour nommage automatique.
- [x] **Navigation Tactile (v5.28.27)** : Implémentation du double-tap pour zoomer.
- [x] **Qualité & Tests (v5.40.11)** : Infrastructure Vitest/Playwright stable et test d'intégrité UI automatisé.
- [x] **Robustesse Packs Pays (v5.27.1)** : Catalogue v2, URLs absolues.
- [ ] **Audit de Performance Final** : Validation sur Galaxy A53 et S23.
- [ ] **Closed Testing (14 jours)** : Atteindre les 20 testeurs actifs requis par Google Play.
- [x] **Refactor de index.html** : Découpage des 14 templates UI terminé.
- [ ] **Screenshots Marketing** : Refaire des captures soignées Phone + Tablette.
- [x] **Masquage Mode Testeur** : Les 7 taps sont maintenus mais cachés par défaut pour la sécurité.

---

## 🗺️ Planificateur d'itinéraire (v5.50.x)

- [x] **Moteur de Routing** : Intégration OpenRouteService `foot-hiking` + fallback OSRM `foot` (gratuit mondial).
- [x] **Interface waypoints** : Onglet nav-bar, clic carte pour ajouter, liste interactive, inversion, suppression.
- [x] **Stats en direct** : Distance, dénivelé, temps estimé Munter, rendu 3D automatique via pipeline GPX.
- [x] **Profil sélection** : Randonnée / Marche / Vélo / VTT.
- [x] **Géocodage inverse** : Nommage automatique des waypoints via Nominatim.
- [x] **Key ORS** : Saisie optionnelle de clé API OpenRouteService (dénivelé + profil randonnée dédié).
- [x] **Export GPX** : Sauvegarde du tracé planifié (réutilise le pipeline GPX existant).
- [x] **Tests** : +29 tests (routingService 23, RoutePlannerSheet 6, state 5 mis à jour).

---

## 🌿 Végétation, Hydrologie & Landcover (v5.34+)

- [x] **Refonte Hydrologie (v5.34.0)** : Passage au vectoriel (PBF) et technique du "Texture Mask".
- [x] **Détection Sémantique Forêts (v5.33.0)** : Remplacement des scan raster par l'analyse vectorielle.
- [x] **Migration POI & Sommets (PBF)** : Migration terminée pour Sommets, POIs et Bâtiments.
- [ ] **Solution Souveraine (Mondial)** : Générer et héberger un fichier `forests-world.pmtiles` sur Cloudflare R2.
- [x] **Adaptation par Pays (v5.38.2)** :
    - [x] **Italie** : Implémentation du moteur OpenTopoMap et détection géographique IT.
    - [x] **Unification Frontalière** : Correction chirurgicale d'Aoste et unification LOD 11.
    - [x] **France** : Stabilisation via MapTiler Z10 (Abandon IGN Geoplateforme pour instabilité).
    - [ ] **Autres pays** : Auditer les services VectorTiles nationaux (Autriche, Espagne, etc.).

---

## 🚀 Priorité 2 : Trail Intelligence & Routing (v6.0)

> Module d'analyse intelligente et planification d'itinéraires. **Alertes sécurité = TOUJOURS FREE.**

- [ ] **v6.0 — Montée en gamme** :
    - [ ] **GraphHopper** : Routing `hike` Pro avec SAC scale T1-T6 segmenté par segment.
    - [ ] **Édition 3D waypoints** : Drag & drop des waypoints sur la carte 3D (actuellement : clic seul).
    - [ ] **Cotation CAS** : Badge de difficulté T1-T6 basé sur la pente (Pro).
    - [ ] **Profil coloré par pente** : Vertex colors sur le tracé 3D (vert → rouge, Pro).
- [ ] **v6.1 — Connecteurs Externes (Hub Rando)** :
    - [ ] **Strava** : Importation des activités passées et des routes planifiées (OAuth2).
    - [ ] **Suunto** : Récupération des entraînements (format FIT) et synchronisation de routes.
    - [ ] **Wikiloc** : Recherche et import direct de parcours communautaires (API Partner).
- [x] **v6.2 — Exposition solaire & Segments** : Analyse d'ombre/soleil détaillée par km sur tracés GPX et itinéraires manuels (Free). (v5.52.x via solarRoute.ts)
- [ ] **v6.2 — Alertes sécurité & Heure de départ** : Avalanche, windchill, nuit sur tracé (Toutes FREE).
- [ ] **v6.3 — Score condition & Estimation physio** : Hydratation, calories, VAM cible (Pro).
- [ ] **v6.4 — Mode Photo Pro** : Capture sans UI avec watermark SunTrail.

---

## 💡 Brainstorming Notifications (Post-v5.x)
- [ ] Bouton "Arrêter REC" inline dans la notification persistante.
- [ ] Alerte batterie faible pendant REC.
- [ ] Alerte coucher de soleil approchant pendant rando.
- [ ] Résumé post-rando (Pro).
