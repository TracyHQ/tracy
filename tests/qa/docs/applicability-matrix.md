# Applicability matrix — edge tags per item kind

Source of the tag list: `tests/qa/inventory/edge-tags.json` (verbatim from plan §3). Real item counts: `tests/qa/inventory/inventory.json`. Each layer declares its obligations in `tests/qa/layers/<layer>/denominator.json`; `build.mjs` merges them into `inventory.json`.

## The four states of an (item × tag)

| State | Meaning | Condition | Counts as PASS? |
|---|---|---|---|
| **REQUIRED** | The tag is required for this item and must have a case | Default for every tag of the item kind | Only when the matching case PASSes with a RED proof |
| **N-A** | The tag does not apply to the item | Needs a **reason + source** proving it (`na.<tag>` in the denominator); `build.mjs` refuses one without either | Not counted as PASS |
| **WAIVED** | Someone with authority accepts not checking it this round | Needs an approver, a reason, a deadline; recorded in the layer, not in the inventory | No — never raises the PASS rate |
| **PENDING** | No case yet, no independent oracle, no RED proof, or waiting for a person | Default while there is nothing | Not counted as PASS |

A tag that is both REQUIRED and N-A is a contradiction; `build.mjs` reports it and stops.

## Tags by group (plan §3)

| Tag group | Used for item kinds (see `KIND_TABLE` in `build.mjs`) | Own tags | REQUIRED | N-A | WAIVED | PENDING |
|---|---|---:|---|---|---|---|
| `common` (7 tags, every item) | all | 7 | every item | per denominator | per layer | default |
| `api-host` | `api-door`, `host-route` | 14 | every door | per denominator | per layer | default |
| `unit-component` | `package`, `dsh-plugin`, `language` | 8 | every item | per denominator | per layer | default |
| `ui-ux` | `ui-switch`, `story-file`, `story-export` | 13 | every item | per denominator | per layer | default |
| `flow` | `journey` | 10 | every journey | per denominator | per layer | default |
| `harness-tool` | `agent-tool`, `agent-surface`, `mode-*`, `fence-*` | 13 | every item | per denominator | per layer | default |
| `infra-script` | `gate`, `compose-service`, `npm-script`, `script-file`, `fleet-script` | 10 | every item | per denominator | per layer | default |
| `cms-release` | declared by the `cms` layer (W1 has no CMS/release extractor) | 10 | — | — | — | PENDING |
| `mail` | `mail-kind`, `mail-renderer`, `mail-html` | 10 | every item | per denominator | per layer | default |

`web-string` and `plugin-strings` carry only the `common` group; the string-specific obligations (all 8 languages, placeholders kept) are declared by the `ui` layer.

## Current state

When W1 generated this, **no layer** had a `denominator.json` yet, so every obligation was **PENDING** and every item `unowned`. Concrete numbers are not copied here so they cannot drift; read `layers.<layer>.unowned` and `completeness` in `inventory.json`. The source of the REQUIRED / N-A / WAIVED / PENDING column template is the audit-kit template; the original could not be checked at the pinned SHA (see `test-strategy.md`), so checking the columns against the template stays **PENDING**.
