# Trail Intelligence — Roadmap

> Module d'analyse intelligente de tracés et terrain.

## Principes

### Philosophie Free / Pro (Décisions v5.25)

| | Free (randonneur) | Pro (alpiniste+) |
|---|---|---|
| **REC** | **Illimité** | **Illimité** |
| **Analyse** | Résumé simple, alertes vitales | Données complètes, segments, VAM |
| **Conversion** | Sécurité offerte → Analyse Pro | Tout déverrouillé |

### Règles non négociables

1. **On ne gate JAMAIS la sécurité vitale.** Toutes les alertes (avalanche, nuit, orage, windchill) sont accessibles en Free.
2. **On gate la profondeur d'analyse** (segments, physio, VAM).
3. **Alertes sécurité** : Toujours visibles gratuitement pour tous les utilisateurs.

---

## v5.50.x — Planificateur d'itinéraire mondial (implémenté)

> Routing gratuit mondial basé sur OpenRouteService / OSRM.

| Feature | Gratuit | Gate |
|---|---|---|
| **Planification waypoint** | Ajout/suppression/inversion de waypoints par clic carte | Aucune |
| **Profil randonnée** | `foot-hiking` (ORS, avec clé) / `foot` (OSRM, sans clé) | Aucune |
| **Rendu 3D + stats** | Tracé 3D sur le terrain, distance, dénivelé, temps Munter | Aucune |
| **Export GPX** | Sauvegarde du tracé planifié | Aucune |
| **Profil Marche/Vélo/VTT** | Sélecteur de profil dans le panel | Aucune |

**Architecture :** `routingService.ts` → API ORS (`foot-hiking`) avec fallback OSRM (`foot`) → conversion GeoJSON → pipeline `addGPXLayer()` existant → rendu 3D automatique.

---

## v6.0 — Montée en gamme (Europe & Monde)

> Amélioration de la qualité du routing et enrichissement des données.

| Feature | Free | Pro | Gate |
|---|---|---|---|
| **Routing GraphHopper** | — | `hike` dédié, SAC scale T1-T6 segmenté | `state.isPro` |
| **Édition 3D waypoints** | Drag & drop des waypoints sur la carte 3D | Idem + altitude précise | Aucune |
| **Durée estimée (Munter)** | Temps total | + temps par segment | `state.isPro` |
| **Cotation difficulté** | Badge simplifié | Cotation CAS T1-T6 + UIAA | `state.isPro` |
| **Profil coloré par pente** | Monochrome | Vertex colors (vert → rouge) | `state.isPro` |

### Sur un point carte

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Pente locale | **Inclinomètre Pro** | **Inclinomètre Pro** | `state.isPro` |
| Altitude | Valeur brute | + distance sommet proche | `state.isPro` |

---

## v6.1 — Connecteurs Externes (Hub Rando)

- **Strava** : Importation des activités passées et des routes planifiées (OAuth2).
- **Suunto** : Récupération des entraînements (format FIT) et synchronisation de routes.
- **Wikiloc** : Recherche et import direct de parcours communautaires (API Partner).

---

## v6.2 — Alertes sécurité (Toutes FREE)

Déclenchées au chargement d'un GPX ou au changement météo.

| Alerte | Condition | Sévérité |
|---|---|---|
| Risque avalanche | Pente 30-45° + météo | ROUGE |
| Nuit sur le tracé | Coucher soleil < durée estimée | ORANGE |
| Orage | Prévision instable + altitude | ORANGE |
| Batterie | D+ restant > 800m + batterie < 30% | JAUNE |

## v6.2 — Exposition solaire & Segments (Pro)

- Barre ombre/soleil détaillée par km sous le profil d'élévation.
- Score condition & estimation physio : hydratation, calories, VAM cible.

## v6.4 — Mode Photo Pro

- Capture sans UI avec watermark SunTrail.
