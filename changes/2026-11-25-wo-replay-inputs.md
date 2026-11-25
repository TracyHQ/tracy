- **The chain build replay uses a picture run whose `get` ends 3 on mapping problems, as the chain does, and sets aside a brand file or picture mapping whose pictures are gone, saying so** — David (WO) · #PR · `fix/wo-replay-inputs` · 2026-11-25
  **Affects:** /ops/wo staff replaying a build (`POST /api/ops/wo/chain-builds/:siteKey/replay`).
  - `createStepChainSteps().filesOf` no longer throws on a non-zero `get` exit; the caller reads the files it got.
  - A replay's `inputs.gone` counts the steps whose pictures are missing. tracy-web's bench folders are emptied by a redeploy (`TRACY_READINESS_DIR` and `TRACY_PICTURE_BENCH_DIR` unset on dev), so a build older than the last deploy replays with the chain's stand-ins for brand and pictures.
  **Why / Measured:** the first dev replay (bxr-london-lat33, 25/11/2026) dropped its pictures (`get` ended 3) and stopped `MISSING_FILE` on `spots/logo-header-1.v3.png`, a brand picture lost with the container.
