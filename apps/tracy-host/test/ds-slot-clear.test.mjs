// `site-ds-slot` mode `clear` (src/ds-slot.js): the worn system taken off, back to the template's own
// look (tracy-web's Template default card), kept as one undo entry so its undo puts the system back.
// The EmDash script is RUN for real against a temporary file; WordPress and Joomla run only inside
// their containers, so here their bookkeeping is driven by a fake and their PHP is linted when a
// `php` binary is on the machine.
//
//   node --test apps/tracy-host/test/ds-slot-clear.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  DS_TEMPLATE_DEFAULT,
  DS_TIMEOUT_MS,
  DS_UNDO_DIR,
  dsSlot,
  JOOMLA_DS_PHP,
  validateDsSlotBody,
  WORDPRESS_DS_PHP
} from '../src/ds-slot.js'

const LABEL = 'dsclear1'
const SHEET = (id, name) =>
  `/* tracy-ds-slot: od:${id} (${name}) — generated, do not edit */\n:root{--ds-accent:#635bff}\n`

/** A fake `run` that executes the EmDash script with node against `file` instead of /app/data. */
function emdashRun(file) {
  const calls = []
  const run = async ({ args, stdin, timeoutMs }) => {
    calls.push({ mode: JSON.parse(stdin).mode, timeoutMs })
    const code = args[args.length - 1].replace('"/app/data/ds-slot.css"', JSON.stringify(file))
    const out = execFileSync(process.execPath, ['-e', code], { input: stdin, encoding: 'utf8' })
    return { code: 0, tail: out.split('\n') }
  }
  return { run, calls }
}

const say = (a) => ({
  code: 0,
  tail: ['noise', `TRACY_DS_JOB ${Buffer.from(JSON.stringify(a)).toString('base64')}`]
})

test('validateDsSlotBody: clear takes no payload and no id', () => {
  const body = (b) => validateDsSlotBody({ kind: 'site-ds-slot', label: LABEL, platform: 'emdash', ...b })
  assert.equal(body({ mode: 'clear' }), null)
  assert.notEqual(body({ mode: 'clear', payload: { system: 'od:stripe' } }), null)
  assert.notEqual(body({ mode: 'clear', id: '000000000001' }), null)
  assert.equal(DS_TIMEOUT_MS.clear, DS_TIMEOUT_MS.apply)
})

test('EmDash: after two applies, clear takes the sheet off; its undo puts the second system back', async () => {
  const privateRoot = mkdtempSync(path.join(tmpdir(), 'ds-clear-'))
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'ds-clear-data-')), 'ds-slot.css')
  const config = { privateRoot }
  const { run, calls } = emdashRun(file)
  let n = 0
  const newId = () => `00000000000${++n}`
  const apply = (id, name) =>
    dsSlot({
      body: {
        label: LABEL,
        mode: 'apply',
        platform: 'emdash',
        payload: { system: `od:${id}`, css: SHEET(id, name) }
      },
      config,
      run,
      newId
    })
  await apply('stripe', 'Stripe')
  await apply('linear-app', 'Linear')

  const c = await dsSlot({ body: { label: LABEL, mode: 'clear', platform: 'emdash' }, config, run, newId })
  assert.equal(c.ok, true)
  assert.equal(c.slot, null, 'nothing worn after')
  assert.deepEqual(c.previous, { id: 'od:linear-app', name: 'Linear' })
  assert.equal(c.changed, true)
  assert.deepEqual(c.files, [])
  assert.equal(existsSync(file), false, 'the sheet is gone: the template reads its own look')
  assert.equal(calls.at(-1).timeoutMs, DS_TIMEOUT_MS.clear)
  const manifest = JSON.parse(
    readFileSync(path.join(privateRoot, LABEL, DS_UNDO_DIR, c.undoId, 'manifest.json'), 'utf8')
  )
  assert.equal(manifest.system, DS_TEMPLATE_DEFAULT)

  // Nothing worn: clear again writes nothing and says so.
  const twice = await dsSlot({
    body: { label: LABEL, mode: 'clear', platform: 'emdash' },
    config,
    run,
    newId
  })
  assert.deepEqual(twice, { ok: false, code: 'DS_NOTHING_WORN' })

  // The clear's undo: the second system's sheet comes back byte for byte.
  const u = await dsSlot({
    body: { label: LABEL, mode: 'undo', platform: 'emdash', id: c.undoId },
    config,
    run
  })
  assert.equal(u.ok, true)
  assert.deepEqual(u.slot, { id: 'od:linear-app', name: 'Linear' })
  assert.equal(readFileSync(file, 'utf8'), SHEET('linear-app', 'Linear'))
})

test('EmDash: a file without the slot header is not a worn system; clear leaves it', async () => {
  const privateRoot = mkdtempSync(path.join(tmpdir(), 'ds-clear-'))
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'ds-clear-data-')), 'ds-slot.css')
  writeFileSync(file, ':root{}\n')
  const { run } = emdashRun(file)
  const c = await dsSlot({
    body: { label: LABEL, mode: 'clear', platform: 'emdash' },
    config: { privateRoot },
    run
  })
  assert.deepEqual(c, { ok: false, code: 'DS_NOTHING_WORN' })
  assert.equal(readFileSync(file, 'utf8'), ':root{}\n')
})

/**
 * A fake WordPress container: the state is the global styles text (a slot is a marker in it), as the
 * script's `$state()` would say it. `clear` writes the `bare` state it is handed.
 */
function wordpressRun() {
  const site = { state: JSON.stringify({ post: { id: 7, content: '{"version":3}' }, options: {} }), runs: [] }
  const slotOf = (s) => {
    const m = /tracy-ds-slot: ([A-Za-z0-9:._-]+)/.exec(s)
    return m ? { id: m[1], name: null } : null
  }
  const run = async ({ stdin }) => {
    const q = JSON.parse(stdin)
    site.runs.push(q)
    const theme = { stylesheet: 'tracy-base', themeVersion: '1.1.5' }
    if (q.mode === 'apply') {
      const b = site.state
      const sb = slotOf(b)
      site.state = JSON.stringify({
        post: { id: 7, content: `{"styles":{"css":"/* tracy-ds-slot: ${q.slug} */"}}` },
        options: {}
      })
      return say({
        ok: true,
        before: b,
        after: site.state,
        slotBefore: sb,
        slot: slotOf(site.state),
        ...theme
      })
    }
    if (q.mode === 'clear') {
      const sb = slotOf(site.state)
      if (!sb) return say({ ok: false, code: 'DS_NOTHING_WORN', ...theme })
      const b = site.state
      site.state = q.bare
      return say({
        ok: true,
        before: b,
        after: site.state,
        slotBefore: sb,
        slot: slotOf(site.state),
        ...theme
      })
    }
    if (q.mode === 'restore') {
      if (q.expect !== site.state) return say({ ok: false, conflict: true })
      site.state = q.before
      return say({ ok: true, slot: slotOf(site.state), ...theme })
    }
    return say({ ok: false, error: 'bad mode' })
  }
  return { site, run }
}

const wpApply = (slug) => ({
  label: LABEL,
  mode: 'apply',
  platform: 'wordpress',
  payload: { system: 'od:stripe', slug, name: slug, variation: { version: 3 } }
})

test('WordPress: clear writes back the look from before the first system, and its undo the system', async () => {
  const config = { privateRoot: mkdtempSync(path.join(tmpdir(), 'ds-clear-')) }
  const { site, run } = wordpressRun()
  const bare = site.state
  let n = 0
  const newId = () => `00000000000${++n}`
  let clock = Date.parse('2026-10-15T08:00:00Z')
  const step = (body) => dsSlot({ body, config, run, newId, now: (clock += 1000) })

  // No entry on this host yet: no look to go back to, nothing runs.
  const none = await step({ label: LABEL, mode: 'clear', platform: 'wordpress' })
  assert.deepEqual(none, { ok: false, code: 'DS_NO_TEMPLATE_LOOK' })
  assert.equal(site.runs.length, 0)

  await step(wpApply('ds-moxie'))
  const second = await step(wpApply('ds-figma'))
  assert.equal(second.ok, true)
  const c = await step({ label: LABEL, mode: 'clear', platform: 'wordpress' })
  assert.equal(c.ok, true)
  assert.equal(site.runs.at(-1).bare, bare, 'the before of the first apply: the template look')
  assert.equal(site.state, bare)
  assert.equal(c.slot, null)
  assert.deepEqual(c.previous, { id: 'ds-figma', name: null })
  assert.equal(c.stylesheet, 'tracy-base')

  const u = await step({ label: LABEL, mode: 'undo', platform: 'wordpress', id: c.undoId })
  assert.equal(u.ok, true)
  assert.match(site.state, /ds-figma/)

  // Clear again after the undo: still the look from before the first system, not the Figma state
  // the undone clear's entry started from.
  const again = await step({ label: LABEL, mode: 'clear', platform: 'wordpress' })
  assert.equal(again.ok, true)
  assert.equal(site.state, bare)
})

test('Joomla: clear unpublishes the slot module (kept, so the undo publishes it again)', () => {
  assert.match(JOOMLA_DS_PHP, /\$q\["mode"\]==="clear"/)
  assert.match(
    JOOMLA_DS_PHP,
    /UPDATE \{\$p\}modules SET published=0 WHERE module='mod_custom' AND client_id=0 AND title=/
  )
  assert.doesNotMatch(
    JOOMLA_DS_PHP.slice(JOOMLA_DS_PHP.indexOf('"clear"'), JOOMLA_DS_PHP.indexOf('$ex=')),
    /DELETE/,
    'a clear deletes no row: restore only updates the rows it kept'
  )
  // WordPress rewrites the global styles post and never deletes it, for the same reason.
  const wpClear = WORDPRESS_DS_PHP.slice(
    WORDPRESS_DS_PHP.indexOf('"clear"'),
    WORDPRESS_DS_PHP.indexOf('"restore"')
  )
  assert.doesNotMatch(wpClear, /wp_delete_post/)
  assert.doesNotMatch(wpClear, /tracy_nav|tracy_hero/, 'the menu and hero options are left as they are')
})

test('the WordPress and Joomla scripts parse as PHP (when php is on this machine)', (t) => {
  const probe = spawnSync('php', ['-v'], { encoding: 'utf8' })
  if (probe.status !== 0) return t.skip('no php binary')
  const dir = mkdtempSync(path.join(tmpdir(), 'ds-clear-php-'))
  for (const [name, code] of [
    ['wordpress.php', WORDPRESS_DS_PHP],
    ['joomla.php', JOOMLA_DS_PHP]
  ]) {
    const f = path.join(dir, name)
    writeFileSync(f, `<?php ${code}`)
    const r = spawnSync('php', ['-l', f], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${name}: ${r.stdout}${r.stderr}`)
  }
})
