# Internal Scripts Guide

This directory contains utility scripts for data ingestion, processing, and maintenance.

## Ingestion & Data Processing

| Script | Responsibility | Usage |
| :--- | :--- | :--- |
| `ingest-natural-earth.ts` | Processes Natural Earth GeoJSON (1:10m) to generate `src/data/countries.ts`. Simplifies polygons and extracts ISO codes for country detection. | `npx tsx scripts/ingest-natural-earth.ts` |
| `build-country-pack.ts` | Generates a PMTiles package for a specific country using local or remote sources. | `npx tsx scripts/build-country-pack.ts [iso_code]` |
| `build-overview-tiles.ts` | Creates low-LOD (5-11) overview tiles in PMTiles format for embedded app storage. | `npx tsx scripts/build-overview-tiles.ts` |
| `pmtiles-writer.ts` | Utility library for writing PMTiles archives with SunTrail-specific optimizations (WebP 90, etc.). | Internal import. |

## Deployment & Monitoring

| Script | Responsibility | Usage |
| :--- | :--- | :--- |
| `upload-to-r2.ts` | Uploads generated PMTiles packs or assets to Cloudflare R2 bucket. | `npx tsx scripts/upload-to-r2.ts [file_path]` |
| `audit_i18n.py` | Audits translation files (`src/i18n/locales/*.json`) for missing keys, extra keys, or encoding issues. | `python scripts/audit_i18n.py` |

## Environment Setup
Most scripts require environment variables (API keys, R2 credentials). Ensure `.env` is populated before running.
- `tsx` is used to run TypeScript scripts directly.
- Python 3.x is required for `audit_i18n.py`.
