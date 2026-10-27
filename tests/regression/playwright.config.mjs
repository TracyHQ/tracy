/**
 * Playwright for the regression cases that need a browser or a stand (`specs/`). One spec per
 * case, run by the case's own `run` through `tests/regression/run.mjs`, judged by the exit code.
 * The browser is the chrome-watch Chrome over CDP (`specs/stand.mjs`), never a launched one.
 *
 * No retries: a case that passes on the second try is a case that fails sometimes, and the runner
 * must see that. Artifacts of a failed spec go to `.playwright-output/`, outside git (`.gitignore`).
 *
 * Playwright's own `trace` and `screenshot` stay off: over CDP they record every context of the
 * shared Chrome, other sessions' pages included. `seatTrace` / `seatScreenshot` (`specs/stand.mjs`)
 * apply the same policy to the contexts the spec made itself. For the same reason the aria
 * "page snapshot" of a failure (it reads the browser's FIRST context, the shared one) is off.
 */
import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

export default defineConfig({
  testDir: 'specs',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: 'list',
  outputDir: '.playwright-output',
  use: {
    trace: 'off',
    screenshot: 'off',
    seatTrace: 'retain-on-failure',
    seatScreenshot: 'only-on-failure'
  }
})
