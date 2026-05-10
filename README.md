# Schuss

Explore European ski resorts on an interactive 3D terrain map. Search by name, see pistes and lifts plotted from OpenSkiMap, toggle 2D / 3D, drop your location with a skier marker, and save favorites.

Built with Next.js 16 (App Router, Turbopack) and MapLibre GL.

## Run locally

```bash
bun install
bun run dev
```

Open http://localhost:3000.

The first run needs the resort dataset:

```bash
bun run scripts/build-resort-data.ts
```

This produces `resorts.json` (gitignored) and `public/resorts/{slug}.json` files.

## Refresh data selectively

The build script accepts phase flags so you don't have to re-download everything:

```bash
bun run scripts/build-resort-data.ts                 # all phases
bun run scripts/build-resort-data.ts --geojson       # only re-download per-resort GeoJSONs
bun run scripts/build-resort-data.ts --index         # only rebuild resorts.json
bun run scripts/build-resort-data.ts --images        # only fill missing image URLs
bun run scripts/build-resort-data.ts --images --refresh   # also overwrite existing images
```

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **MapLibre GL 4.x** + Carto Dark Matter style
- **Tailwind CSS 4**
- **Bun** as the package manager and ETL runtime
- **TypeScript** with strict-type-checked ESLint
- **OpenSkiMap** as the data source for ski areas, runs, and lifts
- **Wikipedia / Wikidata** for hero images

## Data sources & credits

- Map © [OpenFreeMap](https://openfreemap.org) & [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Terrain DEM © Mapzen / AWS Open Data
- Pistes & lifts © [OpenSkiMap](https://openskimap.org)
- Hero images © Wikipedia / Wikimedia Commons
