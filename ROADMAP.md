# SunTrail — Roadmap

## v5.56.0+ (Court terme — Sources HD par pays)

### Cartes gouvernementales HD gratuites

Ajout de sources de tuiles WMTS gratuites (Open Government Data) pour les pays de randonnée.
Architecture data-driven : une entrée dans `COUNTRY_SOURCES` suffit, la détection par polygones
Natural Earth est automatique.

**Implémenté :**
- ✅ Suisse (SwissTopo)
- ✅ France (IGN Geoplateforme)
- ✅ Autriche (basemap.at)
- ✅ Allemagne (BKG TopPlusOpen)
- ✅ Espagne (IGN España)

**Prochaine étape :**
| # | Pays | Source | Statut |
|---|------|--------|--------|
| 6 | Norvège | Kartverket topo4 | ❌ Endpoint inaccessible (timeout) — à tester depuis un VPN norvégien |
| 7 | Slovénie | GURS | URL à vérifier sur place |
| 8 | Italie | Geoportale Nazionale | Qualité rando variable |
| 9 | Royaume-Uni | Ordnance Survey | API key (free tier) |

**Hors-Europe :**
| # | Pays | Source | Licence |
|---|------|--------|---------|
| 10 | Nouvelle-Zélande | LINZ Topo50 | OGD CC-BY |
| 11 | Japon | GSI Maps | OGD |
| 12 | USA | USGS National Map | PD |
| 13 | Canada | NRCan CanTopo | OGL |

**Futur — Vectoriel partiel :** Labels superposés via tuiles vectorielles (ex: basemap.at BMAPV) pour
résoudre le problème de lisibilité des noms à certains zooms, sans migration complète du pipeline raster.

---

### Paiements Web — Restauration par Email

**Problème critique :** Un utilisateur qui paie via Stripe sur web perd l'accès s'il change de navigateur ou vide le cache (App User ID aléatoire en localStorage).

**Solution :** Email-based restauration sans login obligatoire.

**Logique :**
1. Après paiement Stripe → proposer d'entrer son email (optionnel mais recommandé)
2. Stocker email dans `localStorage` + utiliser comme App User ID RevenueCat
3. À chaque démarrage web → vérifier email en localStorage ; si présent, l'utiliser
4. Ajouter bouton "Restaurer achats par email" dans UpgradeSheet pour retrouver les achats

**Fichiers :**
- `src/modules/iapService.ts` : post-paiement demander email, initialisation App User ID depuis email localStorage
- `src/modules/ui/components/UpgradeSheet.ts` : bouton "Restaurer par email"
- `src/modules/packManager.ts` : même logique pour les packs

**Avantages :**
- ✅ Non-invasif (pas de login obligatoire)
- ✅ Protège immédiatement les utilisateurs qui entrent email
- ✅ Permet restauration si cache vidé
- ✅ Fondation pour OAuth optionnel plus tard

**Effort :** 2-3h

---

## v6.0+ (Moyen terme)

### Authentification Utilisateur Optionnelle

**Objectif :** Accès cross-device transparent aux achats (navigateur → navigateur, app → web, etc.).

**Approches :**
1. **Login Email Léger** : email + lien de confirmation (sans password)
2. **OAuth** : Google/Apple Sign-in (transparent, UX meilleure)
3. **WebAuthn** : biométrie/clé sécurité (futur)

**Bénéfices :**
- Utilisateur login → retrouve Pro/packs sur tous les appareils
- Sync avec Android via même email RevenueCat
- Préparation pour sync cloud (sauvegardes traces, préférences, etc.)
- Analytics utilisateur (améliore monétisation)

---

## v6.0+ (Moyen-long terme)

### Autres Features Payantes

- **Intégration Strava/Komoot** : auto-import traces (Pro)
- **Cloud Sync** : sauvegardes traces/marque-pages (Pro)
- **API Publique** : accès données via webhook (Professionnel/B2B)
- **Marque-pages Collaboratifs** : partage itinéraires entre randonneurs (Pro)

---

## Notes

- **RevenueCat :** Documenté [docs/MONETIZATION.md](docs/MONETIZATION.md)
- **Production Stripe :** À faire lors passage en prod (clés live, domaine production, etc.)
- **Tests :** 750 tests passent (iapService mocké dans `src/test/setup.ts`)
