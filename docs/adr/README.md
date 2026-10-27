# TCH ADRs

TCH's **own** decision series — Tracy's root repo on dsh. Numbered from 0001, **unrelated** to the
series of `tracy-infra` or `tracy-docs`.

This series started late: TCH's first decision was originally written with the number `0008`,
because it continued the series `tracy-infra` was in the middle of. Renumbered to `0001` on
2026-08-30. The reason is not aesthetic: `tracy-infra` will write its own `0008`, and then two files
with different content would carry the same number — every "see ADR 0008" in the two repos becomes
ambiguous, and there is no way to detect it by machine.

## Rules

1. **Decisions about TCH are written HERE.** Plugin architecture, the boundary with dsh, bundle
   shape, the release path, gates. No longer written over in `tracy-infra`.
2. **Decisions about cross-repo contracts still belong elsewhere.** The seat ledger API that
   `tracy-desk` and the component on the customer site both call, the fleet protocol, the label
   standard — those live in `tracy-docs`. How to tell: if changing it breaks a repo that TCH cannot
   build, then it is not TCH's decision.
3. **This file keeps the inheritance register.** The §Inheritance section below lists the
   `tracy-infra` ADRs that still bind in TCH. An agent working here only needs to read this folder,
   without digging into another repo.
4. **Status `(binding)` means code must comply — a violation is a bug**, not a suggestion.
5. File name: `NNNN-short-english-slug.md` (lowercase English words joined by `-`, a short slug of the
   title). The next number is the largest number in the folder plus one; never reuse the number of a withdrawn ADR.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-seat-door-and-enforcement-boundary.md) | Seat door: the seat ledger says who gets what, the lane only enforces | (binding) |
| [0002](0002-removed-upstream-assumptions.md) | Five assumptions of `dsh-passwords` that were removed, and why | (binding) |
| [0003](0003-one-sign-in-door.md) | One sign-in door, and one rule for the return path | (binding) |
| [0004](0004-dsh-is-the-shell.md) | dsh is the shell, and sites follow the user | (binding) |
| [0005](0005-one-otp-email-path.md) | One email path: magic link retired, the six-digit code remains | (binding) |
| [0006](0006-plugins-as-pinned-subtrees.md) | Plugins come in as subtrees pinned to a commit, not through a live GitHub path | (binding) |
| [0007](0007-tracy-skin-through-ctx-theme.md) | Tracy's skin goes through `ctx.theme`, not through a `<style>` tag | (binding) |
| [0008](0008-mode-config-ships-in-the-image.md) | Mode configuration is tuned by Tracy, and reaches customers through the image | (binding) |
| [0009](0009-one-dsh-version-published-by-tracy.md) | One dsh version for the whole system, and Tracy publishes that tree itself | (binding) — **§2–§5 superseded by 0014** |
| [0010](0010-design-inspiration.md) | "Design inspiration": the customer-facing name and the machine name of the 152-design-system feature | (binding) |
| [0011](0011-public-design-inspiration-page.md) | Public Design inspiration page: one codebase, two surfaces; typing a domain changes the text, two-beat brand | (binding) |
| [0012](0012-design-systems-served-from-one-place.md) | 152 design systems served from one place: static files of the public page, dsh reads over HTTP and caches by commit, the image is the fallback | (binding) |
| [0013](0013-community-brand-store.md) | The community brand store is a public repo, the two fleet hosts are copies; category computed at read time; `?source=community` on the page | (binding) |
| [0014](0014-one-dsh-per-host-commands-in-web-container.md) | One dsh per host, and agent commands run in the site's web container | (binding) — **formerly `0010`, then `0012`; renumbered 08/09** |
| [0015](0015-feature-pack-is-the-toggle-unit.md) | The feature pack is the unit customers switch on and off, not the page | (binding) |
| [0016](0016-two-layer-source-contract.md) | Two-tier source contract: one neutral source description, one compiler per CMS | (binding) |
| [0017](0017-github-release-is-quickstart-source-of-truth.md) | The GitHub release is the source of truth for a quickstart, and it declares itself with `tracy_setting.json` | (binding) |
| [0018](0018-fleet-bar-does-not-guard-the-door.md) | Fleet bar does not guard the door: it proxies, injects the badge, vouches for identity — it does not decide who may read a site | (binding) |
| [0019](0019-badge-served-from-tracy-web.md) | The badge is served from tracy-web, configured in `badge_setting`; the team edits it at `/ops/widget`, no free-form CSS | (binding) |
| [0020](0020-emdash-content-only-fence.md) | Fence for EmDash sites built from a quickstart: three layers (lane allowlist · code ownership · template middleware) | **Superseded by 0022** (Lee did not approve, 26/09) |
| [0021](0021-one-content-api-for-three-cms.md) | A unified Content API for the three CMSs | Implemented 28/09 through the `content.read` relay on all three CMSs (before that: unified direction, runtime not implemented) |
| [0022](0022-quickstart-contract-is-advice.md) | The quickstart contract is advice, not a lock: a quickstart site only refuses direct database writes | (binding) |
| [0023](0023-site-bound-to-a-design-system.md) | A site is bound to a named design system: the profile names the system, the site folder records the system it wears, checked by value, warnings only | (binding) |
| [0024](0024-backup-is-a-complete-restore-point.md) | A backup is a complete restore point (files + database), replacing the Release concept for customers | Proposed — waiting on Brian |
| [0025](0025-close-comment-on-write-evidence.md) | Tracy closes a comment when there is evidence of a write (the `answered_at` mark of the latest send), and only then; report at the end of the turn; "Ask Tracy to edit all" does not re-tick what was already sent — reverses the stage 6 rule | (binding) |
| [0026](0026-inbox-and-email-notifications.md) | Inbox + email notifications only for person-to-person work (team, comments); the server writes them, email in the recipient's language, no notifications for agent work | (binding) |
| [0027](0027-dsh-passwords-upstream-base-tracy-policy-layer.md) | `dsh-passwords`: upstream as the base, Tracy as a policy layer | (binding) |
| [0028](0028-viewer-editor-owner-roles.md) | Three roles: Viewer, Editor, Owner; drop the role → custom toolset matrix | (binding) |
| [0029](0029-template-customization-question-readiness.md) | Template Customization Question Readiness checker: static check, /ops scores, a skill for admins to fix; no CI gate | (binding) |
| [0030](0030-desktop-is-a-shell-around-the-web.md) | Desktop is the shell of the web: features are built on the web first, the app gets them for free; never cut web features to push app installs; a `Web and desktop` section in the PR description | (binding) |
| [0031](0031-template-design-system-readiness.md) | Template Design System Readiness (TDSR) checker: static check, /ops scores it as the Design system step, the `tdsr` skill fixes; a missing slot contract only warns | (binding) |
| [0032](0032-workspace-rename-keeps-letter-case.md) | Relabel Workspace in its original casing; keep lowercase workspace and technical identifiers | (binding) |
| [0033](0033-voice-chat-stt-agent-tts.md) | Voice conversation: chain STT → agent → TTS, one voice switch, Chat or Voice for each chat | (binding) |
| [0034](0034-ask-before-consequential-change.md) | Ask the customer before a consequential change (hiding, site-wide, from 6 places, price), at the door, for every channel; the shell asks rather than locks | (binding) |
| [0036](0036-website-opportunities-independent-public-repo.md) | Website Opportunities is an independent public repo (Apache-2.0): library + bin, one codebase, Tracy is the builder adapter and the default hub of the shared research store | (binding) |
| [0037](0037-place-profile-is-template-independent.md) | The place profile is sourced facts, independent of the template (`place-profile` 1.0, coverage, slot roles attached at packaging time, wording written at build time); a slot missing facts keeps the full template layout | (binding) — **decision 5 superseded by 0038** |
| [0038](0038-slot-roles-live-in-content-map.md) | Slot roles live on each slot of the content map; the Road to live checks them under Content coverage; released contracts are never edited | (binding) |

## Inheritance — `tracy-infra` ADRs still binding here

TCH split off from work in progress in `tracy-infra`, so some decisions were already in force before
this repo existed. They are **not** copied as TCH ADRs — copying creates two versions that can drift
apart. They are listed here with where to read them.

Paths into the other repo are deliberately written as **text, not links**: a relative cross-repo
link only resolves when the two repos sit side by side in `TracyHQ/` — it breaks in every worktree,
and it is exactly the disk-layout dependency that `scripts/check-self-contained.ts` exists to forbid.
(Measured: the first version of this table used links, and `check-doc-links` caught all six on its
very first run.) The binding content is summarised in the middle column so the table still reads
without the other repo.

| ADR in `tracy-infra` | What it binds in TCH | Where it shows in TCH |
|---|---|---|
| **0002** — access model | Membership tiers and agent policy that the seat door enforces | `docs/adr/0001` §Context |
| **0003** — guest/bot lane | `dsh-passwords` is the load-bearing dependency of the seat door; TCH keeps the `-tracy.N` version in the tree | `vendor/tracy/dsh-passwords/` (bundle `tracy-guest` deleted 06/09 — guest is a **role** in the host's dsh, [`0014`](0014-one-dsh-per-host-commands-in-web-container.md) §1) |
| **0004** — multilingual | The i18n boundary: which namespaces belong to dsh, which to Tracy | `packages/locale/tracy-locale-vi`, [`docs/references/i18n.md`](../references/i18n.md) |
| **0005** — fleet | The fleet is `tracy-infra`'s business; TCH only ships plugins that run on it | `packages/fleet/tracy-fleet-operation` |
| **0006** — dsh/Worker boundary | "One customer" (dsh) and "many customers" (Worker) — TCH is on the first side | `docs/adr/0001` §Related |
| **0007** — dsh alpha.1 + private registry | ~~The only way out is the registry~~ — **no longer binding since 06/09**, see the ⚠ block right below | `.npmrc`, `pnpm-workspace.yaml`, `scripts/check-self-contained.ts` |

⚠ **0007 IS DEAD ON BOTH HALVES, and each half was killed by a different TCH ADR.** Written as a
table because this is the only row in the inheritance register that no longer binds anything:

| Half of `tracy-infra` 0007 | Killed by | What it is now |
|---|---|---|
| "each surface **picks its own** dsh version" | [`0009`](0009-one-dsh-version-published-by-tracy.md) §1 (05/09) | one dsh version for the whole system |
| "the only way out is the **registry**" | [`0014`](0014-one-dsh-per-host-commands-in-web-container.md) §6 (06/09) | **npmjs or workspace** — `@deepseek-ai/*` lives in this tree (`CLAUDE.md` RULE #1) |

When reading 0007, read both of these with it; wherever the three disagree, **the higher number wins**.

Those ADRs live in `tracy-infra/docs/adr/` when both repos are present in `TracyHQ/`.
