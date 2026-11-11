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
