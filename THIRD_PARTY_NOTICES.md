# Third-party materials

ElRusty is an independent, unofficial community tool. It is not affiliated with or endorsed by Facepunch Studios.

## Rust artwork and item metadata

Rust, its item images, names, descriptions and associated game material belong to Facepunch Studios and their respective rights holders. Their inclusion does **not** place them under this repository's MIT license or grant additional rights to redistribute or commercially exploit them.

`public/items/*.webp` and `src/data/items.json` are a snapshot extracted from the installed Rust client's `Bundles/items` folder. The import script converts images to 128-pixel WebP previews. `src/data/provenance.json` records the generation date. Ten internal/generic item records without images are omitted from this searchable snapshot.

To update from your own installation: `node scripts/import-game-assets.mjs "<Rust>/Bundles/items"` after dependency installation. Keep this notice with redistributions. Contact the repository maintainer with any rights or removal request.

## References

- Component documentation: https://wiki.rustclash.com/group=electrical
- Industrial system: https://rust.facepunch.com/news/industrial-update
- Filter min/buffer changes: https://commits.facepunch.com/r/rust_reboot/main/industrial/inverse
- Item format: https://wiki.facepunch.com/rust/Items_Overview
- Background reference: https://www.rustrician.io/handbook/
- Filter UX reference: https://rustconveyorfilters.com/filters

These services are references; their application code has not been copied into ElRusty.

## Software

React (MIT), React Flow / xyflow (MIT), Zustand (MIT), Dexie (Apache-2.0), Lucide (ISC), Vite (MIT), TypeScript (Apache-2.0), Vitest (MIT), Playwright (Apache-2.0), Sharp (Apache-2.0). Their respective license texts remain in their distributed packages. DM Sans and Space Grotesk are bundled locally via Fontsource and are licensed under the SIL Open Font License. Their license notices are included in the corresponding npm packages.
