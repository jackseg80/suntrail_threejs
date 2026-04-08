# Audit #4 — Securite — SunTrail v5.22.1

**Date :** 2026-04-04
**Scope :** Suivi C1-C4 (audit v5.16.7) + nouveaux vecteurs (packManager, buildings, rotation cles, CSP, dependances)
**versionCode :** 556 | **targetSdk :** 36 | **minSdk :** 24

---

## Suivi corrections C1-C4

| # | Issue originale | Status v5.22.1 | Preuve |
|---|----------------|----------------|--------|
| C1 | `usesCleartextTraffic` absent + pas de `network_security_config.xml` | **CORRIGE** | `AndroidManifest.xml:12` `android:usesCleartextTraffic="false"` + `android:networkSecurityConfig="@xml/network_security_config"`. Le fichier `network_security_config.xml` existe avec `cleartextTrafficPermitted="false"` et trust-anchors system-only (pas de CA utilisateur). |
| C2 | Cle API MapTiler en clair dans localStorage | **NON CORRIGE** (risque attenue) | `SharedAPIKeyComponent.ts:29` : `localStorage.setItem('maptiler_key', key)`. `ui.ts:53` : `localStorage.getItem('maptiler_key')`. Aucun chiffrement, aucune obfuscation. La cle reste en plaintext dans `maptiler_key`. Risque attenue : la cle est user-supplied (pas hardcodee), et `backup_rules.xml` exclut SharedPreferences du backup Google (voir C4). |
| C3 | Coordonnees GPS du trace en clair dans localStorage | **PARTIELLEMENT CORRIGE** | L'ancien `suntrail_recording_snapshot` ne contient plus les coordonnees GPS brutes. Le snapshot (`foregroundService.ts:49-54`) ne stocke que `isRecording`, `startTime`, `pointCount` dans localStorage. Les coordonnees completes sont desormais ecrites dans un fichier temporaire sur `Directory.Cache` (`suntrail_rec_points_v1.json`, `foregroundService.ts:119-124`) via Capacitor Filesystem — hors de portee du backup Google. Cependant, le fichier sur disque n'est pas chiffre. |
| C4 | `allowBackup="true"` expose localStorage aux backups Google | **PARTIELLEMENT CORRIGE** | `AndroidManifest.xml:4` : `android:allowBackup="true"` (toujours actif) MAIS `android:fullBackupContent="@xml/backup_rules"` pointe vers `backup_rules.xml` qui exclut `sharedpref`. Le localStorage WebView est sauvegarde dans le domaine `sharedpref` sur Android, donc la cle MapTiler et les flags sont exclus du backup. **Manque** : `android:dataExtractionRules` absent — sur Android 12+ (API 31+, targetSdk 36), Google recommande aussi `data_extraction_rules.xml` au format nouveau. Le fallback `fullBackupContent` est encore lu mais deprecated. |

---

## Nouveaux vecteurs analyses

### packManager.ts — Telechargement de packs pays (710 MB)

**Transport :**
- Les URLs CDN sont toutes en HTTPS (`*.r2.dev`), conformes a la CSP `connect-src`. Le `network_security_config.xml` interdit le cleartext HTTP au niveau OS. **OK**.

**Integrite des packs telecharges :**
- **AUCUNE verification d'integrite** (checksum, SHA-256, signature) apres telechargement. Le fichier `.pmtiles` est ecrit directement dans OPFS depuis le stream HTTP, puis monte sans validation.
- **Vecteur d'attaque** : un CDN compromis ou un MITM (TLS downgrade sur reseau captif mal configure) pourrait fournir un fichier PMTiles malveillant. Le parser PMTiles (`pmtiles.getHeader()`) valide le format mais pas le contenu semantique. Impact reel : tuiles de carte corrompues ou trompeuses (guidage vers mauvais sentier), pas d'execution de code.
- **Recommandation** : ajouter un champ `sha256` dans le catalog, verifier apres download, avant mount.

**Annulation / reprise :**
- `AbortController` correctement utilise pour l'annulation. En cas d'echec, `deletePackFile()` nettoie le fichier partiel. **OK**.

**Catalog :**
- Le catalog est fetch via HTTPS, cache dans localStorage (non critique — pas de secrets). Le fallback embarque `EMBEDDED_CATALOG` evite le blocage si le CDN est indisponible. **OK**.

### buildings.ts — Requetes Overpass

**Injection dans les queries Overpass :**
- La query Overpass est construite avec des coordonnees numeriques calculees (`latSouth.toFixed(4)`, `w.toFixed(4)`, etc.) a partir de `tx`, `ty`, `zoom` (entiers derives des tuiles). Aucun input utilisateur direct n'est injecte dans la query. **Pas de risque d'injection**.

**Validation des reponses :**
- Les reponses JSON Overpass sont parsees via `response.json()` standard. Les elements sont filtres par `el.type === 'way'` et `el.geometry`. Les proprietes sont lues comme des nombres (`el.tags?.['building:levels']`). Pas de `innerHTML` avec du contenu Overpass. **OK**.

**Rate-limiting :**
- Backoff exponentiel global (15s-5min) sur 429/504 dans `utils.ts:processNextOverpass()`. Queue limitee a 8. Cooldown par zone dans `buildings.ts`. **OK**.

### Rotation de cles MapTiler

**Mecanisme :**
- `ui.ts:67-77` : fetch d'un JSON public sur GitHub Gist (`gist.githubusercontent.com/jackseg80/...`). Le JSON contient un tableau `maptiler_keys` avec les cles actives. Une cle est selectionnee aleatoirement (`Math.random()`).
- Priorite : localStorage (user-supplied) > `.env` (bundled) > Gist (rotation).

**Exposition :**
- Les cles sont **exposees cote client par nature** (la clef MapTiler est envoyee en parametre URL `?key=...` a chaque requete de tuile). C'est un modele acceptable pour les cles de type "public tile API" (restriction par domaine/referrer cote MapTiler dashboard).
- Le Gist est **public** et accessible sans authentification — toute personne connaissant l'URL peut lire toutes les cles. Ce n'est pas un probleme si les cles sont restreintes par referrer/domaine.
- Les cles ne sont PAS stockees dans le code source versionne. Le fichier `.env` est dans `.gitignore` et n'a jamais ete commite.

**Risque residuel :**
- Si les cles MapTiler ne sont pas restreintes par referrer/domaine dans le dashboard MapTiler, n'importe qui peut les reutiliser. A verifier cote configuration MapTiler.

### tileLoader.ts — Validation URLs et CORS

- Les URLs de tuiles sont construites par `getColorUrl()`, `getElevationUrl()`, `getOverlayUrl()` a partir de `tx/ty/zoom` (entiers calcules) et `state.MK` (cle MapTiler). Pas d'injection possible.
- `fetchWithCache()` utilise `{ mode: 'cors' }` pour les requetes reseau. **OK**.
- Toutes les URLs de tuiles sont HTTPS sauf le namespace XML GPX (`http://www.topografix.com/GPX/1/1` — namespace string, pas une requete reseau). **OK**.

---

## Permissions Android

| Permission | Declaree | Utilisee | Justification |
|---|---|---|---|
| `INTERNET` | Oui | Oui | Tuiles carto, Overpass, Open-Meteo, CDN packs, Gist config |
| `ACCESS_NETWORK_STATE` | Oui | Oui | `networkMonitor.ts` — detection offline |
| `VIBRATE` | Oui | Oui | `haptics.ts` — feedback haptique (Capacitor Haptics) |
| `ACCESS_COARSE_LOCATION` | Oui | Oui | `location.ts` — GPS tracking, `Geolocation.watchPosition()` |
| `ACCESS_FINE_LOCATION` | Oui | Oui | `location.ts` — GPS haute precision |
| `FOREGROUND_SERVICE` | Oui | Oui | `foregroundService.ts` — maintien processus pendant REC |
| `FOREGROUND_SERVICE_LOCATION` | Oui | Oui | `RecordingService` (manifest:30-32) — type `location` |
| `POST_NOTIFICATIONS` | Oui | Oui | Notifications Android 13+ pour le Foreground Service |
| `com.android.vending.BILLING` | Oui | Oui | `iapService.ts` — RevenueCat Purchases |

**Resultat : 9 permissions, toutes justifiees. Aucune permission inutile.**

**Note :** `<profileable android:shell="true" />` (manifest:43) permet le profiling CPU/GPU via Android Studio en debug. **Non dangereux** en release (R8 desactive les symboles debug), mais pourrait etre retire pour les builds production.

---

## Securite Web

### innerHTML / XSS

- **55+ usages de `.innerHTML`** dans le code source. La grande majorite injectent du contenu statique (templates HTML hardcodes, icones SVG, labels i18n).
- **Points d'attention :**
  - `gpsDisclosure.ts:51-57` : `bodyHtml` est construit depuis `i18n.t('gps.disclosure.body')` split par `\n` et wrap dans `<p>`. La source est un fichier JSON local — **pas de risque XSS** sauf si les fichiers de traduction sont compromis.
  - `SearchSheet.ts:383` : `text.textContent = label.split(',')[0]` — utilise `textContent` (safe) pour les resultats de recherche. **OK**.
  - `ExpertSheets.ts:234,269` : `.innerHTML` avec des donnees meteo numeriques (`precipSum.toFixed(1)`, `Math.round(windSpeedMax)`). Risque theorique nul (nombres).
  - Aucune donnee utilisateur brute (input texte, nom de lieu API) n'est injectee via `.innerHTML`. Les labels de recherche utilisent `textContent`. **Pas de XSS identifie.**

### Content Security Policy (CSP)

- `index.html:13-37` : CSP via `<meta http-equiv>`. **Points positifs :**
  - `default-src 'self'`
  - `media-src 'none'`
  - `object-src 'none'`
  - `connect-src` restreint aux domaines connus (MapTiler, SwissTopo, IGN, Overpass, Open-Meteo, OpenTopoMap, R2 CDN, Waymarked Trails)
  - `worker-src 'self' blob:`

- **Faiblesses CSP :**
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — `unsafe-eval` est requis par Three.js (shader compilation) mais ouvre la porte a l'injection de scripts via `eval()`. `unsafe-inline` empeche la protection contre les scripts injectes. C'est un compromis standard pour les apps Three.js.
  - `style-src 'self' 'unsafe-inline'` — requis pour les design tokens CSS-in-JS. Acceptable.
  - `img-src` n'inclut pas les domaines de tuiles (SwissTopo, IGN, OpenTopoMap) — les tuiles sont chargees via `fetch()` (`connect-src`) et converties en `blob:`, pas via `<img>`. **OK**.

### URLs HTTP dans le code source

- Aucune URL HTTP utilisee pour des requetes reseau. Les seules occurrences `http://` sont :
  - `http://www.w3.org/2000/svg` — namespace SVG (standard)
  - `http://www.topografix.com/GPX/1/1` — namespace XML GPX (standard)

### Secrets versionnes

- `.env` contient `VITE_MAPTILER_KEY=2we4vmXjb9QmNJIEKhih` et `VITE_REVENUECAT_KEY=goog_uNvYVMqbcVzHCIXkSupAyYPFQmu`.
- `.env` est dans `.gitignore` et **n'a jamais ete commite** (verifie via `git log --diff-filter=A -- .env`).
- `.env.example` contient des placeholders (`your_maptiler_key_here`). **OK**.
- Les cles sont injectees a build-time via `import.meta.env.VITE_*` et se retrouvent dans le bundle JS minifie — **extraction possible** via decompilation APK. C'est acceptable pour des cles publiques (MapTiler = restriction par domaine, RevenueCat SDK key = public par design).

---

## npm audit

```
8 vulnerabilities (2 moderate, 6 high)

Principales :
- @xmldom/xmldom <0.8.12      HIGH   XML injection via CDATA (dep: @capacitor/assets, build-only)
- esbuild <=0.24.2            MOD    Dev server request leak (dep: vite, dev-only)
- lodash <=4.17.23            HIGH   Prototype Pollution + Code Injection (dep directe ou transitive)
- minimatch <=3.1.3           HIGH   ReDoS (dep: replace, build-only)
- serialize-javascript <=7.0.4 HIGH  RCE via RegExp + DoS (dep: @rollup/plugin-terser, build-only)
```

**Analyse :**
- `@xmldom/xmldom`, `esbuild`, `minimatch`, `serialize-javascript` sont des dependances de **build/dev uniquement** — pas dans le bundle production. Risque limite a la CI/dev.
- `lodash` est HIGH et potentiellement runtime. Verifier si la version installee est <=4.17.23 et si c'est utilise en production (fix : `npm audit fix`).

---

## Issues identifiees

### S1 — HAUTE : Pas de verification d'integrite des packs telecharges (710 MB)

**Fichier :** `src/modules/packManager.ts:203-237`
**Risque :** Un fichier PMTiles de 710 MB est telecharge via HTTPS et ecrit directement dans OPFS sans verification de hash/checksum. Si le CDN Cloudflare R2 est compromis, un attaquant pourrait fournir des tuiles modifiees (ex: sentiers effaces, falaises masquees). Impact indirect sur la securite physique des randonneurs.
**Recommandation :** Ajouter un champ `sha256` dans `PackMeta`, calculer le hash cote client apres download (via `crypto.subtle.digest('SHA-256', buffer)`), comparer avant mount.

### S2 — MOYENNE : `android:dataExtractionRules` absent (Android 12+)

**Fichier :** `android/app/src/main/AndroidManifest.xml`
**Risque :** `fullBackupContent` est deprecated sur Android 12+ (API 31+). Le targetSdk est 36. Google recommande `android:dataExtractionRules="@xml/data_extraction_rules"` au nouveau format. Le fallback fonctionne encore mais pourrait cesser sur les futures versions Android.
**Recommandation :** Creer `res/xml/data_extraction_rules.xml` au format Android 12+ et ajouter `android:dataExtractionRules` au manifest.

### S3 — MOYENNE : Points GPS REC non chiffres sur disque

**Fichier :** `src/modules/foregroundService.ts:119-124`
**Risque :** Les coordonnees GPS du trace en cours d'enregistrement sont ecrites en JSON clair dans `Directory.Cache` (`suntrail_rec_points_v1.json`). Sur un appareil roote ou via backup ADB, ces donnees sont accessibles. Donnees personnelles sensibles (RGPD Art. 9 si elles revelent des habitudes de vie).
**Recommandation :** Chiffrer le fichier avec AES-GCM via `window.crypto.subtle` (cle derivee d'un random stocke en localStorage — suffisant contre extraction offline).

### S4 — BASSE : CSP `unsafe-eval` + `unsafe-inline`

**Fichier :** `index.html:15`
**Risque :** `script-src 'unsafe-eval'` est requis par Three.js pour la compilation de shaders WebGL. C'est un compromis connu et accepte dans l'ecosysteme Three.js. `unsafe-inline` est requis par Vite HMR en dev et par certains patterns CSS.
**Impact :** Reduit l'efficacite de la CSP contre les attaques XSS. Dans le contexte d'une WebView Android (pas de navigation web externe), le risque est faible.
**Recommandation :** Pas d'action immediate. Pour renforcer a terme : utiliser des nonces CSP pour les scripts inline, et remplacer `unsafe-eval` par `wasm-unsafe-eval` si Three.js le supporte.

### S5 — BASSE : `<profileable android:shell="true" />` en production

**Fichier :** `android/app/src/main/AndroidManifest.xml:43`
**Risque :** Permet le profiling CPU via `adb` sur un build release. Utile pour le debugging performance mais donne une surface d'attaque sur les appareils avec USB debugging actif.
**Recommandation :** Retirer pour les builds de production, ou conditionner via `buildTypes`.

### S6 — INFO : Cle MapTiler toujours en plaintext localStorage (C2 non corrige)

**Fichier :** `src/modules/ui/components/SharedAPIKeyComponent.ts:29`
**Risque :** Identique au C2 original. La cle user-supplied est en plaintext dans `maptiler_key`. Attenue par le fait que `backup_rules.xml` exclut SharedPreferences du backup Google.
**Impact reel :** Faible. La cle MapTiler est publique par nature (envoyee en parametre URL). L'obfuscation n'apporterait qu'une securite cosmetique.
**Recommandation :** Accepter le risque et documenter dans la Privacy Policy. Pas d'action technique necessaire.

### S7 — INFO : `lodash` vulnerability (Prototype Pollution)

**Risque :** `lodash <=4.17.23` a des vulnerabilites connues (Prototype Pollution, Code Injection via `_.template`). Verifier si c'est une dep runtime ou build-only.
**Recommandation :** `npm audit fix` pour les deps corrigibles. Pour `@xmldom/xmldom` (no fix available), verifier que c'est build-only.

---

## Recapitulatif par severite

| Severite | # | Issues |
|----------|---|--------|
| HAUTE | 1 | S1 (integrite packs) |
| MOYENNE | 2 | S2 (dataExtractionRules), S3 (GPS non chiffre) |
| BASSE | 2 | S4 (CSP unsafe-eval), S5 (profileable) |
| INFO | 2 | S6 (cle plaintext), S7 (lodash) |
| **CORRIGE** | **2** | **C1 (cleartext traffic), C4 (backup rules)** |
| **PARTIELLEMENT CORRIGE** | **2** | **C3 (GPS snapshot), C2 → S6 (cle MapTiler)** |

---

## Checklist prioritaire

### Avant la prochaine release
- [ ] **S1** — Ajouter verification SHA-256 des packs telecharges (champ `sha256` dans catalog + `crypto.subtle.digest()` client-side)
- [ ] **S2** — Creer `data_extraction_rules.xml` pour Android 12+ et ajouter `android:dataExtractionRules` au manifest
- [ ] **S7** — Executer `npm audit fix` pour corriger lodash et les deps fixables

### Recommandes
- [ ] **S3** — Chiffrer le fichier `suntrail_rec_points_v1.json` sur disque (AES-GCM)
- [ ] **S5** — Retirer `<profileable android:shell="true" />` du manifest production

### Acceptes (pas d'action)
- [x] **S4** — CSP `unsafe-eval` requis par Three.js (compromis standard)
- [x] **S6** — Cle MapTiler plaintext (publique par nature, backup exclu)
