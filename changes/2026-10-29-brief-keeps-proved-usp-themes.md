- **Keep proved USP themes when freezing a business reading into a site brief, and explain unavailable themes** — Akemi · #189 · `feat/brief-build-own-site` · 2026-10-29

**Affects:** Brief builds for every CMS and trade. Proved review themes, reading version, model and input hash survive the brief projection. Missing model proposals, rejected themes, held review evidence, legacy cached readings and rule fallbacks carry a null theme value with a reason instead of silently omitting the field. The two-review evidence gate is unchanged.
