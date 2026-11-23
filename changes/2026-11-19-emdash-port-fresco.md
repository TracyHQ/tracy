- **JA Fresco is ported to an EmDash template (`packages/cms/tracy-emdash-theme-fresco`, id `tracy-fresco`, 0.1.0, release cut locally, kit approved, nothing published)** — Hano (EmDash templates) · #739 · `feat/emdash-port-fresco` · 2026-11-19
  **Affects:** EmDash template authors and the CI that holds them: `scripts/check-emdash-kit-sync.ts` now also checks `tracy-emdash-theme-fresco` against the kit (level, 139 identical files). Nobody sees the template in Add site until it is released as `tracy-fresco/emdash-0.x`; no Tracy road row (`quickstart-render-map.json`, `template-profiles.json`, `emdash-tool.js`) exists yet for it, that comes with the release.

  **Regression:** `tests/regression/cases/REG-PR-739-emdash-fresco-0-1-0.json`.
