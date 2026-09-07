# Internal Scripts Guide (v5.88)

This directory contains utility scripts for data ingestion, processing, and maintenance.

## Ingestion & Data Processing

| Script | Responsibility | Usage |
| :--- | :--- | :--- |
| `ingest-natural-earth.ts` | Processes Natural Earth GeoJSON (1:10m) to generate `src/data/countries.ts`. Simplifies polygons and extracts ISO codes for country detection. | `npx tsx scripts/ingest-natural-earth.ts` |
| `build-country-pack.ts` | Generates a PMTiles package for a country or region. Natural Earth polygon filter (conservative). Cache .raw format (re-encode without re-download). | `npx tsx scripts/build-country-pack.ts --pack <id> --maptiler-key <key>` |
| `build-overview-tiles.ts` | Creates low-LOD (5-11) overview tiles in PMTiles format for embedded app storage. | `npx tsx scripts/build-overview-tiles.ts` |
| `pmtiles-writer.ts` | Utility library for writing PMTiles archives with SunTrail-specific optimizations (WebP 90, etc.). | Internal import. |
| `generate-guidance-parity.ts` | Regenerates the TypeScript golden file replayed by the native Java matcher tests. Review the diff before accepting a threshold change. | `npx tsx scripts/generate-guidance-parity.ts` |

## Deployment & Monitoring

| Script | Responsibility | Usage |
| :--- | :--- | :--- |
| `upload-to-r2.ts` | Uploads generated PMTiles packs or assets to Cloudflare R2 bucket. | `npx tsx scripts/upload-to-r2.ts [file_path]` |
| `audit_i18n.py` | Audits translation files (`src/i18n/locales/*.json`) for missing keys, extra keys, or encoding issues. | `python scripts/audit_i18n.py` |
| `check-bundle-budget.mjs` | Checks the production PWA precache against the configured size budget. Run after `npm run build`. | `node scripts/check-bundle-budget.mjs` |
| `check-capacitor-assets.mjs` | Rejects missing assets and absolute GitHub Pages URLs before Capacitor sync. | `node scripts/check-capacitor-assets.mjs` |

## Environment Setup
Most scripts require environment variables (API keys, R2 credentials). Ensure `.env` is populated before running.
- `tsx` is used to run TypeScript scripts directly.
- Python 3.x is required for `audit_i18n.py`.
- `upload-to-r2.ts` changes external state and requires explicit authorization; generating or
  checking an archive does not authorize an upload.
