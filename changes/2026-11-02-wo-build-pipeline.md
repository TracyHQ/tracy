- **The live Website Opportunities build (agent demo) checks faster and books its real cost: vision calls do not reason, a refused plan is fixed by its refused rows, checks stop when they stop helping, EmDash sweeps go four at a time, and builds spend their own day cap** — David (with Claude) · #296 · `feat/wo-build-pipeline` · 2026-11-03
  **Affects:**
  - Every WO demo and Build from my business, on all three CMS.
  - Dev: the vision door's look and labels now send the no-reasoning field. The look's log line names completion and reasoning tokens.
  - Lee: the ledger in `packages/wo` keeps `actual_millicents` and a `budget` per row (migration 195 / WO schema 0011), and `/ops/wo` gains `buildDailyCapCents` (2000).
  - Agent prompts: `tracy_demo` gains `plan.fix`, and a check may answer `stopped: 'no-progress'`.
