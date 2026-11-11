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

## Unknown overlay regression

The picture context now distinguishes an unmeasured template overlay from a measured absence. Raw-picture text readability and the independent subject check remain strict. The draft looker prompt changes its frozen role and combined fingerprints; historical runs cannot silently resume under the changed prompt. The official surface-preparation case passed on `193bc37d55`, including 39 focused picture tests. This does not implement child bitmap gradients or responsive text bounds and does not establish hero acceptance.

## Completed local repair findings

The immutable `799ea3ccd1` diagnostic retry emitted its final step-nine artifacts. The direct write took 13.933 seconds, while native repair took 36 minutes 47.206 seconds across 19 closed turns in four page sessions. The page sessions are not duplicate whole-run retries. About-page repair alone used eight initial batches and three resend batches; 16 further faults were not sent because of the item cap. Native repair spend is unavailable and must not be reported as zero.

The final write report has 114 written, 95 hidden, 30 skipped, 25 failed and one refused item. Final site check remains red with 120 blocking findings, 17 warnings and two unmeasured checks. The largest blocking groups are reachable pages (34), unaddressable items (24), demo pictures (18), demo words (17) and callable phones (9). This run does not pass customer acceptance. These measurements describe the old diagnostic runtime, before the required-undo stop and receiver alias fixes, and do not prove candidate behavior.

At 14:43 UTC the existing David browser session still authenticated successfully. Dev reported `bb8ecd1769303d5c3029692ac88f9578bf02c34c`. No new login or dev server access was required.

## Reversible Diner receiver candidate

The companion receiver PR is https://github.com/TracyHQ/claude-cowork/pull/310. Both CI and CodeQL passed on exact head `278b8ad0379cf37bd6ac66fbed9526f39d1f2e88`. The local GD-enabled PHP suite passed 6,713 assertions with zero failures in 238 seconds. Its dedicated container peaked at 893,898,752 bytes under a 1,280 MiB cap, with zero OOM events, and exited cleanly. Earlier missing-GD and smaller PHP-limit attempts remain failed attempts rather than full-suite passes.

The development prerelease `joomla-v0.24.95-rc.2` points at that exact commit. All 248 uploaded asset sizes and SHA256 digests match the reviewed local bytes. Package SHA256 is `03cffa0c939ae18b60905d32dd374ad6b6b780c4da057d23137e47a43407af81`. Stable Latest remains `joomla-v0.24.94`; stable update feeds were not changed. Both canonical Diner provisioning entries now pin this exact receiver. Actual receiver installation, full recovery and customer-site acceptance are separate checks.

## Repair comment packing

The comment builder has a growing per-comment budget, so a rejected prefix does not prove that a longer group will fail. A real-builder regression reproduces two comments exceeding 4,673 characters by two characters, then fitting after a short third comment. Ordered partitioning now evaluates every contiguous candidate and minimizes omissions before turns. The focused reproduction changed from two turns to one without changing prompts, the shared builder, safety footer or comment order. Related repair tests passed. Official packing, undo-stop and picture-surface cases passed again on integrated `afab1ff901`.

The persisted diagnostic request records omit the original locate payload, while report items are sanitized. An exact replay of its batching is therefore unavailable; the saved reconstruction without locate gives one turn before and after and is explicitly not an actual-run speed measurement. No reduction of the real run's 19 turns is claimed.

The Diner pin regression also passed on `bd1465c738`, including unchanged installer and contract hashes and both canonical pin copies. The native diagnostic baseline was mixed: all 27 host/native source mismatches were already present before Retry and remained byte-identical throughout it. This establishes no mid-run drift, not a clean final native-image acceptance.

## Logo-only header menu reconciliation

The exact released Diner kit has no header menu-label slots. The previous header-only vote returned no menu type and exported no menu hides, even though the plan retained only four menu pages. The new fallback joins planned page paths to released menu identities only when they identify one unambiguous menu. It preserves unknown nodes, default Home, every kept page and its ancestors, and excludes other menus and administrator items. It creates no writer-label slots.

Pure replay of the frozen Diner input changes zero hides to six: Blog 108, Offers 141 and alternate Home items 145 through 148. Home 101, Contact 117, About 142 and Reservation 144 remain. The actual shape `plan.pages[].id` is tested with a kept descendant omitted from `mainMenu`; that regression failed before the correction. All 47 focused safety and existing navigation/settings tests passed; the official case passed on integrated `a6f22713da`. No claim that the 34 reachable-page findings have disappeared from an actual new WO is made before a runtime rerun.

## Controlled full-backup recovery and actual route undo

A disposable Diner site passed the previously unexecuted recovery scenario using the real production recovery functions and owner restore door. A fresh full backup preserved files and a verified gzip database dump. A controlled settled-writer fault changed one module title through the supported door and made the homepage return HTTP 500. Two actual 500 probes triggered RestoreEverything; its HTTP call completed successfully in 14.546 seconds. Original file SHA, module titles and complete params, retained 2/2/3 parallel arrays and HTTP 200 were restored. All before/after desktop and phone images were opened. This uses web source overlay `799ea3ccd1` and a preexisting mixed host/native baseline; it is infrastructure recovery evidence, not final customer WO acceptance.

The isolated site's DNS is unavailable inside the web container. The private wrapper relayed real loopback HTTP responses into the production probe; neither the status nor restore result was simulated. A first fault attempt briefly observed cached PHP HTTP 200 and correctly did not restore; its injected file/title were reset before the successful repeat.

After recovery, the supported HTTPS extension-install door installed exact RC2 package bytes in 2.757 seconds. An ordinary menu 142 alias change wrote in 85 ms; generic undo succeeded in 289 ms, restored the entire menu row exactly and left unrelated menu 144 unchanged. Both changed and restored paths answered HTTP 200 at desktop and phone widths; all six captures were opened. The site remains healthy on RC2 with original module data and 2/2/3 arrays. Historical protected language receipts were not fabricated or replayed; their refusal remains source-test coverage.

The actual web and native boot-graph checks also passed on the integrated checkout: 58 web entries with all seven declared Tracy plugins, and 75 native entries with all 23 declared Tracy plugins. This is a local boot test, not a deployed candidate acceptance.

## Unknown native spend

The completed diagnostic run persisted zero write spend despite native repair reporting null, so its $0.6741 was only a known pre-write subtotal. New measurements now preserve unknown agent, step and total spend as null and retain measured partial subtotals separately. A no-turn repair is zero; historical numeric totals are unchanged. The existing Ops consumer types and amount formatter accept unknown values and no longer display them as measured $0.00. Its formatter regression failed before the fix and passed afterwards, while genuine zero and fractional cents remain correct. No pricing estimate or historical rewrite is introduced.

The integrated step-nine, menu-fallback and spend suites passed all 127 tests with zero skips in 3.578 seconds; the separate Ops formatter regression also passed. Full lint/typecheck/format passed before the small nullable-consumer compatibility update; targeted harness typecheck and Biome checks passed afterwards. The earlier vocabulary gate caught a journal term and was corrected. Full final-candidate customer acceptance remains outstanding.

## Actual menu fallback and reversible navigation

The frozen Arabian plan, kit and content map also passed the actual menu modules against the disposable RC2 receiver. The real default-Home guard refused hiding Home 101 before any write. The six derived hides completed through supported settings calls in 440 ms of CMS write time; execution, full ten-row readback and four route probes took 2,088 ms. Opened desktop 1440 and mobile 390 navigation showed only the four kept links, with Blog and Offers absent. Supported generic undo reverted six ordinary content receipts in 187 ms. All ten complete rows then matched the baseline exactly, and all four kept routes returned HTTP 200. All six before, hidden and restored images were opened. This accepts the individual modules on the receiver, not a new full WO or a deployed final image.

The first attempt completed the six hides but parallel post-readback encountered a real CMS HTTP 500 before the wrapper saved its receipt. Its response body was not retained and cannot be reconstructed. Adjacent Joomla language-cache missing-file warnings suggest a race but do not establish the exact cause. Sequential reconciliation proved the changed rows, and supported updates restored only the six original published fields before the clean retry. The wrapper now persists every completed call and apply ID and preserves failed response bodies. The original 500 remains a diagnostic limitation, and the receiver is restored and healthy.

All 63 static gates passed on `eee14bc906`, with tests, lint and boot graph explicitly excluded from that invocation. At 15:10 UTC the existing David browser session still authenticated on dev, which reported build `bc23d315335727c27cbd802685e3e3e3eb81769d`. The candidate PR remains draft; no candidate deployment or final customer acceptance is implied by that session check.

The broader worker run exposed two Brand bench fixture failures: the fake `name_slots` answer omitted the actual tool's name decision, so the safe version correctly skipped naming but the old tests still expected a logo. The shared fixture now invokes the real code-only name-slot tool, retaining the tests' substantive safe-version and no-model expectations. The exact failing file changed from four passes and two failures to six passes; all 54 Brand bench tests then passed with zero skips. This fixture correction does not change production naming policy.
