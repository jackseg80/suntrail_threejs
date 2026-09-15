# Research : intégrations externes et import de traces (état vérifié 2026-09-15)

> Remplace la première ébauche (« Strava, Suunto, Wikiloc »). Les affirmations ci-dessous ont
> été vérifiées contre le code de SunTrail 5.90.0 et, pour Strava, contre la documentation
> officielle. Toute intégration reste hors du produit courant tant qu'un lot dédié ne l'active pas.

## Ce que SunTrail sait déjà faire

- Import GPX manuel par sélecteur de fichiers Android : `#gpx-upload`
  (`src/modules/ui/templates/track.html`) → `gpxService.handleGPXImport`
  (`src/modules/gpxService.ts:41`).
- Pipeline partagé `importGpxTrack` (`src/modules/gpxImportFlow.ts`) : archivage pleine fidélité
  `StoredTrackV1` (origine `gpx-import`) **avant** conversion en `PreparedRouteV1`, puis ouverture.
- Dédoublonnage par empreinte de géométrie : un réimport identique remplace la même archive.
- Réception OS Android (« Ouvrir avec » / partage) : `GpxImportPlugin` + `gpxImportIntake`
  (voir `docs/plans/V5_91_GPX_SHARE_IMPORT.md`).
- PWA (vite-plugin-pwa) pour le Web ; **aucune cible iOS** dans le dépôt.
- Supabase installé mais `accountSync` désactivé ; deep link OAuth
  `com.suntrail.threejs://auth-callback` déjà en place.

Contrainte structurante : tous les canaux d'entrée convergent vers `importGpxTrack`. Ajouter un
canal ne doit jamais dupliquer l'archivage ni la conversion.

## Niveaux d'intégration (corrigés)

| Niveau | Méthode & plateformes | Difficulté | Faisabilité SunTrail | Limite |
| --- | --- | --- | --- | --- |
| **1. OS (partage / « Ouvrir avec »)** | Komoot, AllTrails, Wikiloc, Garmin, navigateurs, gestionnaires de fichiers | Faible (1–2 j) | **Fait (v5.91)** : intent-filters + plugin natif + intake JS. Aucun compte, aucune API. | L'app source doit proposer un export/partage GPX. |
| **2. Cloud générique** | Google Drive, Dropbox, iCloud | Moyenne | Reporté : le sélecteur Android couvre déjà le besoin manuel ; un SDK cloud = OAuth + dépendance. | Dépôt manuel préalable. |
| **3. API ouvertes** | Strava, Wahoo | Moyenne à élevée | Strava : OAuth2 mais `client_secret` obligatoire → back-end (Edge Function Supabase **ou** Worker Cloudflare) ; revue des API Terms. Wahoo : cloud API publique OAuth. | Quotas, attribution, back-end. |
| **4. Partenaires matériel** | Garmin Connect, Suunto, Polar, COROS | Élevée (semaines) | Programme développeur / partenariat à valider. Suunto **n'est pas** une API ouverte. | Délais d'approbation ; FIT à convertir. |
| **5. Fermé / B2B** | AllTrails, Komoot | — | AllTrails : aucune API publique → Niveau 1. Komoot : portail développeur encadré (`developer.komoot.de`), usage restreint → traiter comme partenaire. | Contrat commercial. |

### Corrections par rapport à l'ébauche initiale

- **Suunto** était classé « API ouverte directe » : en réalité accès **partenaire**
  (Suunto API Zone), donc Niveau 4.
- **Komoot** était décrit « aucune API publique » : il existe un portail développeur encadré, mais
  pas de programme d'export grand public. À traiter comme partenaire, pas comme bloqué absolu.
- **Wahoo** manquait : cloud API publique OAuth, bon candidat Niveau 3.
- **Strava** : la documentation officielle impose `client_id` **et** `client_secret` lors de
  l'échange de code (pas de PKCE) ; le secret ne peut pas être embarqué dans l'app.
- **iOS** : hors sujet pour l'instant, le dépôt ne contient aucune plateforme iOS.
- Le **FIT** (Garmin/Suunto/Wahoo) n'est pas lisible par `gpxparser` ; prévoir un parseur dédié si
  un lot partenaire l'exige.

## Constats terrain (2026-09-15, Android)

- **Partage d'un vrai fichier `.gpx`** : fonctionne via « Ouvrir avec » / partage (canal P0), à partir
  d'un gestionnaire de fichiers. Confirmé sur Galaxy S23.
- **Komoot / Wikiloc** : le partage natif envoie une **URL de page web**, pas un GPX. L'export GPX
  est lié au compte/achat de région. Aucun chemin propre et simple.
- **Garmin Connect mobile** : pas d'export GPX ; l'export n'existe que sur le **site web**.
- **Strava** : la *création/enregistrement d'itinéraires* est réservée à l'abonnement ; le partage
  produit une **image**. En revanche, la **lecture de ses propres activités reste gratuite via
  l'API** (`activity:read`), et Strava reçoit automatiquement Garmin/Suunto/Wahoo/Polar/COROS.
- Conséquence : une intégration **Strava « activités »** couvrirait indirectement la plupart des
  montres, y compris Garmin, sans le programme partenaire Garmin. C'est le seul candidat sérieux,
  mais il exige un back-end (secret OAuth) donc un effort moyen.

## Pourquoi un back-end pour Strava (et lequel)

Strava n'impose ni Supabase ni aucun fournisseur. Il impose **deux contraintes** qui rendent un
petit service côté serveur nécessaire :

1. **`client_secret` obligatoire** lors de l'échange du code OAuth (aucun PKCE documenté). Un secret
   embarqué dans l'app Android est extractible (APK décompilé) : il ne doit jamais y vivre.
2. **`redirect_uri` rattaché à un domaine de callback déclaré**. Un schéma d'application
   (`com.suntrail.threejs://`) n'est pas accepté comme domaine ; il faut une URL `https`.

Ce service ne fait **que** l'échange de code et le rafraîchissement des tokens. Les appels API
(lister les activités, récupérer le GPX) et l'import (`importGpxTrack`) restent **dans l'app**.

Hébergement possible, au choix (Strava s'en moque) :

- **Edge Function Supabase** : déjà intégré (`@supabase/supabase-js`), deep link
  `com.suntrail.threejs://auth-callback` déjà en place.
- **Cloudflare Worker** : cohérent avec l'infra existante (`.wrangler`, SDK S3/R2 des packs).

Le **refresh token peut rester local** (`Capacitor Preferences`) : aucun compte SunTrail n'est
requis, ce qui reste cohérent avec `accountSync` désactivé.

**Décision (2026-09-15) : non implémenté.** Le canal OS (P0) couvre le besoin immédiat ; Strava
reste la piste P2 pour les utilisateurs qui possèdent un compte Strava, avec un back-end au choix
Supabase ou Cloudflare.

## Feuille de route recommandée

1. **P0 — Réception OS + aide intégrée (fait, gratuit, sans compte)** :
   `docs/plans/V5_91_GPX_SHARE_IMPORT.md`.
2. **P1 — Web** : glisser-déposer sur la carte, `share_target` PWA (optionnel).
3. **P2 — Strava « activités » (Pro, pour les utilisateurs qui en ont)** : OAuth via un back-end
   (Edge Function Supabase **ou** Worker Cloudflare, au choix), revue des API Terms préalable.
   Ne jamais promettre la création d'itinéraires (payante).
4. **P3 — Wahoo**, puis partenaires Komoot/Wikiloc/Garmin/Suunto/Polar/COROS.
5. **Agrégateur** (ex. Terra) seulement si le nombre de fournisseurs le justifie ; coût élevé.

## Conséquences techniques

- Un nouveau canal doit appeler `importGpxTrack(xml, name)` et rien d'autre.
- Le **secret** Strava vit côté serveur, jamais dans le client ; les **refresh tokens** peuvent
  rester locaux (`Capacitor Preferences`).
- Un compte SunTrail n'est pas requis pour une intégration à tokens locaux ; `accountSync` reste la
  décision séparée pour une sync multi-appareils.
- Nouveau texte visible → 4 locales + `npm run audit:i18n`.
