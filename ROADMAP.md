# SunTrail — Roadmap

## v5.56.1+ (Sources HD par pays)

### Cartes gouvernementales HD gratuites

Ajout de sources de tuiles WMTS gratuites (Open Government Data) pour les pays de randonnée.
Architecture data-driven : une entrée dans `COUNTRY_SOURCES` suffit, la détection par polygones
Natural Earth est automatique.

**Implémenté :**
- ✅ Suisse (SwissTopo) — `wmts.geo.admin.ch`
- ✅ France (IGN Geoplateforme) — `data.geopf.fr`
- ✅ Autriche (basemap.at) — `mapsneu.wien.gv.at`
- ✅ Allemagne (BKG TopPlusOpen) — `sgx.geodatenzentrum.de`
- ✅ Espagne (IGN España) — `www.ign.es`

### Pays testés mais endpoints inaccessibles (à vérifier localement)

Testé le 2026-05-26 depuis l'étranger. Tous nécessitent une vérification locale
(depuis un navigateur situé dans le pays ou un VPN).

| Pays | Source | Code | Cause probable |
|------|--------|------|----------------|
| 🇳🇴 Norvège | Kartverket topo4 | Timeout | Blocage géographique ? |
| 🇨🇿 République Tchèque | ČÚZK ZM | 404 | Endpoint ArcGIS changé |
| 🇵🇱 Pologne | Geoportal 2 | 404 | API migrée |
| 🇸🇰 Slovaquie | ZBGIS | 404 | Endpoint changé |
| 🇫🇮 Finlande | MML maastokartta | 401 | Auth requise |
| 🇸🇪 Suède | Lantmäteriet | 503 | Service down |

**Comment activer :** Tester l'URL depuis l'app/navigateur local → si OK, décommenter
l'entrée dans `COUNTRY_SOURCES` et le helper dans `tileSources.ts`.

### Pays nécessitant des prérequis

| Pays | Source | Prérequis |
|------|--------|-----------|
| 🇸🇮 Slovénie | GURS | URL WMTS à trouver (recherche docs GURS) |
| 🇮🇹 Italie | Geoportale Nazionale | Pas de WMTS national de qualité rando |
| 🇬🇧 Royaume-Uni | Ordnance Survey | Clé API gratuite à configurer |
| 🇯🇵 Japon | GSI Maps | Étendre `countries.ts` à l'Asie (ingest Asia) |
| 🇳🇿 Nouvelle-Zélande | LINZ Topo50 | Clé API gratuite à configurer |
| 🇺🇸🇨🇦 USA/Canada | USGS/NRCan | Faible priorité rando Europe |

### URLs trouvées (prêtes dans `tileSources.ts`)

```
CZ: https://ags.cuzk.gov.cz/arcgis/rest/services/ZM/MapServer/WMTS/tile/1.0.0/ZM/default/GoogleMapsCompatible/{z}/{y}/{x}.png
PL: https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
SK: https://zbgisws.skgeodesy.sk/zbgisservices/wmts/service.svc/get?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
FI: https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png
SE: https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts/tile/1.0.0/topowebb/default/web_mercator/{z}/{y}/{x}.png
JP: https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png
```

### Pour reprendre

1. Vérifier les URLs WMTS depuis un navigateur/navire dans le pays cible
2. Décommenter le helper URL dans `tileSources.ts` (ex: `cuzkTopo()`, `gsiJpTopo()`)
3. Décommenter l'entrée dans `COUNTRY_SOURCES`
4. Ajouter les tests dans `tileLoader.test.ts` + `terrain.source.test.ts`
5. Lancer `npm test` — 859+ tests doivent passer

**Futur — Vectoriel partiel :** Labels superposés via tuiles vectorielles (ex: basemap.at BMAPV)
pour résoudre le problème de lisibilité des noms à certains zooms.

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
