# WO follow-up acceptance evidence

These results establish individual mechanisms. They do not establish five completed customer sites or five-template acceptance.

## Receiver capability

Receiver candidate: TracyHQ/claude-cowork#310, commit `c407106cd190a741d3f27ff7272c63b8bf6d91aa`, prerelease `joomla-v0.24.95-rc.1`. The stable feed remains at 0.24.94. All 248 published package, manifest and contract asset hashes and sizes match the reviewed build.

A fresh, stock JA Diner Joomla 6 site reproduced the exact refusal on receiver 0.24.94: the supported row-removal request failed with `SLOT_NOT_REMOVABLE`. After a database snapshot and verified extension installation of the RC, the identical supported request removed 69 slots representing 23 surplus rows. Module 100, 101 and 102 row counts changed from 10/10/10 to 2/2/3 across name, description and price arrays. Kept values, unrelated parameters and other columns remained unchanged. Contract inspection and the apply receipt passed. Repeating the same request ID returned the same receipt without removing more rows.

All three tabs were captured and opened at 1440 and 390 pixels. Rendered row counts matched 2/2/3; there were no empty surplus rows or horizontal overflow. This is receiver capability acceptance: remaining stock content was intentionally retained and is not customer output acceptance.

Full post-version CI passed, including PHP 7.4 and the PHP 8.1 engine's 6,697 assertions. The earlier local 6,677-assertion run preceded the RC version change; a later local run was interrupted and is not a post-version PASS.

## Brand input and actual spot files

A frozen real brand file passed the historical gate despite referencing raw 512x512 images for 128x80 spots and using a light-side review of a different file. The new gate rejects that input. Standalone mark fitting produces actual 256x160 transparent spot files through the existing fitting operation.

A separate visual inspection rejected the cached light-side solid disc even though machine checks passed. The complete logo retained its detail when an existing opaque proof was recut, inverted with the measured enclosed-fill mask and fitted. Its ink below 2:1 dropped from 72.13% to 28.09%, under the existing 60% blocking share. No review record was invented; this derived asset still needs independent review in an actual run.

A fresh browser-only dev run also reproduced missing `brand.voice`. The input fix supplies only the selected normalized language name at the Brand boundary, records projection provenance, and preserves authored voice and research history.

## Interrupted measurements

The fresh dev run remained in Planner for at least 9.83 minutes, then ended without reaching step 9 during a subsequent deployment. Ops retained only 0.04 minutes from an early completed-step snapshot. The follow-up keeps the original snapshot, records terminal settlement time and reports interrupted attempt elapsed time separately from unknown active-step duration and spend. A legacy last-update estimate is explicitly an upper bound.

The new chain QA guard rejected the failed run rather than declaring it complete. No native trace link is claimed for a run that never reached native repair.

## Runtime limitations

Local test and provisioning workloads overlapped during this verification. A local web container was observed OOM-killed with exit 137, and the fresh baseline Git operation took 883 of 943 provisioning seconds. These timings are infrastructure observations, not a representative WO performance benchmark. The exact owned test workload was stopped, its disposable database containers were removed, and the unchanged owned web container was restarted and verified healthy. Existing customer research and site data were preserved. No shared Docker restart or global prune was used.

Final end-to-end WO timing, independent image-review completion and five-site customer acceptance remain outstanding.

## Integrated regression verification

Latest integration includes develop `bb8ecd1769` and the empty-fill guidance fix. Four official deterministic cases passed on `425c5f7d2e`: actual brand spot files (28 tests), selected-language input (10), empty-fill recovery (10), and interrupted measurement (72). All 120 tests passed with zero skips. Script cases execute this branch's code directly; the existing stand URL is not evidence that the stand runs the candidate.

The final integrated lint, typecheck and formatting check passed in 41.75 seconds with 542 existing warnings. The actual dev website was read again through the existing authenticated David browser session: `/api/build` reported `bb8ecd1769`. No login interaction or dev server access was needed.
