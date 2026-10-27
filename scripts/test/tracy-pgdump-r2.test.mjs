//   node --test scripts/test/tracy-pgdump-r2.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, utimesSync } from 'node:fs'
import path from 'node:path'
import { R, bash, fakeAge, script, tempDir, writeFiles } from './_shard.mjs'

const SECRET = 'r2-backup-secret-should-never-print'
const KEY_ID = 'r2-backup-key-id-should-never-print'

function push({
  dumps = ['postgres-s9-20261014-031700.sql.gz', 'postgres-s9-20261015-031700.sql.gz'],
  env
} = {}) {
  const dir = tempDir('backup-push-')
  const files = {
    'backup-r2.env':
      env ??
      `R2_BACKUP_ENDPOINT=https://acct.r2.cloudflarestorage.com\nR2_BACKUP_BUCKET=tracy-s9-backup\nR2_BACKUP_ACCESS_KEY=${KEY_ID}\nR2_BACKUP_SECRET_KEY=${SECRET}\nBACKUP_AGE_RECIPIENT=${fakeAge}\nTRACY_SHARD_NAME=s9\nR2_BACKUP_KEEP_DAYS=14\n`,
    'state/.keep': '',
    'dumps/.keep': ''
  }
  for (const d of dumps) files[`dumps/${d}`] = 'a dump'
  writeFiles(dir, files)
  // The newest dump by modification time, as `ls -t` reads it: the second one, by a day.
  dumps.forEach((d, i) => {
    const t = new Date(Date.UTC(2026, 9, 14 + i, 3, 17))
    utimesSync(path.join(dir, 'dumps', d), t, t)
  })
  const run = bash([script('tracy-pgdump-r2.sh'), '--dry-run'], {
    env: {
      TRACY_BACKUP_ENV: path.join(dir, 'backup-r2.env'),
      TRACY_BACKUP_DIR: path.join(dir, 'dumps'),
      TRACY_STATE_DIR: path.join(dir, 'state')
    }
  })
  for (const s of [SECRET, KEY_ID]) assert.ok(!run.stdout.includes(s) && !run.stderr.includes(s), s)
  return run
}

test('the newest verified dump is encrypted to the age recipient, uploaded, and 14 days kept', () => {
  const run = push()
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /newest dump postgres-s9-20261015-031700\.sql\.gz/)
  assert.match(run.stdout, new RegExp(`age -r ${fakeAge} -o <tmp> .*postgres-s9-20261015-031700\\.sql\\.gz`))
  assert.match(
    run.stdout,
    /rclone copyto <tmp> r2:tracy-s9-backup\/postgres\/s9\/postgres-s9-20261015-031700\.sql\.gz\.age/
  )
  assert.match(run.stdout, /rclone delete --min-age 14d r2:tracy-s9-backup\/postgres\/s9\//)
})

test('no dump is a failure, said by name', () => {
  const run = push({ dumps: [] })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /no dump in .*backup-postgres\.sh did not leave one/)
})

test('a missing setting is named, never shown', () => {
  const run = push({
    env: `R2_BACKUP_ENDPOINT=https://acct.r2.cloudflarestorage.com\nR2_BACKUP_BUCKET=b\nR2_BACKUP_ACCESS_KEY=${KEY_ID}\nBACKUP_AGE_RECIPIENT=${fakeAge}\nTRACY_SHARD_NAME=s9\n`
  })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /has no value for R2_BACKUP_SECRET_KEY/)
})

test('a recipient that is not an age public key is refused before anything is sent', () => {
  const run = push({
    env: `R2_BACKUP_ENDPOINT=https://a\nR2_BACKUP_BUCKET=b\nR2_BACKUP_ACCESS_KEY=k\nR2_BACKUP_SECRET_KEY=${SECRET}\nBACKUP_AGE_RECIPIENT=ssh-rsa AAAA\nTRACY_SHARD_NAME=s9\n`
  })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /BACKUP_AGE_RECIPIENT is not an age public key/)
})

test('the units: backup-postgres.sh unchanged, then the push, daily at 03:17 UTC', () => {
  const service = readFileSync(path.join(R, 'deploy/systemd/tracy-backup-postgres.service'), 'utf8')
  const timer = readFileSync(path.join(R, 'deploy/systemd/tracy-backup-postgres.timer'), 'utf8')
  assert.match(service, /^ExecStart=\/opt\/tracy-fleet\/stack\/backup-postgres\.sh --keep 3$/m)
  assert.match(service, /^ExecStartPost=\/opt\/tracy-fleet\/stack\/tracy-pgdump-r2\.sh$/m)
  assert.doesNotMatch(service, /EnvironmentFile/, 'the keys reach rclone only, not backup-postgres.sh')
  assert.match(timer, /^OnCalendar=\*-\*-\* 03:17:00 UTC$/m)
  assert.match(timer, /^Persistent=true$/m)
})
