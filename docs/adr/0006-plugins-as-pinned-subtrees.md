# 0006 — Plugins enter Tracy as a subtree pinned to a commit, not through a live GitHub path

- Status: accepted (binding)
- Date: 2026-09-02
- Decided by: Brian
- Related: [`0004`](0004-dsh-is-the-shell.md) (dsh is the shell) · [`0002`](0002-removed-upstream-assumptions.md)
  (the list to re-check every time dsh moves to a new version) · `CLAUDE.md` RULE #1 (the registry is the only
  way out of the tree) and RULE #5 (`vendor/` is other people's code)
- Enforced in: `vendor/` · `.gitmodules` · `scripts/check-self-contained.ts`
- Source: Brian, Telegram 02/09/2026

## Context

dsh is not an application with features built in. `vendor/tracy/deepseek-harness/README.md` states it right at line
7: an **everything-is-a-plugin** architecture, running on Cordis. The core is a socket; everything visible
— sidebar, Settings, sign-in, translations — is a plugin.

That decides **what Tracy sells**. Brian, 02/09: *"Whatever plugin you guys like to write, just
write it, then we pick and preinstall them into the dsh build on `cowork.tracy.ai` and it goes live"*, and
*"picture it like the CMS quickstart at JoomlArt: we preinstall the modules and components, then the customer
comes in and uses it right away"*. The product is not new software — it is **a dsh build with a selected
set of plugins preinstalled and tuned to fit together**.

Brian calls the people who write plugins **vendors** — plugin suppliers for Tracy. Each plugin is **an
independent GitHub repo**, not a folder in this repo. Two sources to find them:

| Source | What it is |
|---|---|
| [`dshfind.com/en/plugins`](https://dshfind.com/en/plugins) | An external catalogue that scans every GitHub repo tagged with the `dsh-plugin` topic, synced daily |
| [`dshmarket.com`](https://dshmarket.com/) | A market **inside** dsh: browse, search, one-click install, mostly without a restart. Nearly 3000 plugins |

The `dsh-plugin` topic convention belongs to dsh itself, not a convention Tracy made up:
`vendor/tracy/deepseek-harness/CONTRIBUTING.md` line 15 tells plugin authors to add that topic so others can
find them.

The remaining question — and the reason for this ADR — is **by which path a vendor's plugin enters the tree**.

## Decision

### 1. Tracy's features are plugins, not core patches

To make Tracy do something, write a plugin that plugs into dsh. Do not modify the dsh core to add features.
This follows directly from the everything-is-a-plugin architecture, and it is the condition for [`0004`](0004-dsh-is-the-shell.md)
to hold: dsh can only be the shell when what Tracy adds is a removable plugin.

### 2. Plugins enter the tree as a **subtree pinned to exactly one commit**

Brian, 02/09: *"still subtree"*, and he explained: *"import it, but only at one specific commit
of the repo; if that repo changes and has new commits, it still doesn't affect the version we settled on"*.

The current shape of `vendor/`: **one submodule** (`deepseek-harness`, pointing to
`TracyHQ/tch-vendor-deepseek-harness`) and **eleven subtrees** (`dsh-passwords`, `dsh-better-locale`,
`dsh-better-sidebar`, `dsh-locale-vi`, `od-design-system`, `od-skill`, `od-brand-engine`, since 06/09
`mattpocock-skills` pinned to tag `v1.2.3` — replacing `dsh-mattpocock-skills-deck`, which stood here from 05/09
to 06/09 and was then removed because its issue board was unusable, `tasks/todo-go-deck.md` — since 10/09
`joomlart-t4-skill`, the T4 template-building skill set pinned to commit `2691a82aa` (`v1.1.0`) — **its home
moved on 14/09 from `JoomlArt-26/joomlart-template-plugin` to `JoomlArt-Products/tracy-joomla-template`,
and it stopped being a fork: fix it in the new repo and then pull it in; its `IMPORT-NOTE.md` keeps that rule** — and also since 10/09
`emdash` and `emdash-theme-bravada`, see the two items just below; since 14/09 `tracy-emdash-skill` pinned to `v1.0.5`
(`2d2ee74`) — **Tracy's own** EmDash template-building skill, home at `JoomlArt-Products/tracy-emdash-template`,
previously a skill of this repo under `.agents/skills/`). All eleven really live in the tree — `git ls-files vendor/tracy/od-design-system`
returns 8037 files — so one `git clone` gets everything, regardless of whether anyone's repo is still alive.

⚠ **`emdash` is the FIRST subtree that is not code running in dsh, and misreading its kind means misunderstanding this whole
section.** `emdash-cms/emdash` pinned to tag `emdash@0.37.0` (commit `fc87efeb1d`, 4152 files, 67 MB,
MIT) is **the CMS the customer site runs on** — in the same class as WordPress and Joomla, not the same class as
`dsh-passwords`. So the two familiar sentences of this section do not apply: there is no `-tracy.N` patch (the fleet
builds the image by cloning a tag on the droplet — `provision/emdash/build-image.sh` says outright *"Tracy
does not fork, does not patch"*), and it is **not** a pnpm workspace member. It enters the tree so it can be **read in
place**: the question *"does upstream still have the Dockerfile line our script patches"* used to be answerable
only by an image build on the droplet. Details, how to move to a new version, and where it must NOT go:
`vendor/emdash/emdash/IMPORT-NOTE.md`.

⚠ **`emdash-theme-bravada` is the second exception, and in the OPPOSITE direction: Tracy EDITS this tree.** Lee
decided on 10/09 — Tracy's EmDash template forks from `vhscom/emdash-theme-bravada` `v0.10.0` (commit
`f39df8784`, 545 files, 33.75 MB, of which 31.89 MB are CC0/CC BY demo images). Same shape as
`dsh-passwords`: edit in place, bump `-tracy.N`, and it **must be brought within the gates' reach** (`check-language`
only scans `['packages', 'workers', 'vendor/tracy/dsh-passwords/src']`).
🔒 It is **GPL-3.0-or-later**, so Tracy's derivative is GPL too, and building
`@tracy/cms-sections` (`UNLICENSED`) into it is a **licensing** decision, not a technical one —
settle it before the first section goes in. Details: `vendor/emdash/emdash-theme-bravada/IMPORT-NOTE.md`.

⚠ **`joomlart-t4-skill` carries 63 MB of binaries, and that is a deliberate choice.** Its `assets/`
holds a full Joomla 6 + T4 build (59 MB), the Akeeba Backup package (3.5 MB) and Kickstart (0.4 MB) — Phase 0
unpacks the first file into a clean site to build the template on, Phase 10 uses the other two.

The first import left them out because blobs in git history are permanent. That argument is right but lacked a
measurement: this repo's `.git` was **already 1.0 GB** at the time, so 63 MB is **+6%**. And Phase 0 is the skill's *first*
step, so a missing zip is not a failure on a rare branch — it fails at the very first command. A
toolset imported to be fixed that cannot run cannot be fixed.

🔒 That T4 file is **JoomlArt commercial software**, and the restriction is in the zip's *archive comment*,
not in `LICENSE.txt` — `LICENSE.txt` is Joomla core's GPLv2 sitting in the same archive; reading
it as a right to redistribute is a misreading. TCH is private so this is valid here; **do not put this tree
in a public repo**. Details and how to check it yourself: `vendor/joomla/joomlart-t4-skill/IMPORT-NOTE.md`.

### 3. No dependency points at **live GitHub**

`github:owner/repo`, `git+https://`, `git+ssh://` are banned in every `package.json` in the tree.
Brian: *"because we have to lock a version to install — if it runs straight from GitHub and the owner of that GitHub
repo updates to a new version, it can break the DSH in tch"*.

This is **the same principle** as the existing RULE #1 (*"a version number, not a path"*),
only on a different axis: RULE #1 blocks the **sideways** way out (pointing at another tree on the same machine), this rule blocks
the way out **along time** (pointing at someone else's latest version). Both fail the same way:
perfect today, broken on a day we did not choose, because of a change we did not see.

### 4. Moving dsh to a new version or pulling a new subtree is **a verified task**, not routine maintenance

Brian: *"for example when dsh goes up a version, we also need to verify whether the new upgrade installed onto
the version the customer is using kills Tracy or not"*.

Pinning a commit does not remove the risk, it **moves the risk to a time we choose**. The price is paid at unpin
time. [`0002`](0002-removed-upstream-assumptions.md) is the most expensive evidence: dsh jumping `rc.2 →
alpha.1` exposed five assumptions of `dsh-passwords`, each appearing only after the previous one was removed,
and all five failed **silently or at the wrong address**. The list to re-check is already in that ADR.

### 5. Pick up first, write later

Brian: *"Just install them, then whichever fits, modify it further to match what we need"*.
Before writing a new plugin, look on `dshmarket.com` and `dshfind.com` to see whether someone has already done it. If so,
try installing it; if it fits, pull it into a subtree and then modify it along RULE #5's path (publish `-tracy.N`, do not edit in
place and forget upstream).

## Consequences

- **RULE #5 does not change.** The sentence *"these vendors are entirely independent repos on GitHub, Tracy
  only calls GitHub and installs"* is about **where a plugin is born**, not about how it enters the tree.
  Two different layers: the source is GitHub, the import path is a subtree.
- **`CLAUDE.md` has had its number fixed:** the `vendor/` map line said *"the other three are subtrees"* from when
  `vendor/` had four folders, then became *"six"* on 02/09, then drifted again when the deck came in on 05/09.
  Since 05/09 that line **no longer counts** and points to the list in §2 — a number copied in two places is a
  number that will drift.
- **One-click install from `dshmarket.com` is for SURVEYING, not a path into the product.** Install it on a
  local profile to see whether the plugin is worth it; what goes into the customer's quickstart set must go through a
  subtree pinned to a commit. ⚠ **This is the agent's reading, not yet confirmed word for word with Brian** — his
  two sentences (*"just install them"* and *"have to lock a version"*) can only be reconciled this way, but he
  has not said it out loud. Once confirmed, remove this ⚠ mark.
- **Machines now catch rule #3 above — patched 02/09, Issue #9.** Before that
  `scripts/check-self-contained.ts` only declared `BAD_SPECIFIER` (blocking `link:` `file:` `portal:` and
  absolute paths), so exactly what Brian worried about — a dependency pointing at live GitHub — slipped through the gate
  and CI stayed green. Now the gate also has `LIVE_REMOTE`, blocking `github:` `gitlab:` `bitbucket:` `git+`
  `git://` and bare `http(s)://` URLs, with its own message: a live path is not a "path
  on disk", and the reader needs to know it fails in a different way.
  `scripts/test/self-contained-specifier.test.ts` pins both axes, plus the `~18.3.1` case — a tilde semver range
  must keep passing, because banning it by mistake pushes authors to caret, i.e. the safety gate would
  loosen versions instead.

## Options considered and rejected

**Install straight from GitHub at run time** (`"dsh-plugin-x": "github:V1ki/dsh-plugin-x"`, or let dsh pull
from the market on the customer's machine). Rejected, and this is the option Brian turned down outright. It turns **every time a repo owner
pushes a commit** into a Tracy release to customers — triggered by an outsider, at a time no one
at Tracy knows, and without passing any gate of this repo. A copy pinned to a commit costs tree space and
effort to pull new versions; in return, the moment of change is chosen by Tracy.

**Copy the vendor code straight into `packages/` and treat it as our own.** Rejected. It also locks the version,
but it cuts the path back to upstream: no more `git subtree pull`, no more diff to answer the question
*"where does our version differ from the original"*, and the author's security patches have to be copied by hand. RULE #5 keeps
exactly that boundary — if you modify it, publish `-tracy.N`, do not swallow other people's code.
