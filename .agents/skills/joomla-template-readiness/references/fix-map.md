# Stop codes: the verdict codes this skill does not fix

The fix of every verdict code lives in one place, the fix registry
(`apps/tracy-web/src/lib/template-readiness/fixes.js`), and the verdict JSON carries it as `fix` under each piece that
is not `done`. This page lists only the codes whose fix needs a person or another repository's release: on one of them
the run stops (SKILL.md section 5) instead of running the registry's fix.

`QC` is the `quickstart-contract` skill.

Where a fix lands decides the version: a fix in the template source or the pack is a **template release** (the next
quickstart version, `QC` section 7b step 3 and lesson 7c "the pack shape must match"); a fix in a Tracy tool is a
**tool fix** (test first, same PR); a fix in the contract, kit or pin is committed beside the contract.

| Piece | Code or case | Why it stops |
|---|---|---|
| contract | `coverage-holes` (and the other `coverage-*` codes) with a hole of class `unknown` | `QC` section 7b step 5: a person reads the evidence |
| cowork-pin | `cowork-release-needed` | No released plugin has `params.missing`: a claude-cowork release is needed. Name the doors |
| cowork-pin | `customize-*` on rule STAB-1, when no released plugin carries the release's contract | A claude-cowork release is needed (`QC` section 8 steps 2 to 4 are another repository's release) |

`kit-not-approved` and `kit-approval-stale` are not stops, but the loop skips them: the approval is recorded at green
([`green.md`](green.md)).
