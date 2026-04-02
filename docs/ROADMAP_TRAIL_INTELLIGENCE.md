# Trail Intelligence — Roadmap v6.0

> Module d'analyse intelligente de tracés et terrain.
> Planifié pour **v6.0** — la v5.x reste dédiée à la stabilisation, optimisation et debug.
> 100% déterministe (règles, formules, seuils). Pas de LLM.
> Couche LLM optionnelle repoussée à v7.x (nécessite backend).

## Principes

### Philosophie Free / Pro

| | Free (randonneur) | Pro (alpiniste+) |
|---|---|---|
| **Principe** | Résumé simple, alertes essentielles | Données complètes, analyse segmentée, conseil tactique |
| **Ton** | "Randonnée difficile, ~5h30" | "T4 CAS, segment clé km 4.2-5.1 à 38%, VAM 350m/h" |
| **Conversion** | Aperçu → "Débloquez l'analyse complète" | Tout déverrouillé |

### Règles non négociables

1. **On ne gate JAMAIS la sécurité vitale.** Toutes les alertes (avalanche, nuit, orage, windchill) sont accessibles en Free.
2. **On gate la profondeur d'analyse et la personnalisation** (segments, heure de départ, physio).
3. **Fonctionne sur un point carte** (basique) **ET sur un tracé GPX** (complet).
4. **Alertes intrusives** : bannière plein écran rouge/orange, auto-dismiss 8s, clickable pour détail.
5. **Alertes à chaque ouverture** du tracé, avec option utilisateur pour les désactiver.

---

## v6.0 — Cotation & Temps estimé

### Sur un tracé GPX

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Durée estimée (Munter) | Temps total | + temps par segment | `state.isPro` |
| Cotation difficulté | Badge simplifié (Facile/Moyen/Difficile/Expert) | Cotation CAS T1-T6 + UIAA | `state.isPro` |
| Profil coloré par difficulté | Tracé 3D monochrome (existant) | Vertex colors par pente (vert → rouge) | `state.isPro` |
| Stats enrichies | D+, D-, distance (existant) | + pente max, pente moy, % tracé > 30° | `state.isPro` |

### Sur un point carte (sans GPX)

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Pente locale | Valeur ° et % (inclinomètre existant) | + aspect (N/S/E/W), zone avalanche 30-45° | `state.isPro` |
| Altitude | Valeur brute | + distance au sommet le plus proche | `state.isPro` |

### Formules

**Munter :**
```
temps_montée = D+ ÷ 400        (m/h)
temps_plat   = dist_h ÷ 4      (km/h)
temps_total  = max(montée, plat) + 0.5 × min(montée, plat)
```
Ajustements : descente facile ÷ 800m/h, descente raide ÷ 600m/h.

**Cotation CAS T1-T6 :**
Score composite basé sur :
- Pente max du tracé (< 25° → T1-T2, 25-35° → T3-T4, > 35° → T5-T6)
- Altitude max (< 2000m → -1, > 3000m → +1)
- % du tracé au-dessus de 30° (> 20% → +1)
- Exposition (crêtes, arêtes détectées par profil en dents de scie)

**Cotation simplifiée Free :**
| Score | Badge | Couleur |
|---|---|---|
| T1-T2 | Facile | Vert `#4caf50` |
| T3 | Moyen | Jaune `#ff9800` |
| T4 | Difficile | Orange `#f44336` |
| T5-T6 | Expert | Rouge foncé `#b71c1c` |

### Fichiers impactés

- Nouveau : `src/modules/trailAnalysis.ts` — moteur de cotation et Munter
- Modifié : `TrackSheet.ts` — affichage badge + durée + stats enrichies (Pro)
- Modifié : GPX mesh — vertex colors par segment (Pro)

---

## v6.1 — Exposition solaire & Segments

### Sur un tracé GPX

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Exposition solaire | Icône résumé ("Tracé ensoleillé") | Barre ombre/soleil par km + heure optimale | `state.isPro` |
| Segments | Nb de montées/descentes | Tableau : distance, pente moy, durée, cotation/segment | `state.isPro` |
| Segment clé | Non affiché | Surligné sur la carte 3D + profil | `state.isPro` |
| Point demi-effort | Non | Marqueur sur le tracé 3D | `state.isPro` |

### Sur un point carte

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Exposition solaire | "Versant sud" / "Versant nord" | Heures d'ensoleillement direct + graphique | `state.isPro` |

### Algorithmes

**Segmentation :**
- Fenêtre glissante 200m, détection changement de pente (seuil ±5%)
- Classification : montée (> +5%), descente (< -5%), plat (±5%)
- Fusion segments courts (< 300m) avec le segment adjacent

**Exposition solaire :**
- `runSolarProbe()` échantillonné tous les 500m le long du GPX
- Aspect terrain déduit de la normal map (azimut de la pente)
- Résultat : matrice `[point × heure]` → ombre ou soleil
- Barre Pro : segments colorés (jaune = soleil, gris = ombre) alignés sous le profil d'élévation

**Point demi-effort :**
- Intégrale du temps Munter segment par segment
- Le point demi-effort est à 50% du temps total, PAS à 50% de la distance

### Fichiers impactés

- Modifié : `src/modules/trailAnalysis.ts` — ajout segmentation + exposition
- Modifié : `src/modules/analysis.ts` — batch `runSolarProbe()` sur N points
- Modifié : `src/modules/profile.ts` — barre exposition sous le profil (Pro)
- Modifié : `TrackSheet.ts` — tableau segments (Pro)

---

## v6.2 — Alertes sécurité & Heure de départ

### Alertes (toutes FREE)

Déclenchées : au chargement d'un GPX, au changement météo significatif, au tap sur un point (alertes terrain).

Affichées à chaque ouverture du tracé. Désactivables par l'utilisateur dans Réglages.

| Alerte | Condition | Sévérité | Couleur |
|---|---|---|---|
| Risque avalanche | Pente 30-45° + neige < 48h + vent > 30 km/h | ROUGE | `#b71c1c` |
| Windchill dangereux | Alt > 2500m + T° ressentie < -15°C | ROUGE | `#b71c1c` |
| Nuit sur le tracé | Coucher soleil < durée restante estimée | ORANGE | `#e65100` |
| Orage après-midi | Prévision orage 12h-18h + alt > 2000m | ORANGE | `#e65100` |
| Coup de chaleur | Exposition S/SW > 2h + UV > 7 + T° > 28°C | ORANGE | `#e65100` |
| Visibilité réduite | Brouillard (< 1km) + tracé > 2000m | JAUNE | `#f9a825` |
| Batterie insuffisante | D+ restant > 800m + batterie < 30% | JAUNE | `#f9a825` |

**UI :**
- Bannière `position:fixed; top:0; z-index: 9500` (sous acceptance wall 9998)
- Icône + texte court (1 ligne) + chevron pour détail
- Auto-dismiss 8s, tap = ouvre le détail
- Tap "×" = dismiss cette instance. Toggle global dans Réglages Avancés.
- Persistance : `localStorage` clé `suntrail_alerts_disabled` (boolean global)

**Windchill (formule standard NWS) :**
```
T_ressentie = 13.12 + 0.6215×T - 11.37×V^0.16 + 0.3965×T×V^0.16
// T en °C, V en km/h — valide si T < 10°C et V > 4.8 km/h
```

### Heure de départ optimale

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Conseil départ | "Partez tôt le matin" (phrase générique) | Tableau 5h-12h, score par créneau + raison | `state.isPro` |

**Algorithme (Pro) :**
Pour chaque heure de départ H (5h → 12h) :
1. Simuler la progression le long du tracé (temps Munter par segment)
2. À chaque segment, croiser l'heure d'arrivée estimée avec :
   - Exposition solaire (pénalité si sections exposées S/SW entre 11h-15h)
   - Risque orage (pénalité forte si altitude > 2000m après 13h et prévision instable)
   - Crépuscule (pénalité si arrivée après coucher du soleil)
3. Score composite = `soleil(30%) + orage(30%) + lumière(25%) + vent(15%)`
4. Affichage : tableau trié par score, icône vert/jaune/rouge, 1 phrase de raison

### Fichiers impactés

- Nouveau : `src/modules/trailAlerts.ts` — moteur d'alertes, règles, UI bannière
- Modifié : `src/modules/trailAnalysis.ts` — ajout calcul heure de départ
- Modifié : `TrackSheet.ts` — déclenchement alertes au chargement GPX
- Modifié : `SettingsSheet.ts` — toggle désactivation alertes dans Avancés
- Modifié : `style.css` — styles bannière alerte (3 sévérités)

---

## v6.3 — Score condition & Estimation physio

### Score "Condition du jour"

Fonctionne **avec ou sans tracé GPX**.

| Feature | Free | Pro | Gate |
|---|---|---|---|
| Score global | Note 1-5 étoiles + couleur | Note + détail par facteur | `state.isPro` |
| Conseil | "Bonnes conditions" (1 phrase) | Facteur limitant identifié | `state.isPro` |

**Sans tracé :** basé sur position caméra (altitude, météo locale).  
**Avec tracé :** croisement météo × chaque segment du tracé.

**Calcul :**
```
score = météo(40%) + vent(20%) + soleil(20%) + visibilité(10%) + UV(10%)

météo :   T° 5-20°C = 5★, T° < 0 ou > 30 = 1★, précip > 50% = 1★
vent :    < 15 km/h = 5★, 15-30 = 4★, 30-50 = 2★, > 50 = 1★
soleil :  golden hours AM = 5★, plein soleil > 4h = 3★, couvert = 4★
visib :   > 10km = 5★, 5-10 = 4★, 1-5 = 3★, < 1km = 1★
UV :      < 6 = 5★, 6-8 = 3★, > 8 = 2★
```

**Affichage :** badge étoiles en haut du TrackSheet (ou dans TopStatusBar si pas de tracé).

### Estimation physio (Pro uniquement)

| Feature | Gate | Dépendance |
|---|---|---|
| Hydratation estimée | `state.isPro` | Durée Munter, altitude, T° |
| Calories estimées | `state.isPro` | Poids utilisateur (réglages Pro) |
| VAM cible par segment | `state.isPro` | Pente du segment |

**Poids utilisateur :**
- Nouveau champ dans Réglages Pro : slider 40-120 kg, défaut 70 kg
- Persisté dans `localStorage` (clé `suntrail_user_weight`)
- Gate Pro : visible uniquement si `state.isPro`

**Hydratation (formule simplifiée) :**
```
base     = 0.5 L/h × durée_Munter_h
alt_mult = altitude_moy > 2000m ? 1.3 : 1.0
temp_mult = T° > 25°C ? 1.5 : (T° > 20°C ? 1.2 : 1.0)
total    = base × alt_mult × temp_mult
// Arrondi à 0.5L supérieur
```

**Calories (Pandolf simplifié) :**
```
M = 1.5×W + 2.0×(W+L)×(L/W)² + η×(W+L)×(1.5×V² + 0.35×V×G)
// W = poids (kg), L = charge estimée 8kg, V = vitesse Munter (m/s)
// G = pente (%), η = coefficient terrain (1.0 sentier, 1.2 hors-piste)
// Résultat en watts → convertir en kcal (×0.86 × durée_h)
```

**VAM cible :**
| Pente | VAM recommandée |
|---|---|
| 10-20% | 400-500 m/h |
| 20-30% | 300-400 m/h |
| 30-40% | 200-300 m/h |
| > 40% | 100-200 m/h (terrain technique) |

### Fichiers impactés

- Modifié : `src/modules/trailAnalysis.ts` — score condition + physio
- Modifié : `SettingsSheet.ts` — champ poids (Pro), section "Profil sportif"
- Modifié : `state.ts` — `state.userWeight: number` (défaut 70)
- Modifié : `TrackSheet.ts` — affichage hydratation, calories, VAM
- Modifié : `TopStatusBar.ts` — badge score condition (mode sans tracé)

---

## v7.x — Couche LLM optionnelle (Pro uniquement)

> Dépendance : backend serveur (API Claude Haiku ~$0.01-0.03/résumé).

**Ce que le LLM ajoute au-dessus des règles :**
- Résumé en langage naturel ("Boucle alpine exigeante avec passage technique...")
- Conseil personnalisé basé sur l'historique ("30% plus dur que votre dernière sortie")
- Formulation contextuelle des alertes

**Non prioritaire.** Les règles déterministes couvrent 90% du besoin.

---

## Résumé du split Free / Pro

```
FREE (sécurité + aperçu)              PRO (analyse complète)
─────────────────────────              ──────────────────────
✅ TOUTES les alertes sécurité         ✅ Cotation CAS T1-T6 + UIAA
✅ Durée totale estimée (Munter)       ✅ Temps par segment
✅ Badge difficulté simplifié          ✅ Tracé 3D coloré par pente
✅ Exposition résumé (icône)           ✅ Barre solaire détaillée par km
✅ Score condition (étoiles)           ✅ Score détaillé par facteur
✅ Pente locale (inclinomètre)         ✅ Heure de départ optimale (tableau)
✅ Aspect terrain (N/S/E/W)            ✅ Segments analysis complet
                                       ✅ Segment clé + point demi-effort
                                       ✅ Hydratation / Calories (Pandolf)
                                       ✅ VAM cible par segment
                                       ✅ Poids utilisateur (réglages)
```

## Feature Gates (à ajouter dans AGENTS.md)

| Feature | Fichier | Guard |
|---|---|---|
| Cotation CAS T1-T6 | `trailAnalysis.ts` | `if (!state.isPro)` → badge simplifié |
| Temps par segment | `TrackSheet.ts` | `if (!state.isPro)` → temps total seul |
| Tracé coloré par pente | GPX mesh builder | `if (!state.isPro)` → monochrome |
| Barre exposition détaillée | `profile.ts` | `if (!state.isPro)` → icône résumé |
| Tableau heure de départ | `trailAnalysis.ts` | `if (!state.isPro)` → phrase générique |
| Segments complets | `TrackSheet.ts` | `if (!state.isPro)` → compteur seul |
| Hydratation / Calories | `trailAnalysis.ts` | `if (!state.isPro)` → masqué |
| Poids utilisateur | `SettingsSheet.ts` | `if (!state.isPro)` → masqué |
| Score détaillé par facteur | `trailAnalysis.ts` | `if (!state.isPro)` → étoiles seul |
