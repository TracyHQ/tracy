#!/usr/bin/env node
/**
 * REG-PR-243: a "forged" credential in a test is never the genuine one, and the `scripts` Turbo task
 * hashes what its suite reads. Read off the tree, no database, no Docker:
 *   S1 the forgery of `website-opportunities-shared-social.test.mjs`, taken from that file, run against
 *      the real mint and verify code with a secret forced to end in `X`. The old fixed `X` re-created
 *      the genuine key 1 time in 64 (nightly run 40973572289); the forgery must be refused every time.
 *   S2 the forgery of `preview-ticket.test.mjs`, taken from that file. Real tickets: the genuine one
 *      reads, the forged one does not. Signatures whose last 22 bits are zero: the old fixed `AAAA`
 *      tail decodes to the genuine signature, so the file's forgery must not.
 *   S3 the `//#test:ci:scripts` inputs in turbo.json cover the paths the nightly of 29/10 found
 *      uncovered (one per kind of the 4792), keep no input another of its inputs already covers
 *      (the generator never writes one; `MACHINERY` aside), and the `turbo-config` structure check passes.
 * Exit 1 with the first broken step; prints one line per step.
 */
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { covers, rootGlobs } from '../../../scripts/ci/turbo-inputs.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

function fail(step, why) {
  console.log(`${step} FAIL — ${why}`)
  process.exit(1)
}

/** The source of one expression in a test file, or the step fails: the case judges THAT file's forgery. */
function expressionIn(step, rel, pattern) {
  const hit = pattern.exec(read(rel))
  if (!hit) fail(step, `${rel} no longer has the forgery this case reads (${String(pattern)})`)
  return hit[1]
}

// S1 — every secret ends in `X`: the 1-in-64 draw of the nightly, made certain.
{
  const step = 'S1'
  const rel = 'apps/tracy-web/test/website-opportunities-shared-social.test.mjs'
  const forge = new Function('key', `return ${expressionIn(step, rel, /const forged = (`[^`\n]+`)/)}`)
  const original = crypto.randomBytes
  crypto.randomBytes = (n, ...rest) => {
    const bytes = original(n, ...rest)
    if (n === 24 && Buffer.isBuffer(bytes)) bytes[23] = (bytes[23] & ~63) | 23 // base64url index 23 = `X`
    return bytes
  }
  syncBuiltinESMExports()
  const { mintSocialServiceKey, verifySocialServiceKey } = await import(
    '../../../packages/wo/website-opportunities/src/wo-social-auth.js'
  )
  const pepper = 'reg-pr-243-pepper'
  const now = Date.parse('2026-10-20T12:00:00Z')
  let row = null
  const pool = {
    async query(sql, params) {
      if (/^\s*insert into wo_social_service_key/i.test(sql)) {
        const [keyId, deploymentId, secretHash, scopes] = params
        row = {
          key_id: keyId,
          deployment_id: deploymentId,
          secret_hash: secretHash,
          scopes,
          expires_at: null
        }
        return { rows: [] }
      }
      if (/from wo_social_service_key/i.test(sql))
        return {
          rows:
            row && params[0] === row.key_id
              ? [{ ...row, enabled: true, reads_per_minute: 1, refreshes_per_day: 1, forces_per_day: 1 }]
              : []
        }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`)
    }
  }
  const verify = (key) => verifySocialServiceKey({ pool, pepper, header: `Bearer ${key}`, now })
  for (let i = 0; i < 8; i++) {
    const key = await mintSocialServiceKey({ pool, pepper, deploymentId: 'local', scopes: ['read'], now })
    if (!key.key.endsWith('X')) fail(step, `the forced secret does not end in X: ${key.key.slice(-4)}`)
    if ((await verify(key.key)).deploymentId !== 'local') fail(step, 'the genuine key does not verify')
    // The old forgery: with the secret ending in `X` it is the genuine key, and it verifies.
    if ((await verify(`${key.key.slice(0, -1)}X`)).deploymentId !== 'local')
      fail(step, 'the old fixed-X forgery no longer collides: this case no longer reproduces the defect')
    const forged = forge(key)
    if (forged === key.key) fail(step, `the forgery in ${rel} returns the genuine key`)
    const answer = await verify(forged)
    if (answer.error !== 'SOCIAL_AUTH_INVALID')
      fail(step, `the forgery in ${rel} got ${JSON.stringify(answer)}, not SOCIAL_AUTH_INVALID`)
  }
  crypto.randomBytes = original
  syncBuiltinESMExports()
  console.log(
    `${step} PASS — 8 keys ending in X: genuine verifies, old forgery collides, ${rel} forgery refused`
  )
}

// S2 — preview tickets: real ones, then signatures built to collide with the old `AAAA` tail.
{
  const step = 'S2'
  const rel = 'apps/tracy-web/test/preview-ticket.test.mjs'
  const forge = new Function('return ' + expressionIn(step, rel, /const forge = (\(ticket\) => `[^`\n]+`)/))()
  const { mintPreviewTicket, readPreviewToken } = await import(
    '../../../apps/tracy-web/src/lib/preview-ticket.js'
  )
  const secret = 'reg-pr-243-session-secret-0123456789abcdef'
  const claims = { site: 'lantern.example', email: 'e@x.y', aud: 'https://tracy.test', secret }
  for (let i = 0; i < 16; i++) {
    const { ticket } = await mintPreviewTicket(claims)
    if (!(await readPreviewToken('ticket', ticket, secret))) fail(step, 'a genuine ticket does not read')
    if (await readPreviewToken('ticket', forge(ticket), secret))
      fail(step, `the forgery in ${rel} reads as genuine`)
  }
  const signature = (token) => Buffer.from(token.split('.').at(-1), 'base64url')
  let collided = 0
  for (let i = 0; i < 64; i++) {
    const sig = crypto.randomBytes(32)
    sig[31] = 0
    sig[30] = 0
    sig[29] &= 0xc0 // the last 22 bits, the four tail characters minus the two bits decoding drops
    const token = `pt.payload.${sig.toString('base64url')}`
    if (signature(`${token.slice(0, -4)}AAAA`).equals(sig)) collided++
    if (signature(forge(token)).equals(sig))
      fail(step, `the forgery in ${rel} decodes to the genuine signature`)
  }
  if (collided !== 64)
    fail(step, `the old AAAA tail collided ${String(collided)} of 64 times, not every time`)
  console.log(
    `${step} PASS — 16 real tickets refused when forged; 64 of 64 built signatures: old AAAA collides, ${rel} forgery never`
  )
}

// S3 — what the `scripts` task hashes.
{
  const step = 'S3'
  const { MACHINERY } = await import('../../../scripts/ci/turbo-setup.mjs')
  const def = JSON.parse(read('turbo.json')).tasks['//#test:ci:scripts']
  if (!def) fail(step, 'turbo.json has no //#test:ci:scripts task')
  const globs = rootGlobs(def.inputs, '')
  const reported = [
    '.github/CODEOWNERS',
    '.github/dependabot.yml',
    '.github/codeql/codeql-config.yml',
    '.github/ISSUE_TEMPLATE/bug.yml',
    'dev.sh',
    'run.sh',
    'tch/profiles/web/package.json',
    'tch/profiles/desktop/package.json',
    'tch/profiles/native/package.json',
    'tests/e2e-dev/run.mjs',
    'tests/e2e/fake-amember-idp.mjs',
    'tests/acceptance/desktop-onboard/run.mjs',
    'tests/acceptance/desktop-onboard-v2/run.mjs',
    'tests/live-sync-sim/sim.mjs',
    'tests/regression/fixtures/site-own-domain/compose.yml',
    'vendor/emdash/emdash/package.json',
    'vendor/emdash/emdash-mika/package.json',
    'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/package.json',
    'vendor/joomla/html/tracy_business/support.js',
    'vendor/tracy/dsh-subscriptions/package.json',
    'vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/package.json'
  ]
  const gone = reported.filter((rel) => !existsSync(path.join(ROOT, rel)))
  if (gone.length) fail(step, `paths this case names no longer exist (update the case): ${gone.join(' ')}`)
  const missed = reported.filter((rel) => !covers(globs, rel))
  if (missed.length) fail(step, `not among the scripts task's inputs: ${missed.join(' ')}`)
  const machinery = new Set(MACHINERY)
  const trees = def.inputs.filter((g) => g.endsWith('/**') && !g.startsWith('!')).map((g) => g.slice(0, -3))
  const redundant = def.inputs.filter(
    (g) =>
      !g.startsWith('!') &&
      !machinery.has(g) &&
      trees.some((t) => g !== `${t}/**` && (g === t || g.startsWith(`${t}/`)))
  )
  if (redundant.length)
    fail(step, `inputs another input already covers (not generator output): ${redundant.join(' ')}`)
  const structure = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/ci/turbo-setup.mjs', '--check', '--structure-only'],
    { cwd: ROOT, encoding: 'utf8' }
  )
  if (structure.status !== 0)
    fail(
      step,
      `turbo-config --structure-only exited ${String(structure.status)}: ${(structure.stderr || structure.stdout).trim().split('\n').slice(-3).join(' | ')}`
    )
  console.log(
    `${step} PASS — ${String(reported.length)} reported paths covered, no redundant input, turbo-config structure clean`
  )
}
