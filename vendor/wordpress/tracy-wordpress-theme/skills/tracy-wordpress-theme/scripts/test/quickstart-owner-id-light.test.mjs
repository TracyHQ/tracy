// Phase 10 for a JoomlArt design: the release tag carries an owner segment
// (`quickstart/ja-kinetic/wp7`), the pack ships an admin that is not `tracyagent`, the site is dark
// by default so verify-parity's light axis needs a light hook, and the stand holds transients that
// `wp option list` hides unless asked. A two-segment id with the default admin reads as before.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { slugOf } from '../quickstart/pack.mjs'
import { titleFor, readmeText, notesTemplate, buildVerification } from '../quickstart/release.mjs'
import { plan } from '../quickstart/cycle.mjs'
import { collectFacts } from '../quickstart/prune-audit.mjs'
import { captureStyles } from '../quickstart/verify-parity.mjs'
import { withPage } from '../lib/browser.mjs'

const manifest = (id) => ({
  id,
  version: '1.0.0',
  wpVersion: '7.1',
  phpVersion: '8.3',
  prefix: 'tr_',
  theme: { name: 't', version: '1.0.0' },
  webroot: { file: `${slugOf(id)}-webroot-1.0.0.tar.gz` },
  database: { file: `${slugOf(id)}-database-1.0.0.sql.gz` }
})
const parity = { a: 'a', b: 'b', ok: true, routes: [], counts: [], styles: {}, summary: {} }

test('an owner segment in front of <product>/<cms> is left out of the asset names and the title', () => {
  assert.equal(slugOf('quickstart/ja-kinetic/wp7'), 'ja-kinetic-wp7')
  assert.equal(slugOf('tracy-base/wp7'), 'tracy-base-wp7')
  assert.equal(titleFor(manifest('quickstart/ja-kinetic/wp7')), 'Quickstart: Ja Kinetic / WordPress 7')
  const readme = readmeText(manifest('quickstart/ja-kinetic/wp7'), { repo: 'R', admin: 'tracyadmin', title: 'Quickstart: JA Kinetic / WordPress 7' })
  assert.match(readme, /^# Quickstart: JA Kinetic \/ WordPress 7\n/)
  assert.match(readme, /tag `quickstart\/ja-kinetic\/wp7` \(wp7\)\.\n$/)
  assert.match(readme, /wp user update tracyadmin --user_pass/)
  assert.match(readme, /--db-password-env DB_PASSWORD --admin tracyadmin --admin-password/)
  const v = buildVerification({ manifest: manifest('quickstart/ja-kinetic/wp7'), parity, restoreReport: null })
  assert.match(notesTemplate(manifest('quickstart/ja-kinetic/wp7'), v, { title: 'Quickstart: JA Kinetic / WordPress 7' }), /^## JA Kinetic \/ WordPress 7 1\.0\.0\n/)
})

test('a two-segment id with the default admin: README and notes are what they were', () => {
  const m = manifest('tracy-base/wp7')
  const readme = readmeText(m, { repo: 'R' })
  assert.equal(readmeText(m, { repo: 'R', admin: 'tracyagent', title: titleFor(m) }), readme)
  assert.match(readme, /--db-password-env DB_PASSWORD --admin-password/)
  assert.match(readme, /tag `tracy-base\/wp7` \(wp7\)\.\n$/)
  const v = buildVerification({ manifest: m, parity, restoreReport: null })
  assert.equal(notesTemplate(m, v, { title: titleFor(m) }), notesTemplate(m, v))
})

test('cycle: --light-hook reaches verify-parity only when given; release names the admin', () => {
  const base = { stand: '/s', id: 'x/wp7', version: '1', siteA: 'a', siteB: 'b', wpA: 'wa', wpB: 'wb', routes: 'r', admin: 'tracyadmin', darkHook: 'cookie:t=dark', dbHost: 'h', dbPasswordEnv: 'P' }
  const without = plan(base).verify[0].argv
  assert.ok(!without.includes('--light-hook'))
  const withLight = plan({ ...base, lightHook: 'cookie:t=light' }).verify[0].argv
  assert.equal(withLight[withLight.indexOf('--light-hook') + 1], 'cookie:t=light')
  const rel = plan(base).release.find((s) => s.argv).argv
  assert.equal(rel[rel.indexOf('--admin') + 1], 'tracyadmin')
})

test('prune-audit asks wp-cli for transients explicitly', () => {
  const calls = []
  const wp = (args) => {
    calls.push(args)
    return args[0] === 'option' && args[1] === 'get' ? 'http://s' : ''
  }
  wp.json = (args) => {
    calls.push(args)
    if (args[0] === 'option' && args[1] === 'list') return args.includes('--transients') ? [{ option_name: args[2].slice(9, -1) + 'x' }] : []
    return []
  }
  wp.field = (args) => wp(args).trim()
  const facts = collectFacts({ webroot: mkdtempSync(path.join(tmpdir(), 'prune-facts-')), wp, admin: 'a', siteUrl: 'http://s', standOptions: [] })
  assert.deepEqual(facts.transients, ['_transient_x'])
  assert.deepEqual(facts.siteTransients, ['_site_transient_x'])
})

test('withPage: a light cookie hook for several sites sets the cookie on each origin', async () => {
  const cookies = []
  const browser = {
    async newContext() {
      return {
        async addInitScript() {},
        async addCookies(list) {
          cookies.push(...list)
        },
        async newPage() {
          return { evaluate: async () => {} }
        },
        async close() {}
      }
    }
  }
  await withPage(browser, { theme: 'light', lightHook: 'cookie:t=light', hookUrl: ['http://a.test:1/x', 'http://b.test:2/y'] }, async () => {})
  assert.deepEqual(cookies.map((c) => c.url), ['http://a.test:1/', 'http://b.test:2/'])
})

test('captureStyles: the light hook makes a dark-by-default site draw light on the light axis, both stands', async () => {
  // Dark unless the request carries t=light — the server decides, as wp-ja-kinetic does.
  const site = createServer((req, res) => {
    const light = /(^|;\s*)t=light/.test(req.headers.cookie ?? '')
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><body style="color:${light ? 'rgb(1, 1, 1)' : 'rgb(250, 250, 250)'}">x</body></html>`)
  })
  const other = createServer(site.listeners('request')[0])
  site.listen(0, '127.0.0.1')
  other.listen(0, '127.0.0.1')
  await Promise.all([once(site, 'listening'), once(other, 'listening')])
  try {
    const args = {
      a: `http://127.0.0.1:${site.address().port}`,
      b: `http://127.0.0.1:${other.address().port}`,
      routes: ['/'],
      viewports: [[320, 400]],
      themes: ['light'],
      darkHook: 'cookie:t=dark',
      selectors: ['body']
    }
    const plain = await captureStyles(args)
    assert.equal(plain.A['/|320|light'].body.color, 'rgb(250, 250, 250)', 'without the hook the light axis is dark')
    const lit = await captureStyles({ ...args, lightHook: 'cookie:t=light' })
    assert.equal(lit.A['/|320|light'].body.color, 'rgb(1, 1, 1)')
    assert.equal(lit.B['/|320|light'].body.color, 'rgb(1, 1, 1)')
  } finally {
    site.close()
    other.close()
  }
})

test('scrub-sql.py drops every transient row of <prefix>options from the dump; other options stay byte for byte', async () => {
  const { spawnSync } = await import('node:child_process')
  const { writeFileSync, readFileSync } = await import('node:fs')
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'scrub-transients-')), 'd.sql')
  writeFileSync(
    f,
    "INSERT INTO `tr_users` (`ID`, `user_login`, `user_pass`) VALUES \n('1', 'tracyadmin', '');\n" +
      "INSERT INTO `tr_options` (`option_id`, `option_name`, `option_value`, `autoload`) VALUES \n" +
      "('1', 'siteurl', 'https://quickstart.invalid', 'on'),\n" +
      "('2', '_transient_doing_cron', '1790317000.1', 'on'),\n" +
      "('3', '_site_transient_wp_theme_files_patterns-1e4c', 'a:1:{s:1:\\\"x\\\";i:1;}', 'off'),\n" +
      "('4', 'wp_ja_kinetic_redirects', '[]', 'on'),\n" +
      "('5', '_transient_timeout_doing_cron', '1790317060', 'off');\n"
  )
  const r = spawnSync('python3', [path.join(import.meta.dirname, '../quickstart/scrub-sql.py'), '--file', f, '--prefix', 'tr_'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /3 transient rows dropped/)
  const out = readFileSync(f, 'utf8')
  assert.ok(!/_transient_/.test(out))
  assert.match(out, /\('1', 'siteurl', 'https:\/\/quickstart\.invalid', 'on'\),\n\('4', 'wp_ja_kinetic_redirects', '\[\]', 'on'\);/)
})
