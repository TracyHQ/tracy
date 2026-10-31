# Agent tool calling: real daemon boot, local deployment and CMS benchmarks

Date: 2026-10-30. Branch: `perf/agent-tool-calling`. Follow-up to the [bounded page-search benchmark](2026-10-30-agent-tool-calling-batched-search.md).

The native boot blocker is resolved on this machine. The updated site-tools bundle is deployed in an isolated local dsh instance and verified through its real password gateway. Joomla and EmDash have paired measurements through the actual shipped Tracy bundle and vendored AgentLoop, with real CMS HTTP reads.

## Real daemon boot

The original error reproduced: `node-addon-native-custom-loader` could not resolve `node-addon-require-builtin-darwin-arm64`. The optional binary was already installed and loaded successfully when addressed directly. The missing piece was dependency resolution from the loader's own package directory.

The local installation now has a relative symlink from the loader's `node_modules` to the existing optional binary package. This changes ignored installed dependencies only; no vendor source, manifest, lockfile or application code was changed. The repair persists in this installation; a fresh reinstall must be checked again. This is not presented as an upstream package fix.

The actual `node --import tsx scripts/check-boot-graph.ts` gate now passes:

| Profile | Delivered graph entries | Declared Tracy client plugins present |
| --- | ---: | ---: |
| web | 58 | 7/7 |
| native | 75 | 23/23 |

The gate also fetches the graph's JavaScript batches. It starts its own temporary daemons on free ports and leaves existing processes alone.

## Local deployment

The running instance is **`tracy-agent-tools-local`**, image **`tracy/dsh:agent-tools-local`**, front door **http://127.0.0.1:61570**. It is a local candidate on its own ports and state, with standalone password authentication. Its Docker launch sets `MCP_TRACY_FLEET=0` only for this isolated instance; the fleet image default and existing services retain their enforcement.

The existing installation image has the same dsh submodule revision, `626ef50d882b24e25c1675899a67ebfa00f2689a`. The candidate image layers only the site-tools package onto that image. It does not deploy unrelated working-tree changes or replace the shared `tracy-dsh` container/profile. The source image ID, labels and package hash are retained in the [image provenance](2026-10-30-agent-tool-calling-cross-cms/image-provenance.json). This is not an official release of the full current repository.

Verified on the running container:

- Host bundle SHA256: `14d19374f19b9719db99a811fd1a04c168ce943fd3f0a621802a7e72d51a23a8`, identical to the benchmarked bundle and current working tree.
- Initial account setup and login both return 302 through the real password gateway, including its CSRF checks.
- The authenticated page returns 200, contains a graph of **74 entries**, and all **three script batches** return nonempty successful responses through the gateway.
- A headless Chromium login through the same gate renders the workspace chooser with **zero page errors** and graph revision `9538bd3563a2`. No site/provider is configured in this isolated account, so no editable chat session or customer task is claimed. The browser was closed cleanly.
- Container ID, Docker VM PID, start time, image ID and exact ports are in the [deployment verification](2026-10-30-agent-tool-calling-cross-cms/local-deployment.json). The 74-entry image graph differs from the checkout gate's 75-entry graph because the candidate deliberately retains the existing installation's other packages/profile.

The local admin credentials and launch URL are in the private mode-600 file `/tmp/tracy-agent-tools-local-access.json`. They are not committed or copied into evidence. Use its `gate`, `username`, `password` and `launchUrl` values. This instance has its own empty account/provider/site state; it does not inherit another session's credentials or customer workspaces.

A full image rebuild from the repository was also attempted. Debian package downloads stalled for several minutes before the build was cancelled. The deployed image above uses the existing local installation as its base and copies the exact candidate package, avoiding an unrelated dependency rebuild. The cancelled rebuild is not recorded as a successful full build.

## Joomla and EmDash benchmark

Both experiments load the real built AgentLoop, ToolRuntime/ToolRegistry, session store and shipped Tracy bundle. A scripted model issues either four independent supported string searches or one bounded OR search. The CMS data comes from real HTTP reader requests; `walkListing` and `pagesDocument` are production functions. The relay transport is injected. These are product-library integration and CMS workload measurements, not paid-model selection tests or a full authenticated tracy-web-to-CMS end-to-end flow.

Each CMS has twelve pairs, alternating arm order: **24 tasks per CMS**. Every task requests the same four distinct titles and checks that their opaque IDs and paths reach the actual next model request. No artificial delay is injected; all timing samples remain in the raw evidence. A concurrent full-repository gate audit competed for CPU, so timing is descriptive.

Joomla runs Joomla **6.1.4** with the pinned Claude Cowork **0.24.66** package, downloaded from its release and checked against the repository's pinned SHA256. A new disposable site contains 401 fixture articles; the native `content.contract derive` operation builds its mapping, and the page inventory contains 402 addressed records. EmDash uses the local Tracy Business **1.7.23** image with its real SQLite database and 40-language seed. Its Content API identity and a private encryption key are initialized through existing template tools. The measured query selects `locale:en`, whose addressed page inventory contains 43 pages.

| Verified four-title task | Joomla before → after | EmDash before → after |
| --- | --- | --- |
| Verified lookup tasks | 12/12 → 12/12 | 12/12 → 12/12 |
| Tool calls reaching the injected relay | 4 → 1 | 4–5 → 1 |
| HTTP Content API listing reads | 20 → 5 | 4–5 → 1 |
| Native source calls reported by CMS | Not exposed by this reader | 8,108 → 2,027 |
| Model adapter requests, including lifecycle follow-ups | 4 → 4 | 4 → 4 |

| Timing, all final samples | Joomla independent → OR | EmDash independent → OR |
| --- | --- | --- |
| Median | 2.763 s → 3.466 s (+25.4%) | 11.466 s → 3.440 s (−70.0%) |
| p90 | 4.087 s → 4.419 s | 13.162 s → 7.959 s |

Two EmDash independent tasks made a fifth relay/HTTP attempt; their native source-call total remained 8,108. The recorder counts those extra attempts and keeps both timing observations. It did not retain individual response statuses, so it cannot assign an exact cause to those extra attempts. The other ten independent tasks made four calls/reads each.

Joomla's independent tools run concurrently inside the real scheduler. Fewer backend reads therefore do not imply a shorter critical path. This run reduces its CMS work by 75% but does not demonstrate a latency improvement. EmDash's native source workload also falls by 75%; one English read still traverses **2,027 native sources** across the seed before producing its filtered envelope. That is the remaining CMS-reader bottleneck. This iteration does not modify that reader or its cross-language behavior.

### Integrity checks and an initial failed observation

Joomla's article text/title/state/language and menu records have identical hashes before and after the complete 24-task experiment.

The first complete EmDash run returned all requested IDs but **failed** its final aggregate SQLite hash assertion. That failed run is retained in [the initial raw observations](2026-10-30-agent-tool-calling-cross-cms/emdash-initial-integrity-failed.json) and [failure record](2026-10-30-agent-tool-calling-cross-cms/initial-integrity-failure.txt). Because that recorder kept only one aggregate before-hash, it cannot identify which table changed. No unproven housekeeping explanation is assigned to it.

The recorder was then extended to retain hashes per table, plus an explicit content/identity/menu/media/taxonomy/revision subset. A separate diagnostic pair passed with every recorded table unchanged. The complete twelve-pair repeat and its per-table evidence are reported separately below; the initial integrity failure is not silently dropped or relabeled as a pass.

The complete repeat passes the content subset assertion: all `ec_*` entry tables, `_tracy_*` identity tables, revisions, media, taxonomies/content-taxonomy relations and native menu tables keep identical hashes. The full per-table comparison shows three operational tables changed: `options`, `_emdash_revision_prune_queue` and `_emdash_media_usage_cleanup`. No claim is made that the whole SQLite database is unchanged. This distinguishes the final passing content-integrity check from the first failing whole-database check.

## Regression checks and limits

- Six focused real AgentLoop integration cases pass, including platform-specific Joomla/EmDash tool descriptions and WordPress behavior, exact IDs, invalid-array refusal, seat refusal, stable schemas, persisted results and existing scheduler classifications.
- **737** existing Joomla/EmDash, replacement and stopped-write tests pass, zero failures/cancellations/skips. These are regression tests, not 737 real CMS requests.
- The compact-read regression script passes, including its new six-case product-loop step. Test-quality checks pass.
- Targeted oxlint and formatting pass. The runtime source and host bundle are unchanged from the previous optimization; this follow-up adds measurement/test evidence and local deployment.

The full `pnpm build:check` run passed lint, documentation and the early structural checks, then its Turbo input audit ran repository-wide suites. The unrelated WordPress-quickstart task exited 1. That audit was stopped after the failure; its partial run is not a full green gate result. A separate run of the remaining gates excludes lint, the failed/incomplete Turbo audit and the global tests gate; the focused product tests above remain the applicable regression evidence. No gate was loosened and no unrelated source was edited to obtain a green result.

The remaining-gates run completed with one failure: the generated `/ops/api` agent-tool catalogue was stale after the tool-description change. Regenerating it changed only the eight surface descriptions; no action, routing or schema changed. Its `--check` gate and catalogue tests now pass. Every other selected gate passed, including the 23-package/32-build bundle check and real web/native boot. This does not replace the incomplete Turbo audit or unrun global tests gate.

The CMS benchmarks perform reads and compare stored state. They do not establish full Joomla/EmDash write/Undo acceptance or paid-model task quality. The earlier WordPress write/Undo evidence remains in its original report. The local gateway/boot checks establish a running candidate, not a fully configured customer website or production deployment.

## Evidence and reproduction

- [Paired summary](2026-10-30-agent-tool-calling-cross-cms/summary.json)
- [Joomla observations](2026-10-30-agent-tool-calling-cross-cms/joomla.json)
- [Final EmDash observations with table hashes](2026-10-30-agent-tool-calling-cross-cms/emdash.json)
- [Separate EmDash integrity probe](2026-10-30-agent-tool-calling-cross-cms/emdash-integrity-probe.json)
- [Validation record](2026-10-30-agent-tool-calling-cross-cms/validation.txt)
- [Local image provenance](2026-10-30-agent-tool-calling-cross-cms/image-provenance.json) and [deployment verification](2026-10-30-agent-tool-calling-cross-cms/local-deployment.json)

Run `scripts/measure/cross-cms-page-search-bench.mjs --platform joomla|emdash --config <private-config> --repeats 12 --out <directory>`. The config must name the dedicated `toolbench-crosscms-<platform>` container, its loopback HTTP origin and token; Joomla also names its dedicated database container. The script refuses other names/origins, uses no guessed IDs, and requires a complete page inventory. Populate a fresh owned Joomla install with the articles and derive its mapping; initialize a fresh EmDash Business container with the shipped bootstrap and identity tools before measuring. Neither benchmark touches an existing customer site.

`python3 docs/superpowers/plans/2026-10-30-agent-tool-calling-cross-cms/summarize.py` validates complete pair counts, lookup checks and matching content hashes, then regenerates the summary. Percentiles use linear interpolation; no outlier is removed.

Owned benchmark Joomla/EmDash containers, anonymous volumes, network, private credential configs and the temporary EmDash data directory were removed after capture. The healthy `tracy-agent-tools-local` instance remains running, as do all pre-existing services. The cancelled full-build process and the failed broad audit processes started by this turn were stopped; borrowed services were not restarted.
