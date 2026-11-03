// The `site-ds-slot` job (src/ds-slot.js): a design system put on a running site and taken back.
// The EmDash script is RUN here for real — node, against a temporary file standing for
// `/app/data/ds-slot.css` — through a fake `docker` that executes it; WordPress and Joomla scripts
// run only inside their containers (measured on the stand: tasks/evidence/design-system-button-2026-10-11/),
// so here they are held to their shape and the job's bookkeeping is driven by a fake.
//
//   node --test apps/tracy-host/test/ds-slot.test.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import {
  DS_SLOT_KIND,
  DS_TIMEOUT_MS,
  DS_UNDO_DIR,
  dsSlot,
  dsSlotArgv,
  EMDASH_DS_SCRIPT,
  JOOMLA_DS_PHP,
  parseDsLine,
  validateDsSlotBody,
  WORDPRESS_DS_PHP,
  WORDPRESS_READ_PHP
} from '../src/ds-slot.js'

const LABEL = 'dsbtn1'
const SHEET = (id, name) =>
  `/* tracy-ds-slot: od:${id} (${name}) — generated, do not edit */\n:root{--ds-accent:#635bff}\n`

/** A fake `run` that executes the EmDash script with node against `file` instead of /app/data. */
function emdashRun(file) {
  const calls = []
  const run = async ({ script, args, stdin }) => {
    calls.push({ script, args })
    assert.equal(script, 'docker')
    assert.equal(args[args.length - 2], '-e')
    const code = args[args.length - 1].replace('"/app/data/ds-slot.css"', JSON.stringify(file))
    const out = execFileSync(process.execPath, ['-e', code], { input: stdin, encoding: 'utf8' })
    return { code: 0, tail: out.split('\n') }
  }
  return { run, calls }
}

function roots() {
  const privateRoot = mkdtempSync(path.join(tmpdir(), 'ds-slot-'))
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'ds-data-')), 'ds-slot.css')
  return { config: { privateRoot }, file }
}

test('EmDash: apply writes the sheet, keeps what was there, undo puts it back exactly', async () => {
  const { config, file } = roots()
  const { run } = emdashRun(file)
  let n = 0
  const newId = () => `00000000000${++n}`

  const read0 = await dsSlot({ body: { label: LABEL, mode: 'read', platform: 'emdash' }, config, run })
  assert.deepEqual(read0, { ok: true, slot: null })

  const a = await dsSlot({
    body: {
      label: LABEL,
      mode: 'apply',
      platform: 'emdash',
      payload: { system: 'od:stripe', css: SHEET('stripe', 'Stripe') }
    },
    config,
    run,
    newId
  })
  assert.equal(a.ok, true)
  assert.deepEqual(a.slot, { id: 'od:stripe', name: 'Stripe' })
  assert.equal(readFileSync(file, 'utf8'), SHEET('stripe', 'Stripe'))
  const entry = path.join(config.privateRoot, LABEL, DS_UNDO_DIR, a.undoId)
  assert.equal(JSON.parse(readFileSync(path.join(entry, 'before'), 'utf8')).file, null)

  const b = await dsSlot({
    body: {
      label: LABEL,
      mode: 'apply',
      platform: 'emdash',
      payload: { system: 'od:linear-app', css: SHEET('linear-app', 'Linear') }
    },
    config,
    run,
    newId
  })
  assert.equal(readFileSync(file, 'utf8'), SHEET('linear-app', 'Linear'))

  // Undo the newest: the first system's sheet comes back byte for byte.
  const ub = await dsSlot({
    body: { label: LABEL, mode: 'undo', platform: 'emdash', id: b.undoId },
    config,
    run
  })
  assert.deepEqual(ub, { ok: true, id: b.undoId, slot: { id: 'od:stripe', name: 'Stripe' } })
  assert.equal(readFileSync(file, 'utf8'), SHEET('stripe', 'Stripe'))
  const again = await dsSlot({
    body: { label: LABEL, mode: 'undo', platform: 'emdash', id: b.undoId },
    config,
    run
  })
  assert.deepEqual(again, { ok: false, code: 'DS_UNDO_USED' })

  // Undo the first: no sheet at all, as before it (the template's own look).
  const ua = await dsSlot({
    body: { label: LABEL, mode: 'undo', platform: 'emdash', id: a.undoId },
    config,
    run
  })
  assert.equal(ua.ok, true)
  assert.equal(existsSync(file), false)
})

test('EmDash: a sheet changed after the apply is never overwritten by undo', async () => {
  const { config, file } = roots()
  const { run } = emdashRun(file)
  const a = await dsSlot({
    body: {
      label: LABEL,
      mode: 'apply',
      platform: 'emdash',
      payload: { system: 'od:stripe', css: SHEET('stripe', 'Stripe') }
    },
    config,
    run
  })
  writeFileSync(file, SHEET('apple', 'Apple'))
  const u = await dsSlot({
    body: { label: LABEL, mode: 'undo', platform: 'emdash', id: a.undoId },
    config,
    run
  })
  assert.deepEqual(u, { ok: false, code: 'DS_CHANGED_SINCE' })
  assert.equal(readFileSync(file, 'utf8'), SHEET('apple', 'Apple'))
})

test('the EmDash script refuses a sheet without the generated header (the template would ignore it)', async () => {
  const { config, file } = roots()
  const { run } = emdashRun(file)
  await assert.rejects(
    dsSlot({
      body: {
        label: LABEL,
        mode: 'apply',
        platform: 'emdash',
        payload: { system: 'od:stripe', css: ':root{}' }
      },
      config,
      run
    }),
    /not a slot sheet/
  )
  assert.equal(existsSync(file), false)
})

test('an unknown undo id, or one of another platform, is refused without touching the site', async () => {
  const { config, file } = roots()
  const { run, calls } = emdashRun(file)
  assert.deepEqual(
    await dsSlot({
      body: { label: LABEL, mode: 'undo', platform: 'emdash', id: 'abcdefabcdef' },
      config,
      run
    }),
    { ok: false, code: 'DS_UNDO_UNKNOWN' }
  )
  const a = await dsSlot({
    body: {
      label: LABEL,
      mode: 'apply',
      platform: 'emdash',
      payload: { system: 'od:stripe', css: SHEET('stripe', 'Stripe') }
    },
    config,
    run
  })
  const before = calls.length
  assert.deepEqual(
    await dsSlot({
      body: { label: LABEL, mode: 'undo', platform: 'joomla', id: a.undoId },
      config,
      run: async () => assert.fail('no run')
    }),
    { ok: false, code: 'DS_UNDO_UNKNOWN' }
  )
  assert.equal(calls.length, before)
})

test("WordPress / Joomla: the job keeps the scripts' before/after and answers hashes only", async () => {
  for (const platform of ['wordpress', 'joomla']) {
    const config = { privateRoot: mkdtempSync(path.join(tmpdir(), 'ds-slot-')) }
    let state = 'S0'
    const run = async ({ args, stdin }) => {
      const q = JSON.parse(stdin)
      const say = (a) => ({
        code: 0,
        tail: ['noise', `TRACY_DS_JOB ${Buffer.from(JSON.stringify(a)).toString('base64')}`]
      })
      if (q.mode === 'apply') {
        const b = state
        state = 'S1'
        return say({ ok: true, before: b, after: state, slot: { id: 'od:stripe', name: null } })
      }
      if (q.mode === 'restore') {
        if (q.expect !== state) return say({ ok: false, conflict: true })
        state = q.before
        return say({ ok: true, slot: null })
      }
      return say({ ok: true, slot: null, stylesheet: 'tracy-base', template: 'tracy_base', args })
    }
    const payload =
      platform === 'wordpress'
        ? {
            system: 'od:stripe',
            slug: 'ds-od-stripe',
            name: 'Stripe',
            variation: { version: 3, settings: {} }
          }
        : {
            system: 'od:stripe',
            html: '<style id="tracy-ds-slot">/* tracy-ds-slot: od:stripe */</style>',
            module: { title: 'Tracy design system', position: 'header-r', ordering: 0, style: 'System-none' }
          }
    const a = await dsSlot({ body: { label: LABEL, mode: 'apply', platform, payload }, config, run })
    assert.equal(a.ok, true)
    assert.equal(typeof a.before, 'string')
    assert.equal(a.before.length, 64, 'a hash, not the site bytes')
    const r = await dsSlot({ body: { label: LABEL, mode: 'read', platform }, config, run })
    assert.equal(
      platform === 'wordpress' ? r.stylesheet : r.template,
      platform === 'wordpress' ? 'tracy-base' : 'tracy_base'
    )
    const u = await dsSlot({ body: { label: LABEL, mode: 'undo', platform, id: a.undoId }, config, run })
    assert.equal(u.ok, true)
    assert.equal(state, 'S0')
  }
})

test('validateDsSlotBody accepts the three shapes and refuses everything else', () => {
  const ok = (b) => assert.equal(validateDsSlotBody({ kind: DS_SLOT_KIND, label: LABEL, ...b }), null)
  const no = (b) => assert.notEqual(validateDsSlotBody({ kind: DS_SLOT_KIND, label: LABEL, ...b }), null)
  ok({ mode: 'read', platform: 'joomla' })
  ok({ mode: 'undo', platform: 'emdash', id: 'abcdefabcdef' })
  ok({ mode: 'apply', platform: 'emdash', payload: { system: 'od:stripe', css: SHEET('stripe', 'Stripe') } })
  ok({
    mode: 'apply',
    platform: 'wordpress',
    payload: { system: 'od:stripe', slug: 'ds-od-stripe', name: 'Stripe', variation: {} }
  })
  no({ mode: 'read', platform: 'shopify' })
  no({ mode: 'undo', platform: 'emdash', id: '../../etc' })
  no({ mode: 'apply', platform: 'emdash', payload: { system: 'od:stripe', css: ':root{}' } })
  no({ mode: 'apply', platform: 'emdash', payload: { system: 'refero:x', css: SHEET('x', 'x') } })
  no({
    mode: 'apply',
    platform: 'wordpress',
    payload: { system: 'od:stripe', slug: '../x', name: 'S', variation: {} }
  })
  no({
    mode: 'apply',
    platform: 'joomla',
    payload: { system: 'od:stripe', html: 'tracy-ds-slot:', module: { title: 'T', position: 'a b' } }
  })
  no({ mode: 'read', platform: 'emdash', extra: 1 })
})

test("every script runs in the site's own web container, never another", () => {
  for (const p of ['emdash', 'wordpress', 'joomla'])
    assert.ok(dsSlotArgv(p, 'dsbtn1-web-1').includes('dsbtn1-web-1'))
  assert.throws(() => dsSlotArgv('emdash', 'tracy-web'))
  assert.throws(() => dsSlotArgv('emdash', 'x-db-1'))
  assert.ok(WORDPRESS_DS_PHP.includes('tracy_apply_inspiration'))
  assert.ok(
    !dsSlotArgv('wordpress', 'a-web-1').includes('--skip-themes'),
    'the theme is loaded: its function is the write'
  )
  assert.ok(JOOMLA_DS_PHP.includes('modules_menu'))
  assert.ok(EMDASH_DS_SCRIPT.includes('/app/data/ds-slot.css'))
  assert.equal(parseDsLine(['x']), null)
})

test('POST /_host/site routes site-ds-slot and refuses a bad body before anything runs', async () => {
  const dir = (n) => mkdtempSync(path.join(tmpdir(), `ds-${n}-`))
  const config = {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: dir('sites'),
    privateRoot: dir('private'),
    scriptsDir: '/opt/tracy-fleet',
    jobsDir: dir('jobs'),
    logDir: dir('logs'),
    cloudflare: null
  }
  const all = new Map()
  const jobs = {
    put: async (id, fields) => all.set(id, { ...all.get(id), ...fields }),
    get: async (id) => all.get(id) ?? null
  }
  const file = path.join(dir('data'), 'ds-slot.css')
  const app = buildApp({ config, jobs, run: emdashRun(file).run })
  const call = async (payload) => {
    const body = JSON.stringify(payload)
    const headers = await signHostCall({ secret: 'host-secret', path: '/_host/site', body })
    return app.fetch(new Request('http://tracy-host.test/_host/site', { method: 'POST', headers, body }))
  }
  const res = await call({ kind: DS_SLOT_KIND, label: LABEL, mode: 'read', platform: 'emdash' })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  for (let i = 0; i < 200 && all.get(jobId)?.state !== 'done'; i++) await new Promise((r) => setTimeout(r, 5))
  assert.deepEqual(JSON.parse(all.get(jobId).output), { ok: true, slot: null })
  assert.equal(
    (await call({ kind: DS_SLOT_KIND, label: '../x', mode: 'read', platform: 'emdash' })).status,
    400
  )
  assert.equal(
    (await call({ kind: DS_SLOT_KIND, label: LABEL, mode: 'apply', platform: 'emdash', payload: {} })).status,
    400
  )
})

// ── One run per press, sized for a busy host (timing: tasks/evidence/design-system-button-2026-10-11/timing.md) ──

test('EmDash: the apply says what the site wore just before, read in the same run', async () => {
  const { config, file } = roots()
  const { run, calls } = emdashRun(file)
  const a = await dsSlot({
    body: {
      label: LABEL,
      mode: 'apply',
      platform: 'emdash',
      payload: { system: 'od:stripe', css: SHEET('stripe', 'Stripe') }
    },
    config,
    run
  })
  assert.equal(a.previous, null)
  const b = await dsSlot({
    body: {
      label: LABEL,
      mode: 'apply',
      platform: 'emdash',
      payload: { system: 'od:apple', css: SHEET('apple', 'Apple') }
    },
    config,
    run
  })
  assert.deepEqual(b.previous, { id: 'od:stripe', name: 'Stripe' })
  assert.equal(calls.length, 2, 'one run per apply')
})

test('WordPress reads with SHORTINIT php (no WP-CLI, no theme, no plugins); it writes with the theme loaded', () => {
  const read = dsSlotArgv('wordpress', 'a-web-1', 'read')
  assert.deepEqual(read.slice(0, 8), [
    'exec',
    '-i',
    '-u',
    'www-data',
    '-w',
    '/var/www/html',
    'a-web-1',
    'php'
  ])
  assert.equal(read.at(-1), WORDPRESS_READ_PHP)
  assert.ok(!read.includes('wp'), 'no WP-CLI boot for a read')
  assert.ok(WORDPRESS_READ_PHP.startsWith('define("SHORTINIT",true);'))
  assert.ok(WORDPRESS_READ_PHP.includes("x.taxonomy='wp_theme'"), 'the post is found by its wp_theme term')
  for (const mode of ['apply', 'restore']) {
    const argv = dsSlotArgv('wordpress', 'a-web-1', mode)
    assert.ok(argv.includes('wp') && argv.includes('eval') && argv.at(-1) === WORDPRESS_DS_PHP)
    assert.ok(!argv.includes('--skip-themes'))
  }
  assert.ok(!WORDPRESS_DS_PHP.includes('"mode"]==="read"'), 'the full boot no longer answers reads')
})

test('each run gets the limit of its mode: a busy host is waited for, a write never cut at 60 s', async () => {
  const seen = []
  const run = async ({ timeoutMs, stdin }) => {
    seen.push([JSON.parse(stdin).mode, timeoutMs])
    const q = JSON.parse(stdin)
    const a =
      q.mode === 'apply' ? { ok: true, before: 'A', after: 'B', slot: null } : { ok: true, slot: null }
    return { code: 0, tail: [`TRACY_DS_JOB ${Buffer.from(JSON.stringify(a)).toString('base64')}`] }
  }
  const config = { privateRoot: mkdtempSync(path.join(tmpdir(), 'ds-slot-')) }
  const payload = { system: 'od:stripe', slug: 'ds-od-stripe', name: 'Stripe', variation: {} }
  await dsSlot({ body: { label: LABEL, mode: 'read', platform: 'wordpress' }, config, run })
  const a = await dsSlot({
    body: { label: LABEL, mode: 'apply', platform: 'wordpress', payload },
    config,
    run
  })
  await dsSlot({ body: { label: LABEL, mode: 'undo', platform: 'wordpress', id: a.undoId }, config, run })
  assert.deepEqual(seen, [
    ['read', DS_TIMEOUT_MS.read],
    ['apply', DS_TIMEOUT_MS.apply],
    ['restore', DS_TIMEOUT_MS.undo]
  ])
  assert.ok(DS_TIMEOUT_MS.read >= 45_000 && DS_TIMEOUT_MS.apply >= 120_000 && DS_TIMEOUT_MS.undo >= 120_000)
})

test('WordPress / Joomla: an apply names the template it was made for; another one running writes nothing', async () => {
  for (const platform of ['wordpress', 'joomla']) {
    const config = { privateRoot: mkdtempSync(path.join(tmpdir(), 'ds-slot-')) }
    const runs = []
    const running =
      platform === 'wordpress'
        ? { stylesheet: 'wp-ja-kinetic', themeVersion: '1.1.11' }
        : { template: 'ja_kinetic' }
    const run = async ({ stdin }) => {
      const q = JSON.parse(stdin)
      runs.push(q)
      const raw = running.stylesheet ?? running.template
      const a =
        q.templates && !q.templates.includes(raw)
          ? { ok: false, code: 'DS_TEMPLATE_MOVED', slot: { id: 'od:apple', name: null }, ...running }
          : {
              ok: true,
              before: 'A',
              after: 'B',
              slotBefore: { id: 'od:apple', name: null },
              slot: { id: 'od:stripe', name: null },
              ...running
            }
      return { code: 0, tail: [`TRACY_DS_JOB ${Buffer.from(JSON.stringify(a)).toString('base64')}`] }
    }
    const base =
      platform === 'wordpress'
        ? { system: 'od:stripe', slug: 'ds-od-stripe', name: 'Stripe', variation: {} }
        : {
            system: 'od:stripe',
            html: '/* tracy-ds-slot: od:stripe */',
            module: { title: 'Tracy design system', position: 'header-r' }
          }
    const moved = await dsSlot({
      body: {
        label: LABEL,
        mode: 'apply',
        platform,
        payload: { ...base, templates: ['tracy-base', 'tracy'] }
      },
      config,
      run
    })
    assert.deepEqual(moved, {
      ok: false,
      code: 'DS_TEMPLATE_MOVED',
      slot: { id: 'od:apple', name: null },
      ...running
    })
    assert.equal(existsSync(path.join(config.privateRoot, LABEL, DS_UNDO_DIR)), false, 'no undo entry')
    assert.deepEqual(runs[0].templates, ['tracy-base', 'tracy'])
    const ok = await dsSlot({
      body: {
        label: LABEL,
        mode: 'apply',
        platform,
        payload: { ...base, templates: [running.stylesheet ?? running.template] }
      },
      config,
      run
    })
    assert.equal(ok.ok, true)
    assert.deepEqual(ok.previous, { id: 'od:apple', name: null })
    assert.equal(ok.stylesheet ?? ok.template, running.stylesheet ?? running.template)
  }
  assert.ok(WORDPRESS_DS_PHP.includes('DS_TEMPLATE_MOVED') && JOOMLA_DS_PHP.includes('DS_TEMPLATE_MOVED'))
  assert.ok(WORDPRESS_DS_PHP.includes('"slotBefore"') && JOOMLA_DS_PHP.includes('"slotBefore"'))
  assert.ok(EMDASH_DS_SCRIPT.includes('slotBefore'))
})

test('validateDsSlotBody: `templates` only on WordPress / Joomla, one to four plain names', () => {
  const body = (platform, templates) => ({
    kind: DS_SLOT_KIND,
    label: LABEL,
    mode: 'apply',
    platform,
    payload:
      platform === 'emdash'
        ? { system: 'od:stripe', css: SHEET('stripe', 'Stripe'), templates }
        : { system: 'od:stripe', slug: 'ds-od-stripe', name: 'Stripe', variation: {}, templates }
  })
  assert.equal(validateDsSlotBody(body('wordpress', ['tracy-base', 'tracy'])), null)
  assert.equal(validateDsSlotBody(body('wordpress', undefined)), null)
  assert.notEqual(validateDsSlotBody(body('emdash', ['x'])), null)
  assert.notEqual(validateDsSlotBody(body('wordpress', [])), null)
  assert.notEqual(validateDsSlotBody(body('wordpress', ['a b'])), null)
  assert.notEqual(validateDsSlotBody(body('wordpress', ['a', 'b', 'c', 'd', 'e'])), null)
  assert.notEqual(validateDsSlotBody(body('wordpress', 'tracy')), null)
})

test('WordPress: the read says the running theme’s version (still one php run); an apply checks minTheme in its run', async () => {
  assert.ok(WORDPRESS_READ_PHP.includes('"themeVersion"=>$tv'))
  assert.ok(WORDPRESS_READ_PHP.includes('/style.css'), 'the Version header of the theme’s style.css')
  assert.ok(WORDPRESS_DS_PHP.includes('version_compare($tv,$need,"<")'))
  // …and past the last release confirmed to wear the slot (`maxTheme`), nothing written either
  assert.ok(WORDPRESS_DS_PHP.includes('version_compare($tv,$top,">")'))
  const config = { privateRoot: mkdtempSync(path.join(tmpdir(), 'ds-slot-')) }
  const seen = []
  const run = async ({ stdin }) => {
    const q = JSON.parse(stdin)
    seen.push(q)
    const a = {
      ok: false,
      code: 'DS_TEMPLATE_MOVED',
      stylesheet: 'wp-ja-kinetic',
      themeVersion: '1.1.9',
      slot: null
    }
    return { code: 0, tail: [`TRACY_DS_JOB ${Buffer.from(JSON.stringify(a)).toString('base64')}`] }
  }
  const payload = {
    system: 'od:stripe',
    slug: 'ds-od-stripe',
    name: 'Stripe',
    variation: {},
    templates: ['wp-ja-kinetic'],
    minTheme: { 'wp-ja-kinetic': '1.1.11' },
    maxTheme: { 'wp-ja-kinetic': '1.1.12' }
  }
  assert.equal(
    validateDsSlotBody({ kind: DS_SLOT_KIND, label: LABEL, mode: 'apply', platform: 'wordpress', payload }),
    null
  )
  const r = await dsSlot({
    body: { label: LABEL, mode: 'apply', platform: 'wordpress', payload },
    config,
    run
  })
  assert.deepEqual(r, {
    ok: false,
    code: 'DS_TEMPLATE_MOVED',
    slot: null,
    stylesheet: 'wp-ja-kinetic',
    themeVersion: '1.1.9'
  })
  assert.deepEqual(seen[0].minTheme, { 'wp-ja-kinetic': '1.1.11' })
  assert.deepEqual(
    seen[0].maxTheme,
    { 'wp-ja-kinetic': '1.1.12' },
    'the run is handed the last release checked'
  )
  const bad = (minTheme, platform = 'wordpress') =>
    validateDsSlotBody({
      kind: DS_SLOT_KIND,
      label: LABEL,
      mode: 'apply',
      platform,
      payload: { ...payload, minTheme }
    })
  assert.notEqual(bad({ 'wp-ja-kinetic': 'x' }), null)
  assert.notEqual(bad({ '../x': '1.0' }), null)
  assert.notEqual(bad(['1.0']), null)
  assert.equal(bad({ 'wp-ja-kinetic': null }), null, 'null: no release wears it yet — the run refuses')
  const badTop = (maxTheme, platform = 'wordpress') =>
    validateDsSlotBody({
      kind: DS_SLOT_KIND,
      label: LABEL,
      mode: 'apply',
      platform,
      payload: { ...payload, minTheme: undefined, maxTheme }
    })
  assert.equal(badTop({ 'wp-ja-kinetic': 'x' }), 'refused maxTheme')
  assert.equal(badTop({ '../x': '1.0' }), 'refused maxTheme')
  assert.equal(badTop(['1.0']), 'refused maxTheme')
  assert.equal(badTop({ 'wp-ja-kinetic': '1.1.12' }, 'joomla'), 'refused maxTheme')
})

test('an apply answers the webroot files it wrote (WordPress), so Site changes folds their seal into the press', async () => {
  const config = { privateRoot: mkdtempSync(path.join(tmpdir(), 'ds-slot-')) }
  const answers = {
    wordpress: [
      'wp-content/uploads/tracy/styles/ds-od-stripe.json',
      'wp-content/uploads/tracy/inspirations.json',
      // Never kept: a path out of the webroot, a climb, a leading slash.
      '/etc/passwd',
      'wp-content/../wp-config.php',
      42
    ],
    joomla: undefined
  }
  for (const platform of ['wordpress', 'joomla']) {
    const run = async () => ({
      code: 0,
      tail: [
        `TRACY_DS_JOB ${Buffer.from(
          JSON.stringify({ ok: true, before: 'A', after: 'B', slot: null, files: answers[platform] })
        ).toString('base64')}`
      ]
    })
    const payload =
      platform === 'wordpress'
        ? { system: 'od:stripe', slug: 'ds-od-stripe', name: 'Stripe', variation: {} }
        : {
            system: 'od:stripe',
            html: '<style>/* tracy-ds-slot: od:stripe */</style>',
            module: { title: 'Tracy design system', position: 'header-r' }
          }
    const a = await dsSlot({ body: { label: LABEL, mode: 'apply', platform, payload }, config, run })
    assert.deepEqual(
      a.files,
      platform === 'wordpress'
        ? ['wp-content/uploads/tracy/styles/ds-od-stripe.json', 'wp-content/uploads/tracy/inspirations.json']
        : [],
      platform
    )
  }
  // The WordPress script names both files it writes, relative to ABSPATH (the webroot).
  assert.match(WORDPRESS_DS_PHP, /\$rr=rtrim\(ABSPATH,"\/"\)\."\/";/)
  assert.match(WORDPRESS_DS_PHP, /foreach\(\[\$dir\."\/styles\/"\.\$slug\."\.json",\$idx\] as \$f\)/)
  assert.match(WORDPRESS_DS_PHP, /"slot"=>\$slot\(\),"files"=>\$fs\]/)
})

test('EmDash: the slot sheet is outside the webroot history, so an apply names no file', async () => {
  const { config, file } = roots()
  const { run } = emdashRun(file)
  const a = await dsSlot({
    body: {
      label: LABEL,
      mode: 'apply',
      platform: 'emdash',
      payload: { system: 'od:stripe', css: SHEET('stripe', 'Stripe') }
    },
    config,
    run
  })
  assert.equal(a.ok, true)
  assert.deepEqual(a.files, [])
})

test('two undos of one entry at once: one puts it back, the other is refused, neither throws', async () => {
  // Two undo jobs for the same id used to write `manifest.json.<pid>.tmp` at once: one rename
  // moved it away and the other job failed with ENOENT although its restore had landed.
  const privateRoot = mkdtempSync(path.join(tmpdir(), 'ds-slot-'))
  try {
    let state = 'S0'
    const run = async ({ stdin }) => {
      const q = JSON.parse(stdin)
      const say = (a) => ({
        code: 0,
        tail: [`TRACY_DS_JOB ${Buffer.from(JSON.stringify(a)).toString('base64')}`]
      })
      if (q.mode === 'apply') {
        const b = state
        state = 'S1'
        return say({ ok: true, before: b, after: state, slot: { id: 'od:stripe', name: null } })
      }
      // Two restores in two containers read the state before either writes it.
      const seen = state
      await new Promise((resolve) => setTimeout(resolve, 10))
      if (q.expect !== seen) return say({ ok: false, conflict: true })
      state = q.before
      return say({ ok: true, slot: null })
    }
    const config = { privateRoot }
    const payload = {
      system: 'od:stripe',
      slug: 'ds-od-stripe',
      name: 'Stripe',
      variation: { version: 3, settings: {} }
    }
    const a = await dsSlot({
      body: { label: LABEL, mode: 'apply', platform: 'wordpress', payload },
      config,
      run
    })
    const undo = () =>
      dsSlot({ body: { label: LABEL, mode: 'undo', platform: 'wordpress', id: a.undoId }, config, run })
    const answers = await Promise.all([undo(), undo()])
    assert.deepEqual(answers.map((x) => x.ok).sort(), [false, true])
    assert.deepEqual(
      answers.find((x) => !x.ok),
      { ok: false, code: 'DS_UNDO_USED' }
    )
    assert.equal(state, 'S0')
    const entry = path.join(privateRoot, LABEL, DS_UNDO_DIR, a.undoId)
    assert.ok(JSON.parse(readFileSync(path.join(entry, 'manifest.json'), 'utf8')).reverted)
    assert.deepEqual(
      readdirSync(entry).filter((n) => n.endsWith('.tmp')),
      []
    )
  } finally {
    rmSync(privateRoot, { recursive: true, force: true })
  }
})
