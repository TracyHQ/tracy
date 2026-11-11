# David issue acceptance on develop, 11 November 2026

This is a continuation after PR #541. Its merge reached develop as `f179607e3fe39aff6c04bd73ce44d053b056dad2` at 12:41:45 UTC. The final branch head was `11e9256f696fc92a3178b31403644268411c267e`.

## Delivery and exact-source checks

- [Tracy CI 43020951020](https://github.com/TracyHQ/tracy/actions/runs/43020951020) passed on the final branch head. Its full application and browser suite proof comes from the identical green tree in manual run 42996537808.
- [Live Sync Integration 43020951280](https://github.com/TracyHQ/tracy/actions/runs/43020951280) passed on that exact head: 304 tests, zero failures, cancellations or skips. This is real MariaDB integration proof, separate from customer UI acceptance.
- [Application rollout 43022564902](https://github.com/TracyHQ/tracy/actions/runs/43022564902) and [dsh rollout 43022565072](https://github.com/TracyHQ/tracy/actions/runs/43022565072) both completed successfully.
- The authenticated browser itself reported web commit `f179607e3fe39aff6c04bd73ce44d053b056dad2` and dsh graph `f6d2561e285c` with 74 entries at 13:01 UTC. The earlier baseline was web `73b44d40d3` and graph `71d20533fabd`.

All remote acceptance uses the existing David browser session and website doors. No dev-machine connection, remote shell, database access or minted session is used in this continuation.

## Observed customer output

The same Tennis & Padel Coach opportunity was opened before and after deployment.

| Scenario | Before | After |
| --- | --- | --- |
| #547 failed brief | Unexpected error and Try again | The brief needs attention; review checks, complete research or owner answers, and create a new brief. The primary action is View brief. |
| #549 full research preview | Nothing is reused; TripAdvisor offered for collection; up to USD 0.61 | Available sources are collected; kept sources stay unchanged. TripAdvisor is kept because its provider needs account/payment repair; up to USD 0.36. |
| #549 source recovery | TripAdvisor exposes Try again | The provider repair explanation is visible and the source has no retry button. No paid research was submitted for this preview check. |

The generic next-step paragraph still suggests building from research on the blocked opportunity. Open PR #522 removes this old paragraph as part of its existing Details redesign. Its source was inspected; this continuation does not create a competing redesign.

## Real own-business run

Using Add site, Paste its links and the actual owner website, the customer started research of Portland City Boxing at 12:59:06 UTC. The server accepted it with HTTP 202. At 13:01 the research had saved 64 of 64 media items and was reading the business; the refreshed page then suggested JA Boxing on Joomla under the full business name.

The customer pressed Use this template at 13:02:06 UTC. The request contains only the chosen CMS, design and quickstart; it supplies no forced workflow. The accepted action has no client chat mode, advances through kit to plan, and keeps site `portland-city-boxing-2.tracy.site`. This proves the ordinary entry selected server-owned work, not a completed customer handover.

At 13:05 the real UI still said “Opening the chat where Tracy builds your site…” while its action was planning. The local follow-up reuses the translated Building your site and elapsed-minute labels for server-owned work. It preserves the durable business through failure/reload and adds explicit Retry of the failed action through the existing own-site build door. Retry sends no fresh research or template choice. Known blocked briefs and lost/deleted sites are excluded from this retry control.

Local flow and browser suites passed 31 tests with zero failures or skips, including the actual component moving from building to failure, reopening, retry and completion without a chat preparation call. TypeScript and the committed add-site client build passed. Final follow-up gates, committed-source regression, rollout and browser recheck remain pending.

The original owner website was opened independently to establish current services, trainers, history and prices for final comparison. No generated customer site has yet passed the complete desktop/mobile content and picture acceptance in this continuation.

## Temporary operator setting

The existing `site-from-business` switch was off. It was enabled through `/ops/ui` for this acceptance run, and the public UI settings door confirmed it was no longer hidden. Its previous false state is recorded privately for restoration when acceptance finishes. No source default or second feature flag is added.

## Further develop observations at 13:17 UTC

The first own-business action failed at the plan step. The ordinary authenticated site job door returned the precise cause: Tracy restarted before the text and pictures were written. Its base site was done, but its brief was failed, and the action correctly remained failed. The application rollout for an unrelated develop merge overlapped the build. The site is not accepted.

The website's operator place history confirmed that the new pasted-URL place was automatically merged into an existing Google place at 13:01:18 UTC. The Google survivor retained its 10 November snapshot, as the merge contract currently specifies. The opportunity therefore read business-reading-6 with zero services, team and story even though its new research request had completed. This is an observed freshness limitation, not evidence that the v7 extractor returned empty. No shared-place merge policy is changed here.

Because own-site opportunities are excluded from My opportunities, their direct list URL did not expose Research again. Through the same authenticated browser, the ordinary website research-again preview and research doors were exercised for this owned opportunity. No session was minted. The preview kept unavailable TripAdvisor and YouTube, budgeted USD 0.15, and the full research request returned 202 at 13:14:53 UTC. It completed at 13:16:51 UTC on the Google survivor, publishing business-reading-7 with ten grounded services, five quoted team entries, one story, two facts and three key messages. This demonstrates recovery of the empty reading on the deployed source. Completeness against every trainer page and use of that reading in a newly frozen site brief remain unaccepted.

Follow-up PR #559 contains the Add site progress and Retry correction. Its actual-component browser regression passed on committed source f4849b411f8ac6f730b5cfa8ca0268b3a540dfcb. The local gate run completed all selected gates; only lint initially failed because the new API method required a matching Storybook fixture. After fixing that fixture, both pnpm test:lint and the dedicated lint gate passed, including all fourteen TypeScript projects. The three excluded worktree gates were tests, turbo-config and boot-graph; CI and runtime acceptance must answer their remaining scope.

After merging origin/develop at bb8ecd1769303d5c3029692ac88f9578bf02c34c, the committed-source browser regression passed again on 2f96c84351e2f3c4a675041d86639cf09977e8e9. The final local gate command completed successfully: 63 gates passed, with tests, turbo-config and boot-graph explicitly excluded. No claim is made that these exclusions passed locally. A private screenshot of the actual component was inspected with the package's CSS; it shows the stopped build and Try again control. It does not include the dsh host's full styling and therefore is not final product visual acceptance.

## CI-discovered follow-up failures

PR #559 remained unmerged after Tracy CI 43028535486 failed its import E2E row and Live Sync Integration 43028535367 failed one of 304 tests. The PR was returned to draft.

The Sync failure reproduced locally against MariaDB: the copy dropped and recreated a table under the same name, and the read stopped with error 1146 even though the table list matched again. A deterministic first-dump missing-table fixture also failed against the old classifier. The correction recognizes both client missing-table forms as copy movement and uses the existing bounded retries. The complete local copy-load suite passed nine tests with no skips, including both client error forms, a concurrent writer, full 400000-row restoration and an invalid view that must still stop with error 1356 and a redacted reason. No partial dump is accepted.

The import E2E test observed an HTTP response before React had consumed the new detection and committed all animated rows. Its assertion now first observes removal of the server credential fields and advances the virtual clock in bounded turns until measured rows finish. The actual Continue and checkbox reversibility assertions remain intact. All eight import browser scenarios passed under local load with zero failures or skips. An initial run with a 60-second whole-file budget expired after eight passing scenarios; the complete rerun used a 180-second file budget and finished in 65 seconds. The CI timeout is unchanged.

The publication scan of final head 0595f10f and base bb8ecd1769 reported the same 107 inherited blockers and zero new findings. This is a comparison, not a clean-publication verdict; no allowlist was weakened and private findings are not committed.

After the follow-up, the selected local gate command again passed all 63 gates, with tests, turbo-config and boot-graph explicitly excluded. Both committed-source regression cases passed on `7d8442d1497041fc1ec9baee2d55ead18ba734dc`: `REG-PR-559-own-build-recovery` and `REG-PR-559-sync-copy-recreated-table`. Final-head CI, deployment and customer-site acceptance remain required.

## Further end-user recovery observation at 14:04 UTC

The real customer pressed Use this template after the fresh completed research. The website returned HTTP 409 BUILD_EXISTS for the earlier Portland test site's base, whose provisioning build was done while its server chain had failed. The customer saw the generic could-not-build message, rather than access to that failed action. No second site build was accepted.

The own-business state query matched terminal actions only for the latest request key. A later research press therefore hid the earlier stopped action even though its base still existed. The correction also finds terminal owned actions with an existing live base, retaining account isolation, replacement exclusion and the duplicate-build guard. Deleted bases are excluded; Retry retains the same frozen revision. The real PostgreSQL route case failed before this correction (research instead of build) and passed after it, including failure, completion, another account and deletion.

Live Sync Integration 43033045711 passed on head 3b43198777: 305 tests passed, zero failures or skips. Tracy CI 43033045602 failed before browser testing because Ubuntu package download DNS resolution failed on its runner. The PR returned to draft. No test was removed and no infrastructure failure was presented as passing.

The final publication scan at 3b43198777 still reported the same 107 inherited blockers as bb8ecd1769, with zero new unallowed paths. Its private reports stay outside git.

The real Add site primary button on the deployed graph f6d2561e285c was also inspected in light and system-dark modes. In light mode its label contrast was 4.641:1 at rest and 6.122:1 hovered; the dark view passed both checks as well. Screenshots were visually inspected. Custom accents and destructive controls retain their existing local regression coverage; these particular website observations do not measure those states.

The selected local gate command passed all 63 gates again after the terminal-action query change, with tests, turbo-config and boot-graph explicitly excluded. The next CI run uses the repository-supported `ci:self-hosted` label to avoid hosted Ubuntu package installation DNS failures; `ci:e2e` remains enabled. No workflow, test scope or merge gate is weakened.

The complete Website Opportunities HTTP-door suite then passed all 76 cases with no failures, cancellations or skips against local PostgreSQL, including unchanged duplicate-build, owner-isolation and Retry boundaries. The new committed-source regression `REG-PR-559-own-build-after-research` passed on `dcd1c41ee3`.

## Deployed recovery and follow-up layout observation

PR #559 merged into develop as `bc23d315335727c27cbd802685e3e3e3eb81769d` after final-head Tracy CI 43036540814 and Live Sync Integration 43036539970 passed. The latter executed all 305 cases with no skips. The browser suite passed 568 cases with four explicit suite skips; the ordinary workers row retains its reported environment-dependent skips. These are separate scopes, not an all-tests-without-skips claim.

Both app rollout 43040163250 and dsh rollout 43040163278 completed successfully. The existing authenticated browser confirmed the deployed web commit and freshly loaded graph `3f55c1bcff71` with 74 entries. Reopening Add site exposed the original failed action even though a later research request existed. It no longer offered a template that BUILD_EXISTS would refuse.

At 14:56:25 UTC the actual Try again button sent only the original failed action's retryOf and received HTTP 202. The replacement retained the original frozen revision, server-owned workflow and Portland test site. The client displayed Building your site and elapsed minutes without opening a chat or declaring completion. This accepts the recovery handoff, not the resulting site's content.

Before Retry, nine pages were inspected at desktop and phone widths. All 18 page loads returned 200, with no horizontal overflow, broken visible images or captured browser errors. The site still contained stock JA Boxing trainers, services and contact details from its failed content run, so content acceptance failed. The original frozen reading is empty; new research does not rewrite that revision.

The full dsh screenshot also exposed a visual defect missed by the earlier isolated flow check: the Retry button was a direct child of Alert and fell into its zero-width icon column. Its label extended outside its clickable box. A real-browser geometry assertion reproduced this before the correction at 276 pixels. Retry now lives inside AlertDescription, following the shared component's existing content-column contract. The complete 31-case flow/browser suite passed afterward, including label and alert containment at 276, 390 and 800 pixels. The corrected local component screenshot was inspected. This follow-up is required after #559 because the defect was found on its first deployed full-shell acceptance; the new deployed layout still needs acceptance after rollout.

At 15:01 UTC the actual dev tab was reloaded and reopened through Build it from my business. It retained the same running replacement action and showed four elapsed minutes, without preparing a chat. The follow-up local gate run passed 63 gates, explicitly excluding tests, turbo-config and boot-graph for the worktree; the separate flow/browser suites passed 31/31. The generated site's content remains unaccepted.

## Copy icon repair observed during the running Retry

The original Retry reached write while copy reported a Twitter glyph on its planned YouTube link. The website subsequently showed the correct YouTube glyph because the link writer already infers common glyphs from a single evidenced font family. Two new local assertions failed before the follow-up: the copy checker refused that supported YouTube class, and it failed to detect a different replacement glyph's disagreement with the planned network. Copy checking and link writing now share the existing resolver. An actionable finding names the supported target class; unknown networks, another family and mixed-family inference remain refused. The checker version is `site-copy-check/11`; the locked planner prompt is unchanged.

The focused checker and writer tests passed 29/29. The broader copy, writer and write-step run passed 908 cases with 33 environment skips. All 32 database-dependent cases were then executed against isolated local PostgreSQL and passed with no skips. The browser review file also passed 12/12 with Playwright explicitly configured, including the remaining browser-dependent case. These are local validations of the correction; the running dev Retry uses the previously deployed code.

The site was inspected during write on nine pages at desktop and phone widths: all 18 loads returned 200, with no captured browser errors or horizontal overflow. The phone menu contained one visible logo and the YouTube link had a YouTube glyph. Gallery frames still contained the template's pictures under documentary-looking descriptions, so content acceptance remains failed pending terminal repair and a fresh grounded brief. Fast sweeps left the lazy footer logo unloaded on some pages; scrolling that exact image into view and waiting confirmed its actual image loaded with natural width 350. No broken-image claim is made from those unloaded sweep entries.

PR #522 was reconciled with the current recovery line without replacing its source implementation. The generated Add site conflict was rebuilt from merged source; 776 client/flow tests and 130 real PostgreSQL server tests passed with no skips. The complete PostgreSQL rerun on its committed head supersedes an invalid first run interrupted by a checkout change. Its deterministic regression passed on `1d1aa414fc`; the source and receipt were pushed as `2e4da51460`. Further changes to this recovery line must be merged into #522 before its final CI and readiness.
