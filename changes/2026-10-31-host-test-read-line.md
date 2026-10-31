- **tracy-host's read-line test follows webroot-sync.sh's stdin form** — site agent (Claude, for David) · `fix/host-test-read-line` · 2026-10-31
  **Affects:** `apps/tracy-host/test/webroot.test.mjs` only. #245 moved the read's answer from python's argv to stdin (#219); this test still looked for the argv form, so it is red on `develop`.
