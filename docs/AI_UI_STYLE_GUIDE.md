# AI UI Style Guide (v5.90.1)

> Contrat visuel actuel, incluant Prepared Routes, Sortie/Bibliothèque et guidage Android/Web.

This guide defines the standardized UI patterns for SunTrail to ensure visual consistency across all panels (Expert Sheets, Settings, etc.).

## 0. Interaction contract (v5.82.0)

- Use native `button`, `input`, `select` and `details/summary` elements for interactive
  controls. A clickable `div` is not accepted for a critical action.
- Touch targets are at least 48 × 48 px. Keep a visible `:focus-visible` outline and an
  accessible name; dynamic choices synchronize `aria-selected`/`aria-pressed`.
- Sheets use the shared focus trap and Escape behavior. Standalone dialogs must implement
  both and declare `role="dialog"`, `aria-modal` and `aria-labelledby`.
- Respect `prefers-reduced-motion`; state changes must remain understandable without
  animation. Use semantic live regions only for useful status updates.
- Public labels describe the hiking outcome (map detail, local archive, fallback route),
  not implementation terms. LOD and routing-provider keys belong only in the Developer lab ;
  PMTiles import remains inside collapsed technical details in the offline-map screen.
- Mobile uses five visible destinations: Explorer, Prepare, Outing, Library and More. From 900 px, reuse the same functions in side
  rails/panels; never create a desktop-only preparation feature.

### Prepared Routes v5.83

- Keep the simple route summary first: distance, duration, difficulty plus coverage, effort,
  ETA and daylight margin. Method/source explanations stay in secondary text or details.
- “Difficulty unknown” is a valid, explained state; never replace it with a slope-derived SAC level.
- A/B search and the keyboard waypoint list are the semantic alternative to the WebGL canvas.
- Approximate legacy routes always retain a visible warning and are never presented as guide-ready.

### Terrain controls v5.89.1

- Préparer expose les actions fréquentes directement dans l'ordre Suivre, Enregistrer, Points,
  Profil, puis Configuration. Boucle et inversion restent des options secondaires avec des icônes
  de même taille.
- Un point visible ouvre le panneau Points. Ce panneau porte centrage, déplacement sur la carte,
  réorganisation et suppression ; Configuration ne duplique pas ces commandes.
- Guidance utilise des boutons explicites pour ses trois hauteurs : Bandeau depuis les panneaux
  normal et détaillé, Détails/Réduire entre ces deux panneaux, puis Agrandir depuis le bandeau
  minimal. Sur écran court ou grande police, le panneau reste sous la barre haute et son contenu
  défile sans dépendre d'un geste vertical caché.
- Pendant Guidance, les informations terrain actives rejoignent la surface Guidance au lieu de
  rester derrière elle. En session Guidance + REC, la barre haute ne duplique pas l'état REC : le
  panneau complet garde son résumé et le bandeau minimal affiche seulement REC et sa durée.
- Les trois états GPS doivent différer par la forme, la couleur et le libellé accessible : inactif,
  position ponctuelle et suivi continu.
- Une limite Free qui n'empêche pas le geste reste expliquée dans le contrôle concerné. Pour le zoom
  au-delà du détail 14, l'indicateur orange « HD Pro » est persistant et ouvrable au toucher.

### Settings information architecture

The sticky category navigation targets **Essentials**, **Map** and **Advanced**. The account/RGPD
section is hidden when no authenticated action is available. Settings exposes only adjustable Pro
options and one upgrade entry; pricing, restore and legal actions live on the dedicated Pro sheet.

### Timeline solaire

- Présenter la lecture dans deux niveaux : heure, phase et date en résumé, puis lecture, curseur et
  vitesse dans la rangée de contrôle. Chaque commande conserve une cible d'au moins 48 px.
- La couleur de l'heure suit les quatre phases calculées par le moteur solaire, avec une variante
  contrastée pour le thème clair. Le texte de phase reste toujours visible : la couleur seule ne
  porte jamais l'information.
- Free conserve la date du jour avec verrou explicite. Pro ouvre le calendrier et affiche Azimut et
  Élévation dès l'ouverture, sans attendre une interaction du curseur.
- Fluide et Maximum peuvent utiliser la surface vitrée commune. Endurance emploie une surface opaque
  sans flou. Le panneau reste ancré sous les éléments hauts visibles et n'est pas déplaçable.
- L'analyse d'un point reste accessible en 2D : lever, coucher, midi solaire, durée du jour, azimut,
  élévation et courbe astronomique ne dépendent pas de l'affichage 3D. Quand le relief manque, une
  information non bloquante le signale et les résultats qui en dépendent ne sont pas affichés.
- La simulation visuelle des ombres sur la carte reste propre à la 3D. Ne jamais présenter une
  hypothèse de terrain plat comme une mesure d'ombre, de premier rayon ou d'ensoleillement réel.
- L'analyse d'un point place la frise « Évolution sur 24h » sous la courbe d'élévation. La frise
  porte une légende (Soleil / Ombre / Nuit), un axe horaire, des infobulles par créneau et un résumé
  accessible. L'ombre est en bleu-gris, cohérent avec la bande solaire du profil et l'overlay 3D ;
  ne jamais réutiliser un rouge chaud, qui se lit comme l'heure dorée.
- Le graphique d'élévation accepte un curseur glissant : un glissement horizontal affiche heure,
  altitude, azimut et phase (ou ombre) sans bloquer le défilement vertical. Les seuils de phase
  proviennent du module partagé `solarPhases.ts` et jamais d'une copie locale.

### Sélection cartographique

- Un toucher sur le terrain ouvre un bandeau compact ancré juste au-dessus de la navigation. Il laisse
  libre la colonne de commandes à droite et affiche les coordonnées sans les tronquer.
- L'altitude est affichée lorsqu'elle est disponible en 3D. L'action Soleil reste liée au point
  sélectionné et la fermeture utilise un vrai bouton accessible.
- Quand le bandeau est visible, l'inclinomètre remonte au-dessus de lui avec un espace constant. Aucun
  des deux panneaux n'est déplaçable et aucun geste caché n'est requis pour les retrouver.
- Fluide et Maximum utilisent la transparence contrôlée commune. Endurance garde un fond opaque sans
  flou afin de préserver la lisibilité et le coût de rendu attendu par le preset.

### Sélection de zone hors ligne

- La sélection de zone est une tâche modale : masquer temporairement les commandes carte,
  l'inclinomètre et les coordonnées qui pourraient recouvrir ses dimensions ou ses actions.
- L'accès Free utilise un vrai bouton avec icône SVG et libellé explicite. Le curseur de taille
  désactivé ne reçoit ni clic détourné ni apparence interactive.
- Annuler et Télécharger restent visibles en portrait comme en paysage. Les toasts liés à cette
  tâche sont placés au-dessus du panneau et ne doivent jamais recouvrir ces actions.
- La barre supérieure disparaît pendant la sélection. En portrait, l'emprise s'arrête avant le
  panneau ; en paysage, emprise et panneau occupent deux colonnes sans recouvrement.
- Une seule emprise géographique est visible sur la carte. Elle est orange pendant la sélection,
  verte pendant le transfert et bleue quand la zone est disponible. Le guide d'écran qui sert au
  calcul reste invisible afin de ne pas créer une seconde forme concurrente.
- Au toucher de Télécharger, recalculer l'emprise affichée puis la figer pour toute la durée du
  transfert et pour l'état final. Les tuiles techniques qui intersectent l'emprise peuvent dépasser
  légèrement ses bords ; le contour représente la zone demandée et enregistrée.
- Fluide et Maximum peuvent utiliser la transparence commune ; Endurance conserve une surface
  opaque sans flou.

## 1. The "Expert" Grid (2x2 Pattern)

To ensure readability on mobile, use the `exp-stat-grid` class. It automatically handles 2-column layouts on narrow screens.

**HTML Pattern:**

```html
<div class="exp-stat-grid exp-probe-grid-mb">
    <div class="exp-probe-card">
        <div class="icon-svg-wrapper">...</div>
        <div class="exp-probe-label">Label</div>
        <div class="exp-probe-value">Value</div>
    </div>
    <!-- ... -->
</div>
```

**Key Classes:**

- `.exp-stat-grid`: Flex/Grid container for cards.
- `.exp-probe-card`: Individual stat block with optional icon.
- `.exp-probe-label`: Small, dimmed text for the metric name.
- `.exp-probe-value`: Bold, prominent text for the data.

## 2. Iconography & SVG (v5.53.8)

SunTrail has transitioned from emojis to **dual-tone SVG icons** for critical UI controls and expert stats.

- **Icon Module**: `src/modules/ui/icons.ts` contains standardized SVGs (close, play, pause, stop, record, check, lock, unlock, info).
- **Colors**: Use `--accent` (blue) and `--gold` (mountain/sun) for primary visual elements.
- **Backgrounds**: Use preset-aware surfaces. Fluide/Maximum may use controlled transparency and
  blur, but full content sheets remain nearly opaque so map labels and HUD controls never compete
  with form text. Endurance uses opaque surfaces without blur.

## 3. Instrument Panels (Real-time Data)

For real-time instruments (Compass, Weather Vane), use the "Instrument" pattern which combines a visual SVG and a stats column.

- L'inclinomètre garde son résumé ancré. Le viseur est le seul élément déplaçable ; il reste visible,
  borné à l'écran et utilisable au toucher comme au clavier. Pendant Guidance, ce même résumé est
  placé dans le panneau de suivi ; il ne doit pas être recopié dans un second composant.
- Les pictogrammes météo servent uniquement à décrire une condition ou un événement météo. Les
  alertes, états de chargement, verrouillages et aides utilisent texte, couleur sémantique et icônes
  SVG communes.

**Classes:**

- `.solar-realtime-instrument`: Flex container (Horizontal).
- `.weather-instrument-panel`: Flex container with justify-between.
- `.solar-instrument-compass`: Fixed-size square for the SVG dial.
- `.solar-instrument-stats`: Flexible column for RT metrics.

## 4. SVG Charts (24h Trend)

Standardized dimensions for embedded charts:

- **ViewBox**: Typically `0 0 320 120` (Solar) or `0 0 300 80` (Weather).
- **Colors**:
    - `var(--gold)`: Primary trend line.
    - `var(--accent)`: Secondary markers.
    - `var(--text-3)`: Grid lines and labels.
    - `rgba(239,68,68,0.15)`: Warning zones (Shadows/Freezing).

## 5. Typography & Spacing

Always use CSS variables for consistent look & feel:

- **Fonts**: `var(--text-xs)` (8-10px) for labels, `var(--text-md)` (14-16px) for values.
- **Spacing**: `var(--space-2)` (8px), `var(--space-4)` (16px).
- **Gradients**: Use `var(--surface-subtle)` for panel backgrounds.

## 6. Mobile Optimizations

- **Short Labels**: Prefer "Elev. Max" over "Maximum Elevation".
- **Click Targets**: Buttons must be full-width or at least 48 × 48 px, and Pro upgrades remain clearly identified (`PRO ↗`).
- **Touch handling**: Reserve `touch-action: none` for direct-manipulation surfaces that must own
  the gesture. Keep ordinary sheets and lists vertically scrollable.
