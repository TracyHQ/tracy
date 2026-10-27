# The build contract — how parallel agents stop overwriting each other

## The problem this exists to solve

`build-subagents.md` §C already stops agents writing the same FILE: each owns a distinct path, and
shared files are merged on the spine. That is necessary and it is not sufficient, because CSS is not
scoped by file. Two agents writing two different files still write into **one cascade**, and the
cascade has no idea they were meant to be independent.

Three collisions from a single real build, none of which touched a shared file:

| What happened | How it looked |
|---|---|
| Three ACM builders each set `padding-block: var(--tpl-band-y)` on their own block, and the row wrapper already had it | Every band double-padded. Each agent's CSS was correct in isolation. |
| Two agents both defined `.tpl-field` | The second definition silently broke the first one's login form. Neither file mentions the other. |
| One agent read a spec line about containment and changed a fixture's raised shadow to a ring | The card "improved" away from the design it was copying. Caught only by the fixture diff. |

The common shape: **an agent made a locally correct decision about a shared surface it could not
see.** No file conflict, no merge conflict, no error. The fix is not more isolation — it is a small
written record of what has already been claimed, that every agent reads before writing and appends
to after.

## The file

`build-docs/build-contract.json`, next to the design-spec artifact. It is written by the spine
before dispatch, read by every builder, and **appended to via the agent's RETURN** — builders do
not write it directly, for the same reason they do not write `_all.scss`.

```json
{
  "prefix": "tracyapple",
  "owns": {
    "band-rhythm": {
      "owner": "spine",
      "element": ".tracyapple-band > .container",
      "property": "padding-block",
      "note": "Band rhythm belongs to the ROW. A block that sets its own padding-block double-pads."
    },
    "tracyapple-field": {
      "owner": "t4-override-builder:com_users",
      "element": ".tracyapple-field",
      "note": "Form field shell. Claimed 2026-09-09. Do not redefine; extend with a modifier class."
    }
  },
  "tokens": {
    "--tracyapple-band-y": { "owner": "spine", "value": "var(--section-y-desktop)" },
    "--tracyapple-capsule": { "owner": "spine", "value": "var(--radius-pill)" }
  },
  "fixture-overrides": []
}
```

Four sections, each answering a question an agent would otherwise answer by guessing:

- **`prefix`** — the one class prefix. An agent that invents a second prefix has forked the design
  system without saying so.
- **`owns`** — every shared selector that already has an owner, and the property that owner
  controls. An agent that needs to touch one **returns a request**; it does not write.
- **`tokens`** — every custom property the template has declared, with its value. This is what stops
  two agents inventing `--tpl-card-radius` and `--tpl-radius-card` for the same number.
- **`fixture-overrides`** — the list of places where the build KNOWINGLY departs from the fixture,
  each with a reason. Empty is the correct starting state, and it should stay nearly empty. An entry
  here is how a deliberate departure survives the next review instead of being "fixed" back.

## The rules

1. **Read the contract before writing any CSS.** It is short by design.
2. **A selector in `owns` is not yours.** Need it changed? Return the request with the reason; the
   spine decides and merges once.
3. **A new shared selector gets returned, not written.** "Shared" means: anything not scoped inside
   your one block's `.acm-<block>` / your one override's view.
4. **Rhythm, spacing between sections, and page-level padding belong to the ROW, never to a block.**
   This is the single most repeated collision, so it is a standing rule rather than an entry.
5. **Reuse a token before declaring one.** If the value you need exists under another name, use that
   name and say so in your return.
6. **A departure from the fixture is a `fixture-overrides` entry or it is a bug.** See
   `t4-acm-block-builder`: when the fixture DOM and the design-spec prose disagree, the fixture
   wins, and disagreeing with it is the spine's decision.

## What it does not do

It does not prevent a genuine cascade surprise — a compiled Bootstrap rule, or T4's runtime-generated
per-style sheet loading after `template.css`, will still outrank a correct declaration. That class of
defect belongs to `references/gotchas.md` and to the review scanners. The contract's job is narrower
and worth doing on its own: **stop agents from surprising each other.**
