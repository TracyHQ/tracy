- **A brief short only of photos or of a template card kind now builds as a trial site, and says so; a refused brief no longer reads as an unexpected error** — David (WO) · #751 · `fix/wo-brief-trial-build` · 2026-11-25
  **Affects:** sellers and testers of Website Opportunities.
  - **Builds that go on now:** a brief blocked only on own photos, photo labels, an opening photo or a template card kind it holds nothing for builds, and its Build card notes that it is a trial version and what a full version needs (`demo.trial`, `brief.check.*`).
  - **Builds that still stop:** a picture with no known source or credit, and a brief with nothing of the business (#554), with `BRIEF_NOT_READY`, now read as the brief refusal (`demo.reason.briefNotReady`), never "The demo stopped on an unexpected error" (#547).
  - **Retry:** a Retry of an action refused on trial checks only goes on.
  - **Code:** `builds.js` exports `buildGateOf`, `noteGateOf` and `TRIAL_CHECKS`; a build's readiness note carries `trial`, and so does its demo action's `selection.trial` (read as `demoAction.trial`).
  - **Translations:** two strings in every interface language, with locale bundles and the WO client rebuilt.

  **Why:** a tester's cafe on dev (25/11/2026, one source, three facts, no photo of its own) was refused with `BRIEF_NOT_READY` and the screen said, in Vietnamese, that the demo stopped on an unexpected error, with a Retry that could only be refused again. David: a site with a gap or two is fine, let the user in with a trial version note.
