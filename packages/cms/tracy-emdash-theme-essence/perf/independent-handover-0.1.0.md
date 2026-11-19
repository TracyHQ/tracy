# Independent handover report: JA Essence (tracy-essence 0.1.0)

## What I ran
1. `cd pack && node tools/distribution.mjs verify .`
2. `pack/tools/clean-install.sh /home/agent/out/essence/p11/independent/site 4441` (log: install.log)
3. `curl -s -o /dev/null -w '%{http_code}'` on `/`, `/our-authors`, `/contact`, `/blog`, `/blog/natural-remedies-for-common-ailments-blog-fashion`, `/category/blog`
4. `node tools/configure-smtp.mjs --site http://127.0.0.1:4441 --token-file data/tracy-agent.token --host 127.0.0.1 --port 1025`
   `node tools/admin-session.mjs --site http://127.0.0.1:4441 --email tracy-agent@tracy.ai --out ../admin-state.json`
   post id from `curl .../_emdash/api/content/posts -H "Authorization: Bearer $(cat data/tracy-agent.token)"`
   `node tools/admin-roundtrip.mjs --site ... --storage-state ../admin-state.json --entry /_emdash/admin/content/posts/01M7RMP44FPX5MK5TWY59NK13T --field field-title --public /blog/natural-remedies-for-common-ailments-blog-fashion --out ../roundtrip.json`
5. `node tools/audit.mjs http://127.0.0.1:4441 ../audit-out --config template.config.json`
6. `kill <pid of my entry.mjs>`; `ss -ltn | grep 4441`

## What came out
1. verify: exit 0, status pass, 385 files, errors [].
2. clean-install: exit 0, ~26 s, "clean site ready at http://127.0.0.1:4441", search index posts indexed 51.
3. `/` 200 (title "JA Essence — Home"), `/our-authors` 200, `/contact` 200, post page 200; `/blog` 404, `/category/blog` 404 (see gaps).
4. configure-smtp exit 0 (emdash-smtp selected); admin-session exit 0 "signed-in"; roundtrip exit 0, 7 PASS lines (opened, stamp absent, saved+published, public shows edit, restored+published, stamp gone, field original). Title restored to "Natural Remedies for Common Ailments".
5. audit: exit 0; 108 pages, 108 ok, 91 assets, 0 broken, findings 0; unknown paths 404 as policy says.
6. My server (pid 111299) killed; `ss -ltn` shows 4441 free. Mailpit 1025/8025 untouched. Another site on 4432 (pid 109456, not mine) left alone.

## Where the docs fell short
1. README/install.md say Node >= 22.23.4; I ran Node 24.22.1 and it worked. Not stated whether 24 is supported (minor).
2. `clean-install.sh` needs `rsync` and `lsof`; the docs list neither as a prerequisite (the script checks and dies, but docs omit it). It exited ok here.
3. clean-install.sh leaves the server running in the background (pid only visible via `ss`); the docs never say how to stop it or where its log is (`site/server.log`, pid not recorded). No stop instruction in any doc.
4. The doc names the target as "<new-dir>" but clean-install refuses a target inside any directory with a package.json/astro.config.mjs ancestor; not documented in install.md (only in the script header). A folder under a project would fail.
5. checks-and-recovery.md says to run `pnpm exec playwright install chromium` once; with no network this was not needed (cache existed in ~/.cache/ms-playwright), but nothing says which Chromium revision is expected or that clean-install does not install it. Offline users get no guidance.
6. README says "Public addresses ... `/blog/<slug>`" but gives no example slug; `/blog` and `/category/blog` answer 404, which a reader may take for a failure. No doc lists a real post slug or category term for a smoke test. I had to read the Content API to find one.
7. The roundtrip example requires `<entry id>` obtained by a curl command whose output is a large JSON; no one-liner to extract id and slug; `--public` is the "post's public path" but the mapping from slug to `/blog/<slug>` is only inferable from the README.
8. The roundtrip needs the field id `field-title`; the doc shows it in the example but does not say how to find ids for other fields.
9. `admin-session.mjs --out` path is written relative to the current dir; the docs use `admin-state.json` inside the site folder, which holds an admin session and is not listed as git-ignored or private (the token is described as private, the storage state is not).
10. audit.mjs run takes about 2 minutes (108 pages x 2 viewports); the docs give no expected duration or the expected summary line ("findings 0"), so pass/fail is only inferable from exit code.
11. The Mailpit step: README says "skip this line when a Mailpit already listens"; fine. But configure-smtp output does not say that it needs no email to be sent; and docs never state that the sign-in mail is read automatically by admin-session (a reader may expect a manual link click).
12. AGENTS.md points to `docs/content-api.md` for "safe edits"; I did not need it. README mentions `qa.contract.json`, `DECISIONS.md`, `STATUS.md` as files in the table though they are absent from the package (README says repository only; slightly confusing).

Total gaps: 12 (none blocking; all steps passed).
