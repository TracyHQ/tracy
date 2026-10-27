# @tracy/wo-views

The result views of Website Opportunities, drawn once for two screens: the **Find places** tab of the
plugin `packages/site/tracy-website-opportunities` and the harness page **`/ops/wo`**. The approved
look is `tasks/mockups/wo-find-v2.html`; the API is `tasks/contract-wo-views.md`.

A library, not a plugin: no `cordis.patch.yml`, no build, source exports (`src/index.ts`).

## What it does and does not do

- **Does:** draw `PlaceRow[]` as a results header, kind tabs, a Table/Grid/Map switch, a Columns
  menu, a sortable table (checkbox and Place sticky when it scrolls sideways), grid cards with the
  place's photo, and a map with grade pins that group when zoomed out. Under a 560px container the
  table becomes one column of cards and sorting moves into a select.
- **Does not:** fetch, poll, store anything (`localStorage` included), load the Maps SDK, or import
  dsh. The consumer owns data, state, the photo URLs (`actions.photoUrl` / `photoFallbackUrl`) and
  the loaded `google.maps` namespace (passed as `maps`).

Pure logic lives in `src/model.ts` and `src/map-clusters.ts` (`sortRows`, `filterByKind`,
`kindCounts`, `reasonText`, `websiteSummary`, `clusterPins`, number/distance/time formatting with a
`locale`); `test/model.test.mjs` pins it and checks that `en` holds every key the sources use.

## Wiring a consumer

1. **CSS.** Import `@tracy/wo-views/styles.css` (plain CSS, `.tracy-wo-*` classes, Tracy tokens only,
   no reset) and put the views inside an element with class **`tracy-wo`** — it is the container
   the 560px query measures. Set `data-view="table|grid|map"` on it so the sort select and the
   Columns button follow the view.
2. **Tailwind.** The views use `@tracy/ui` components plus a few utilities, so the consumer's
   Tailwind must scan this package next to `@tracy/ui`:

   ```css
   @source "<relative path>/packages/ui/tracy-wo-views/src";
   ```

   A missing or wrong `@source` fails silently (gate `tailwind-source` only proves the path exists).
3. **`t`.** Every visible string goes through `t(key, params)` with `{name}` placeholders. Merge
   `en` from this package into the consumer's dictionary under the **same keys** (prefixes
   `results.` `cell.` `score.` `kind.` `columns.`); the plugin uses its own namespace
   `tracy-website-opportunities`. Without a locale system, `createTranslate()` gives a `t` over `en`.
   Product names (Google, Facebook, WhatsApp, Zalo, WordPress…) are shown as written, not translated.
4. **`locale`.** Components that print numbers, distances or "2d ago" take an optional `locale`
   (default `en`); pass the interface language.

## Map

`PlacesMap` takes the loaded SDK namespace (`maps`, typed as the slice it calls: `MapsApi`) or
`null`, which shows `unavailableNote`. Grade pins are drawn by this library as advanced markers
when `maps.marker` is loaded **and** a `mapId` is passed; otherwise it falls back to classic
markers labelled with the grade. Grouping is a simple pixel grid below zoom 15 (`clusterPins`), so
`@googlemaps/markerclusterer` is not needed.
