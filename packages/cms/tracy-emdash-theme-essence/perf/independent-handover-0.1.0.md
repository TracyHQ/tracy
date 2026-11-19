<!-- Saved verbatim by the coordinating session from the text the independent reviewer agent returned (the harness refuses file writes from subagents). Reviewer: a fresh Sonnet agent given only the packed folder (pack 23) and its docs, 2026-11-19. -->
# Independent handover report: JA Essence (tracy-essence 0.1.0)

## What I ran
1. `node tools/distribution.mjs verify .` from the pack. Exit 0.
2. `bash tools/clean-install.sh <work folder>/site 4441`, logged to `<work folder>/install.log`. Exit 0, about 28 s. It ended with "clean site ready at http://127.0.0.1:4441". Mailpit was already listening on 1025 and 8025, and I did not start another.
3. Read content with the agent token through `/_emdash/api/content/<collection>`. Curled `/`, two posts, a category, a tag, an author, `/our-authors`, `/contact`, `/search?q=remedies` and an unknown path. All as expected.
4. `node tools/configure-smtp.mjs ...` with `--host 127.0.0.1 --port 1025`.
   - First attempt, run from `<work folder>` with the pack's tool path: exit 2, "no from address: set mail.fromEmail in the template config or pass --from".
   - Re-run from the installed site folder: exit 0. The `emdash-smtp` plugin was selected exclusively for `email:deliver`.
5. `node tools/admin-session.mjs --site http://127.0.0.1:4441 --email tracy-agent@tracy.ai --out <work folder>/admin-state.json`.
   - First attempt, run from `<work folder>` with the pack's tool path: exit 1, `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright' imported from <pack>/tools/qa-browser.mjs`.
   - Re-run from the installed site folder: exit 0, `status: signed-in`.
   - The `localhost` fallback was not needed. The sign-in link was found with `127.0.0.1`.
6. `node tools/admin-roundtrip.mjs --site <origin> --storage-state admin-state.json --entry /_emdash/admin/content/posts/01M7TSY68D7C2GM7GQ7PWY8P61 --field field-title --public /blog/natural-remedies-for-common-ailments-blog-fashion --out roundtrip.json`. Exit 0. The entry id came from the Content API, as `docs/checks-and-recovery.md` says.
7. `node tools/audit.mjs http://127.0.0.1:4441 <work folder>/audit-out --config template.config.json`. Exit 0.
8. Stopped my server with `kill 13761`. I found the pid with `ss`, and it was the process listening on 4441. Port 4441 is now free. Mailpit is still running on 1025 and 8025.

## What came out
- **Verify:** `status pass`, 391 files, 0 errors. artifactHash `sha256:e1618f6854e3...`, contractHash `sha256:4ea0f339063c...`.
- **Seed counts:** 8 collections, 85 fields, 14 taxonomy terms, 14 menu items. Content was 76 entries created (`entries.total` 76, same 76, missing/changed/editor/conflicts/drafts all 0). Media was 96 of 96 uploaded.
  - Per collection through the Content API: posts 51, pages 3, authors 9, category_info 8, gallery 1, social 2, contact 1, chrome 1. These sum to 76.
  - The search index reported `indexed: 51` for posts.
- **Page statuses (all 200 unless stated):**
  - `/` 200, titled "JA Essence — Home".
  - `/blog/natural-remedies-for-common-ailments-blog-fashion` 200.
  - `/blog/fitness-tips-for-a-healthy-lifestyle-blog-fashion` 200.
  - `/category/blog-fashion` 200, and `?page=2` 200.
  - `/tag/health` 200.
  - `/author/adrian-perez` 200.
  - `/our-authors` 200.
  - `/contact` 200, titled "We’d love to hear from you".
  - `/search?q=remedies` 200, and the result page contains the remedies post.
  - `/nothing-here` 404, titled "Page not found — JA Essence".
- **Roundtrip:** 7 steps, all PASS.
  - Editor opened with the field; the original value was "Natural Remedies for Common Ailments".
  - Public page had no stamp before the edit.
  - Saved and published from the admin UI.
  - Public page showed the edited text.
  - Restored and published.
  - Stamp gone from the public page.
  - Field back to the original value.
- **Audit:** `complete: true`, 108 pages, 108 ok, all 108 indexable. Assets 91, broken 0. Findings 0. Viewports 1440 and 390. Unknown paths `/does-not-exist`, `/404` and `/blog/nope` all returned 404.

## Where the docs fell short
1. Not blocking, but it cost two failed runs. The docs say to run tools "from the package root" or "site folder", but the examples never say that this means the installed site folder from `clean-install.sh`. The pack has no `node_modules`, so `admin-session.mjs` fails with `Cannot find package 'playwright'` when run from the pack or from any other folder. `configure-smtp.mjs` also reads `template.config.json` from the current directory and fails with "no from address" elsewhere. Say that every tool must run from inside the installed site folder, with `data/` and `template.config.json` relative to it.
2. Not blocking. The docs mention `pnpm exec playwright install chromium` once, in `checks-and-recovery.md`. They do not say whether `clean-install.sh` already installs Chromium. In this environment the browser tools worked without my installing anything, so it is unclear whether Chromium was already present or the install script fetched it.
3. Not blocking. The instructions and docs warn about a `localhost` versus `127.0.0.1` sign-in link host. It did not occur here. The README does not say when it would happen, so a recipient cannot tell whether to expect it.
4. Not blocking. The README does not say where `clean-install.sh` leaves its logs (`build.log`, `install.log` and `server.log` inside the site folder). It also does not give the server pid or say how to stop the server cleanly. There is no stop command, so the recipient has to use `ss` and `kill`.
5. Not blocking. The category, tag and author slugs for spot checks are not listed. I found them from the links on a post page. The Content API entries carry a `path` field only for posts and pages, not for authors or `category_info`. The docs do not say that the public category and tag slugs come from taxonomy terms. One example of each in the README would help.
6. Not blocking. The README does not name the exact post and entry-id lookup for the roundtrip step. The recipient has to read `checks-and-recovery.md` for the curl line that lists entry ids.

Total gaps: 6 (0 blocking, 6 not blocking)
