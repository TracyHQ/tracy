/**
 * REG-028: My Sites delete tells a partial or unreadable teardown in a notice instead of closing
 * like a clean delete. Runs the unit suite and the browser suite exactly as the case's S1 says (the
 * browser suite bundles the real MySitesTab and launches its own headless Chromium through
 * Playwright, `open-harness.mjs`), with a throwaway artifact directory, and requires every browser
 * test that carries one of the case's expectations.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const artifacts = mkdtempSync(join(tmpdir(), 'reg-028-'))
let r
try {
  r = nodeTest(
    [
      'packages/site/tracy-my-sites/test/delete-response.test.mjs',
      'packages/site/tracy-my-sites/test/e2e/delete-result.test.mjs'
    ],
    {
      env: { ...process.env, TRACY_TEST_ARTIFACT_DIR: artifacts },
      extra: ['--test-concurrency=1', '--test-timeout=120000']
    }
  )
} finally {
  rmSync(artifacts, { recursive: true, force: true })
}
c.tapClean('S4 (both files)', r)
for (const name of [
  // host:false / repo:'failed' → partial notice, only the unconfirmed parts, one action, one DELETE.
  'host teardown failed: the delete says so, names the reason and the next step, and offers no second delete',
  'repository not confirmed by GitHub: the delete says so and invents no reason',
  'sessions and seats the agent did not confirm are both disclosed',
  'parts the answer leaves out or reports in an undefined shape are shown as not reported',
  'a reason is shown as the text it is',
  // repo false / 'kept' / true with every other part true → no notice, the dialog closes.
  'no repository, or a repository kept on purpose, is a clean delete: no notice',
  // Unreadable body, removed not true, dropped connection, 5xx → unknown, no "Nothing was changed".
  'a success nobody can read is an unknown result',
  'a request that never answered, or a server error, is an unknown result',
  // 403 / 429 / 404 → the refusal stays in the dialog, the row stays.
  'a refusal stays a refusal in the dialog',
  // Own site: navigation only after the acknowledgment; clean → one navigation, no notice.
  'deleting the site this page stands in, the tab already unmounted: the notice shows, and the page leaves only after it is acknowledged',
  'deleting the site this page stands in with an unknown result also waits for the acknowledgment',
  'deleting the site this page stands in, everything confirmed: straight on to the next site, no notice',
  // Last listed site, double press.
  'deleting the last site listed: the list empties and the notice is still there to read',
  'two presses in one tick send one DELETE and show one notice',
  // 360px, light and dark.
  'at 360px: a notice with every part and a long reason stays inside the viewport, its button reachable',
  'at 360px, dark: a notice with every part and a long reason stays inside the viewport, its button reachable'
])
  c.passes('browser suite', r, name)
c.done()
