# Audit #7 -- RGPD & Data Safety Play Store -- SunTrail v5.22.1

Date : 2026-04-04
Scope : Privacy Policy (`public/privacy.html`), code source TypeScript, manifeste Android, dependances npm/Gradle

---

## 1. Privacy Policy -- Analyse

- **URL** : `public/privacy.html` (bilingue FR/EN, derniere mise a jour mars 2026)
- **Structure** : 9 sections (resume, donnees locales, donnees non collectees, tiers, localisation, stockage/securite, droits RGPD/LPD, enfants, modifications)

### Donnees declarees comme traitees localement
| Donnee | Usage declare | Stockage declare |
|--------|---------------|-----------------|
| Position GPS | Centrage carte + enregistrement traces | localStorage / Service Android |
| Traces GPX | Affichage 3D + profil elevation | Sur l'appareil, export explicite |
| Cle API MapTiler | Chargement tuiles | localStorage, jamais transmise a SunTrail |
| Preferences | Langue, perf, source carte | localStorage |

### Tiers declares
| Service | Usage declare | Lien privacy policy |
|---------|---------------|---------------------|
| MapTiler Cloud | Tuiles raster/vectorielles | Oui |
| SwissTopo / geo.admin.ch | Donnees topo suisses | Oui |
| IGN France / Geoplateforme | Donnees topo francaises | Oui |
| OpenStreetMap | Fond de carte alternatif | Oui |
| Open-Meteo | Donnees meteo temps reel | Oui |
| Overpass API (OSM) | Donnees batiments 3D | Oui |

### Droits utilisateur declares
- Droit d'acces/suppression via suppression locale ou desinstallation
- Droit d'opposition via desactivation du GPS Android
- Justification : aucune donnee personnelle sur serveur SunTrail, donc pas de demande possible aupres du developpeur

### Affirmations cles a verifier
1. "SunTrail ne collecte, ne stocke et ne transmet **aucune donnee personnelle** sur ses propres serveurs" (Section Resume)
2. "Votre position n'est **jamais transmise** a un serveur SunTrail ni a des **tiers**" (Section 4)
3. "SunTrail ne partage aucune donnee personnelle avec ces services. Vos traces GPX et votre position GPS ne leur sont jamais transmis." (Section 3)

---

## 2. Donnees reelles collectees

| Donnee | Type RGPD | Stockage | Transmise a | Chiffree transit | Supprimable |
|--------|-----------|----------|-------------|-----------------|-------------|
| Position GPS (lat/lon/alt) | Localisation precise | localStorage + Filesystem (Cache dir) | Open-Meteo (lat/lon), MapTiler Geocoding (lat/lon), Nominatim OSM (lat/lon) | Oui (HTTPS) | Oui (desinstallation ou clear data) |
| Traces GPX (points enregistres) | Localisation precise | localStorage + Filesystem (Cache dir) | Aucun tiers | Oui (local) | Oui (arret REC + desinstallation) |
| Cle API MapTiler | Identifiant technique | localStorage | MapTiler (dans URL tuiles) | Oui (HTTPS) | Oui (clear localStorage) |
| Preferences utilisateur | Pas de donnee personnelle | localStorage (suntrail_settings) | Aucun | Local | Oui |
| Statut Pro (isPro) | Information achat | localStorage (suntrail_pro) | RevenueCat (anonymous ID) | Oui (HTTPS) | Oui |
| Cache sommets (peaks) | Pas de donnee personnelle | localStorage (suntrail_peaks_cache) | Aucun | Local | Oui |
| Etats packs pays | Pas de donnee personnelle | localStorage (suntrail_pack_states/catalog) | Aucun | Local | Oui |
| Flags UX (onboarding, acceptance, GPS disclosure) | Pas de donnee personnelle | localStorage | Aucun | Local | Oui |
| Snapshot enregistrement (rec) | Localisation precise | localStorage + Filesystem (Cache) | Aucun | Local | Oui |
| Compteur zones offline | Pas de donnee personnelle | localStorage | Aucun | Local | Oui |
| Adresse IP | Identifiant reseau | Non stockee | Tous les tiers (standard HTTP) | Oui (HTTPS) | N/A |

### Detail : localStorage keys identifiees dans le code
- `suntrail_settings` -- preferences app (langue, preset, toggles visuels)
- `suntrail_pro` -- statut achat Pro
- `suntrail_peaks_cache` -- cache sommets Overpass (lat/lon + noms, TTL 7j)
- `suntrail_pack_states` -- etat d'installation packs pays
- `suntrail_pack_catalog` -- catalogue CDN cache
- `suntrail_rec_snapshot_v1` -- snapshot enregistrement GPS
- `suntrail_onboarding_v2` -- flag tutoriel vu
- `suntrail_acceptance_v1` -- flag disclaimer accepte
- `suntrail_gps_disclosure_v1` -- flag disclosure GPS vue
- `suntrail-offline-zones-count` -- compteur zones offline
- `maptiler_key` -- cle API MapTiler (saisie manuelle)

---

## 3. Transmissions reseau vers des tiers

### Inventaire exhaustif des `fetch()` dans le code source

| Service | Module source | Donnees transmises dans la requete | Base legale RGPD | Declare dans privacy policy ? |
|---------|---------------|-----------------------------------|-----------------|-------------------------------|
| **MapTiler Cloud** (tuiles raster) | `tileLoader.ts` | Cle API + coordonnees tuile (z/x/y) dans URL | Interet legitime (fonctionnement app) | **Oui** |
| **MapTiler Cloud** (tuiles elevation Terrain-RGB) | `tileLoader.ts` | Cle API + coordonnees tuile (z/x/y) dans URL | Interet legitime | **Oui** |
| **MapTiler Cloud** (tuiles batiments vectorielles) | `buildings.ts` | Cle API + coordonnees tuile (z/x/y) dans URL | Interet legitime | **Oui** |
| **MapTiler Geocoding** | `utils.ts` | Cle API + **lat/lon GPS** (reverse geocoding) OU **texte de recherche** (forward geocoding) | Interet legitime | **Partiellement** (declare comme "tuiles", pas geocoding) |
| **SwissTopo WMTS** | `tileLoader.ts` | Coordonnees tuile (z/x/y) dans URL | Interet legitime | **Oui** |
| **IGN Geoplateforme WMTS** | `tileLoader.ts` | Coordonnees tuile (z/x/y) dans URL | Interet legitime | **Oui** |
| **OpenStreetMap tiles** | `tileLoader.ts` | Coordonnees tuile (z/x/y) dans URL | Interet legitime | **Oui** |
| **Open-Meteo API** | `weather.ts` | **lat/lon GPS** + parametres meteo dans URL | Interet legitime | **Oui** -- mais ne precise pas que lat/lon sont envoyes |
| **Overpass API** (batiments, hydrologie) | `utils.ts` | **Bbox** (bounding box lat/lon) dans requete OverpassQL | Interet legitime | **Oui** (declare comme "batiments 3D") |
| **Overpass API** (sommets) | `peaks.ts` | **Bbox** (lat/lon +/- rayon) dans requete OverpassQL | Interet legitime | **Sommets non mentionnes** |
| **Overpass API** (recherche sommets par nom) | `SearchSheet.ts` | **Nom de sommet** (texte) dans requete OverpassQL | Interet legitime | **Non mentionne** |
| **Nominatim OSM** (geocoding fallback) | `utils.ts` | **lat/lon GPS** (reverse) OU **texte de recherche** (forward) + User-Agent "SunTrail-3D-App" | Interet legitime | **Non** |
| **OpenTopoMap** | `tileLoader.ts` | Coordonnees tuile (z/x/y) dans URL | Interet legitime | **Non** (mentionne comme "OpenStreetMap", mais OpenTopoMap est un service distinct) |
| **Waymarked Trails** | `tileLoader.ts` | Coordonnees tuile (z/x/y) dans URL (overlay sentiers) | Interet legitime | **Non** |
| **SwissTopo WMTS** (sentiers wanderwege overlay) | `tileLoader.ts` | Coordonnees tuile (z/x/y) dans URL | Interet legitime | **Oui** (couvert par SwissTopo) |
| **RevenueCat SDK** | `iapService.ts` | Anonymous app user ID, plateforme, info achat, entitlements | Execution contrat (achat) | **Non** |
| **Cloudflare R2 CDN** (packs pays) | `packManager.ts` | URL du pack (pas de donnee personnelle) + IP standard | Execution contrat (achat) | **Non** |
| **GitHub Gist** (config MapTiler keys) | `ui.ts` | Rien (simple GET) + IP standard | Interet legitime | **Non** |
| **OSM tile** (connectivity probe) | `networkMonitor.ts` | HEAD request tuile 0/0/0 (probe reseau) | Interet legitime | Couvert par "OpenStreetMap" |

---

## 4. Tracking / Analytics

### Recherche dans le code source

| Pattern recherche | Resultat |
|-------------------|----------|
| `analytics` | **Aucun** dans le code applicatif (present uniquement dans `workbox-google-analytics` de la lib PWA, inactif) |
| `firebase` | **Aucun SDK Firebase** dans les dependances. Mention dans `.gitignore` et `build.gradle` conditionnelle (`google-services.json` absent) |
| `gtag`, `ga(`, `fbq`, `pixel` | **Aucun** |
| `advertising`, `GAID`, `getAdvertisingId` | **Aucun** |
| `XMLHttpRequest` | **Aucun** (toutes les requetes utilisent `fetch()`) |

### Dependances npm (package.json)
- **Aucun SDK analytics** : pas de Firebase, Google Analytics, Amplitude, Mixpanel, Sentry, etc.
- **RevenueCat** (`@revenuecat/purchases-capacitor`) est le seul SDK tiers avec communication serveur

### Dependances Gradle (build.gradle)
- **Aucun SDK analytics** dans les dependances directes
- Condition `google-services.json` presente mais fichier absent du repo = Google Services non actif

### Verdict : **CONFORME -- Aucun tracking ni analytics detecte**

---

## 5. Verification des affirmations critiques de la privacy policy

### Affirmation 1 : "Aucune donnee personnelle transmise a ses propres serveurs"
**VRAI.** L'app n'a aucun backend propre. La seule communication vers une ressource du developpeur est le fetch du Gist GitHub (config JSON publique, GET sans donnees personnelles) et le CDN Cloudflare R2 (telechargement packs, URL publique).

### Affirmation 2 : "Position GPS jamais transmise a des tiers"
**FAUX.** Les coordonnees GPS de l'utilisateur (lat/lon) sont transmises a :
- **Open-Meteo** : lat/lon dans l'URL de la requete meteo (`weather.ts` ligne 58)
- **MapTiler Geocoding** : lat/lon dans l'URL de reverse geocoding (`utils.ts` ligne 185)
- **Nominatim OSM** : lat/lon dans l'URL de reverse geocoding (`utils.ts` ligne 186)

**Note importante :** Il ne s'agit pas de la position GPS en temps reel de l'utilisateur mais de la position du centre de la carte (qui peut etre la position GPS si le suivi est actif). Neanmoins, la distinction n'est pas faite dans la privacy policy, et la formulation "jamais transmise a des tiers" est techniquement incorrecte.

### Affirmation 3 : "SunTrail ne partage aucune donnee personnelle avec ces services"
**PARTIELLEMENT FAUX.** Les coordonnees de la zone consultee (assimilables a un interet de localisation) et l'adresse IP sont transmises. Les coordonnees de tuile (z/x/y) revelent la zone geographique consultee, et les appels geocoding transmettent directement lat/lon.

---

## 6. Data Safety -- Formulaire Play Store propose

### Location
- **Collectee** : Oui
- **Type** : Approximate location (coordonnees tuile z/x/y) + Precise location (lat/lon GPS pour meteo/geocoding)
- **Partagee avec des tiers** : Oui (Open-Meteo recoit lat/lon, MapTiler recoit coordonnees tuiles + cle API, Overpass recoit bbox)
- **Usage** : App functionality (carte, meteo, geocoding)
- **Traitee de facon ephemere** : Oui (pas de stockage cote serveur par SunTrail ; les tiers ont leur propre politique)
- **Optionnelle ou obligatoire** : Obligatoire pour le fonctionnement de base (carte), optionnelle pour le GPS (l'utilisateur peut naviguer manuellement)
- **Chiffree en transit** : Oui (HTTPS enforce via `usesCleartextTraffic="false"`)
- **Supprimable par l'utilisateur** : Oui (desinstallation ou clear data)

### Financial info
- **Collectee** : Non directement par SunTrail
- **Note** : Les achats transitent via Google Play Billing + RevenueCat. SunTrail ne recoit que le statut d'entitlement (pro/non-pro), pas les informations financieres. RevenueCat utilise un **anonymous ID** auto-genere (pas d'identifiant personnel).
- **Partagee** : Non (RevenueCat recoit les infos d'achat directement de Google Play, pas via SunTrail)

### Device or other identifiers
- **Collectee** : Non
- **Note** : RevenueCat genere un `appUserID` anonyme aleatoire (pas le GAID, pas l'Android ID). La cle API MapTiler est un identifiant technique du developpeur, pas de l'utilisateur.

### App activity
- **Collectee** : Non
- **Note** : Aucun analytics, aucun event tracking, aucun ecran tracker

### App info and performance
- **Collectee** : Non
- **Note** : Pas de crash reporting (pas de Firebase Crashlytics, Sentry, etc.)

### Personal info (name, email, etc.)
- **Collectee** : Non
- **Note** : Aucun compte utilisateur, aucune inscription

### Photos and videos
- **Collectee** : Non

### Messages / Contacts / Calendar
- **Collectee** : Non

### Health and fitness
- **Collectee** : Non

---

## 7. Ecarts privacy policy vs realite

| # | Declaration privacy policy | Realite dans le code | Gravite | Action recommandee |
|---|---------------------------|---------------------|---------|-------------------|
| 1 | "Position GPS jamais transmise a des tiers" | lat/lon envoyes a Open-Meteo (meteo), MapTiler (geocoding), Nominatim (geocoding fallback) | **HAUTE** | Reformuler : "Les coordonnees sont transmises aux services meteo et geocoding pour leur fonctionnement. Les traces GPX enregistrees ne sont jamais transmises." |
| 2 | Tiers : Overpass = "donnees batiments 3D" uniquement | Overpass est aussi utilise pour sommets (peaks) et hydrologie (lacs/rivieres) | Basse | Preciser "batiments, sommets, lacs et cours d'eau" |
| 3 | RevenueCat non mentionne | SDK RevenueCat actif, envoie anonymous ID + infos d'entitlement | **HAUTE** | Ajouter RevenueCat dans la liste des tiers avec lien privacy policy |
| 4 | Nominatim OSM non mentionne | Nominatim utilise en fallback geocoding (envoie lat/lon ou texte de recherche + User-Agent) | **MOYENNE** | Ajouter Nominatim (ou mentionner que OSM inclut Nominatim) |
| 5 | Waymarked Trails non mentionne | Tuiles overlay sentiers chargees depuis waymarkedtrails.org | **MOYENNE** | Ajouter dans la liste des tiers |
| 6 | OpenTopoMap non mentionne | Tuiles de fond chargees depuis opentopomap.org (service distinct d'OSM) | **MOYENNE** | Ajouter dans la liste ou preciser qu'OSM inclut OpenTopoMap |
| 7 | Cloudflare R2 CDN non mentionne | Telechargement packs pays depuis CDN Cloudflare | Basse | Mentionner le CDN pour les packs telechargeables |
| 8 | GitHub Gist non mentionne | Fetch de configuration (cles MapTiler) depuis gist.githubusercontent.com | Basse | Mentionner ou considerer comme infrastructure technique negligeable |
| 9 | Open-Meteo : pas de precision sur donnees transmises | lat/lon GPS envoyes directement dans l'URL de requete | **MOYENNE** | Preciser que les coordonnees de la zone consultee sont transmises pour obtenir les previsions |
| 10 | MapTiler Geocoding non mentionne | MapTiler recoit lat/lon (reverse geocoding) et texte de recherche (forward geocoding) en plus des tuiles | **MOYENNE** | Preciser les usages geocoding de MapTiler |
| 11 | Privacy policy mentionne "Foreground only" pour le GPS | Le Foreground Service (`FOREGROUND_SERVICE_LOCATION`) maintient le GPS actif meme app en arriere-plan pendant un enregistrement | **MOYENNE** | Preciser que le Foreground Service maintient le GPS actif pendant les enregistrements, meme ecran eteint |
| 12 | `android:allowBackup="true"` dans le manifest | La privacy policy dit que les donnees sont exclues de Google Drive via `fullBackupContent`. Le fichier `backup_rules.xml` exclut bien les SharedPreferences, mais `allowBackup="true"` reste actif pour les fichiers Cache. | Basse | Verifier que les points GPS en cache (`suntrail_rec_points_v1.json`) sont bien exclus |

---

## 8. Permissions Android declarees

| Permission | Usage | Necessaire |
|-----------|-------|------------|
| `INTERNET` | Acces reseau tuiles/meteo/overpass | Oui |
| `ACCESS_NETWORK_STATE` | Detection online/offline | Oui |
| `VIBRATE` | Haptics (swipes, confirmations) | Oui |
| `ACCESS_COARSE_LOCATION` | GPS (prealable a FINE) | Oui |
| `ACCESS_FINE_LOCATION` | GPS haute precision | Oui |
| `FOREGROUND_SERVICE` | Maintien processus pendant REC | Oui |
| `FOREGROUND_SERVICE_LOCATION` | Type du foreground service | Oui |
| `POST_NOTIFICATIONS` | Notification foreground service (Android 13+) | Oui |
| `com.android.vending.BILLING` | Achats In-App RevenueCat | Oui |

**Verdict** : Toutes les permissions sont justifiees et minimales. Pas de `ACCESS_BACKGROUND_LOCATION` (le Foreground Service utilise FOREGROUND_SERVICE_LOCATION qui est different).

---

## 9. Securite des donnees en transit

| Controle | Statut |
|---------|--------|
| `android:usesCleartextTraffic="false"` | **Actif** -- HTTP en clair bloque au niveau systeme |
| `android:networkSecurityConfig` | **Configure** -- fichier XML reference |
| Tous les `fetch()` utilisent HTTPS | **Oui** -- verifie sur les 15+ endpoints identifies |
| `backup_rules.xml` exclut SharedPreferences | **Oui** -- cle MapTiler et snapshots GPS exclus du backup Google |

---

## 10. Conformite specifique RevenueCat

Le SDK RevenueCat (`@revenuecat/purchases-capacitor` v12.3+) :
- Genere un **anonymous app user ID** aleatoire (pas de lien avec GAID ou compte Google)
- Communique avec les serveurs RevenueCat : statut abonnement, entitlements, info produit
- N'envoie **pas** : nom, email, position GPS, donnees d'usage
- Conforme : `Purchases.configure({ apiKey })` sans `appUserID` explicite = mode anonyme

**Impact Data Safety Play Store** :
- La categorie "Device or other identifiers" ne devrait pas necessiter de declaration pour l'ID anonyme RevenueCat (il n'est pas persistant cross-app)
- La categorie "Financial info > Purchase history" doit etre consideree : RevenueCat recoit les informations d'achat via Google Play Billing

---

## 11. Recommandations

### Priorite HAUTE (a corriger avant prochaine mise a jour)

1. **Corriger l'affirmation "position GPS jamais transmise a des tiers"** dans la privacy policy. Les coordonnees (lat/lon de la zone consultee) sont effectivement transmises a Open-Meteo, MapTiler Geocoding, et Nominatim. Reformuler : *"Les coordonnees de la zone consultee sont transmises aux services de meteo et geocoding pour leur fonctionnement. Vos traces GPX enregistrees ne sont jamais transmises a des tiers."*

2. **Ajouter RevenueCat** dans la liste des services tiers, avec lien vers leur privacy policy (https://www.revenuecat.com/privacy/). Preciser : identifiant anonyme uniquement, donnees d'achat via Google Play Billing.

### Priorite MOYENNE

3. **Ajouter les services tiers manquants** dans la privacy policy :
   - **Nominatim / OpenStreetMap Geocoding** : geocoding texte et reverse (lat/lon)
   - **Waymarked Trails** : overlay sentiers de randonnee
   - **OpenTopoMap** : fond de carte topographique (distinct d'OSM standard)

4. **Preciser les donnees transmises a Open-Meteo** : latitude/longitude de la zone consultee pour obtenir les previsions meteo.

5. **Preciser le comportement du Foreground Service** : le GPS reste actif pendant un enregistrement meme lorsque l'ecran est eteint ou l'app en arriere-plan. Le texte actuel laisse croire que le GPS fonctionne uniquement "au premier plan".

6. **Preciser les usages MapTiler** : non seulement tuiles raster/vectorielles, mais aussi elevation (Terrain-RGB), batiments (vector tiles), et geocoding.

### Priorite BASSE

7. **Mentionner Cloudflare R2** pour le telechargement des packs pays (aucune donnee personnelle transmise, seulement l'IP standard).

8. **Mentionner GitHub Gist** pour le chargement de configuration (aucune donnee personnelle transmise).

9. **Verifier `backup_rules.xml`** : le fichier Cache contenant les points GPS (`suntrail_rec_points_v1.json`) pourrait etre sauvegarde par Google Drive via `allowBackup="true"`. Envisager d'ajouter une exclusion pour le directory `Cache` ou passer a `android:allowBackup="false"`.

### Pour le formulaire Data Safety Play Store

10. **Declarer "Location" comme collectee et partagee** avec les services tiers pour le fonctionnement de l'app. Preciser "traitee de facon ephemere" et "chiffree en transit".

11. **Declarer "Purchase history"** dans la categorie Financial info, car RevenueCat recoit les informations d'achat. Preciser "necessaire pour la gestion des abonnements".

12. **Ne PAS declarer** : Device identifiers (pas de GAID), Personal info, Health/fitness, Messages, Photos, App activity, App info and performance.

---

## Resume executif

La privacy policy de SunTrail v5.22.1 est **globalement honnete** : l'app ne collecte effectivement aucune donnee personnelle sur ses propres serveurs, et les donnees locales sont correctement decrites. Cependant, **l'affirmation "position GPS jamais transmise a des tiers"** est factuellement incorrecte, et **RevenueCat est absent** de la liste des tiers. Six services tiers supplementaires (Nominatim, OpenTopoMap, Waymarked Trails, Cloudflare R2, GitHub Gist, MapTiler Geocoding) ne sont pas mentionnes.

Le zero-tracking est **confirme** : aucun SDK analytics, aucun identifiant publicitaire, aucun event tracking. Les permissions Android sont minimales et justifiees. Le chiffrement en transit est systematique (HTTPS).

Les 5 corrections prioritaires (reformulation GPS, ajout RevenueCat, ajout Nominatim/OpenTopoMap/Waymarked Trails) doivent etre appliquees a la privacy policy avant la prochaine soumission Play Store pour garantir l'alignement avec les exigences de transparence du RGPD (Article 13) et du formulaire Data Safety.
