# Lessons — every known EmDash trap as one record, read only when it applies

> **Cross-phase packet.** Run the scan before each phase (`--phase` of the phase you are starting) and,
> without `--phase`, on the packed artifact before P8 ends. Open a lesson through `show`; the reference it cites stays the full
> account. Modelled on the WordPress kit's lessons ledger.

The skill's traps are prose spread over SKILL.md's invariants and D-numbered decisions,
[`release-regressions.md`](release-regressions.md), the measured traps of [`frontend-stack.md`](frontend-stack.md)
and the recurring defect classes of [`visual-review-method.md`](visual-review-method.md). Rereading all of it before
each step costs context and still misses the one that applies. The ledger keeps each trap as one short record that
**cites the line holding the rule** — it repeats no rule — and, where a check over files on disk is reliable, a
**detector** that says whether the trap is in this template.

```bash
node scripts/lessons.mjs scan <template-dir> [--pack <packed-dir>] [--phase <phase being started>]   # skill folder
node scripts/lessons.mjs show E-021
```

`scan` reads the template folder (and the packed artifact with `--pack`); it loads no page, starts no site and
replaces no gate — `qa.mjs`, `visual-qa.mjs`, `release.mjs` still decide.

## Which detectors run

Each detector record names the phase that **establishes** what it checks (the seed in P2; `astro.config.mjs`, the
layout and the icons in P3; personalization in P4.5; the package in P8). `--phase X` runs the detectors of the
phases **before** X — those must hold — and lists the detector lessons of X itself on stdout as reminders, with the
read records of X. A detector of X or later does not run: before its phase the trap is not fixable yet (a
`new-template.sh` starter has no layout and placeholder personalization by design), and reporting it would block
the phase that is meant to fix it. Without `--phase` every detector runs: the final scan, with `--pack`.

## Output and exit codes

- **stdout**: one line per lesson, `id · sym · fix` — first the **unresolved** ones (a detector found the trap in
  these files), then the **read** records and the detector reminders of `--phase` (all read records without
  `--phase`).
- **stderr**: the counts, the detail of each unresolved lesson, the clear ones, the ones **not checked** (their input
  does not exist yet — no `seed/seed.json` before P2, no `seed/personalize.json` before P4.5, no `--pack`) and the ones
  whose input could not be read (**unknown**).
- **exit**: `0` no unresolved lesson among the detectors that ran · `1` an unresolved lesson · `2` a usage error or an
  unknown (2 wins: a scan that could not read part of its inputs is never reported as clean). `0` covers only what
  ran: a not-checked detector is not a clear one.

## Record format — `references/lessons.jsonl`

One JSON object per line, keys in this order, every value a string:

| Key | Holds |
|---|---|
| `id` | `E-NNN`, ascending |
| `area` | `i18n` `frontend` `seed` `importer` `content` `routing` `runtime` `visual` `release` `package` |
| `when` | only on a detector record: the detector (below). A record without it is a **read** record — a rule no file on disk shows |
| `phase` | `P0`…`P8`, `P4.5`, `P4.6`: for a read record the phase whose scan prints it; for a detector record the phase that establishes what it checks (§Which detectors run) |
| `sym` | the symptom, ≤ 100 characters |
| `fix` | where the rule lives — for a detector record `references/<file>.md[#<heading>]`; for a read record the one-line action and the reference |
| `ref` | `<file under the skill>:<line>` of the sentence that states the rule |
| `cite` | text that line holds; `scripts/lessons.test.mjs` fails when the line moved or changed, so an edit of the reference updates the record in the same change |

## Detectors — `scripts/lessons.mjs` `DETECTORS`

| Detector | Reads | Phase | Lesson |
|---|---|---|---|
| `astro-i18n-prefix` | `astro.config.mjs` (comments blanked): `prefixDefaultLocale: true` | P3 | E-001 |
| `astro-i18n-fallback` | `astro.config.mjs`: a `fallback:` after `i18n` | P3 | E-002 |
| `global-css-once` | `src/**/*.{astro,ts,tsx,js,jsx,mjs}`: exactly one file imports `global.css` | P3 | E-003 |
| `seed-media` | `seed/seed.json`: any `$media` key | P2 | E-004 |
| `dockerfile-in-dist` | `qa.contract.json` `distribution.include` covers `Dockerfile` and `tools/docker-entrypoint.sh`; with `--pack`, both files are in it | P8 | E-005 |
| `dockerfile-content-api` | `Dockerfile`: every stage sets `ENV TRACY_CONTENT_API_SCALARS` | P8 | E-006 |
| `pack-forbidden` | `--pack`: any path `distribution.mjs`'s `forbidden()` refuses (runtime data, uploads, secrets, `node_modules`, backups) | P8 | E-007 |
| `icon-font` | `src/**` and `package.json`: Font Awesome / `fa-*` icon-font classes | P3 | E-008 |
| `personalize-placeholder` | `seed/personalize.json` + `seed/questions.json` through `personalize-gate.mjs` (`personalizeProblems`) | P4.5 | E-009 |

A detector reads only static files, never follows a link, caps a file at 8 MiB and a tree at 20 000 entries.

## Adding a lesson

1. The next free id; `area`, `sym`, `fix`; `ref` + `cite` pointing at the sentence of the reference that states the
   rule (add the sentence there first if no reference holds it — the ledger is an index, not a home for rules).
2. A detector only when the trap can be read reliably from files on disk, with one fixture where it is present and
   one where it is not in `scripts/lessons.test.mjs` (`TRAPS`); otherwise a `phase` (read) record.
3. `node --test scripts/lessons.test.mjs` (part of `npm run test:docs`).
