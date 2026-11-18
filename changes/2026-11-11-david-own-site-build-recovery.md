- **Build from my business shows server-owned work as building and preserves a failed build for explicit Retry** — David issue acceptance · #559 · `fix/david-dev-acceptance` · 2026-11-11
  **Affects:** Add site on web and desktop. The client keeps the original business through failures and reloads, retries the failed action through the existing server door, and opens the site only after completion. Rebuild the dsh image. Existing translated progress and retry labels are reused.
  **Why / Measured:** Browser acceptance on develop found a JA Boxing chain creating Portland City Boxing while the page still promised to open a chat. The focused local flow and browser suites passed 31 tests with no skips, including same-site retry, reopening, terminal failure and blocked-brief behavior. Final-head CI and acceptance of this follow-up deployment remain pending.

- **Sync retries a table recreated under its original name during the copy read** — David issue acceptance · #559 · `fix/david-dev-acceptance` · 2026-11-11
  **Affects:** Sync on every host. Missing-table errors now use the existing bounded retry even when the table list already matches again; permanent invalid views still stop. Rebuild the dsh image.
  **Why / Measured:** Final-head CI exposed a real read race, reproduced locally with MariaDB and a deterministic first-dump error before the fix. Import browser tests also wait for rendered preflight completion instead of assuming one virtual-clock jump commits all React effects.

- **A later business research press reopens its existing stopped or completed build** — David issue acceptance · #559 · `fix/david-dev-acceptance` · 2026-11-11
  **Affects:** Build from my business on web and desktop. An earlier owned action with a live base remains reachable for Retry or opening the finished site; deleted bases and replaced actions are excluded. The frozen revision and duplicate-build guard are preserved.
  **Why / Measured:** The authenticated dev website returned BUILD_EXISTS after a fresh research offered JA Boxing over the earlier failed chain's base. A real PostgreSQL route regression failed before the change and passed after it.

- **Keep the own-business Retry label inside its clickable button** — David issue acceptance · `fix/david-dev-acceptance` · 2026-11-11
  **Affects:** Add site failure recovery on web and desktop. Rebuild the dsh client. Retry now lives inside the alert description, following the shared alert's content column instead of its zero-width icon column. No strings or retry behavior change.
  **Why / Measured:** Browser acceptance after #559 deployed reproduced the squeezed button. The actual component's geometry assertion failed before the fix at 276 pixels; all 31 flow/browser cases passed afterward, including label containment at 276, 390 and 800 pixels.
