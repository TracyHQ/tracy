# Agent tool optimization: release follow-up

Date: 2026-10-31. Scope: publish owning-repository components, prepare template candidates and land the optimization in Tracy develop. Tracy main and production are excluded by the user.

## Published owning-repository components

| Component | Release | Owning PRs | Verification |
| --- | --- | --- | --- |
| EmDash template toolkit | [v1.5.3](https://github.com/JoomlArt-Products/tracy-emdash-template/releases/tag/v1.5.3) | [#27](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/27), [#28](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/28), both merged | Content API kit: 48 pass, 3 expected skips. Reader source: 7 pass. Imported metadata and reader bytes match the owning repository. |
| Joomla Claude Cowork | [0.24.76](https://github.com/TracyHQ/claude-cowork/releases/tag/joomla-v0.24.76) | [#265](https://github.com/TracyHQ/claude-cowork/pull/265), [#266](https://github.com/TracyHQ/claude-cowork/pull/266), both merged | All GitHub checks passed on each merged head. Full PHP suite: 6,185 passed, zero failed, including the release-version run. Official package downloaded again and installed on the owned local Joomla fixture; authenticated reader returns the complete inventory fingerprint. |

Joomla package SHA256: `33ccc3d910e8e1851e0555187430c01bc6bc93bb3da05d1e6811f1a0c6490da2`.
Release-announcement merge: `ee6c1e0f2b504dce3893c7afd4e10d1093fcae5e`.
[Official package smoke](2026-10-31-agent-tool-release/joomla/official-package-smoke.json).
WordPress requires no separate CMS component release for this change; its optimization is in the Tracy relay and site-tools.

## EmDash template candidates: not activated

The template checkout contains unrelated differences from the published archives. Each reader candidate therefore patches the previously published archive, preserving storefront/dependency files and the scrubbed state byte for byte. The changed-file allowlist and per-file hashes are recorded in patch-evidence.json. Original executable modes are retained. No rolling-release setting or existing versioned asset was overwritten. Repository version metadata remains at the previously released identities until the candidates are accepted; the next-version metadata exists only in the draft packages. This also preserves the release-specific content navigation maps rather than claiming coverage for an unpublished version.

| Template | Candidate | Delivery | Current evidence |
| --- | --- | --- | --- |
| Base | 0.5.7 | [Draft candidate](https://github.com/JoomlArt-Products/joomlart-products/releases/tag/untagged-40616bc141e25c7ed330) | 7 source tests pass; distribution, contract and preflight pass; exact packed Docker image builds and serves the public/admin pages plus authenticated reader. Full template acceptance remains incomplete. |
| Business | 1.7.24 | [Draft candidate](https://github.com/JoomlArt-Products/joomlart-products/releases/tag/untagged-2034fcde0a49d75f2c96) | Same source/static/runtime checks pass. Full template acceptance remains incomplete. |
| SaaS | 1.4.15 | [Draft candidate](https://github.com/JoomlArt-Products/joomlart-products/releases/tag/untagged-499d94d93b4fceedf1f2), release blocked | Source tests pass; canonical role scan finds 103 unresolved findings: 44 auto-convert, 36 manual flags and 23 missing required role reads. No storefront rewrite or acceptance bypass. |

Base image: `sha256:b82e6a1cfa6baa3de15b25007b6e2a91f3c85b0a0e78b1c8308c643eabb79c57`.
Business image: `sha256:098d21d21668dc2d15a9cd701697decdcfcd9ac1d8e785b9651d9372f72b42d9`.
The temporary release fixtures were stopped and removed after smoke. Their images were removed afterwards to recover local disk capacity. The local Tracy candidate and the three benchmark fixtures remain available.

The template [skill](../../../vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/SKILL.md) P8 requires “every gate pass/not-applicable, no pending/blocked”. Consequently, reader smoke alone does not authorize promoting these drafts to accepted releases. Full storefront checks and review receipts remain explicit in VERIFICATION.json. [Independent Base handover](2026-10-31-agent-tool-release/base/independent-handover.md) additionally found stale generated documentation, incomplete install instructions and admin acceptance helpers that omit current confirmation steps. Its complete audit (81 pages and 28 assets), 12 browser smoke cells and actual admin UI publish/revert passed, with a disclosed cached Astro dependency substitution; these results do not establish frozen-lock clean installation or full visual acceptance. Follow-up: [issue #268](https://github.com/TracyHQ/tracy/issues/268).

Evidence: [Base](2026-10-31-agent-tool-release/base/VERIFICATION.json), [Business](2026-10-31-agent-tool-release/business/VERIFICATION.json), [SaaS role scan](2026-10-31-agent-tool-release/saas/design-system-roles.md).

## Tracy verification and delivery

The implementation and all benchmark evidence are on perf/agent-tool-calling. The branch incorporated origin/develop at `df3a136d0c`; no conflict required discarding either line's behavior. The site-tools bundle was rebuilt after the merge. A fresh product-harness smoke after the merge and official Joomla upgrade verifies 15/15 scenarios across all three CMSs ([raw runs](2026-10-31-agent-tool-release/post-merge-smoke/joomla-after.json)); these concurrent release-time runs are functional checks, not new latency comparisons. The compact-read regression passes again on `ed8b7cdfaedaa920d79dfb27078433ea3eac47fc`.

The first full local gate attempt was cancelled after concurrent image builds exhausted the Docker VM disk and its disposable PostgreSQL failed with no space left. This is retained as a failed infrastructure attempt, not counted as green. Only owned release images, individually identified build cache records and the failed invocation's database were removed. Borrowed services were not stopped or altered.

The subsequent complete gate run uses an owned PostgreSQL with tmpfs data, COPYFILE_DISABLE=1 to suppress macOS AppleDouble archive members, and one trace task at a time. Its final outcome is recorded below when complete. No test or gate is skipped to hide a failure.

The refreshed develop baseline contains a stale host test that extracts the live-read Python snippet from webroot-sync.sh. The script now reads JSON from stdin while the test still expects an argv argument. The same mismatch is present in origin/develop. The follow-up changes only the host and web timing tests' extraction and feeds the real snippet through stdin; the existing positive and refusal assertions remain. The host timing case passes (1/1), and the web timing suite passes (8/8). No sync product code was changed by this follow-up.

## Measured optimization and limits

The [acceptance report](2026-10-31-agent-tool-reader-acceptance.md) remains the source of truth for the before/after results: 150/150 reader runs; EmDash 2,027 to 119 native calls over 2,000 byte-identical rows; actual edit/Undo restoration on all three CMSs; 52/54 real streamed-agent attempts verified, with the two misses retained. No production latency or complete model-success claim is made.

No desktop-shell release is needed: desktop uses the shared web surface. Tracy main is unchanged by this work. No production deployment was requested or performed.

## Contribution-policy prerequisite

The complete language check found localized observations in eight immutable raw evidence blobs and five exact Unicode fixture lines. The separate [prerequisite PR #269](https://github.com/TracyHQ/tracy/pull/269) is needed because the validator reads exceptions from the trusted base; the data PR cannot authorize itself. Exact blob/line identities retain the measured text without a blanket language exemption.

The full publication scanner reports 49 blocking findings on origin/develop and 87 on the optimization head before the prerequisite policy. The 38 new hits are reviewed false positives: 16 occurrences of SHA256 of the empty JSON array in integrity table digests, 20 opaque public Content API IDs also present in captured tool responses, and two occurrences of a demo address in a recorded test name. The prerequisite adds only exact paths and value hashes, plus the exact demo-address match. Re-evaluating the scanner delta under that policy leaves zero new blocking findings. The baseline 49 are outside this optimization and remain unresolved; the repository is not claimed publication-clean. [Delta review](2026-10-31-agent-tool-release/publication-delta-review.json).
