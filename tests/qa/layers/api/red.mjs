// RED proof by mutation, in a scratch copy of apps/tracy-web/src. A mutant is a recorded, exact text
// replacement in ONE product file ("drop an auth check", "flip a role compare", "leak a field"…).
// The same manifests that PASS on the real tree are run, unchanged, on the mutant; a case earns a
// proof only when its own assertion turns FAIL there. Hard rules:
//   * the mutant must APPLY (the text to replace occurs exactly once);
//   * the mutant must BOOT and answer a control request — an import/boot failure is never a RED;
//   * a case that stays green on the mutant gets no proof (it stays PENDING), whatever the mutant is;
//   * a proof is valid only while the hashes of the test inputs, the oracle and the mutation still match.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { sha256 } from './io.mjs'
import { runAgainst } from './runner.mjs'
import { SCENARIO_MUTANTS, scenarioByKey } from './scenarios.mjs'
import { readBytesSync, readTextSync } from '../../lib/bounded-reader.mjs'

/** Each mutant names the tags whose cases it is meant to break; cases of other tags are not run on it. */
export const MUTANTS = Object.freeze([
  {
    id: 'M01-anonymous-becomes-owner',
    description:
      'drop the sign-in check: a request with no usable session cookie is treated as the site owner',
    file: 'src/lib/http.js',
    find: "return sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret)",
    replace:
      "return (await sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret)) ?? 'owner-a@qa.test'",
    tags: ['anonymous', 'expired-auth']
  },
  {
    id: 'M02-session-never-expires',
    description: 'drop the expiry compare of the session token',
    file: 'src/lib/session.js',
    find: "if (typeof body.exp !== 'number' || body.exp * 1000 < now) return null",
    replace: "if (typeof body.exp !== 'number') return null",
    tags: ['expired-auth']
  },
  {
    id: 'M03-session-signature-unchecked',
    description: 'accept a session token whose HMAC does not verify',
    file: 'src/lib/session.js',
    find: 'if (!ok) return null',
    replace: 'if (false) return null',
    tags: ['expired-auth']
  },
  {
    id: 'M04-staff-gate-open',
    description: 'flip the staff role compare: a signed-in person with no tracy_admin seat is staff',
    file: 'src/ops/admit.js',
    find: 'if (!role) return null\n  return { email, role }',
    replace: "if (!role) return { email, role: 'owner' }\n  return { email, role }",
    tags: ['wrong-role']
  },
  {
    id: 'M05-csrf-guard-off',
    description: 'the cross-site request guard lets every write through',
    file: 'src/lib/csrf.js',
    find: 'if (!MUTATING.has(method)) return next()',
    replace: 'return next()',
    tags: ['csrf-origin']
  },
  {
    id: 'M06-seat-lookup-ignores-account',
    description:
      'the seat lookup of a site no longer filters by the person: any signed-in account has the first seat',
    file: 'src/seats/store.js',
    find: 'where account_id = $1 and site_key = $2\n       and revoked_at is null and declined_at is null and accepted_at is not null`',
    replace:
      'where $1::text is not null and site_key = $2\n       and revoked_at is null and declined_at is null and accepted_at is not null`',
    tags: ['other-tenant', 'empty']
  },
  {
    id: 'M07-config-leaks-in-header',
    description: 'leak a field: every answer carries the session secret in a debug header',
    file: 'src/app.js',
    find: 'export function buildApp(deps) {\n  const app = new Hono()',
    replace:
      "export function buildApp(deps) {\n  const app = new Hono()\n  app.use('*', async (c, next) => {\n    await next()\n    c.res.headers.set('x-debug-config', String(deps.config?.sessionSecret ?? ''))\n  })",
    tags: ['no-secret-leak']
  },
  {
    id: 'M08-health-answers-every-method',
    description: 'break a route: /health is mounted for every method instead of GET',
    file: 'src/app.js',
    find: "app.get('/health', (c) => c.json({ ok: true }))",
    replace: "app.all('/health', (c) => c.json({ ok: true }))",
    tags: ['wrong-method']
  },
  {
    id: 'M09-api-key-secret-unchecked',
    description: 'accept an API key whatever its secret half is',
    file: 'src/lib/api-key.js',
    find: "if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { error: 'KEY_INVALID' }",
    replace: 'void expected; void given',
    tags: ['expired-auth']
  },
  {
    id: 'M10-api-key-revocation-ignored',
    description: 'a revoked API key still opens the door',
    file: 'src/lib/api-key.js',
    find: "if (row.revoked_at) return { error: 'KEY_REVOKED' }",
    replace: '',
    tags: ['expired-auth']
  },
  {
    id: 'M11-activity-limit-unvalidated',
    description: 'drop the limit validation of the activity list',
    file: 'src/sites/activity.js',
    find: "if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX)\n      return json(c, { code: 'INVALID_LIMIT' }, 400)\n    const filter = c.req.query('filter') ?? 'all'",
    replace: "const filter = c.req.query('filter') ?? 'all'",
    tags: ['pagination', 'boundary']
  },
  {
    id: 'M12-team-invite-body-unchecked',
    description:
      'drop the body check of the team invitation: a missing or non-object body reaches the handler',
    file: 'src/seats/route.js',
    find: "const body = await c.req.json().catch(() => null)\n    if (!body) return json(c, { code: 'INVALID_REQUEST' }, 400)\n    // Owners are made from the Team list, never by invitation (ADR 0028).\n    const role = body.role",
    replace: 'const body = await c.req.json().catch(() => null)\n    const role = body.role',
    tags: ['malformed-body', 'partial-write', 'empty']
  },
  {
    id: 'M13-key-touch-writes-every-key',
    description:
      "the use stamp of an API key is written on every call and onto every key, so one tenant's request changes another tenant's row",
    file: 'src/lib/api-key.js',
    find: "if (row.last_used_at === null || row.last_used_at.getTime() + TOUCH_EVERY_MS <= now) {\n    await pool.query('update api_key set last_used_at = $2 where id = $1', [row.id, new Date(now)])",
    replace:
      "if (true) {\n    await pool.query('update api_key set last_used_at = $2 where id = $1 or id is not null', [row.id, new Date(now)])",
    tags: ['other-tenant']
  }
])

/** Every mutant a run proves RED with: the tag mutants above, then the door-scenario mutants. */
export const ALL_MUTANTS = Object.freeze([
  ...MUTANTS,
  ...SCENARIO_MUTANTS.map((m) => ({
    ...m,
    tags: [...new Set(m.scenarios.map((k) => scenarioByKey.get(k).tag))]
  }))
])

/** Hashes that decide whether an old proof still describes today's test. */
export function inputHashes(layerDir, oracleDir, fixtureDir = join(layerDir, '..', '..', 'fixtures', 'api')) {
  const read = (p) => readBytesSync(p)
  const fixtures = existsSync(fixtureDir)
    ? readdirSync(fixtureDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => read(join(fixtureDir, f)))
    : []
  return {
    tests: sha256(
      Buffer.concat(
        ['assertions.mjs', 'exec.mjs', 'plan.mjs', 'runner.mjs', 'harness.mjs', 'scenarios.mjs'].map((f) =>
          read(join(layerDir, f))
        )
      )
    ),
    oracle: sha256(Buffer.concat(['pin.json', 'exceptions.json'].map((f) => read(join(oracleDir, f))))),
    fixtures: sha256(Buffer.concat(fixtures))
  }
}

export const manifestHash = (m) => sha256(JSON.stringify(m))
/** `also` (further edits of one mutant, each `{ file, find, replace }`) is part of what was mutated. */
export const mutationHash = (mutant) =>
  sha256(
    [mutant, ...(mutant.also ?? [])]
      .map((e, i) => `${i ? `${e.file}\n` : ''}${e.find}\n=>\n${e.replace}`)
      .join('\n--\n')
  )

/**
 * A proof counts only if it is a mutation proof for THIS case (id, manifest hash, assertion), its hashes
 * are current, and its log (read through `readLog`) really says this case went red on a booted, applied mutant.
 */
export function proofIsValid(proof, { caseManifest, hashes, logExists, readLog = null }) {
  if (!proof || proof.kind !== 'mutation')
    return { ok: false, why: proof ? `kind ${proof.kind} is not a mutation proof` : 'no proof' }
  if (proof.caseId !== caseManifest.id)
    return { ok: false, why: `proof names case ${proof.caseId ?? 'nothing'}, not ${caseManifest.id}` }
  if (!caseManifest.assertionIds.includes(proof.assertionId) || proof.failedAssertionId !== proof.assertionId)
    return { ok: false, why: 'proof is for another assertion' }
  if (proof.manifestSha256 !== manifestHash(caseManifest))
    return { ok: false, why: 'stale: the case manifest changed' }
  if (
    proof.testsSha256 !== hashes.tests ||
    proof.oracleSha256 !== hashes.oracle ||
    proof.fixturesSha256 !== hashes.fixtures
  )
    return { ok: false, why: 'stale: test, oracle or fixture hash changed' }
  if (typeof proof.log !== 'string' || proof.log.startsWith('/') || proof.log.includes('..'))
    return { ok: false, why: 'log path escapes the output directory' }
  if (!logExists(proof.log)) return { ok: false, why: 'proof log is missing' }
  if (proof.mutantBooted !== true)
    return { ok: false, why: 'the mutant did not boot: a boot failure is not a RED' }
  if (typeof proof.mutationSha256 !== 'string' || proof.mutationSha256.length !== 64)
    return { ok: false, why: 'proof has no mutation hash' }
  if (readLog) {
    const log = readLog(proof.log)
    if (typeof log !== 'string') return { ok: false, why: 'proof log is unreadable' }
    if (!log.includes(`mutation sha256 ${proof.mutationSha256}`))
      return { ok: false, why: 'proof log does not carry this mutation hash' }
    if (!/applied=true booted=true/.test(log))
      return { ok: false, why: 'proof log does not show an applied, booted mutant' }
    if (
      !log
        .split('\n')
        .some(
          (l) => l.startsWith('RED ') && l.includes(` ${caseManifest.id} [${proof.assertionId}] good PASS`)
        )
    )
      return { ok: false, why: 'proof log has no RED line for this case and assertion' }
  }
  return { ok: true }
}

export function applyMutation(source, mutant) {
  const first = source.indexOf(mutant.find)
  if (first === -1) return { ok: false, why: 'the text to replace is not in the file' }
  if (source.indexOf(mutant.find, first + 1) !== -1)
    return { ok: false, why: 'the text to replace occurs more than once' }
  return {
    ok: true,
    source: source.slice(0, first) + mutant.replace + source.slice(first + mutant.find.length)
  }
}

/**
 * @param {{ repoRoot: string, appRoot: string, clusterUrl: string, outDir: string, hashes: object,
 *   goodResults: Map<string, {v: string}>, manifests: object[], doorIndex: Map, doorsByPath: Map, exceptions: object,
 *   mutants?: object[], onMutant?: (m: object, summary: object) => void }} opts
 * @returns {Promise<{ proofs: Map<string, object>, mutants: object[] }>}
 */
export async function proveRed(opts) {
  const proofs = new Map()
  const summaries = []
  const logDir = join(opts.outDir, 'redproof')
  mkdirSync(logDir, { recursive: true })
  for (const mutant of opts.mutants ?? ALL_MUTANTS) {
    const summary = {
      id: mutant.id,
      description: mutant.description,
      file: mutant.file,
      tags: mutant.tags,
      applied: false,
      booted: false,
      cases: 0,
      red: 0,
      survived: 0
    }
    summaries.push(summary)
    const logRel = `redproof/${mutant.id}.log`
    const lines = [`mutant ${mutant.id}: ${mutant.description}`, `file ${mutant.file}`]
    const scratch = join(opts.outDir, 'scratch', mutant.id)
    try {
      rmSync(scratch, { recursive: true, force: true })
      mkdirSync(scratch, { recursive: true })
      // Same depth as the real tree (apps/tracy-web) with `packages` linked: some product files read
      // `../../../../packages/...` relative to themselves, so a flat copy would not boot.
      const appCopy = join(scratch, 'apps', 'tracy-web')
      mkdirSync(appCopy, { recursive: true })
      cpSync(join(opts.appRoot, 'src'), join(appCopy, 'src'), { recursive: true })
      cpSync(join(opts.appRoot, 'package.json'), join(appCopy, 'package.json'))
      symlinkSync(join(opts.appRoot, 'node_modules'), join(appCopy, 'node_modules'), 'dir')
      symlinkSync(join(opts.repoRoot, 'packages'), join(scratch, 'packages'), 'dir')
      const target = join(appCopy, mutant.file)
      const original = readTextSync(target)
      const applied = applyMutation(original, mutant)
      if (!applied.ok) {
        lines.push(`NOT APPLIED: ${applied.why}`)
        summary.reason = applied.why
        continue
      }
      writeFileSync(target, applied.source)
      // A rule kept in two places needs both taken out to show: every further edit must apply too.
      let alsoMissed = null
      for (const edit of mutant.also ?? []) {
        const file = join(appCopy, edit.file)
        const more = applyMutation(readTextSync(file), edit)
        if (!more.ok) {
          alsoMissed = `${edit.file}: ${more.why}`
          break
        }
        writeFileSync(file, more.source)
        lines.push(`also ${edit.file}`, '--- replaced', edit.find, '--- with', edit.replace, '---')
      }
      if (alsoMissed) {
        lines.push(`NOT APPLIED: ${alsoMissed}`)
        summary.reason = alsoMissed
        continue
      }
      summary.applied = true
      summary.mutantFileSha256 = sha256(applied.source)
      lines.push(
        `mutation sha256 ${mutationHash(mutant)}`,
        `mutated file sha256 ${summary.mutantFileSha256}`,
        '--- replaced',
        mutant.find,
        '--- with',
        mutant.replace,
        '---'
      )

      // A scenario mutant names its scenarios; a tag mutant is never run on a scenario.
      const targeted = (m) =>
        mutant.scenarios
          ? mutant.scenarios.includes(m.scenario)
          : !m.scenario && mutant.tags.includes(m.edgeTags[0])
      const subset = opts.manifests.filter((m) => targeted(m) && opts.goodResults.get(m.id)?.v === 'PASS')
      summary.cases = subset.length
      if (subset.length === 0) {
        lines.push('no green case carries a targeted tag: nothing to run')
        continue
      }
      const run = await runAgainst({
        appRoot: appCopy,
        clusterUrl: opts.clusterUrl,
        manifests: subset,
        doorIndex: opts.doorIndex,
        doorsByPath: opts.doorsByPath,
        exceptions: opts.exceptions,
        label: `m${mutant.id.slice(1, 3)}`
      })
      if (!run.ok) {
        lines.push(`MUTANT DID NOT BOOT: ${run.bootError}`)
        summary.reason = `mutant did not boot: ${run.bootError}`
        continue
      }
      summary.booted = true
      for (const m of subset) {
        const r = run.results.get(m.id)
        const assertionId = m.assertionIds[0]
        if (r?.v === 'FAIL') {
          summary.red += 1
          lines.push(`RED      ${m.id} [${assertionId}] good PASS → mutant FAIL: ${r.reason}`)
          const existing = proofs.get(m.id)
          if (!existing)
            proofs.set(m.id, {
              kind: 'mutation',
              ref: mutant.id,
              caseId: m.id,
              assertionId,
              failedAssertionId: assertionId,
              manifestSha256: manifestHash(m),
              mutationSha256: mutationHash(mutant),
              fixturesSha256: opts.hashes.fixtures,
              log: logRel,
              mutantBooted: true,
              mutantFileSha256: summary.mutantFileSha256,
              testsSha256: opts.hashes.tests,
              oracleSha256: opts.hashes.oracle,
              mutantReason: r.reason
            })
        } else {
          summary.survived += 1
          lines.push(
            `survived ${m.id} [${assertionId}] mutant verdict ${r?.v ?? 'none'}${r ? `: ${r.reason}` : ''}`
          )
        }
      }
    } catch (error) {
      lines.push(`MUTANT RUN FAILED: ${error?.message ?? error}`)
      summary.reason = String(error?.message ?? error)
    } finally {
      lines.push(
        `summary: applied=${summary.applied} booted=${summary.booted} cases=${summary.cases} red=${summary.red} survived=${summary.survived}`
      )
      writeFileSync(join(opts.outDir, logRel), `${lines.join('\n')}\n`)
      rmSync(scratch, { recursive: true, force: true })
      opts.onMutant?.(mutant, summary)
    }
  }
  rmSync(join(opts.outDir, 'scratch'), { recursive: true, force: true })
  void relative
  void existsSync
  return { proofs, mutants: summaries }
}
