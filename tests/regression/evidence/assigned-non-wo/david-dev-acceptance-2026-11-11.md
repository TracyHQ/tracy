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
