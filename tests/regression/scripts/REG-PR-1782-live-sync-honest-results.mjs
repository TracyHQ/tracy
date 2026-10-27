/**
 * REG-PR-1782: Sync from live and Sync to live say what happened, and a site with foreign keys syncs.
 * Runs the four suites that hold the case's fences and prints one `ok -`/`not ok -` line per test the
 * case names; exits 0 only when every one ran and passed. A test that SKIPPED (no docker daemon for
 * the MariaDB suites, no TEST_DATABASE_URL) is `not ok`: a skip is not a pass.
 */
import { spawnSync } from 'node:child_process'

const STEPS = [
  {
    cmd: [
      'node',
      '--test',
      '--test-reporter=tap',
      'packages/fleet/tracy-fleet-operation/test/live-sync-copy-load.test.mjs',
      'packages/fleet/tracy-fleet-operation/test/live-sync-db.test.mjs',
      'packages/fleet/tracy-fleet-operation/test/provision-joomla-check-in.test.mjs'
    ],
    tests: [
      'tables tied by a foreign key, loaded by two streams side by side, load whole',
      'a title the live site changed in a table the copy left alone is one record that came over',
      'a stamp or a counter the live site moved is no record; a category it added is one',
      'one title both sites changed is one place kept: the asset that mirrors it follows',
      'every record the live site had open is checked in on the copy, Joomla 4 and Joomla 3 alike'
    ]
  },
  {
    cmd: [
      'node',
      '--test',
      '--test-reporter=tap',
      'packages/fleet/tracy-fleet-operation/test/live-write.test.mjs'
    ],
    tests: [
      'a record open in the live site’s editor is not written, and the answer names whose editor',
      'WordPress block theme: parts and templates go by slug'
    ]
  },
  {
    cmd: [
      'node',
      '--test',
      '--test-reporter=tap',
      'packages/fleet/tracy-fleet-operation/test/live-push-sql.test.mjs'
    ],
    tests: ['WordPress block theme: a header part, a new footer part, a template handed back to the theme']
  },
  {
    cmd: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=tap',
      'apps/tracy-web/test/live-push.test.mjs',
      'apps/tracy-web/test/live-sync.test.mjs'
    ],
    tests: [
      'a deleted copy takes its sync and push rows with it',
      'a push that wrote nothing ran no sync: no site_sync row'
    ]
  },
  {
    cmd: [
      'node',
      '--import',
      'tsx',
      '--test',
      '--test-reporter=tap',
      'packages/core/tracy-core/test/publish-push-dom.test.mjs',
      'packages/core/tracy-core/test/publish-sync-zip-dom.test.mjs'
    ],
    tests: [
      'a push that wrote nothing says so — never a success of "0 changes"',
      'Sync, up to date: a live title change in a table the copy left alone is one record, not "nothing"',
      'Sync, up to date: versions, logs and stamps only are small changes, not records',
      'Sync, up to date: nothing at all came over: nothing had changed',
      'the pure parts: phases from answers, the step each is drawn on, failure words, names',
      'Sync: a kept place inside a JSON column names the key both changed, and how many more'
    ]
  }
]

let failed = 0
for (const step of STEPS) {
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    env: process.env
  })
  const lines = `${r.stdout ?? ''}`.split('\n')
  for (const name of step.tests) {
    const line = lines.find((l) => /^\s*(not )?ok \d+ - /.test(l) && l.includes(name))
    const pass = Boolean(line) && !/^\s*not ok/.test(line) && !/# SKIP/i.test(line)
    if (!pass) failed++
    const why = !line ? ' (did not run)' : /# SKIP/i.test(line) ? ' (skipped)' : ''
    console.log(`${pass ? 'ok' : 'not ok'} - ${name}${why}`)
  }
}
process.exit(failed ? 1 : 0)
