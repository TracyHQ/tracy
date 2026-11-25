- **Staff can replay a finished chain build's write on a fresh trial site of the same template: the build's own frozen inputs, the write step, then the site check, with no model call** — David (WO) · #750 · `feat/wo-chain-replay` · 2026-11-25
  **Affects:** /ops/wo staff, through three new internal doors:
  - `POST /api/ops/wo/chain-builds/:siteKey/replay` (owner/admin, same Origin; 202, one replay at a time, 409 `REPLAY_BUSY`);
  - `GET /api/ops/wo/chain-replays`;
  - `GET /api/ops/wo/chain-replays/:id`.

  tracy-web now runs the write step bench in its own process for a replay (`step-chain-replay.js`). The bench's wiring moved from `scripts/write-step-bench.mjs` to `src/write-step-bench-deps.js`, and the command line works as before. `create-site` takes `--keep-others` (with `--by`): it removes only the earlier sites of that label, so a replay never deletes another bench line's trial site. Without the flag it removes as before. `createStepChainSteps` has `filesOf(name, runId, dir)`, and app.js builds the chain steps once for the chain and the replay.
  **Why:** a chain build takes 15 to 25 minutes on dev and the planner gives another plan each time, so one write step fix waited a whole build and its effect was mixed with the model's spread. A replay writes the same inputs again in minutes.
