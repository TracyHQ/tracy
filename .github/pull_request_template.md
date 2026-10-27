<!--
The five sections below are enforced by `.github/workflows/pr-description-check.yml`: leaving one
empty turns CI red. They are not paperwork — they are the questions a reviewer needs answered before
reading the first line of the diff, and the author is the only one who can answer them cheaply. The
fifth section (Web and desktop) is the ADR 0030 rule: web and the desktop app must not drift apart in features.
-->

### What this PR does

Before this PR:

<!-- Current behaviour. Say what DOES happen, not what is missing. -->

After this PR:

<!-- New behaviour. If these two paragraphs read the same, the change has not been described. -->

<!--
Does it introduce a NEW NAME (package, concept, data key, wording in the docs)? If something already
has a name, use it. If you need a new word, edit docs/references/vocabulary.md in this PR and say why
no existing word works (§10 of that file).
-->

### Why we need it

<!--
Why it is worth doing now. If there are trade-offs or options you considered and dropped, write them
down — that is what a reader six months from now cannot reconstruct.
-->

### How it was verified

<!--
What actually RAN, not what "should be fine".

  pnpm build:check                                    (locally, every gate in scripts/check-all.ts)
  pnpm exec tsx scripts/check-all.ts --skip boot-graph (what CI runs)

If you touched the UI, say where you looked at it — no gate checks pixels.
Declare any gaps: a PR that says what it has not checked is readable;
a silent one is not.

If there is a regression case, point to its id (REG-PR-<PR number>-<slug>, older cases REG-NNN) instead of
repeating the steps.

PRs into develop: the browser E2E rows (including the three EmDash theme rows) and the worker tests that need
a database (read TEST_DATABASE_URL) run ONLY when the PR has the `ci:e2e` / `ci:integration` label
(docs/references/gates-ci-runners.md). If your change touches either suite (EmDash themes, test/e2e,
tracy-design-inspiration), add the label (while still a draft, or right after Ready — CI re-runs by itself)
and say here which label you added.
-->

<!--
Only a reviewer can stop the language debt ledger and --accept-sources (#754). Tick [x] if this PR
adds/edits rows in scripts/locale-debt.json or runs --accept-sources, then give the reason after "Why:"
(which rows, which English sentence changed, whether all 7 languages are translated). Otherwise leave it unticked.
This line alone does not count as filling in this section.
-->
- [ ] Languages: edited `scripts/locale-debt.json` or ran `check-interface-languages.ts --accept-sources`. Why:

### Web and desktop

<!--
ADR 0030 — desktop is a shell around the web. Write ONE of the three:

  Both the same — <which surface, whether you opened it in the app>
  Desktop only — web cannot: <why the web cannot do it (saving files locally, URL scheme, windows…)>
  N/A — <the PR does not touch a user-facing surface>

A feature the web can do is built on the web first; the app renders the same page and gets it for free.
Never cut a web feature to push people into installing the app.
-->

### Regression

<!--
The `Regression` gate (.github/workflows/regression-check.yml) reads this section — only for fix/feat PRs.
Write one of the two:

  REG-PR-<PR number>-<slug> — PASS on <commit>   (a case added with tests/regression/create.mjs, or an existing
                                           case you edited — keep its id; results in results/)
  Regression: none — <reason, ≥ 10 characters>   (feat ONLY; a fix always needs a case)

How to write and run a case: tests/regression/README.md
-->

### Release note

<!--
Raw material for the product changelog (apps/tracy-docs/src/content/docs/changelog/desktop/<X.Y>.md;
`packages/desktop/tracy-desktop/build/draft-release-notes.mjs` drafts it from this block, and a maintainer
reviews the page before release). For every change a user SEES — on the web or in the desktop app — replace
NONE with ONE line in English, one line per change. There is a single label:
  - no label  = everywhere (web and in the app — the app shows the same web page);
  - `desktop:` at the start of the line = desktop app ONLY (auto-update, OS notifications, windows, install…);
    the page shows "Desktop only". There is no other label (no `web:`, `mobile:`…) — a line with an unknown label is rejected.
Example:
  Sites open faster.
  desktop: Restart reminders stop interrupting your work.
If users see nothing new, leave NONE.
Write what users SEE ("Faster sign-in", "Security updates"), never a vendor or library name:
not "Bump dsh-passwords 2.7.7", no dsh/DeepSeek/Electron/Cherry… A PR that only bumps vendor/ with no visible
change leaves NONE. Blocked names: `build/third-party-names.mjs`.
(The old block name `desktop-release-note` is still read; every line counts as unlabelled.)
-->

```release-note
NONE
```

<!-- Fixes # -->
