/**
 * Scenarios other than the path fence: dispatcher edges, routing, approval, the four write paths,
 * and the failure / cancel lifecycle. Each returns `{ controls, checks, evidence }` in the shape
 * `fence.mjs` uses: a control that fails means the scenario itself is invalid (PENDING), a check
 * that fails is a finding about the product (FAIL).
 */
import fs from 'node:fs'
import path from 'node:path'

import { prepareWorld } from './fence.mjs'
import { FENCE_SITES, FENCE_TOOLS, allowedValue } from './fence.mjs'
import { SENTINEL, canaryHashes, dsh, emdashExecSeam, hashFile } from './runtime.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

/** The options of the shared runtime: every shipped Tracy host plugin on, the EmDash MCP seam wired. */
export const standardOptions = (extra = {}) => ({
  sites: FENCE_SITES,
  siteTabs: true,
  siteTools: true,
  siteToolsConfig: {
    exec: emdashExecSeam(), // The site's own `io.tracy.cms` container label, read through the docker proxy in production.
    emdash: { cms: async (container) => (container === 'c1-web-1' ? 'emdash' : '') }
  },
  ...extra
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const nonReaper = (execs) => execs.filter((e) => !e.reaper)
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** One tool call on a fresh step; returns the result, new docker execs, and the drive record. */
async function call(rt, sess, name, args, options) {
  const n0 = rt.execs().length
  const r = await rt.drive(sess, [{ calls: [{ name, args }] }], options)
  return {
    r,
    last: r.results.at(-1) ?? { isError: true, text: '(no result)' },
    execs: nonReaper(rt.execs().slice(n0))
  }
}
const touched = (r, execs) =>
  r.trace.fsOps.length + r.trace.harnessSpawns.length + r.trace.fixtures.length + execs.length

// ── dispatcher edges ────────────────────────────────────────────────────────────────────────────

export async function unknownTool(rt) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const bad = await call(rt, sess, 'qa_no_such_tool', { file_path: A.own })
  const good = await call(rt, sess, 'read', { file_path: A.own })
  return {
    controls: [
      {
        id: 'known-tool-works-after',
        ok: !good.last.isError && good.last.text.includes(SENTINEL.siteA),
        detail: good.last.text.slice(0, 120)
      }
    ],
    checks: [
      { id: 'error-result', ok: bad.last.isError === true, detail: bad.last.text.slice(0, 200) },
      {
        id: 'says-unknown-tool',
        ok: /unknown tool/i.test(bad.last.text),
        detail: bad.last.text.slice(0, 200)
      },
      {
        id: 'no-backend-call',
        ok: touched(bad.r, bad.execs) === 0,
        detail: JSON.stringify(bad.r.trace.fsOps)
      },
      { id: 'turn-settled', ok: bad.r.settled, detail: `ms=${bad.r.ms}` }
    ],
    evidence: { text: bad.last.text.slice(0, 200) }
  }
}

/**
 * Schema-invalid arguments for one tool: nothing required given, a value of the wrong type, and a
 * body that is not JSON at all. Each must be an error result and must not reach the backend.
 */
export async function schemaInvalid(rt, tool, schema) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const checks = []
  const required = schema?.required ?? []
  const props = schema?.properties ?? {}
  const variants = [['empty-object', {}]]
  const typed = required.find((name) => props[name]?.type === 'string')
  if (typed !== undefined) variants.push(['wrong-type', { [typed]: 12345 }])
  variants.push(['not-json', '{this is not json'])
  for (const [name, args] of variants) {
    const { r, last, execs } = await call(rt, sess, tool, args)
    checks.push({
      id: `${name}-is-refused`,
      ok: last.isError === true || /"ok":\s*false/.test(last.text),
      detail: last.text.slice(0, 200)
    })
    checks.push({
      id: `${name}-backend-untouched`,
      ok: touched(r, execs) === 0,
      detail: `fs=${r.trace.fsOps.length} spawn=${r.trace.spawns.length}`
    })
    checks.push({ id: `${name}-settled`, ok: r.settled, detail: `ms=${r.ms}` })
  }
  const good = tool === 'read' ? await call(rt, sess, 'read', { file_path: A.own }) : null
  const controls = [
    { id: 'schema-lists-required', ok: required.length > 0, detail: JSON.stringify(required) }
  ]
  if (good)
    controls.push({
      id: 'valid-call-still-works',
      ok: !good.last.isError,
      detail: good.last.text.slice(0, 100)
    })
  return { controls, checks, evidence: { tool, required } }
}

/** A session with no workspace: nothing may run for the tools that need a site. */
export async function missingCwdDispatch(rt, tool, buildArgs) {
  prepareWorld(rt)
  const sess = await rt.session({ cwd: null })
  const { r, last, execs } = await call(rt, sess, tool, buildArgs(rt.world))
  const home = await rt.session({ cwd: rt.world.sites.a1.dir })
  const control = await call(rt, home, tool, buildArgs(rt.world))
  return {
    controls: [
      {
        id: 'same-call-works-with-a-site',
        ok: !control.last.isError && !/"ok":\s*false/.test(control.last.text),
        detail: control.last.text.slice(0, 120)
      }
    ],
    checks: [
      {
        id: 'refused',
        ok: last.isError === true || /"ok":\s*false/.test(last.text),
        detail: last.text.slice(0, 200)
      },
      {
        id: 'no-backend',
        ok: touched(r, execs) === 0,
        detail: `exec=${execs.length} fs=${r.trace.fsOps.length}`
      },
      { id: 'settled', ok: r.settled, detail: `ms=${r.ms}` }
    ],
    evidence: { text: last.text.slice(0, 200) }
  }
}

export async function streamFailure(rt, variant) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const script =
    variant === 'provider-error'
      ? [{ error: 'qa provider unavailable' }]
      : variant === 'broken-stream'
        ? [{ breakStream: 'qa stream broke', partial: 'writing the page' }]
        : [
            {
              calls: [
                {
                  name: 'write',
                  args: { file_path: path.join(A.dir, '.webroot', 'w.txt'), content: 'QA-WRITE' }
                }
              ]
            },
            { breakStream: 'qa stream broke after a tool' }
          ]
  const before = canaryHashes(rt.world)
  const failed = await rt.drive(sess, script)
  const lateFile = fs.existsSync(path.join(A.dir, '.webroot', 'w.txt'))
  await sleep(300)
  const next = await rt.drive(sess, [
    { calls: [{ name: 'read', args: { file_path: A.own } }] },
    { text: 'recovered' }
  ])
  const execsAfter = rt.execs().length
  await sleep(200)
  return {
    controls: [
      {
        id: 'session-usable-afterwards',
        ok: next.settled && next.results.some((x) => !x.isError && x.text.includes(SENTINEL.siteA)),
        detail: `settled=${next.settled}`
      }
    ],
    checks: [
      {
        id: 'settles-in-bounded-time',
        ok: failed.settled && failed.ms < 30000,
        detail: `settled=${failed.settled} ms=${failed.ms}`
      },
      { id: 'turn-end-recorded', ok: failed.turnEnds.length === 1, detail: JSON.stringify(failed.turnEnds) },
      {
        id: 'no-tool-ran-for-failed-model',
        ok: variant === 'broken-after-tool' ? failed.calls.length === 1 : failed.calls.length === 0,
        detail: `calls=${failed.calls.length}`
      },
      {
        id: 'no-late-write',
        ok: variant === 'broken-after-tool' ? lateFile : !lateFile,
        detail: `file=${lateFile}`
      },
      {
        id: 'no-new-docker-after-quiescence',
        ok: rt.execs().length === execsAfter,
        detail: 'docker exec after settle'
      },
      {
        id: 'canaries-unchanged',
        ok: JSON.stringify(before) === JSON.stringify(canaryHashes(rt.world)),
        detail: 'canary hash moved'
      }
    ],
    evidence: { turnEnds: failed.turnEnds }
  }
}

export async function cancel(rt, variant) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const late = path.join(A.dir, '.webroot', 'late.txt')
  fs.rmSync(late, { force: true })
  const checks = []
  const controls = []
  const before = canaryHashes(rt.world)
  let evidence = {}
  if (variant === 'model-hang') {
    const asked = () => rt.model.requests.some((req) => String(req.sessionId) === String(sess.id))
    const r = await rt.drive(sess, [{ hang: true }], { cancelWhen: asked, deadlineMs: 20000 })
    checks.push({
      id: 'settles-after-cancel',
      ok: r.settled && r.msAfterCancel !== null && r.msAfterCancel < 15000,
      detail: `settled=${r.settled} afterCancel=${r.msAfterCancel}`
    })
    checks.push({ id: 'turn-ended', ok: r.turnEnds.length === 1, detail: JSON.stringify(r.turnEnds) })
    evidence = { turnEnds: r.turnEnds }
  } else if (variant === 'tool-write') {
    const n = rt.backend.fixtures.length
    const r = await rt.drive(sess, [{ calls: [{ name: 'qa_slow_write', args: { file: late } }] }], {
      cancelWhen: () => rt.backend.fixtures.length > n,
      deadlineMs: 20000
    })
    await sleep(900)
    controls.push({
      id: 'tool-was-started',
      ok: r.trace.fixtures.some((f) => f.name === 'qa_slow_write'),
      detail: JSON.stringify(r.trace.fixtures)
    })
    checks.push({
      id: 'settles-after-cancel',
      ok: r.settled && r.msAfterCancel !== null && r.msAfterCancel < 15000,
      detail: `settled=${r.settled} afterCancel=${r.msAfterCancel}`
    })
    checks.push({
      id: 'no-write-after-quiescence',
      ok: !fs.existsSync(late),
      detail: `late file exists=${fs.existsSync(late)}`
    })
    evidence = { turnEnds: r.turnEnds }
  } else if (variant === 'shell-hang') {
    rt.setDocker({ hang: true })
    const n0 = rt.dockerCalls().length
    const r = await rt.drive(
      sess,
      [{ calls: [{ name: 'bash', args: { command: 'sleep 600', description: 'long', workdir: A.dir } }] }],
      { cancelWhen: () => rt.dockerCalls().length > n0, deadlineMs: 20000 }
    )
    rt.setDocker({})
    await sleep(500)
    const calls = rt.dockerCalls().slice(n0)
    const pids = [...new Set(calls.map((c) => c.pid))]
    controls.push({
      id: 'shell-was-started',
      ok: nonReaper(rt.execs()).length >= 1,
      detail: `docker calls=${calls.length}`
    })
    checks.push({
      id: 'settles-after-cancel',
      ok: r.settled && r.msAfterCancel !== null && r.msAfterCancel < 15000,
      detail: `settled=${r.settled} afterCancel=${r.msAfterCancel}`
    })
    checks.push({
      id: 'no-child-left',
      ok: pids.every((pid) => !pidAlive(pid)),
      detail: `alive=${pids.filter(pidAlive)}`
    })
    evidence = { pids, turnEnds: r.turnEnds }
  }
  checks.push({
    id: 'canaries-unchanged',
    ok: JSON.stringify(before) === JSON.stringify(canaryHashes(rt.world)),
    detail: 'canary hash moved'
  })
  const next = await rt.drive(sess, [{ calls: [{ name: 'read', args: { file_path: A.own } }] }])
  controls.push({
    id: 'session-usable-afterwards',
    ok: next.settled && next.results.some((x) => !x.isError),
    detail: `settled=${next.settled}`
  })
  return { controls, checks, evidence }
}

export async function toolFailure(rt, variant) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const checks = []
  let evidence = {}
  if (variant === 'tool-throws') {
    const { r, last } = await call(rt, sess, 'qa_throw', {})
    checks.push({ id: 'error-result', ok: last.isError === true, detail: last.text.slice(0, 160) })
    checks.push({
      id: 'error-text-kept',
      ok: last.text.includes('qa-tool-failure'),
      detail: last.text.slice(0, 160)
    })
    checks.push({ id: 'settled', ok: r.settled, detail: `ms=${r.ms}` })
  } else if (variant === 'missing-file') {
    const { r, last } = await call(rt, sess, 'read', {
      file_path: path.join(A.dir, '.webroot', 'does-not-exist.txt')
    })
    checks.push({ id: 'error-result', ok: last.isError === true, detail: last.text.slice(0, 160) })
    checks.push({
      id: 'not-a-fence-denial',
      ok: !last.text.includes('outside the session'),
      detail: last.text.slice(0, 160)
    })
    checks.push({ id: 'settled', ok: r.settled, detail: `ms=${r.ms}` })
  } else {
    // The container command itself fails: the exit status reaches the model, the call is not retried.
    rt.setDocker({ exit: 3, stdout: '', stderr: 'qa: command failed\n' })
    const { r, last, execs } = await call(rt, sess, 'bash', {
      command: 'false',
      description: 'fails',
      workdir: A.dir
    })
    rt.setDocker({})
    checks.push({
      id: 'failure-visible',
      ok: last.isError === true || /exit|3|fail/i.test(last.text),
      detail: last.text.slice(0, 200)
    })
    checks.push({ id: 'one-exec-no-retry-storm', ok: execs.length === 1, detail: `execs=${execs.length}` })
    checks.push({ id: 'settled', ok: r.settled, detail: `ms=${r.ms}` })
    evidence = { text: last.text.slice(0, 200) }
  }
  const next = await call(rt, sess, 'read', { file_path: A.own })
  return {
    controls: [
      { id: 'session-usable-afterwards', ok: !next.last.isError, detail: next.last.text.slice(0, 80) }
    ],
    checks,
    evidence
  }
}

/** The docker daemon is unreachable: bounded, visible, no write, no secret. */
export async function dockerDown(rt) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const before = canaryHashes(rt.world)
  rt.setDocker({
    exit: 125,
    stdout: '',
    stderr: 'Cannot connect to the Docker daemon at tcp://qa:2375. Is the docker daemon running?\n'
  })
  const { r, last, execs } = await call(
    rt,
    sess,
    'bash',
    { command: 'ls', description: 'ls', workdir: A.dir },
    { deadlineMs: 30000 }
  )
  rt.setDocker({})
  const ok = await call(rt, sess, 'bash', { command: 'ls', description: 'ls', workdir: A.dir })
  return {
    controls: [
      {
        id: 'works-once-docker-is-back',
        ok: !ok.last.isError && ok.execs.length === 1,
        detail: ok.last.text.slice(0, 80)
      }
    ],
    checks: [
      { id: 'settles-in-bounded-time', ok: r.settled && r.ms < 30000, detail: `ms=${r.ms}` },
      {
        id: 'failure-visible-to-model',
        ok: last.isError === true || /Cannot connect|125|daemon/i.test(last.text),
        detail: last.text.slice(0, 220)
      },
      { id: 'bounded-attempts', ok: execs.length >= 1 && execs.length <= 3, detail: `execs=${execs.length}` },
      {
        id: 'canaries-unchanged',
        ok: JSON.stringify(before) === JSON.stringify(canaryHashes(rt.world)),
        detail: 'canary hash moved'
      }
    ],
    evidence: { text: last.text.slice(0, 220) }
  }
}

/** The mode is lowered mid-session: later writes are refused, later shells run as the read-only user. */
export async function permissionRevoked(rt) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const { setSandboxMode } = await dsh('sandbox/sandbox-policy')
  const canariesBefore = canaryHashes(rt.world)
  const sess = await rt.session({ cwd: A.dir })
  const first = path.join(A.dir, '.webroot', 'before-revoke.txt')
  const second = path.join(A.dir, '.webroot', 'after-revoke.txt')
  fs.rmSync(first, { force: true })
  fs.rmSync(second, { force: true })
  const w1 = await call(rt, sess, 'write', { file_path: first, content: 'ok' })
  const sh1 = await call(rt, sess, 'bash', { command: 'id', description: 'id', workdir: A.dir })
  setSandboxMode(sess.agent.session, 'read-only')
  const w2 = await call(rt, sess, 'write', { file_path: second, content: 'must-not-land' })
  const sh2 = await call(rt, sess, 'bash', { command: 'id', description: 'id', workdir: A.dir })
  return {
    controls: [
      {
        id: 'write-allowed-before-revocation',
        ok: !w1.last.isError && fs.existsSync(first),
        detail: w1.last.text.slice(0, 100)
      },
      { id: 'shell-user-before', ok: sh1.execs[0]?.user === 'www-data', detail: `user=${sh1.execs[0]?.user}` }
    ],
    checks: [
      {
        id: 'write-refused-after-revocation',
        ok: w2.last.isError === true,
        detail: w2.last.text.slice(0, 200)
      },
      { id: 'file-not-created', ok: !fs.existsSync(second), detail: `exists=${fs.existsSync(second)}` },
      {
        id: 'shell-user-after-is-read-only-user',
        ok: sh2.execs[0]?.user === 'nobody',
        detail: `user=${sh2.execs[0]?.user}`
      },
      {
        id: 'canaries-unchanged',
        ok: JSON.stringify(canariesBefore) === JSON.stringify(canaryHashes(rt.world)),
        detail: 'canary hash moved'
      }
    ],
    evidence: { before: sh1.execs[0]?.user, after: sh2.execs[0]?.user }
  }
}

// ── routing ─────────────────────────────────────────────────────────────────────────────────────

/** A shell command lands in the container of the session's own site, as the mode's user. */
export async function routeShell(rt, label, expectedUser = 'www-data') {
  prepareWorld(rt)
  const site = rt.world.sites[label]
  const other = Object.values(rt.world.sites).find((s) => s.label !== label && s.label !== `${label}x`)
  const sess = await rt.session({ cwd: site.dir })
  const sessOther = await rt.session({ cwd: other.dir })
  // Both sessions at once: the routing must not depend on the order or on shared state.
  const n0 = rt.execs().length
  const [a, b] = await Promise.all([
    rt.drive(sess, [
      { calls: [{ name: 'bash', args: { command: 'echo a', description: 'a', workdir: site.dir } }] }
    ]),
    rt.drive(sessOther, [
      { calls: [{ name: 'bash', args: { command: 'echo b', description: 'b', workdir: other.dir } }] }
    ])
  ])
  const execs = nonReaper(rt.execs().slice(n0))
  const mine = execs.filter((e) => e.container === `${label}-web-1`)
  const theirs = execs.filter((e) => e.container === `${other.label}-web-1`)
  return {
    controls: [
      {
        id: 'both-sessions-ran',
        ok: a.settled && b.settled && execs.length === 2,
        detail: `execs=${execs.length}`
      }
    ],
    checks: [
      { id: 'own-container', ok: mine.length === 1, detail: JSON.stringify(execs.map((e) => e.container)) },
      { id: 'own-workdir', ok: mine[0]?.workdir === `/site/${label}`, detail: `workdir=${mine[0]?.workdir}` },
      { id: 'mode-user', ok: mine[0]?.user === expectedUser, detail: `user=${mine[0]?.user}` },
      {
        id: 'other-session-other-container',
        ok: theirs.length === 1 && theirs[0].workdir === `/site/${other.label}`,
        detail: JSON.stringify(theirs.map((e) => [e.container, e.workdir]))
      },
      { id: 'no-cross-routing', ok: mine.every((e) => e.workdir === `/site/${label}`), detail: '' }
    ],
    evidence: { cms: site.cms, execs: execs.map((e) => [e.container, e.user, e.workdir]) }
  }
}

/** Relative paths resolve inside the session's OWN site: A and B read their own files. */
export async function routeFiles(rt, tool) {
  prepareWorld(rt)
  const { sites } = rt.world
  const sa = await rt.session({ cwd: sites.a1.dir })
  const sb = await rt.session({ cwd: sites.b1.dir })
  const args = {
    read: { file_path: '.webroot/own.txt' },
    grep: { pattern: 'QA-OWN', path: '.webroot' },
    glob: { pattern: '*', path: '.webroot' },
    write: { file_path: '.webroot/routed.txt', content: 'routed' },
    edit: null
  }[tool]
  if (args === null) return null
  fs.rmSync(path.join(sites.a1.dir, '.webroot/routed.txt'), { force: true })
  fs.rmSync(path.join(sites.b1.dir, '.webroot/routed.txt'), { force: true })
  const a = await call(rt, sa, tool, args)
  const b = await call(rt, sb, tool, args)
  const checks = []
  if (tool === 'write') {
    checks.push({
      id: 'a-wrote-in-a',
      ok: fs.existsSync(path.join(sites.a1.dir, '.webroot/routed.txt')),
      detail: ''
    })
    checks.push({
      id: 'b-wrote-in-b',
      ok: fs.existsSync(path.join(sites.b1.dir, '.webroot/routed.txt')),
      detail: ''
    })
  } else if (tool === 'glob') {
    checks.push({
      id: 'a-sees-only-a',
      ok: a.last.text.includes('only-a1.txt') && !a.last.text.includes('only-b1.txt'),
      detail: a.last.text.slice(0, 160)
    })
    checks.push({
      id: 'b-sees-only-b',
      ok: b.last.text.includes('only-b1.txt') && !b.last.text.includes('only-a1.txt'),
      detail: b.last.text.slice(0, 160)
    })
  } else {
    checks.push({
      id: 'a-reads-a',
      ok: a.last.text.includes(`${SENTINEL.siteA} a1`) && !a.last.text.includes(' b1'),
      detail: a.last.text.slice(0, 160)
    })
    checks.push({
      id: 'b-reads-b',
      ok: b.last.text.includes(`${SENTINEL.siteA} b1`) && !b.last.text.includes(' a1'),
      detail: b.last.text.slice(0, 160)
    })
  }
  return {
    controls: [
      {
        id: 'both-calls-succeeded',
        ok: !a.last.isError && !b.last.isError,
        detail: `${a.last.text.slice(0, 60)} | ${b.last.text.slice(0, 60)}`
      }
    ],
    checks,
    evidence: {}
  }
}

// ── approval ────────────────────────────────────────────────────────────────────────────────────

const ESCALATION = { sandbox_permissions: 'danger-full-access', justification: 'qa: needs the whole disk' }

/** A new session is pinned `approval: never` and an escalation is refused without any question. */
export async function approvalNever(rt, tool) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const target = path.join(A.dir, '.webroot', 'escalated.txt')
  fs.rmSync(target, { force: true })
  const args =
    tool === 'bash'
      ? { command: 'echo escalated', description: 'escalate', workdir: A.dir, ...ESCALATION }
      : { file_path: target, content: 'must-not-land', ...ESCALATION }
  const control =
    tool === 'bash'
      ? await call(rt, sess, 'bash', { command: 'echo plain', description: 'plain', workdir: A.dir })
      : await call(rt, sess, 'write', { file_path: path.join(A.dir, '.webroot', 'plain.txt'), content: 'ok' })
  const { r, last, execs } = await call(rt, sess, tool, args, { deadlineMs: 25000 })
  const types = sess.agent.session.snapshotEvents().map((e) => e.type)
  const policy = [...sess.agent.session.snapshotEvents()].reverse().find((e) => e.type === 'approval/policy')
    ?.data?.policy
  return {
    controls: [{ id: 'plain-call-works', ok: !control.last.isError, detail: control.last.text.slice(0, 80) }],
    checks: [
      { id: 'session-pinned-never', ok: policy === 'never', detail: `policy=${policy}` },
      {
        id: 'escalation-refused',
        ok: last.isError === true || !(tool === 'bash' ? execs.length > 0 : fs.existsSync(target)),
        detail: last.text.slice(0, 200)
      },
      {
        id: 'no-effect',
        ok:
          tool === 'bash'
            ? !execs.some((e) => e.program.join(' ').includes('escalated'))
            : !fs.existsSync(target),
        detail: `execs=${execs.length}`
      },
      {
        id: 'no-customer-question',
        ok:
          rt.forwardedToBrowsers() === 0 &&
          types
            .filter((t) => t === 'approval/decided')
            .every(() =>
              sess.agent.session
                .snapshotEvents()
                .filter((e) => e.type === 'approval/decided')
                .every((e) => e.data?.outcome === 'rejected')
            ),
        detail: `forwarded=${rt.forwardedToBrowsers()} ${types.filter((t) => t.startsWith('approval')).join(',')}`
      },
      { id: 'settles-in-bounded-time', ok: r.settled && r.ms < 20000, detail: `ms=${r.ms}` }
    ],
    evidence: { policy, text: last.text.slice(0, 200) }
  }
}

/** A session pinned `ask` before the `never` rows existed: answered `rejected` at once, never waiting. */
export async function approvalLegacyAsk(rt, tool) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir, policy: 'ask' })
  const target = path.join(A.dir, '.webroot', 'asked.txt')
  fs.rmSync(target, { force: true })
  const args =
    tool === 'bash'
      ? { command: 'echo asked', description: 'escalate', workdir: A.dir, ...ESCALATION }
      : { file_path: target, content: 'must-not-land', ...ESCALATION }
  const n0 = rt.execs().length
  const { r, last } = await call(rt, sess, tool, args, { deadlineMs: 25000 })
  const events = sess.agent.session.snapshotEvents()
  const decided = events.filter((e) => e.type === 'approval/decided')
  const execs = nonReaper(rt.execs().slice(n0))
  return {
    controls: [
      {
        id: 'browsers-would-never-answer',
        ok: rt.forwarderRegistered() === true,
        detail: 'a silent approval forwarder is registered, so a question that left would hang and be counted'
      }
    ],
    checks: [
      { id: 'does-not-hang', ok: r.settled && r.ms < 20000, detail: `settled=${r.settled} ms=${r.ms}` },
      {
        id: 'rejected',
        ok: last.isError === true && /reject/i.test(last.text),
        detail: last.text.slice(0, 200)
      },
      {
        id: 'decision-audited-as-rejected',
        ok: decided.length >= 1 && decided.every((e) => e.data?.outcome === 'rejected'),
        detail: JSON.stringify(decided.map((e) => e.data))
      },
      {
        id: 'question-never-reaches-browsers',
        ok: rt.forwardedToBrowsers() === 0,
        detail: `forwarded=${rt.forwardedToBrowsers()}`
      },
      {
        id: 'no-effect',
        ok: tool === 'bash' ? execs.length === 0 : !fs.existsSync(target),
        detail: `execs=${execs.length}`
      }
    ],
    evidence: { text: last.text.slice(0, 200), ms: r.ms }
  }
}

// ── the four write paths × CMS ──────────────────────────────────────────────────────────────────

const doorOf = (r, suffix) =>
  r.trace.doorRequests.filter((d) => d.url.endsWith(suffix) && d.method === 'POST')
const actorOk = (d, label) =>
  d.headers['x-tracy-actor'] === 'signed:an@example.test' && d.headers['x-tracy-workspace-label'] === label

/** The turn the chat opened is the one the write reports against (the Site changes correlation). */
function turnChecks(r, label, { expectWrite }) {
  const turn = doorOf(r, '/turn')
  const moment = doorOf(r, '/moment')
  const checks = [
    { id: 'turn-opened-once', ok: turn.length === 1, detail: `turn calls=${turn.length}` },
    {
      id: 'turn-actor-and-label',
      ok: turn.length === 1 && actorOk(turn[0], label),
      detail: JSON.stringify(turn[0]?.headers ?? {}).slice(0, 200)
    },
    {
      id: 'turn-source-is-panel',
      ok: turn[0]?.body?.source === 'panel',
      detail: `source=${turn[0]?.body?.source}`
    },
    {
      id: 'moment-closed-same-turn',
      ok: moment.length === 1 && moment[0].body?.turnId === turn[0]?.body?.turnId,
      detail: `moment=${moment.length}`
    },
    {
      id: 'moment-actor-and-label',
      ok: moment.length === 1 && actorOk(moment[0], label),
      detail: JSON.stringify(moment[0]?.headers ?? {}).slice(0, 200)
    }
  ]
  if (expectWrite) {
    const turnId = turn[0]?.body?.turnId
    checks.push({
      id: 'write-carries-the-turn',
      ok: expectWrite.every((d) => d.headers['x-tracy-turn'] === turnId),
      detail: JSON.stringify(expectWrite.map((d) => d.headers['x-tracy-turn']))
    })
  }
  return checks
}

export async function writePath(rt, pathKind, cms) {
  prepareWorld(rt)
  const label = { wordpress: 'a1', joomla: 'b1', emdash: 'c1' }[cms]
  const site = rt.world.sites[label]
  const sess = await rt.session({ cwd: site.dir })
  const before = canaryHashes(rt.world)
  const others = Object.values(rt.world.sites).filter((s) => s.label !== label)
  const otherBefore = others.map((s) => hashFile(s.own))
  let r
  let checks = []
  let controls = []
  let evidence = { cms, pathKind }
  if (pathKind === 'shell') {
    const n0 = rt.execs().length
    r = await rt.drive(sess, [
      {
        calls: [
          {
            name: 'bash',
            args: { command: 'echo changed > note.txt', description: 'write a file', workdir: site.dir }
          }
        ]
      }
    ])
    const execs = nonReaper(rt.execs().slice(n0))
    controls.push({ id: 'shell-ran', ok: execs.length === 1, detail: `execs=${execs.length}` })
    checks.push({
      id: 'ran-in-site-container',
      ok: execs[0]?.container === `${label}-web-1`,
      detail: `container=${execs[0]?.container}`
    })
    checks.push({
      id: 'ran-as-site-user',
      ok: execs[0]?.user === 'www-data',
      detail: `user=${execs[0]?.user}`
    })
    checks.push(...turnChecks(r, label, { expectWrite: null }))
    evidence.container = execs[0]?.container
  } else if (pathKind === 'file-tool') {
    const file = path.join(site.dir, '.webroot', 'filetool.txt')
    fs.rmSync(file, { force: true })
    r = await rt.drive(sess, [
      { calls: [{ name: 'write', args: { file_path: file, content: 'QA-FILE-TOOL' } }] }
    ])
    controls.push({
      id: 'file-written',
      ok: fs.existsSync(file) && readTextSync(file) === 'QA-FILE-TOOL',
      detail: `exists=${fs.existsSync(file)}`
    })
    checks.push({
      id: 'effect-only-in-own-site',
      ok: others.every((s, i) => hashFile(s.own) === otherBefore[i]),
      detail: ''
    })
    checks.push(...turnChecks(r, label, { expectWrite: null }))
  } else if (pathKind === 'apply') {
    const params =
      cms === 'wordpress'
        ? { kind: 'post', id: 1, fields: { title: 'T' } }
        : cms === 'joomla'
          ? { kind: 'article', id: 1, fields: { title: 'T' } }
          : { kind: 'post', id: 1, fields: { title: 'T' } }
    r = await rt.drive(sess, [
      { calls: [{ name: 'tracy_site', args: { action: 'content.update', params } }] }
    ])
    const apply = doorOf(r, '/apply')
    if (cms === 'emdash') {
      // EmDash content is not written through Apply (SYSTEM.md §4c/d): the door must not be reached.
      controls.push({ id: 'call-answered', ok: r.results.length === 1, detail: '' })
      checks.push({
        id: 'apply-door-not-reached',
        ok: apply.length === 0,
        detail: `apply calls=${apply.length}`
      })
      checks.push({
        id: 'refusal-names-platform',
        ok: /NOT_ON_THIS_PLATFORM/.test(r.results[0]?.text ?? ''),
        detail: (r.results[0]?.text ?? '').slice(0, 160)
      })
    } else {
      controls.push({
        id: 'call-answered',
        ok: r.results.length === 1 && !r.results[0].isError,
        detail: (r.results[0]?.text ?? '').slice(0, 100)
      })
      checks.push({
        id: 'apply-door-called-once',
        ok: apply.length === 1,
        detail: `apply calls=${apply.length}`
      })
      checks.push({
        id: 'apply-actor-and-label',
        ok: apply.length === 1 && actorOk(apply[0], label),
        detail: JSON.stringify(apply[0]?.headers ?? {}).slice(0, 200)
      })
      checks.push({
        id: 'apply-carries-session',
        ok: apply[0]?.headers['x-tracy-session'] === String(sess.id),
        detail: `session=${apply[0]?.headers['x-tracy-session']}`
      })
      checks.push({
        id: 'apply-action',
        ok: apply[0]?.body?.action === 'content.update',
        detail: `action=${apply[0]?.body?.action}`
      })
      checks.push(...turnChecks(r, label, { expectWrite: apply }))
    }
  } else {
    // 'changed': a write outside Apply is reported to POST /changed.
    let n0 = rt.door.requests.length
    if (cms === 'emdash') {
      const id = '01M36TA83763RSVSN5R28DZ0E1'
      r = await rt.drive(sess, [
        {
          calls: [
            {
              name: 'tracy_emdash',
              args: {
                tool: 'content_update',
                arguments: {
                  collection: 'home',
                  id,
                  _rev: 'MzoyMDI2LTA5LTI0VDA0OjM2OjQ1LjA0MFo=',
                  data: { title: 'Hi' }
                }
              }
            }
          ]
        }
      ])
    } else {
      const rel =
        cms === 'wordpress'
          ? '.webroot/wp-content/themes/qa/style.css'
          : '.webroot/templates/qa/css/template.css'
      fs.mkdirSync(path.dirname(path.join(site.dir, rel)), { recursive: true })
      r = await rt.drive(sess, [
        {
          calls: [
            { name: 'write', args: { file_path: path.join(site.dir, rel), content: 'body{color:red}' } }
          ]
        }
      ])
    }
    await sleep(150)
    const changed = rt.door.requests
      .slice(n0)
      .filter((d) => d.url.endsWith('/changed') && d.method === 'POST')
    const via = cms === 'emdash' ? 'emdash-mcp' : 'file-look'
    controls.push({
      id: 'write-answered',
      ok:
        r.results.length === 1 &&
        !r.results[0].isError &&
        (cms !== 'emdash' || /"ok":true/.test(r.results[0].text)),
      detail: (r.results[0]?.text ?? '').slice(0, 100)
    })
    checks.push({
      id: 'changed-reported-once',
      ok: changed.length === 1,
      detail: `changed calls=${changed.length}`
    })
    checks.push({
      id: 'changed-actor-and-label',
      ok: changed.length === 1 && actorOk(changed[0], label),
      detail: JSON.stringify(changed[0]?.headers ?? {}).slice(0, 200)
    })
    checks.push({
      id: 'changed-via',
      ok: changed[0]?.body?.via === via,
      detail: `via=${changed[0]?.body?.via}`
    })
    checks.push({
      id: 'changed-session',
      ok: changed[0]?.headers['x-tracy-session'] === String(sess.id),
      detail: `session=${changed[0]?.headers['x-tracy-session']}`
    })
    checks.push(...turnChecks(r, label, { expectWrite: changed }))
    // A refusal is not a change: an unreadable path must not be reported.
    const n1 = rt.door.requests.length
    const refused = await rt.drive(sess, [
      { calls: [{ name: 'write', args: { file_path: rt.world.canaries.host, content: 'x' } }] }
    ])
    await sleep(100)
    checks.push({
      id: 'refused-write-not-reported',
      ok:
        rt.door.requests.slice(n1).filter((d) => d.url.endsWith('/changed') && d.method === 'POST').length ===
          0 && refused.results[0]?.isError === true,
      detail: ''
    })
    evidence.via = changed[0]?.body?.via
  }
  checks.push({
    id: 'canaries-unchanged',
    ok: JSON.stringify(before) === JSON.stringify(canaryHashes(rt.world)),
    detail: 'canary hash moved'
  })
  return { controls, checks, evidence }
}

/** Dropping the record is a loss the person sees as a missing row: a failed door must not break the turn. */
export async function recordFailure(rt) {
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const file = path.join(A.dir, '.webroot', 'door-down.txt')
  fs.rmSync(file, { force: true })
  rt.door.behaviour.status = 503
  const r = await rt.drive(
    sess,
    [{ calls: [{ name: 'write', args: { file_path: file, content: 'QA-DOOR-DOWN' } }] }],
    { deadlineMs: 30000 }
  )
  rt.door.behaviour.status = 200
  return {
    controls: [
      {
        id: 'door-was-asked',
        ok: doorOf(r, '/turn').length >= 1,
        detail: `turn calls=${doorOf(r, '/turn').length}`
      }
    ],
    checks: [
      { id: 'turn-still-completes', ok: r.settled, detail: `ms=${r.ms}` },
      { id: 'write-still-lands', ok: fs.existsSync(file), detail: '' },
      {
        id: 'close-attempts-bounded',
        ok: doorOf(r, '/moment').length <= 3,
        detail: `moment calls=${doorOf(r, '/moment').length}`
      }
    ],
    evidence: { moment: doorOf(r, '/moment').length }
  }
}

/** An allowed call of one tool leaves the Site changes record of its turn: opened, closed, signed. */
export async function fenceAudit(rt, toolKey) {
  prepareWorld(rt)
  const spec = FENCE_TOOLS[toolKey]
  const tool = spec.tool ?? toolKey
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  const value = allowedValue(spec, A)
  const pre = spec.pre?.(value) ?? []
  const r = await rt.drive(sess, [
    ...pre.map((c) => ({ calls: [c] })),
    { calls: [{ name: tool, args: spec.build(value) }] }
  ])
  const last = r.results.at(-1)
  const checks = turnChecks(r, 'a1', { expectWrite: null })
  if (tool === 'write' || tool === 'edit') {
    checks.push({
      id: 'effect-in-site-files',
      ok: spec.proof(last, { leafPath: path.join(A.dir, '.webroot', spec.leaf) }) === null,
      detail: last.text.slice(0, 100)
    })
  }
  return {
    controls: [
      { id: 'call-succeeded', ok: last?.isError === false, detail: (last?.text ?? '').slice(0, 100) }
    ],
    checks,
    evidence: { tool }
  }
}

/**
 * Disposing a runtime leaves nothing of the scenario behind: no child process of the fake docker,
 * the process environment as it was, `console.error` restored, the scratch folder removable.
 * Builds its OWN runtime (the shared one is still in use) and takes it down.
 */
export async function cleanupRuntime({ createRuntime, base, tmpRootFor, removeScratch, extra = {} }) {
  const before = {
    sites: process.env.TRACY_SITES_ROOT,
    origin: process.env.MCP_TRACY_ORIGIN,
    home: process.env.DSH_HOME,
    error: console.error
  }
  const root = tmpRootFor(base, 'cleanup')
  const rt = await createRuntime({ root, ...standardOptions(), ...extra })
  prepareWorld(rt)
  const A = rt.world.sites.a1
  const sess = await rt.session({ cwd: A.dir })
  rt.setDocker({ hang: true })
  const n0 = rt.dockerCalls().length
  await rt.drive(
    sess,
    [{ calls: [{ name: 'bash', args: { command: 'sleep 600', description: 'long', workdir: A.dir } }] }],
    { cancelWhen: () => rt.dockerCalls().length > n0, deadlineMs: 20000 }
  )
  const pids = [...new Set(rt.dockerCalls().map((c) => c.pid))]
  const during = { sites: process.env.TRACY_SITES_ROOT, home: process.env.DSH_HOME }
  await rt.dispose()
  await sleep(300)
  let removed = true
  try {
    removeScratch(root, base)
  } catch {
    removed = false
  }
  return {
    controls: [
      {
        id: 'runtime-was-live',
        ok: during.sites === rt.world.sitesRoot && pids.length > 0,
        detail: `sites=${during.sites} pids=${pids.length}`
      }
    ],
    checks: [
      {
        id: 'no-child-left',
        ok: pids.every((pid) => !pidAlive(pid)),
        detail: `alive=${pids.filter(pidAlive)}`
      },
      {
        id: 'env-restored',
        ok:
          process.env.TRACY_SITES_ROOT === before.sites &&
          process.env.MCP_TRACY_ORIGIN === before.origin &&
          process.env.DSH_HOME === before.home,
        detail: JSON.stringify({ now: process.env.TRACY_SITES_ROOT, was: before.sites })
      },
      { id: 'console-restored', ok: console.error === before.error, detail: '' },
      { id: 'scratch-removed', ok: removed && !fs.existsSync(root), detail: root }
    ],
    evidence: { pids }
  }
}
