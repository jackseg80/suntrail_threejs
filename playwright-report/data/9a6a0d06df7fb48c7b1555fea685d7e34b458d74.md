# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: onboarding.test.ts >> First Launch Experience >> should complete full onboarding and permissions flow
- Location: e2e\onboarding.test.ts:4:7

# Error details

```
Error: expect(locator).not.toBeVisible() failed

Locator:  locator('#onboarding-overlay')
Expected: not visible
Received: visible
Timeout:  5000ms

Call log:
  - Expect "not toBeVisible" with timeout 5000ms
  - waiting for locator('#onboarding-overlay')
    8 × locator resolved to <div role="dialog" aria-modal="true" id="onboarding-overlay" aria-labelledby="ob-title">…</div>
      - unexpected value "visible"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Aller au contenu" [ref=e2] [cursor=pointer]:
    - /url: "#canvas-container"
  - heading "SunTrail - Carte 3D" [level=1] [ref=e3]
  - main:
    - img "Carte topographique 3D interactive" [ref=e5]
  - banner:
    - generic [ref=e6]:
      - button "WORLD · LVL 6 --°C" [ref=e8] [cursor=pointer]:
        - generic [ref=e9]: WORLD · LVL 6
        - generic [ref=e10]: ☀️
        - generic [ref=e11]: "--°C"
      - generic [ref=e12]:
        - button "État réseau" [ref=e13] [cursor=pointer]:
          - img [ref=e14]
        - button "SOS urgence" [ref=e19] [cursor=pointer]:
          - generic [ref=e20]: 🆘
        - button "Ouvrir la timeline de simulation" [ref=e21]:
          - generic [ref=e22]: 🕒
  - generic:
    - generic: —
    - generic:
      - button "☀ Solaire"
  - navigation [ref=e23]:
    - tablist [ref=e24]:
      - tab "Recherche" [ref=e25] [cursor=pointer]:
        - img [ref=e27]
        - generic [ref=e30]: Recherche
      - tab "Parcours" [ref=e31] [cursor=pointer]:
        - img [ref=e33]
        - generic [ref=e37]: Parcours
      - tab "Réglages" [ref=e38] [cursor=pointer]:
        - img [ref=e40]
        - generic [ref=e43]: Réglages
  - generic:
    - generic [ref=e44]:
      - generic [ref=e47]:
        - generic [ref=e48]: Réglages
        - generic "Fermer les réglages" [ref=e49] [cursor=pointer]: ×
      - generic [ref=e50]: Profil de performance
      - generic [ref=e51]:
        - button "Éco" [ref=e52] [cursor=pointer]
        - button "Std" [ref=e53] [cursor=pointer]
        - button "High" [ref=e54] [cursor=pointer]
        - button "Ultra" [ref=e55] [cursor=pointer]
      - generic [ref=e56]: Thème
      - generic [ref=e57]:
        - button "Clair" [ref=e58] [cursor=pointer]
        - button "Sombre" [ref=e59] [cursor=pointer]
        - button "Auto" [ref=e60] [cursor=pointer]
      - generic [ref=e61]:
        - generic [ref=e62]:
          - generic [ref=e63]: 🔋
          - generic [ref=e64]: Économie d'énergie
        - switch "Économie d'énergie" [ref=e65] [cursor=pointer]
      - generic [ref=e66]:
        - generic [ref=e67]: Rendu 3D & Détails
        - generic [ref=e68]:
          - generic [ref=e69]:
            - button "▶" [ref=e70] [cursor=pointer]
            - generic [ref=e71]: Forêts & Végétation
          - switch "Forêts & Végétation" [checked] [ref=e72] [cursor=pointer]
        - generic [ref=e73]:
          - generic [ref=e74]: Lacs & Rivières
          - switch "Lacs & Rivières" [checked] [ref=e75] [cursor=pointer]
        - generic [ref=e76]:
          - generic [ref=e77]:
            - button "▶" [ref=e78] [cursor=pointer]
            - generic [ref=e79]: Météo
          - switch "Météo" [checked] [ref=e80] [cursor=pointer]
        - generic [ref=e81]:
          - generic [ref=e82]: Signalisation 3D
          - switch "Signalisation 3D" [checked] [ref=e83] [cursor=pointer]
      - generic [ref=e84]:
        - generic [ref=e85]:
          - generic [ref=e86]: ✨
          - generic [ref=e87]: Fonctionnalités PRO
          - generic [ref=e88]: PRO
        - paragraph [ref=e89]: Débloquez toutes les fonctionnalités premium avec SunTrail Pro
        - generic [ref=e90] [cursor=pointer]:
          - generic [ref=e91]:
            - generic [ref=e92]: 🏢
            - generic [ref=e93]:
              - generic [ref=e94]: Bâtiments OSM
              - generic [ref=e95]: Architecture réaliste sur le terrain
          - generic [ref=e96]: PRO
          - checkbox "Bâtiments OSM" [checked] [disabled] [ref=e97]
        - generic [ref=e98] [cursor=pointer]:
          - generic [ref=e99]:
            - generic [ref=e100]: 📐
            - generic [ref=e101]:
              - generic [ref=e102]: Inclinomètre
              - generic [ref=e103]: Pente du terrain en temps réel (°, %)
          - generic [ref=e104]: PRO
          - checkbox "Inclinomètre" [checked] [disabled] [ref=e105]
        - generic [ref=e106] [cursor=pointer]:
          - generic [ref=e107]:
            - generic [ref=e108]: 🌡️
            - generic [ref=e109]:
              - generic [ref=e110]: Météo Avancée
              - generic [ref=e111]: Graphique 24h + Prévisions 3 jours
          - generic [ref=e112]: PRO
          - checkbox "Météo Avancée" [checked] [disabled] [ref=e113]
        - generic [ref=e115]: Inclus avec Pro
        - generic [ref=e116]:
          - generic [ref=e117]:
            - generic [ref=e118]: 🗓️
            - generic [ref=e119]:
              - generic [ref=e120]: Calendrier solaire
              - generic [ref=e121]: Ombres pour n'importe quel jour de l'année
          - generic [ref=e122]: ✓
        - generic [ref=e123]:
          - generic [ref=e124]:
            - generic [ref=e125]: ☀️
            - generic [ref=e126]:
              - generic [ref=e127]: Analyse solaire Pro
              - generic [ref=e128]: Azimut, élévation, graphique 24h, phase lunaire
          - generic [ref=e129]: ✓
        - generic [ref=e130]:
          - generic [ref=e131]:
            - generic [ref=e132]: 🗺️
            - generic [ref=e133]:
              - generic [ref=e134]: Zoom LOD 18 + Satellite
              - generic [ref=e135]: Détail maximum — sentiers, bâtiments, végétation
          - generic [ref=e136]: ✓
        - generic [ref=e137]:
          - generic [ref=e138]:
            - generic [ref=e139]: 📍
            - generic [ref=e140]:
              - generic [ref=e141]: Multi-tracés + Export GPX
              - generic [ref=e142]: Importez et exportez autant de randonnées que vous voulez
          - generic [ref=e143]: ✓
        - generic [ref=e144]:
          - generic [ref=e145]:
            - generic [ref=e146]: 📶
            - generic [ref=e147]:
              - generic [ref=e148]: Zones offline illimitées
              - generic [ref=e149]: Téléchargez autant de régions que vous voulez
          - generic [ref=e150]: ✓
        - button "🔓 Passer à Pro" [ref=e151] [cursor=pointer]:
          - generic [ref=e152]: 🔓
          - generic [ref=e153]: Passer à Pro
      - group [ref=e154]:
        - generic "⚙️ Paramètres Avancés" [ref=e155] [cursor=pointer]
      - generic [ref=e157]:
        - generic [ref=e158]: Langue
        - combobox "Langue" [ref=e159]:
          - option "Français" [selected]
          - option "Deutsch"
          - option "Italiano"
          - option "English"
      - generic [ref=e161]:
        - generic [ref=e162]: ID Testeur
        - generic [ref=e163]:
          - code [ref=e164]: Non disponible (web)
          - button "Copier" [ref=e165] [cursor=pointer]
      - button "❓ Aide & Tutoriel" [ref=e167] [cursor=pointer]
      - generic [ref=e169]:
        - generic [ref=e170]: "GPU : NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0)"
        - generic [ref=e171]: "CPU : 32 cores"
        - generic [ref=e172]: "Preset détecté : performance"
    - generic [ref=e173]:
      - generic [ref=e176]:
        - generic [ref=e177]: Fonds de carte
        - generic "Fermer les calques" [ref=e178] [cursor=pointer]: ×
      - listbox "Fonds de carte" [ref=e179]:
        - option "Topo CH" [ref=e180] [cursor=pointer]:
          - generic [ref=e182]: Topo CH
        - option "Satellite" [ref=e183] [cursor=pointer]:
          - generic [ref=e184]:
            - generic: Pro
          - generic [ref=e185]: Satellite
        - option "OpenTopo" [selected] [ref=e186] [cursor=pointer]:
          - generic [ref=e188]: OpenTopo
      - generic [ref=e189]:
        - generic [ref=e190]:
          - generic [ref=e191]:
            - img [ref=e193] [cursor=pointer]
            - generic [ref=e195]:
              - generic [ref=e196]: Sentiers
              - generic [ref=e197]: Indisponible à ce zoom
          - generic [ref=e198]:
            - generic "Zoomer d'avantage (LVL 11+) pour voir les sentiers" [ref=e199]: ⓘ
            - switch "Sentiers" [disabled] [ref=e200]
        - generic [ref=e201]:
          - generic [ref=e202]:
            - img [ref=e204] [cursor=pointer]
            - generic [ref=e208]:
              - generic [ref=e209]: Pentes > 30°
              - generic [ref=e210]: Indisponible à ce zoom
          - generic [ref=e211]:
            - generic "Zoomer d'avantage (LVL 11+) pour voir les pentes" [ref=e212]: ⓘ
            - switch "Pentes > 30°" [disabled] [ref=e213]
    - generic [ref=e214]:
      - generic [ref=e217]:
        - generic [ref=e218]: Exploration
        - generic "Fermer la recherche" [ref=e219] [cursor=pointer]: ×
      - generic [ref=e221]:
        - img [ref=e223]
        - textbox "Rechercher un lieu" [ref=e226]:
          - /placeholder: Rechercher un lieu...
      - listbox "Résultats de recherche"
    - generic [ref=e227]:
      - generic [ref=e230]:
        - generic [ref=e231]: Parcours
        - generic "Fermer parcours" [ref=e232] [cursor=pointer]: ×
      - generic [ref=e233]:
        - button "Enregistrer un parcours" [ref=e234] [cursor=pointer]:
          - img [ref=e235]
          - text: REC
        - button "Importer un fichier GPX" [ref=e238] [cursor=pointer]:
          - generic [ref=e239]: 📥 Import GPX
      - generic [ref=e240]:
        - img [ref=e241]
        - paragraph [ref=e244]: Aucun parcours
        - paragraph [ref=e245]: Importez un fichier GPX ou démarrez l'enregistrement GPS
      - generic [ref=e246]:
        - generic [ref=e247]: Tracé éphémère (mémoire vive uniquement). Passez à Pro pour exporter le fichier GPX sur votre téléphone.
        - button "Voir Pro ↗" [ref=e248] [cursor=pointer]
    - generic [ref=e249]:
      - generic [ref=e252]:
        - generic [ref=e253]: Bulletin Météo
        - generic "Fermer météo" [ref=e254] [cursor=pointer]: ×
      - generic [ref=e256]:
        - generic [ref=e257]: 🌤️
        - generic [ref=e258]: Aucune donnée météo
        - generic [ref=e259]: Localisation en cours...
    - generic [ref=e263]:
      - generic [ref=e264]: Analyse Solaire
      - generic "Fermer analyse solaire" [ref=e265] [cursor=pointer]: ×
    - generic [ref=e269]:
      - generic [ref=e270]: 🆘
      - heading "URGENCE SOS" [level=2] [ref=e271]
      - paragraph [ref=e272]: Voici vos coordonnées exactes à transmettre aux secours.
      - generic [ref=e273]: ⌛ Localisation en cours...
      - generic [ref=e274]:
        - button "Copier le message" [ref=e275] [cursor=pointer]
        - button "📱 Envoyer par SMS" [disabled] [ref=e276] [cursor=pointer]
      - button "Fermer" [ref=e277] [cursor=pointer]
    - generic [ref=e278]:
      - generic [ref=e281]:
        - generic [ref=e282]: Système & Données
        - generic "Fermer connectivité" [ref=e283] [cursor=pointer]: ×
      - generic [ref=e284]: État du Signal
      - generic [ref=e285]:
        - generic [ref=e286]:
          - generic [ref=e287]: Signal GPS
          - generic [ref=e288]: "-- m"
        - generic [ref=e289]:
          - generic [ref=e290]: Réseau
          - generic [ref=e291]: ONLINE
          - generic [ref=e292]: Inconnu
      - generic [ref=e293]:
        - generic [ref=e294]:
          - generic [ref=e295]: ✈️
          - generic [ref=e296]:
            - generic [ref=e297]: Mode Hors-ligne
            - generic [ref=e298]: Forcer l'usage du cache uniquement
        - switch "Mode Hors-ligne" [ref=e299] [cursor=pointer]
      - generic [ref=e300]:
        - generic [ref=e301]: Gestion du Cache
        - generic [ref=e302]:
          - button "Vider le Cache" [ref=e303] [cursor=pointer]
          - button "📥 77 tuiles · ~6.0 Mo · 0/1 zone utilisée" [ref=e304] [cursor=pointer]
        - generic [ref=e305]:
          - generic [ref=e306]: Stockage local (.pmtiles)
          - button "📂" [ref=e307] [cursor=pointer]
        - button "Packs Pays" [ref=e308] [cursor=pointer]
      - generic [ref=e309]:
        - generic [ref=e310]: Services Externes
        - generic [ref=e312]:
          - paragraph [ref=e313]: Clé MapTiler
          - generic [ref=e315]:
            - textbox "Clé API MapTiler" [ref=e316]:
              - /placeholder: Coller votre clé ici...
              - text: test-key-bypass
            - button "✓" [ref=e317] [cursor=pointer]
          - paragraph [ref=e318]:
            - link "Obtenir une clé gratuite ↗" [ref=e319] [cursor=pointer]:
              - /url: https://cloud.maptiler.com/account/keys/
    - generic [ref=e320]:
      - generic [ref=e323]:
        - generic [ref=e324]: Packs Pays
        - generic "Fermer les packs" [ref=e325] [cursor=pointer]: ×
      - generic [ref=e326]:
        - generic [ref=e327]: Stockage
        - generic [ref=e328]: Aucun pack installé
      - generic [ref=e329]:
        - generic [ref=e330]:
          - generic [ref=e331]:
            - generic [ref=e332]:
              - generic [ref=e333]: 🇨🇭
              - generic [ref=e334]:
                - generic [ref=e335]: Suisse HD
                - generic [ref=e336]: LOD 8-14
            - generic [ref=e337]: 716 MB
          - generic [ref=e338]: Cartes SwissTopo haute résolution
          - generic [ref=e339]:
            - generic [ref=e340]: ☁ En ligne
            - button "Télécharger" [ref=e341] [cursor=pointer]
        - generic [ref=e342]:
          - generic [ref=e343]:
            - generic [ref=e344]:
              - generic [ref=e345]: 🇫🇷
              - generic [ref=e346]:
                - generic [ref=e347]: France Alpes HD
                - generic [ref=e348]: LOD 8-14
            - generic [ref=e349]: 515 MB
          - generic [ref=e350]: Cartes IGN haute résolution
          - generic [ref=e351]:
            - generic [ref=e352]: ☁ En ligne
            - button "Télécharger" [ref=e353] [cursor=pointer]
      - generic [ref=e354]: "Pro : LOD 12-14 · Gratuit : LOD 12"
      - button "Restaurer les achats" [ref=e355] [cursor=pointer]
    - generic [ref=e356]:
      - generic [ref=e359]:
        - generic [ref=e360]: Passer à Pro ✨
        - generic [ref=e361] [cursor=pointer]: ×
      - generic [ref=e362]:
        - generic [ref=e363]:
          - generic [ref=e364]: ☀️
          - generic [ref=e365]: Simulation solaire unique au monde
          - generic [ref=e366]: Voyez exactement quand le soleil éclaire votre sentier. Ombres projetées sur le vrai relief 3D — pour n'importe quel jour de l'année.
        - generic [ref=e367]:
          - generic [ref=e368]:
            - generic [ref=e369]: 🗓️
            - generic [ref=e370]: Calendrier solaire illimité
          - generic [ref=e371]:
            - generic [ref=e372]: ☀️
            - generic [ref=e373]: Analyse solaire complète
          - generic [ref=e374]:
            - generic [ref=e375]: 🌡️
            - generic [ref=e376]: Météo 3 jours + alertes
          - generic [ref=e377]:
            - generic [ref=e378]: 🗺️
            - generic [ref=e379]: Zoom LOD 18 maximum
          - generic [ref=e380]:
            - generic [ref=e381]: 🛰️
            - generic [ref=e382]: Vue Satellite HD
          - generic [ref=e383]:
            - generic [ref=e384]: 🏢
            - generic [ref=e385]: Bâtiments 3D réalistes
          - generic [ref=e386]:
            - generic [ref=e387]: 📐
            - generic [ref=e388]: Inclinomètre de pente
          - generic [ref=e389]:
            - generic [ref=e390]: 📍
            - generic [ref=e391]: Multi-tracés GPX
          - generic [ref=e392]:
            - generic [ref=e393]: 💾
            - generic [ref=e394]: Export GPX + stats
          - generic [ref=e395]:
            - generic [ref=e396]: 📶
            - generic [ref=e397]: Offline illimité
        - button "✨ Essayer Pro (3 jours) — Gratuit" [ref=e398] [cursor=pointer]:
          - generic [ref=e399]: ✨
          - generic [ref=e400]: Essayer Pro (3 jours) — Gratuit
        - link "Disponible sur Google Play" [ref=e401] [cursor=pointer]:
          - /url: https://play.google.com/store/apps/details?id=com.suntrail.threejs
        - paragraph [ref=e402]: L'achat Pro est disponible via l'application Android sur Google Play.
  - generic [ref=e403]:
    - button "Réinitialiser le Nord" [ref=e404] [cursor=pointer]:
      - img [ref=e405]
    - button "Changer le type de carte" [ref=e409] [cursor=pointer]:
      - img [ref=e410]
    - button "Localiser ma position" [ref=e414] [cursor=pointer]:
      - img [ref=e415]
    - button "Basculer 2D/3D" [disabled] [pressed] [ref=e419]:
      - img [ref=e420]
      - generic [ref=e428]: 2D
  - generic:
    - generic:
      - generic:
        - generic:
          - heading "📈 Profil d'élévation & Pentes" [level=3]
          - generic:
            - generic: "Distance : 0km | Alt : 0m | Pente : 0%"
            - button "×"
      - generic:
        - img
  - dialog "Recherchez un lieu" [ref=e429]:
    - generic [ref=e430]:
      - generic [ref=e431]:
        - generic [ref=e432]: 🔍
        - heading "Recherchez un lieu" [level=2] [ref=e433]
        - paragraph [ref=e434]: Tapez le nom d’une ville, d’un sommet ou d’un pays dans la barre de recherche. Des filtres rapides affinent les résultats.
      - generic [ref=e445]:
        - button "Passer" [active] [ref=e446] [cursor=pointer]
        - button "Suivant →" [ref=e447] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('First Launch Experience', () => {
  4  |   test('should complete full onboarding and permissions flow', async ({ page }) => {
  5  |     // Start with a clean slate (no localStorage)
  6  |     await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
  7  |     await page.waitForFunction(() => (window as any).suntrailReady === true);
  8  | 
  9  |     // 1. Acceptance Wall
  10 |     await expect(page.locator('#acceptance-wall-overlay')).toBeVisible();
  11 |     await page.click('#aw-accept-btn');
  12 |     await expect(page.locator('#acceptance-wall-overlay')).not.toBeVisible();
  13 | 
  14 |     // 2. Onboarding Tutorial
  15 |     await expect(page.locator('#onboarding-overlay')).toBeVisible();
  16 |     // Navigate through some slides
  17 |     for (let i = 0; i < 3; i++) {
  18 |         await page.click('#ob-next');
  19 |     }
  20 |     // Skip the rest
  21 |     await page.click('#ob-skip');
> 22 |     await expect(page.locator('#onboarding-overlay')).not.toBeVisible();
     |                                                           ^ Error: expect(locator).not.toBeVisible() failed
  23 | 
  24 |     // 3. GPS Disclosure
  25 |     // Triggers when clicking the GPS button
  26 |     await page.click('#gps-main-btn');
  27 |     await expect(page.locator('#gps-disclosure-overlay')).toBeVisible();
  28 |     await page.click('#gps-disc-allow-btn');
  29 |     await expect(page.locator('#gps-disclosure-overlay')).not.toBeVisible();
  30 | 
  31 |     // Final check: app should be loaded (check for the main 3D canvas)
  32 |     await expect(page.locator('#canvas-container canvas').first()).toBeVisible();
  33 |   });
  34 | 
  35 |   test('should allow skipping onboarding directly', async ({ page }) => {
  36 |     await page.goto('/?mode=test', { waitUntil: 'domcontentloaded' });
  37 |     await page.waitForFunction(() => (window as any).suntrailReady === true);
  38 |     
  39 |     // Accept wall
  40 |     await page.click('#aw-accept-btn');
  41 |     
  42 |     // Skip onboarding
  43 |     await expect(page.locator('#onboarding-overlay')).toBeVisible();
  44 |     await page.click('#ob-skip');
  45 |     await expect(page.locator('#onboarding-overlay')).not.toBeVisible();
  46 |     
  47 |     // GPS Disclosure (click button)
  48 |     await page.click('#gps-main-btn');
  49 |     await expect(page.locator('#gps-disclosure-overlay')).toBeVisible();
  50 |     await page.click('#gps-disc-decline-btn');
  51 |     await expect(page.locator('#gps-disclosure-overlay')).not.toBeVisible();
  52 |     
  53 |     // Final check: app should be loaded (check for the main 3D canvas)
  54 |     await expect(page.locator('#canvas-container canvas').first()).toBeVisible();
  55 |   });
  56 | });
  57 | 
```