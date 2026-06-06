# AI UI Style Guide (v5.57.0)

This guide defines the standardized UI patterns for SunTrail to ensure visual consistency across all panels (Expert Sheets, Settings, etc.).

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
- **Click Targets**: Buttons must be full-width or clearly identified as Pro upgrades (`PRO ↗`).
- **Touch Fix**: `touch-action: none` on interaction containers to prevent browser scroll interference.
