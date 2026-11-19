<!-- Saved verbatim by the coordinating session from the text the independent reviewer agent returned (the harness refuses file writes from subagents). Reviewer: a fresh Sonnet agent given only the packed folder (pack 19) and its docs, 2026-11-19. -->
# Independent handover report: JA Essence (tracy-essence 0.1.0)

## What I ran
1. `node tools/distribution.mjs verify .` (from the pack) — exit 0.
2. `tools/clean-install.sh <evidence-dir>/p19/independent/site 4441` — exit 0, about 29 s.
3. Content API reads with `curl` and the agent token (posts, authors, category_info), then `curl` on 12 public paths — all exit 0.
4. `node tools/configure-smtp.mjs --site http://127.0.0.1:4441 --token-file data/tracy-agent.token --host 127.0.0.1 --port 1025` — exit 0.
5. `node tools/admin-session.mjs --site http://127.0.0.1:4441 --email tracy-agent@tracy.ai --out admin-state.json` — exit 0.
6. `node tools/admin-roundtrip.mjs --site ... --storage-state admin-state.json --entry /_emdash/admin/content/posts/01M7SXDH5DZ7S0M887NY5WKK3N --field field-title --public /blog/natural-remedies-for-common-ailments-blog-fashion --out roundtrip.json` — exit 0.
7. `node tools/audit.mjs http://127.0.0.1:4441 <audit-out> --config template.config.json` — exit 0.
8. `kill 34608` (my server, the only listener on 4441), then `ss -ltn`.

## What came out
- Verify: `status pass`, 390 files, no errors. Artifact hash sha256:1849b01f…c902.
- Clean install: preflight passed; copied the source, installed, built, started the server and bootstrapped; listening on 127.0.0.1:4441. Seed receipts: schema, content (76 ops), media (162 ops) and forms (4 ops), all with 0 conflicts; the search index covered 51 posts; "clean site ready".
- Content API slugs: posts `natural-remedies-for-common-ailments-blog-fashion`, `fitness-tips-for-a-healthy-lifestyle-blog-fashion`, `essential-nutrients-for-optimal-health-blog-health`; authors `shelia-ortiz`, `adrian-perez`; category pages `resources`, `resources-2`, `blog-normal-design`.
- Public smoke test: `/`, two `/blog/<slug>` posts, `/category/blog-fashion`, `/category/blog-fashion?page=2`, `/tag/health`, `/author/shelia-ortiz`, `/our-authors`, `/contact`, `/search?q=health` all 200; `/nope-xyz` 404 with the 404 view. `/category/fashion` and `/category/health` returned 404 (guessed terms; the real terms came from the Home page links).
- SMTP: provider selected and settings saved. Admin session: `signed-in` through the existing Mailpit.
- Round trip: all 7 steps PASS (editor opened, edited text published and shown on the public page, restore published and the stamp gone, field back to the original value).
- Audit: `complete: true`, 108 pages with 108 ok, 91 assets with 0 broken, 0 findings, viewports 1440 and 390. The three unknown paths answered 404 as expected.
- Server killed; 4441 free; Mailpit untouched; no pack file modified.

## Where the docs fell short
1. The category term slugs are not listed anywhere. README says `/category/<term>` and `/tag/<term>`, but the real terms (`blog-fashion`, `blog-health`, `blog-design`, `blog-normal-*`, `resources`) are not named; terms like `fashion` give 404. Not blocking.
2. The docs do not say that `clean-install.sh` leaves the server running in the background, nor where its PID or log is; stopping it means finding the PID with `ss -ltnp`. Not blocking.
3. The `admin-roundtrip.mjs` example does not say that the entry id is the ULID and not the slug (`content-api.md` explains it), nor that the `--public` path is the post's `data.path` (`/blog/<slug>`). Not blocking.
4. The docs do not say whether `admin-session.mjs` needs the SMTP step first (it does): a minor ordering note.
5. The Content API example in `checks-and-recovery.md` is a bare `curl` with no `limit` and no `jq`; it prints a very large JSON and does not suggest how to extract `id` and `slug`. Not blocking.

Total gaps: 5 (none blocking)
