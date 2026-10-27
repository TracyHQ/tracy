# 0009 — One dsh version for the whole system, and Tracy publishes that tree itself

> ⚠ **2026-09-06 — THE SECOND HALF OF THIS ADR HAS BEEN RETIRED; read it together with [`0014`](0014-one-dsh-per-host-commands-in-web-container.md).**
> §1 ("one dsh version for the whole system") **is still binding**, only the enforcement changes: `@deepseek-ai/*` are
> **pnpm workspace members** in `vendor/tracy/deepseek-harness`, so "one version" is one source tree rather
> than a sequence of release numbers. §2–§5 (publishing 248 packages ourselves to `npm.tracy.ai`, `overrides`
> must be empty, the `check-image-lock` gate) **are no longer in effect**: the private registry, the `npm-registry` Worker,
> `scripts/release.ts` and that gate were all deleted the same day. The text below is kept unchanged — it records the
> 05/09 decision and its reasons, and history is not rewritten.

- Status: accepted (binding) — **§2–§5 superseded by [`0014`](0014-one-dsh-per-host-commands-in-web-container.md) on 06/09**
- Date: 2026-09-05
- Decided by: Lee ("publish it ourselves")
- Related: [`0006`](0006-plugins-as-pinned-subtrees.md) (other people's code enters through a
  pinned path, not a live one) · [`0008`](0008-mode-config-ships-in-the-image.md)
  (the release path to customers is the image) · `tracy-infra` ADR 0007 §version choice — **this ADR supersedes that section**
- Enforced in: `infra/registry/` · `.npmrc` · `packages/fleet/tracy-fleet-operation/dsh/`
  (`Dockerfile`, `IMAGE_TAG`, `install/pnpm-lock.yaml`) · `scripts/check-image-lock.ts` ·
  `vendor/tracy/deepseek-harness` branch `tracy`

## Context

`tracy-infra` ADR 0007 allowed **each surface to choose its own dsh version**. That was right while Tracy was still
a few loose pieces. It stopped being right once the profile, the lane image and the plugins all had to fit together: three dsh versions
in one system are three sets of APIs, and the breakage comes not at build time but when a lane happens to install the mismatched version.

Lee settled on **one dsh version for the whole system** on 30/08 (`tasks/todo-tch-greenfield.md`). That decision
lived for four months as a convention in people's heads, and it leaked out at one measurable spot: the image
manifest carried **8 `overrides` lines** pinning individual packages to different `-tracy.N` versions. Those eight lines are exactly
where "one version" was broken, written down as configuration.

By 05/09 the conflict became a hard block. The source tree stood at `dsh-v0.1.3-alpha.1`, but **upstream only
tagged it and published no package**: the latest version on npmjs was still `0.1.2-rc.1`. Lanes install packages from the
registry, not from the source tree — so the version Tracy had merged, fixed and measured **had no way
to reach customers**. Waiting for upstream to publish would hand Tracy's ship schedule to someone else.

## Decision

1. **One dsh version for the whole system.** Profile, bundles, plugins and the lane image share one number. No
   surface chooses its own version.
2. **Tracy publishes the whole fork tree itself to a private registry**, without waiting for upstream. The `tracy` branch of
   `vendor/tracy/deepseek-harness` is where releases happen: bump **all** packages carrying the base version to
   `<upstream version>-tracy.N`, publish to `npm.tracy.ai` with the dist-tag `tracy`.
3. **The whole tree, not individual packages.** Fixing one package means republishing all 248 packages at the next number. One
   round that raises `N` for everything is more expensive in bandwidth and cheaper in everything else.
4. **`overrides` in the image manifest are zero.** One override line means rule #1 has just been
   broken; the `check-image-lock` gate reads that straight from the lockfile.
5. **Packages outside the dsh tree do not follow this rule.** The 9 `cordis`/`schemastery` packages upstream has
   published on npmjs — proxied, not bumped, no suffix.

## Consequences

- Tracy's ship schedule no longer depends on upstream's release schedule. In return, Tracy takes on the release
  work: every base upgrade is a bump + publish of 248 packages, not a `pnpm install`.
- **`check-image-lock` no longer needs an exception list.** Before: 231 packages + 8 overrides had to be read by
  eye. After: 231 packages, one version, and every deviation is red.
- The `-tracy.N` suffix is **Tracy's version on top of upstream**, not a one-off patch. Read
  `0.1.3-alpha.1-tracy.1` as "base `0.1.3-alpha.1`, Tracy's first release round".
- ⚠ **`-tracy.N` packages are prereleases under semver**, so a range `^0.1.2-rc.1` CAN STILL pick
  `0.1.2-rc.1-tracy.1`. That is where an old version slips into the lockfile without anyone seeing: the range matches, the install
  runs, and only the version-counting gate catches it. Upgrading the base means scanning the dependency ranges too, not only
  the keys pinned by number.

## Cost paid (measured 05/09)

- **Three image builds failed, all three reporting the wrong place.** The install step in the Dockerfile is the step that mounts the registry
  secret, so every `pnpm install` error showed up as `secret registry_password is required`. The
  secret was right all along. The real cause: `fs-ext` had not been approved to build, and then `node:24-slim` had no
  Python for `node-gyp`. The image now carries `python3 make g++`, and that is mandatory — `0.1.3` locks session
  writes with `flock(2)`, loaded at import time; a missing binding means the lane dies, not that it slows down.
- **The lane path is not a convention.** The sample lane keeps its env in `dsh-home-alpha/`, so a
  `*/dsh-home/*` loop missed it, and the symptom was a 404 with a perfectly healthy container. Scan with
  `find -name dsh-passwords.env`.

## Options considered and rejected

- **Wait for upstream to publish `0.1.3`.** The cheapest, and rejected because it puts Tracy's ship schedule in
  someone else's hands — no date, no commitment.
- **Publish only the packages Tracy has modified.** Less work per round, but it gives birth to exactly what was just removed:
  a tree with many versions, and an override list to maintain.
- **Roll the source tree back to `0.1.2-rc.1`.** Throws away a merge that was already paid for, and keeps the problem for next time.
