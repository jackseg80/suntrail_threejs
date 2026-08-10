# AI UI Style Guide (v5.83.1)

> Référence de la release publique corrective v5.83.1 ; v5.84 n'est pas implémentée.

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
  not implementation terms. LOD, PMTiles and routing-provider keys belong only in the
  Developer lab.
- Mobile uses four primary destinations. From 900 px, reuse the same functions in side
  rails/panels; never create a desktop-only preparation feature.

### Prepared Routes v5.83

- Keep the simple route summary first: distance, duration, difficulty plus coverage, effort,
  ETA and daylight margin. Method/source explanations stay in secondary text or details.
- “Difficulty unknown” is a valid, explained state; never replace it with a slope-derived SAC level.
- A/B search and the keyboard waypoint list are the semantic alternative to the WebGL canvas.
- Approximate legacy routes always retain a visible warning and are never presented as guide-ready.

### Settings information architecture

The sticky category navigation targets **Essentials**, **Advanced hiking** and
**Developer lab**. The optional account/RGPD section stays visible, but sign-in and Google
link controls remain hidden until authentication is production-ready.

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
- **Backgrounds**: Use glassmorphism (`backdrop-filter: blur(10px)`) for floating toolbars and sheets.

## 3. Instrument Panels (Real-time Data)

For real-time instruments (Compass, Weather Vane), use the "Instrument" pattern which combines a visual SVG and a stats column.

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
- **Touch Fix**: `touch-action: none` on interaction containers to prevent browser scroll interference.
