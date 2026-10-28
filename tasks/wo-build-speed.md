# Website Opportunities: faster research and site build

Goal: the time from "Build demo" (or "Build from my business") to a checked site goes down, with the same
verdicts and the same site. Work in one PR; measured on one local site at a time.

## Where the time goes (before this PR)

Local bench, one site per CMS, code of 26/10 (before full-page visual QA landed):

| Site | Wall | Model time | Tool time | Checks (8) | copy.write + copy.apply | provision.wait |
|---|---|---|---|---|---|---|
| WordPress, JA Restaurant | 26.5–32.2 min | 13.9–16.1 min | 12.4–15.9 min | 7–9 min | 1.8–2.8 min | 0.6–0.8 min |
| Joomla | 30.0 min | 16.0 min | 13.8 min | 7.0 min | 4.0 min | 1.2 min |
| EmDash | 18.1–25.7 min | 10.7–14.4 min | 7.3–11.2 min | 3.3–4.0 min | 0.4–2.1 min | 2.1 min |

Since then (#7) every check also looks at every page top to bottom at both widths: about 110 viewport tiles
and 38 vision calls for seven pages, and capture, vision and page reads all run one at a time
(`LOOK_AT_ONCE = 1`, `READ_AT_ONCE = 1`).

Research on a server takes 1–10 minutes before the build starts.

## What is serial today

1. **The look waits for every vision call before it captures the next tile.** `demo-look.js` `onFrame`
   awaits `flush()` (one model call per three tiles) inside the capture stream, so the browser idles during
   each call and the look costs capture time + the sum of every call. The 240 s capture deadline per
   two-page stream is also spent on model waits.
2. **The check reads pages one at a time** (`apps/tracy-host/src/demo-qa.js` `READ_AT_ONCE = 1`).
3. **The look starts only after the page reads end** (`client-demo.js` `measureOnce`).
4. **A passing incremental check is read again in full** (`measure`): the passing check costs two.
5. Research stages and sources: see the research section below.

## Plan

- S1. Vision calls in flight while capture continues: a bounded number of calls at once, results applied
  in tile order (same faults, same acknowledgements, same cap), capture memory unchanged.
- S2. Page reads a few at a time again on hosts with room, bounded by a setting; one at a time stays the
  default where memory is tight.
- S3. Start the look with the pages known before the reads end; look at any newly found page after.
- S4. Research: independent sources and media downloads at once, within the same cost caps and lease.

Each step keeps verdicts identical (tests that compare serial and parallel results) and is measured on one
local site before the next.

## Research

Every external wait of one place's research runs one after another, and nothing recorded how long each stage took:

| Stage | Waits, in order |
|---|---|
| discovery | Google Place Details, then (no website) social search: Facebook then Instagram, up to 3 queries each |
| collection | Google Maps (place → overview → menu), TripAdvisor, then website (up to 40 pages, 15 s each; an Apify browser run up to 240 s when thin), Facebook, Instagram, TikTok, YouTube (providers in turn, Apify runs up to 270 s) |
| media | up to 300 pictures + 50 from Maps/TripAdvisor, downloaded one by one (60 s timeout, videos up to 200 MB) |
| profile | PageSpeed (60 s), menu links, menu file, up to 24 menu-photo vision calls in turn, business reading (one model call) |
| brand | logo check, up to 6 vision calls in turn |

Done in this PR: media five at a time (a video alone), written in list order; PageSpeed, menu and business reading
at once, landing in the serial order; one log line per run with each stage's seconds.

Not done, and why:
- Collection in two waves (Maps, TripAdvisor, website and known socials together): the old Apify path keeps one
  `progress.apifyRun` slot, progress writes overwrite each other, and the pause/budget early returns assume one source
  at a time. Worth it (1–4 min) but needs its own change.
- Menu-photo and logo vision calls: their stop rules (four not-menus in a row, three failures) are order-bound; reading
  ahead would spend calls past a stop.
- Website pages three at a time: which 40 pages are read could change, and small sites answer 429.

## Measures

One WordPress build (Levain Bakery on JA Restaurant) before and after, on the local stand, one build at a time.
Results in the PR description.
