# Plan de réflexion — Trancher les 5 décisions de monétisation SunTrail

## Objectif
Répondre aux 5 décisions bloquantes (D1-D5) de `docs/MONETIZATION.md` avant Sprint 7.
Chaque décision sera argumentée, pas juste cochée.

---

## Contrainte de séquençage

Les décisions ne sont pas indépendantes. Ordre logique de résolution :

```
D5 (iOS ?) → D4 (Marché) → D1 (Modèle) → D2 (Clé MapTiler) → D3 (Pub)
```

- **D5 avant D4** : iOS implique un budget de dev supplémentaire → impacte l'ambition géo
- **D4 avant D1** : le marché cible détermine quel tier de prix est acceptable et quels partenariats sont réalistes
- **D1 avant D2** : le modèle de revenus dicte si on peut absorber le coût tiles ou non
- **D3 en dernier** : quasi-décidé (zéro pub), mais à confirmer en cohérence avec D1

---

## Phase 1 — Cadrage personnel (session de 20 min, réponses libres)

Avant toute décision, clarifier le contexte humain :

1. **Tolérance coûts récurrents** : Quel montant mensuel est acceptable sans revenus ? (0€ / <50€ / <200€)
2. **Cible de revenus** : Couvrir les coûts seulement ? Revenu complémentaire (500€/mois) ? Produit principal ?
3. **Horizon de temps** : Sprint 7 dans combien de semaines ? Peut-on itérer après publication ?
4. **Réseau pro** : As-tu des contacts guides, écoles d'alpi, SAC/CAS ? Combien de temps pour les activer ?
5. **Ouverture open-source** : Propriétaire assumé, ou open-source envisageable (impacts D2 radicalement) ?
6. **Appétit iOS** : Capacitor le supporte — est-ce une vraie envie ou juste "peut-être un jour" ?

> Ces réponses ne sont pas dans le document. Elles conditionnent tout ce qui suit.

---

## Phase 2 — Analyse décision par décision

### D5 — iOS (décision d'abord car elle calibre les ressources)

**Question centrale** : Investir en parallèle ou séquentiellement ?

| Choix | Implication ressources | Impact marché |
|-------|----------------------|---------------|
| Ignoré | Zéro effort | ~50% du marché alpin perdu (iOS dominant en CH/FR premium) |
| v6.x séquentiel | +1-2 sprints après Android | Marché complet, délai acceptable |
| Simultané | +30-40% effort Sprint 7 | Risque de dilution qualité Android |

**Critère de décision** : Si iOS représente >40% de ta cible démographique (randonneurs CH premium), `v6.x séquentiel` est le seul choix rationnel.

**Livrable** : Décision D5 + date cible v6.x si séquentiel.

---

### D4 — Marché initial

**Question centrale** : Concentration CH ou ouverture alpine immédiate ?

**Arguments CH only** :
- Données SwissTopo = différenciateur unique, inégalable
- Potentiel SAC/CAS (150k membres) si partenariat activé
- Marché premium, paiement culturellement ancré, moins de concurrence directe
- Taille : ~500k randonneurs actifs CH

**Arguments FR+CH+DE+AT (Europe alpine)** :
- IGN France + OSM couvrent FR et DE
- FFCAM = 380k membres (levier énorme)
- TAM multiplié par ~8 vs CH seul
- Complexité : support multilingue (déjà partiellement fait), clés API régionales

**Critère de décision** : Si aucun contact SAC/CAS dans les 3 prochains mois, ouvrir direct à l'Europe alpine (le canal B2B CH nécessite du temps).

**Livrable** : Décision D4 + liste des 2-3 pays à cibler en priorité.

---

### D1 — Modèle de base

**Question centrale** : One-shot, Freemium, ou hybride ?

Le document recommande **one-shot €3.99 en Phase 1**. Examinons les hypothèses :

**Hypothèse 1 — Disposition à payer validable à €3.99**
- Risque : friction initiale (payer sans essayer) → conversion faible sur Play Store (typiquement 2-5%)
- Mitigation : screenshots haute qualité, vidéo démo, période de test via PWA gratuite

**Hypothèse 2 — One-shot comme MVP de monétisation**
- Avantage réel : zéro infra, publication en <1 semaine
- Avantage réel : données d'usage réelles avant d'investir dans IAP
- Risque : si l'app prend, les utilisateurs one-shot bloquent le passage à freemium (ils ont payé, attendront toujours les nouvelles features gratuitement)

**Hypothèse 3 — Freemium direct (alternative)**
- Clé bundlée avec quota 100k tiles/mois → ~50-200 sessions gratuites/mois
- Effort : +3-5 jours (IAP Capacitor) avant Sprint 7
- Avantage : modèle scalable dès le départ, pas de migration douloureuse

**Critère de décision** :
- Si Sprint 7 dans <4 semaines → one-shot obligatoire
- Si Sprint 7 dans >6 semaines ET tolérance coût tiles → Freemium direct envisageable

**Livrable** : Décision D1 + prix si one-shot / features gate si freemium.

---

### D2 — Clé MapTiler

**Question centrale** : Qui paie les tiles ?

Cette décision découle directement de D1 :

| Si D1 = | Alors D2 = | Pourquoi |
|---------|------------|----------|
| One-shot €3.99 | Clé utilisateur obligatoire | L'utilisateur a payé l'app, pas les données. Friction acceptable pour public tech-savvy. |
| Freemium | Option D (bundlée tier gratuit) | Le tier gratuit doit fonctionner sans friction pour l'acquisition |
| Gratuit | Option B (proxy) ou A (bundlée) | Coût à absorber — non viable sans revenus |

**Point critique à valider** : MapTiler free tier = 100k tiles/mois. Avec 200 utilisateurs actifs à 500 tiles/session → 100k tiles = 1 session/user/mois. Insuffisant pour une bonne expérience gratuite.

**Alternative à explorer** : Approcher MapTiler partnerships AVANT Sprint 7 — un accord startup/early-stage peut multiplier le quota x10 gratuitement.

**Livrable** : Décision D2 + contact MapTiler partnerships si Option D retenue.

---

### D3 — Publicité

**Question centrale** : Confirmer zéro pub, ou cas particulier native ?

Le document est clair : zéro publicité intrusive. La seule nuance est la **publicité native sponsorisée** (Garmin, Suunto sur écran de démarrage).

**Recommandation** : Zéro pub jusqu'à 10k téléchargements minimum. En dessous, aucun brand outdoor ne signera et le revenu serait anecdotique (<€100/mois).

**Livrable** : Confirmation D3 = zéro pub + note de réactivation à 10k downloads.

---

## Phase 3 — Test de cohérence des décisions combinées

Une fois D1-D5 répondues, vérifier que l'ensemble tient :

1. **Cohérence financière** : Les revenus projetés couvrent-ils les coûts tiles projetés ?
   - Formule : `(downloads × taux_conversion × prix) ≥ (DAU × tiles_session × coût_tile)`
2. **Cohérence technique** : L'effort Sprint 7 est-il réaliste avec les décisions prises ?
3. **Cohérence marché** : Le modèle choisi est-il adapté au marché cible retenu ?
4. **Cohérence concurrentielle** : Le positionnement reste-t-il unique vs AllTrails/Komoot ?

---

## Phase 4 — Mise à jour du document

À l'issue des phases 1-3, mettre à jour `docs/MONETIZATION.md` :
- Remplir le tableau Section 9 (D1-D5 avec décisions + justifications)
- Mettre à jour Section 10 (Recommandation initiale) si la Phase 1 a changé les hypothèses
- Ajouter une Section 12 "Décisions arrêtées le [date]" pour traçabilité

---

## Format de session suggéré

Ce plan se travaille en **dialogue** : je pose les questions de Phase 1, tu réponds, et on enchaîne les décisions dans l'ordre. Durée estimée : 45-60 min de conversation.
