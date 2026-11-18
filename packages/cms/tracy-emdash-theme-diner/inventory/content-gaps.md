# Content gaps — JA Diner

| Code | What | Evidence | Handling |
|---|---|---|---|
| G-01 | Image alt text is missing everywhere in the source (`alt=""`). | `seed/media-map.json` items, `alt: ""` | Left empty; never invented. |
| G-02 | `templates/system/css/system.css` answers 404 on 52 pages of the source; three glyphicons/fontawesome svg references are unresolved. | `inventory/assets.json` unresolved 58 | Source defect, not ported. |
| G-03 | The newsletter module (AcyMailing, id 127) is a third-party extension. | `spec/page-map.json` section-bottom 127 | Becomes a form on the forms plugin (P5). Subscriber storage is not invented. |
| G-04 | Post bodies keep text only: `img`, `figure`, `figcaption`, `span`, `small`, `cite` are dropped by the HTML → Portable Text step. | `ingest/html-to-portable-text.mjs` output `droppedTags` | Pictures of an article are its cover; inline pictures recorded as a gap to check in P5. |
| G-05 | Several ACM image fields lose their folder in the model (`item-1.jpg` exists in `blog/`, `features/`, `slideshow/`). | `build-media-map` first run: 10 missing | Resolved by collection folder in `ingest/build-media-map.mjs`. |
| G-06 | `happyhours.hp_link_text` is typed `url` by the adapter although it holds a label. | `seed/site-model.json` type `happyhours` | To check in P2 follow-up; the label is rendered as text. |
| G-07 | The model has no `route.view` / `type` for pages. | `site-model.json` routes | Routes come from `inventory/routes.json`. |
| G-08 | Source posts are served at `/index.php/our-blog/<cat-id>-<cat>/<id>-<slug>`; the port serves `/<category>/<slug>`. | `inventory/routes.json` source.url | Deliberate, as for the sibling theme. |
