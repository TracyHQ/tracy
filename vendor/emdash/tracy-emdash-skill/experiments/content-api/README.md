> Historical feasibility probe only. The pathname helper below is NOT the SSR integration. Current scalar reader lives in `skills/tracy-emdash-template/scripts/tools/content-api/`; identity findings are in `IDENTITY.md`.

# P4 Content API — native auth probe, not yet an adapter

Upstream base: `74f08df563a3327e0dbddca8d0c878a5933250d7`.
Branch `codex/content-api-emdash`, worktree `/tmp/tracy-emdash-content-api`.
TCH source measured: `1e724aad20c3be7df82aebf9e5e59db87e0a6aa2`, Business 1.4.3,
EmDash npm 0.38.0 / Astro 7.0.0 / Node 24.11.1.

**P4 NOT YET MET.** The experiment folder is not part of `scripts/tools`, and new-template does not copy it.
Do not release it or use it as a Content API capability. The helper calls runtime initialization and then
native auth explicitly, because a public route does not receive the full runtime/auth from the default
middleware. The callback probe calls the authorized native detail route; it does not read the DB to bypass permissions.

Reproduce only on a separately bootstrapped trial copy of Business (never a customer site):

1. Create a TCH worktree from exactly the SHA above, read the package AGENTS/README and install the standalone dependencies
   with `pnpm install --frozen-lockfile` in `packages/cms/tracy-emdash-theme-business`.
2. Copy `native-auth.mjs` to `tools/content-api-native-auth.mjs` and `probe-route.ts` to
   `src/pages/content.json.ts` **only in the trial copy**; confirm there is no existing content.json route/file
   that must be kept. This is not a collision preflight meant for the product.
3. Confirm the port is free, run `pnpm exec astro dev --host 127.0.0.1 --port 4387`.
   First-run setup per the README, save the PAT to `data/tracy-agent.token` mode 0600; do not print the token.
4. From the Business root, run `node <experiment-path>/runtime-probe.mjs
   http://127.0.0.1:4387 data/tracy-agent.token <new-evidence-folder>`.
   The script deliberately accepts only loopback, edits/publishes the trial site's social repeater, and finally restores the values
   to what they were before the test through the native API. It is not a journal-revert check.
5. Remove the two temporarily copied files, stop exactly the daemon just started; do not commit generated typegen or data.

Ran: 17 native runtime assertions. Full evidence is in the TCH worktree at
`tasks/evidence/content-api-emdash/`; the PAT is not in the capture.

Blocker I01/B01: the native repeater returns rows without identity. REST keeps the auto-added `_key`, but the admin
`RepeaterField.tsx` in 0.38 calls `stripKeys` before onChange, so that approach does not keep identity through the editor.
Need to try another metadata namespace + the native lifecycle (create/migration, duplicate, delete/recreate,
draft/live). No conclusion yet that core must change; no admin UI roundtrip done yet for the alternative.
Do not generate IDs from the index or a value hash, and do not change schema v1 to dodge the requirement.

No v1 mapping/reader, registry/cursor/snapshot, locale/media/shared graph or bounded payload yet.
The probe response deliberately has `schemaVersion: null`; the shared validator rejects it. Do not accept P4 runtime from
these 17 assertions. No TCH transport/bundle to merge. Nothing committed/pushed/released/deployed.
