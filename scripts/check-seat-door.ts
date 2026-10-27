/**
 * Seat door gate (TCH ADR 0001).
 *
 * The three rules here can all be broken by an innocent edit, and all three fail SILENTLY:
 *
 *   1. The password door must close when the seat door opens. Remove that 404 block and the lane has two
 *      entrances, the second being one the seat book neither grants nor revokes. No gateway test fails
 *      because of it — the login page still works, as before.
 *   2. Missing config must mean the door does NOT exist. Drop the defensive `typeof === 'string'` read and
 *      an old config (`undefined`) both closes the password door and opens the HMAC door with a non-string
 *      key. A bug introduced and caught by the author on 30/08.
 *   3. Only ONE place may sign. The signing string must match byte for byte across two runtimes; anyone
 *      building an `x-seat-signature` header in a second place builds a second copy of an algorithm, and
 *      that copy will drift.
 *
 * A fourth rule — "no master credential left" — is NOT on yet: Phase 3 deliberately keeps the old path
 * until the lane really runs `2.6.6-tracy.2`. At Phase 6, turn `MASTER_MUST_BE_MARKED` into an outright ban.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

interface Rule {
  readonly what: string
  readonly file: string
  /** Pattern that MUST be present. */
  readonly must?: RegExp
  /** Pattern that must NOT be present. */
  readonly forbidden?: RegExp
  readonly why: string
}

const RULES: readonly Rule[] = [
  {
    what: 'the password door closes when the seat door opens',
    file: 'vendor/tracy/dsh-passwords/src/tracy/gateway-doors.ts',
    must: /if \(seatSecret !== ''\)\s*\{\s*app\.use\(\['\/gateway\/login', '\/gateway\/setup'\]/,
    why: 'two entrances to one lane means one the seat book cannot revoke'
  },
  {
    what: 'missing config = no door',
    file: 'vendor/tracy/dsh-passwords/src/tracy/gateway-doors.ts',
    must: /typeof config\.seatSecret === 'string' \? config\.seatSecret\.trim\(\) : ''/,
    why: "an old config has `undefined` there, and `undefined !== ''` opens the HMAC door with a non-string key"
  },
  {
    // ⚠ THIS RULE MOVED HOME ON 16/09/2026 WITHOUT CHANGING MEANING. Before that it guarded `workers/cowork-web`,
    // where each seat sweep built the door from `hostDshFor(env, host)`. That Worker was deleted with the whole
    // `workers/` tree; the seat door's caller is now `apps/tracy-web`, and the "is this host configured" test
    // lives in its `doorFor`/`config.hosts`. The invariant is unchanged: half a config is NOT a door, and there
    // is no master credential path.
    what: 'missing config = no door, on the tracy-web side',
    file: 'apps/tracy-web/src/config.js',
    must: /need\(env, `HOST_\$\{name\}_DSH_ORIGIN`\)/,
    why: 'a host missing its origin must turn the config RED when read, not open a door with `undefined`'
  }
]

/** The ONLY places allowed to build a signature. Tests may mention the header name to assert that. */
const SIGNING_ALLOWED = [
  'apps/tracy-web/src/workspace/seat-door.js',
  'vendor/tracy/dsh-passwords/src/tracy/gateway-doors.ts',
  'vendor/tracy/dsh-passwords/src/tracy/seat.ts'
]

/**
 * Every OTHER place that once had a reason to sign, and must not. The list changed 16/09/2026 with the
 * deletion of `workers/`: five old Worker files were replaced by the `tracy-web` modules that call the seat
 * door or sit right next to it — where a second copy of the signing algorithm would grow.
 */
const SEARCHED_FOR_SIGNING = [
  'apps/tracy-web/src/workspace/route.js',
  'apps/tracy-web/src/sites/route.js',
  'apps/tracy-web/src/seats/route.js',
  'apps/tracy-web/src/lanes/route.js',
  'apps/tracy-web/src/cron.js',
  'apps/tracy-web/src/host/client.js',
  'apps/tracy-web/src/public/route.js'
]

const violations: string[] = []

for (const rule of RULES) {
  let source: string
  try {
    source = readFileSync(join(ROOT, rule.file), 'utf8')
  } catch {
    violations.push(`${rule.file}: unreadable — rule "${rule.what}" cannot be checked`)
    continue
  }
  if (rule.must !== undefined && !rule.must.test(source)) {
    violations.push(`${rule.file}: lost "${rule.what}" — ${rule.why}`)
  }
  if (rule.forbidden !== undefined && rule.forbidden.test(source)) {
    violations.push(`${rule.file}: violates "${rule.what}" — ${rule.why}`)
  }
}

for (const file of SEARCHED_FOR_SIGNING) {
  let source: string
  try {
    source = readFileSync(join(ROOT, file), 'utf8')
  } catch {
    continue
  }
  if (/x-seat-signature/.test(source) && !SIGNING_ALLOWED.includes(file)) {
    violations.push(
      `${file}: builds its own signature header. Only ${SIGNING_ALLOWED[0]} may sign — two copies of one algorithm will drift`
    )
  }
}

if (violations.length > 0) {
  process.stderr.write(`Seat door gate: ${String(violations.length)} violation(s)\n`)
  for (const line of violations) process.stderr.write(`  - ${line}\n`)
  process.exit(1)
}

process.stdout.write(
  `Seat door gate: ${String(RULES.length)} rules + ${String(SEARCHED_FOR_SIGNING.length)} files scanned for signing, clean.\n`
)
