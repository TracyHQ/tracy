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

Of 62 integrated static gates, 60 passed initially. The vocabulary check caught three journal terms; the design registry caught the Diner pin's canonical provisioning copy not matching the web copy. Both were corrected in `799ea3ccd1`, and both gates passed on rerun. The private release-gallery comparison remains explicitly skipped because its token is not present.

## Current runtime and coverage boundaries

The owned local web was updated to an immutable `799ea3ccd1` source overlay. All 2,114 checked runtime files match, as does the host's canonical quickstart pin. Existing networks, stored research and historical run artifacts were preserved. This is source-overlay verification, not a clean native-image build.

A fresh read of the local role assignments and persisted call receipts supersedes the older missing-provider handoff. Independent Brand review and Picture looker use `openai/gpt-6-luna` through OpenRouter; Picture drawer uses `google/gemini-3.1-flash-lite-image`. Their assignments are enabled and usable, and historical actual answered calls exist. Brand agent and Picture picker use DeepSeek. No provider or key was changed for this verification. Current end-to-end runs still need their own successful receipts.

The failed dev FIGHTLAND site's public output was captured and opened at 1440 and 390 pixels: stock Boxing branding, hero copy and template title remain. There is no observed horizontal overflow at those widths, but the site fails customer personalization acceptance. This confirms the failed baseline run's QA decision; it is not a test of the follow-up deployment.

The current release inventory has five published kit variants across four design families. Only Boxing J6 and Diner J6 are enabled for the full chain. Voyara J6 and Diner WP7 are outside its allowlist; Restaurant EmDash 1.0.2 also lacks production bench contract registration. Gallery visibility and kit approval alone do not prove full-chain support. Five businesses through Boxing do not satisfy five-template acceptance.

## Held names and export boundaries

The real Diner retry on `799ea3ccd1` passed Brand after two unnecessary repairs: its name was held, but the checker demanded unused rendered name files. New runs freeze `brand-held-name-check/1`, allow independently reviewed fitted standalone marks, and retain confirmation and contrast checks. The safe version also consumes the existing name-slots decision, so its gate bypass cannot compose an authored but withheld name. Historical runs retain their recorded policy; the approved prompt is unchanged.

Separate deterministic reproductions demonstrated that failed-best artifacts could pass existing planner/picture failures and still reach export. Documentary pictures now reuse P07 before mapping, uploads and alts; article copy reuses R25 against both the frozen plan and actual writer citations before CMS writes. Invalid items are refused explicitly, while valid owner posts, real photos and generic illustrations remain available. Frozen inputs are not rewritten.

Three new official cases passed on `5f00854cf3`: held-name, safe-version, domain-boundary and site-check tests (35); documentary export (8); original-post export and actual write-door boundary (9). All 52 tests passed with zero failures and skips. These deterministic tests are separate from customer-site acceptance.

## Active Diner timing findings

A supported Retry accepted at 13:47:11 UTC reran the core chain with new bench IDs on the previously provisioned Arabian Tea House site, after a verified full backup and RC installation. It is not fresh site provisioning. Actual Brand independent review and Picture looker/drawer calls answered using the existing role configuration. Brand, planner, writer and pictures reached successful bench outcomes; final site acceptance remains pending.

The writer's initial full-copy call took 343.106 seconds, followed by a 15.518-second repair. Picture preparation recorded a confirmed five-minute quickstart installer timeout and fell back to unknown template overlays; its code timer began after that wait. These are measured causes of elapsed time, not evidence that every slow run has the same cause. During the write, shared local host pressure also caused Docker and API observation timeouts; the latest observed web cgroup peak was 830,357,504 bytes with zero OOM kills. The observation gap must not be presented as measured model work or a new web OOM.

The 14:06 desktop and phone captures were opened during the write. Branding and copy had changed, but the hero showed a gradient without a restaurant photograph. The run was still applying, so this is an interim finding requiring terminal verification, not a final accepted output.

Later inspection of the frozen picture manifest and mapping confirmed that both slideshow frames were explicitly hidden after their fallback ladders. The missing photographs are therefore an actual output-quality problem. Three exact reviewed images were opened: the two drawings failed text readability, and the owner photo also failed the specific before-service subject. Mean luminance was below the current darkening cutoff despite bright tablecloth regions. The installed template has a child bitmap gradient mask, which the current verified-installer surface reader does not model; unknown overlay metadata is incorrectly explained to the looker as no template overlay. These findings do not authorize accepting the failed images or inventing overlay measurements.

## Native repair duration and failed undo

The native session was reached through its actual local UI URL, separately from Ops. The first two completed turns reported 131.101 seconds of model work and 478.325 seconds of tools. During the shared-host stall, even a local todo write took 61.079 seconds; two content reads took about 165 and 170 seconds. After eight verified owned idle site containers were stopped with volumes retained, later native sessions had faster tool timings but still encountered real service refusals, including expired content snapshots, invalid query combinations, shared-module confirmation requirements and contract fit limits. Infrastructure pressure does not explain all errors.

An ordinary menu alias update succeeded for menu item 117, but its required turn undo failed verification. The receiver used the same `alias` receipt operation as protected language changes. A bound site's generic revert consequently refused it as a special language operation. The isolated receiver regression reproduces that exact refusal; the candidate uses a distinct `menuAlias` receipt and preserves language/source-relabel and editor-lock guards. Historical ambiguous receipts remain protected.

The chain deliberately replaces the default 10/12-minute repair windows with its remaining two-hour preparation budget plus handover allowance. It continued to open additional native repair sessions after the failed required undo. The new stop guard immediately marks that base unverified and suppresses later pages, batches and resends, including failures during request numbering and native waiting. Accepted IDs remain tracked and existing writers still settle and are judged. All 105 step-nine tests passed with zero skips; the official undo-stop case passed on `bfae983a30`.

The measured local retry remains a failed-quality diagnostic run until its terminal artifacts and final website have been reviewed. No supported whole-action stop exists for this internal Retry, and it has no public-demo cancel linkage. A native turn cancel alone cannot prove the orchestrator has stopped opening work. No database edit, container kill or undo replay was used to manufacture a terminal result.
