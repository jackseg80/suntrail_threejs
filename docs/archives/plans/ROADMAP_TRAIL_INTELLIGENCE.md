# Trail Intelligence — Roadmap v6.0

> Module d'analyse intelligente de tracés et terrain.
> Planifié pour **v6.0** — la v5.x reste dédiée à la stabilisation et au lancement.

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

## v6.0 — Cotation & Temps estimé

### Sur un tracé GPX

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Durée estimée (Munter) | Temps total | + temps par segment | `state.isPro` |
| Cotation difficulté | Badge simplifié | Cotation CAS T1-T6 + UIAA | `state.isPro` |
| Profil coloré par pente | Monochrome | Vertex colors (vert → rouge) | `state.isPro` |

### Sur un point carte

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Pente locale | **Inclinomètre Pro** | **Inclinomètre Pro** | `state.isPro` |
| Altitude | Valeur brute | + distance sommet proche | `state.isPro` |

---

## v6.2 — Alertes sécurité (Toutes FREE)

Déclenchées au chargement d'un GPX ou au changement météo.

| Alerte | Condition | Sévérité |
|---|---|---|
| Risque avalanche | Pente 30-45° + météo | ROUGE |
| Nuit sur le tracé | Coucher soleil < durée estimée | ORANGE |
| Orage | Prévision instable + altitude | ORANGE |
| Batterie | D+ restant > 800m + batterie < 30% | JAUNE |

**Note :** Ces fonctions seront développées dans le cycle v6.x.
