<!-- Saved verbatim by the coordinating session from the text the independent reviewer agent returned (the harness refused the agent's own file write). Reviewer: a fresh Sonnet agent given only the packed folder (pack 18) and its docs, 2026-11-19. -->
# Independent handover report: JA Essence (tracy-essence 0.1.0)

## What I ran
Only README.md, AGENTS.md and docs/*.md of the pack were used as instructions.
1. `node tools/distribution.mjs verify .` from the pack: exit 0.
2. `tools/clean-install.sh <evidence-dir>/p18/independent/site2 4441` (new, empty target): exit 0, about 28 s. It ran install, build, start, seed, media, forms and the search index.
3. Content API reads with the agent token (`/_emdash/api/content/{posts,pages,authors,category_info}`, `/_emdash/api/taxonomies/tag/terms`) to find real slugs.
4. `curl` smoke test of 14 public paths.
5. `node tools/configure-smtp.mjs --site http://127.0.0.1:4441 --token-file data/tracy-agent.token --host 127.0.0.1 --port 1025`: exit 0. I used the existing Mailpit and did not start another.
6. `node tools/admin-session.mjs --site http://127.0.0.1:4441 --email tracy-agent@tracy.ai --out admin-state.json`: exit 0, status signed-in. Playwright's Chromium was already usable, so I did not install it.
7. `node tools/admin-roundtrip.mjs --site ... --storage-state admin-state.json --entry /_emdash/admin/content/posts/01M7SC26B2N6H00CKXMJ139HAN --field field-title --public /blog/natural-remedies-for-common-ailments-blog-fashion --out roundtrip.json`: exit 0.
8. `node tools/audit.mjs http://127.0.0.1:4441 ../audit-out --config template.config.json`: exit 0.
9. Killed my own server (pid 42804, `node ./dist/server/entry.mjs`). `ss -ltn` shows 4441 free. The existing Mailpit on 1025/8025 is untouched.

## What came out
- Verify: `status pass`, 390 files, no errors. Artifact hash sha256:b12630997b899626da2446dd0f339af3c64b3d2cb953f0d0c76bb6165730042d.
- Clean install: the site came up on :4441. The schema was seeded, 162 media ops ran, 4 form ops ran, and 51 posts were indexed for search.
- Content API: 51 posts, 3 pages (`home`, `our-authors`, `contact`), 9 authors, 8 `category_info` entries. All were published. The posts' `path` field is `/blog/<slug>`.
- Smoke test results:
  - 200: `/`, `/blog/natural-remedies-for-common-ailments-blog-fashion`, `/blog/essential-nutrients-for-optimal-health-blog-health`, `/category/blog-fashion`, `/category/resources`, `/category/blog-health?page=2`, `/tag/health`, `/author/shelia-ortiz`, `/our-authors`, `/contact`, `/search?q=health`.
  - 404 with the 404 view ("Page not found"): `/nope-xyz`. Also `/category/fashion` and `/tag/fashion`, which were guessed terms and not real slugs.
- Admin round trip: all 7 steps PASS (open editor, save and publish an edit, see it on the public page, restore, confirm the original). The post title was restored to "Natural Remedies for Common Ailments".
- Audit: complete. 108 pages, 108 ok (all indexable), 91 assets with 0 broken, 0 findings. The 404 probes `/does-not-exist`, `/404` and `/blog/nope` returned 404 as expected. Output is in `<evidence-dir>/p18/independent/audit-out/audit.json` and `audit.md`.
- Server stopped, port 4441 free.

## Where the docs fell short
1. Not blocking. The docs describe `/category/<term>` and `/tag/<term>` but never say where the real term slugs come from. The category slugs are those of the `category_info` collection (`blog-fashion`, `resources`, ...), and they differ from the labels ("Fashion"). I guessed `/category/fashion` and got a 404, then found the real slugs through the API.
2. Not blocking. `docs/content-api.md` says a post's path is `/<category>/<slug>`. The installed site serves posts at `/blog/<slug>`, which is what the README says. The two docs disagree.
3. Not blocking. The admin round trip needs an entry id and the post's public path. The docs give a `curl` that lists posts, but they do not say the public path is in `data.path`. Nothing says how to pull the id and path out of the JSON (I used `node -e`). The `curl` also did not show `limit` or paging.
4. Not blocking. `clean-install.sh` leaves the server running. The docs do not say how to stop it, or that the process is `node ./dist/server/entry.mjs` and not a child of your shell. A reader has to find the pid on the port themselves.
5. Not blocking. `docs/checks-and-recovery.md` says the audit and the round trip need Playwright's Chromium, installed once with `pnpm exec playwright install chromium`. `clean-install.sh` does not do this and does not say so in its output. It worked here only because a browser was already available. A clean machine may fail at that step.

Total gaps: 5
