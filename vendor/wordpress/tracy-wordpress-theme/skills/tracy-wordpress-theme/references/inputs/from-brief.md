# Brief — no visual source

Use this adapter when the input is an authored design brief and there is no site, HTML export, URL or
image to compare. Write the facts and page copy in JSON; the adapter creates the same seedable
spec-pack used by the other inputs.

## Author the brief

```json
{
  "site": { "title": "Northstar", "tagline": "Find your next direction", "locale": "en" },
  "palette": {
    "light": { "primary": "#2457a7", "secondary": "#e4ad50", "body_bg": "#ffffff", "text": "#182338" },
    "dark": { "primary": "#8bb6ff", "secondary": "#f0c878", "body_bg": "#101827", "text": "#edf2fa" }
  },
  "fonts": { "body": "Source Sans 3", "heading": "Fraunces" },
  "voice": ["Direct, warm, and specific."],
  "rules": [
    { "id": "body-type", "category": "typography", "selector": "body", "styles": { "1440-light": { "fontFamily": "Source Sans 3" }, "390-light": { "fontFamily": "Source Sans 3" }, "1440-dark": { "fontFamily": "Source Sans 3" }, "390-dark": { "fontFamily": "Source Sans 3" } } },
    { "id": "body-color", "category": "color", "selector": "body", "styles": { "1440-light": { "color": "#182338" }, "390-light": { "color": "#182338" }, "1440-dark": { "color": "#edf2fa" }, "390-dark": { "color": "#edf2fa" } } },
    { "id": "main-width", "category": "layout", "selector": "main", "styles": { "1440-light": { "maxWidth": "72rem" }, "390-light": { "maxWidth": "100%" }, "1440-dark": { "maxWidth": "72rem" }, "390-dark": { "maxWidth": "100%" } } },
    { "id": "primary-button", "category": "component", "selector": ".wp-block-button__link", "styles": { "1440-light": { "borderRadius": "0.5rem" }, "390-light": { "borderRadius": "0.5rem" }, "1440-dark": { "borderRadius": "0.5rem" }, "390-dark": { "borderRadius": "0.5rem" } } }
  ],
  "coverage": [{ "selector": "main", "properties": ["color", "fontFamily"] }],
  "pages": [
    { "path": "/", "view": "front-page", "title": "Northstar", "rules": ["body-type", "body-color", "main-width", "primary-button"], "requiredRules": ["body-type", "body-color"], "sections": [
      { "type": "hero", "title": "Start here", "content": "<h2>Make your next move</h2><p>Specific brief copy.</p>" }
    ] }
  ],
  "menus": [
    { "menutype": "primary", "title": "Primary", "region": "header", "items": [
      { "label": "Home", "url": "/" }
    ] }
  ]
}
```

`site.title`, `site.tagline`, `site.locale`, both complete palettes, both font names, a nonempty
`voice` list, at least one authored `rules` entry in each of `typography`, `color`, `layout`, and
`component`, `coverage`, each page's `path`, `view`, `title`, `rules`, `requiredRules`, and nonempty
`sections`, every section's `type` and HTML `content`, and each menu's `menutype`, `title`, `region`
and `items` are required. Rules use the design-contract shape `{id, category, selector, styles}`.
`styles` must provide authored CSS values for each of `1440-light`, `390-light`, `1440-dark`, and
`390-dark`; the adapter copies them without defaults. `coverage` uses the design-contract
`{selector, properties}` shape. Page `rules` and `requiredRules` name the authored rules that apply
to that page. Menu items and children each require a `label` and site-path `url`. Missing or invalid
facts are reported together; the adapter does not fill them in. Section HTML is converted with the
same HTML-to-blocks converter as `from-html`, and section records use its `sections.json` schema.

## Generate and validate

```bash
node scripts/ingest/from-brief.mjs brief.json --out <spec-pack> --scope website
node scripts/ingest/spec-pack.mjs --validate <spec-pack>
```

The adapter writes `page-map.json`, `reference.json` (`kind: none`), `provenance.json`,
`content.json`, `sections.json`, `menus.json`, `redirects.json`, both contracts and `design-spec.md`.
The default scope is `template`, matching `from-html`, and applies the 12-page template floor. Use
`--scope website` for a specifically authored smaller website set; it validates the listed pages
without that template floor. `--scope` accepts `template` or `website`. `--page-floor N` adjusts the
floor for template scope. The resulting `content.json` routes page, single, and archive views into
the same page/post/archive structures as `from-html`; `seed.mjs` reads those records.

## QA status

Visual QA, interaction and preflight bind every typed source-side not-applicable entry to the spec.
Site sweep keeps target invariants live (including overflow, scheme state, visible/reachable controls,
focus appearance and first interaction) and records source comparisons as not-applicable. Round runs
the sweep for brief packs, and first and patch releases require complete, validated sweep evidence;
target failures and unread measurements still refuse release.
