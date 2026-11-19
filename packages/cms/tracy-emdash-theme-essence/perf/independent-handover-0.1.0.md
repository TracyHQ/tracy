<!-- Saved verbatim by the coordinating session from the text the independent reviewer agent returned (the harness refuses file writes from subagents). Reviewer: a fresh Sonnet agent given only the packed folder (pack 21) and its docs, 2026-11-19. -->
# Independent handover report: JA Essence (tracy-essence 0.1.0)

## What I ran
1. `node tools/distribution.mjs verify .` (from the pack): exit 0.
2. `tools/clean-install.sh <work folder>/site 4441` (output redirected to a log): exit 0, about 30 s.
3. Content API reads with the agent token (`/_emdash/api/content/{posts,pages,authors,category_info}`), plus `curl` of the public pages: all fine.
4. `node tools/configure-smtp.mjs --site http://127.0.0.1:4441 --token-file data/tracy-agent.token --host 127.0.0.1 --port 1025`: exit 0 (the existing Mailpit on 1025/8025 was used).
5. `node tools/admin-session.mjs --site http://127.0.0.1:4441 --email tracy-agent@tracy.ai --out admin-state.json`: exit 0, "signed-in".
6. `node tools/admin-roundtrip.mjs --site ... --storage-state admin-state.json --entry /_emdash/admin/content/posts/01M7T00QNP5FJD9EDHGEKW0PRK --field field-title --public /blog/natural-remedies-for-common-ailments-blog-fashion --out roundtrip.json`: exit 0.
7. `node tools/audit.mjs http://127.0.0.1:4441 ../audit-out --config template.config.json`: exit 0.
8. `kill 70389` (my server only); `ss -ltn` shows 4441 free; 4431 and 1025 untouched.

## What came out
- Verify: `status pass`, 391 files, no errors, artifactHash sha256:a2ac8e0d…2e44a8.
- Clean install: preflight, copy, `pnpm install --frozen-lockfile`, build, start, first-run seed, media (162 ops), forms (4 ops) and search index (51 posts) completed with no conflicts; "clean site ready".
- Smoke test: 200 for `/`, `/our-authors`, `/contact`, `/search?q=remedies`, a `/blog/<slug>` post, `/category/blog-fashion` and its `?page=2`, `/category/resources`, `/tag/health`, `/author/adrian-perez`; 404 with the 404 view for `/nope` and `/category/blog-health/x`; 404 for the guessed terms `/category/fashion` and `/tag/fashion` (the real terms are `blog-fashion`, `blog-design`, `blog-health`, `resources`, `resources-2` and tags `design`, `health`, `lifestyle`, `technology`).
- Content API: the 3 pages (home, our-authors, contact) are published; post paths are `/blog/<slug>`, as the README says.
- Admin round trip: all 7 steps PASS; `roundtrip.json` has `status pass` and an empty `failed` list.
- Audit: 108 pages, 108 ok, 91 assets with 0 broken, 0 findings; the 404 probes `/does-not-exist`, `/404` and `/blog/nope` returned 404.
- Server stopped, 4441 free.

## Where the docs fell short
1. Not blocking: nothing tells you where to find real category, tag and author slugs; tag terms have no listing endpoint. A short list of example public URLs would help.
2. Not blocking: the install docs never say that post `path` fields are `/blog/<slug>` or that the entry id is the ULID from the API list (only a `curl` hint in `checks-and-recovery.md`).
3. Not blocking: `clean-install.sh` does not print the server PID or say how to stop it.
4. Not blocking: the docs do not say that `clean-install.sh` needs network access for fonts at build time (the script prints it).
5. Not blocking: the docs do not say that `clean-install.sh` leaves a running server that outlives the command.
6. Not blocking: the docs use port 4361 and say to skip the Mailpit `docker run` if one listens; nothing says an existing Mailpit's mail mixes with other sites' mail.

Total gaps: 6 (none blocking)
