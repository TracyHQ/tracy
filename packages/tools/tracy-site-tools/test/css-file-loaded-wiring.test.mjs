/**
 * The wiring of the stylesheet check (`css-file-loaded.mjs`, follow-up to #1710 / #1713): a bash
 * command that appends a rule to a theme's `style.css` is read around the call (`tools/execute`), the
 * page is read through the container's curl, and the call's own result (`tools/post-execute`) says
 * whether the page loads the file. On EmDash the answer waits for the next `site.rebuild` and rides on
 * its result. The container's file read runs for real, by this machine's sh.
 *
 *   node --test packages/tools/tracy-site-tools/test/css-file-loaded-wiring.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'
import { LOOK_FILES_SH } from '../src/host/role-pins.mjs'

const RULE = '\n.tracy-r7-2255 { outline: 0; }\n'

/** A site folder under a fresh sites root; `files` relative to it. */
function siteFolder(
  /** @type {string} */ label,
  /** @type {string} */ platform,
  /** @type {Record<string, string>} */ files
) {
  const root = mkdtempSync(path.join(tmpdir(), 'css-file-wiring-'))
  const cwd = path.join(root, label)
  mkdirSync(path.join(cwd, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(cwd, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform })
  )
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true })
    writeFileSync(path.join(cwd, rel), text)
  }
  process.env.TRACY_SITES_ROOT = root
  return { root, cwd }
}

/**
 * The plugin with a docker transport: the look-file read runs for real (`/site/…` is this test's sites
 * root, `/app/…` the `app` folder given), a curl answers from `pages`, anything else is not answered.
 */
function boot(
  /** @type {string} */ root,
  /** @type {Record<string, string>} */ pages,
  /** @type {{ app?: string }} */ opts = {}
) {
  /** @type {string[]} */
  const fetched = []
  const here = (/** @type {string} */ f) =>
    f.replace(/^\/site\//, `${root}/`).replace(/^\/app\//, opts.app === undefined ? '/app/' : `${opts.app}/`)
  const exec = async (/** @type {{ argv: string[] }} */ { argv }) => {
    if (argv.includes(LOOK_FILES_SH)) {
      const w = here(argv[argv.indexOf('-w') + 1])
      const asked = argv.slice(argv.indexOf(LOOK_FILES_SH) + 2)
      const files = asked.map(here)
      let stdout = execFileSync('sh', ['-c', LOOK_FILES_SH, 'sh', ...files], { cwd: w, encoding: 'utf8' })
      files.forEach((f, i) => {
        stdout = stdout.replace(Buffer.from(f).toString('base64'), Buffer.from(asked[i]).toString('base64'))
      })
      return { code: 0, stdout, stderr: '', timedOut: false }
    }
    if (argv[4] === 'curl') {
      const nonce = /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])?.[1]
      const u = new URL(String(argv.at(-1)))
      const at = u.pathname + u.search
      fetched.push(at)
      const body = pages[at]
      const status = body === undefined ? 404 : 200
      const type = /\.css(?:\?|$)/.test(at) ? 'text/css' : 'text/html; charset=utf-8'
      const text = body ?? '<h1>Not found</h1>'
      return {
        code: 0,
        stdout: `HTTP/1.1 ${status} X\r\nContent-Type: ${type}\r\n\r\n${text}\n${nonce} ${status} ${Buffer.byteLength(text)}\n`,
        stderr: '',
        timedOut: false
      }
    }
    return { code: 1, stdout: '', stderr: 'not answered in this test', timedOut: false }
  }
  const listeners = new Map()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: () => () => {}, schemas: () => [] },
    effect: (/** @type {() => void} */ setup) => setup(),
    on: (/** @type {string} */ name, /** @type {Function} */ fn) =>
      listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: () => undefined
  }
  apply(
    /** @type {any} */ (ctx),
    /** @type {any} */ ({ exec, viewContext: false, emdash: { cms: async () => '' }, hostChrome: null })
  )
  return { listeners, fetched }
}

/** One call through `tools/execute`, then the `tools/post-execute` waterfall; the texts its result carries. */
async function call(
  /** @type {Map<string, Function[]>} */ listeners,
  /** @type {{ name: string, arguments: Record<string, unknown>, callId: string, cwd: string }} */ c,
  /** @type {() => void} */ effect,
  /** @type {Record<string, unknown>} */ value = { ok: true }
) {
  const agent = { session: { id: 'session-css', header: { cwd: c.cwd } } }
  const exec = { name: c.name, arguments: c.arguments, callId: c.callId, agent }
  const result = { content: [{ type: 'text', text: JSON.stringify(value) }], value }
  const [around] = listeners.get('tools/execute') ?? []
  await around(exec, async () => {
    effect()
    return result
  })
  const post = listeners.get('tools/post-execute') ?? []
  const run = (/** @type {number} */ i) =>
    i >= post.length ? Promise.resolve({ kind: 'accept' }) : post[i](exec, result, () => run(i + 1))
  const decision = await run(0)
  return (decision.content ?? result.content).map((/** @type {any} */ b) => b.text)
}

const TRACY_HOME =
  "<link rel='stylesheet' id='tracy-app-pair-css' href='/wp-content/themes/tracy/assets/css/app-pair.css?ver=1.4.2' media='all' />" +
  "<link rel='stylesheet' id='tracy-marketing-css' href='/wp-content/themes/tracy/assets/css/marketing.css?ver=1.4.2' media='all' />"

test('🔒 WordPress: a bash append to a style.css the home page does not link — the result says CSS_FILE_NOT_LOADED and not to call it done', async () => {
  const { root, cwd } = siteFolder('wpcss1', 'wordpress', {
    '.webroot/wp-content/themes/tracy/style.css': '/* Theme Name: Tracy */\n'
  })
  const { listeners, fetched } = boot(root, {
    '/': TRACY_HOME,
    '/wp-content/themes/tracy/assets/css/app-pair.css?ver=1.4.2': '.app{color:red}',
    '/wp-content/themes/tracy/assets/css/marketing.css?ver=1.4.2': '.hero{padding:0}'
  })
  const file = path.join(cwd, '.webroot/wp-content/themes/tracy/style.css')
  const texts = await call(
    listeners,
    {
      name: 'bash',
      arguments: { command: `printf '${RULE}' >> .webroot/wp-content/themes/tracy/style.css` },
      callId: 'c1',
      cwd
    },
    () => appendFileSync(file, RULE)
  )
  const said = texts.map((t) => JSON.parse(t)).find((v) => v.cssFile !== undefined)
  assert.ok(said, `the result carries the check: ${JSON.stringify(texts)}`)
  assert.equal(said.cssFile, 'not loaded')
  assert.equal(said.page, '/')
  assert.equal(said.warnings[0].code, 'CSS_FILE_NOT_LOADED')
  assert.equal(said.warnings[0].file, 'wp-content/themes/tracy/style.css')
  assert.match(said.next, /^Do not tell the customer it is done\./)
  assert.match(said.next, /app-pair\.css/)
  assert.equal(fetched[0], '/', 'the home page: no tab is open')
})

test('WordPress: the same append to a style.css the page links — the result records it loaded', async () => {
  const { root, cwd } = siteFolder('wpcss2', 'wordpress', {
    '.webroot/wp-content/themes/classic/style.css': '/* Theme Name: Classic */\n'
  })
  const { listeners } = boot(root, {
    '/': "<link rel='stylesheet' href='/wp-content/themes/classic/style.css?ver=6.8' />"
  })
  const file = path.join(cwd, '.webroot/wp-content/themes/classic/style.css')
  const texts = await call(
    listeners,
    {
      name: 'write',
      arguments: { file_path: file, content: `/* Theme Name: Classic */\n${RULE}` },
      callId: 'c2',
      cwd
    },
    () => appendFileSync(file, RULE)
  )
  const said = texts.map((t) => JSON.parse(t)).find((v) => v.cssFile !== undefined)
  assert.equal(said?.cssFile, 'loaded')
  assert.deepEqual(said.loaded, ['wp-content/themes/classic/style.css (linked)'])
})

test('a call that writes no stylesheet, or one the write did not change, carries no check', async () => {
  const { root, cwd } = siteFolder('wpcss3', 'wordpress', {
    '.webroot/wp-content/themes/tracy/style.css': '.a{top:0}\n'
  })
  const { listeners, fetched } = boot(root, { '/': TRACY_HOME })
  const same = await call(
    listeners,
    {
      name: 'bash',
      arguments: { command: "sed -i 's/zzz/zzz/' .webroot/wp-content/themes/tracy/style.css" },
      callId: 'c3',
      cwd
    },
    () => {}
  )
  assert.equal(same.length, 1, 'the result as it was')
  assert.deepEqual(fetched, [], 'no page read for nothing written')
})

test('🔒 EmDash: a source edit waits for site.rebuild; the rebuild’s result says the page does not load a new stylesheet nothing imports', async () => {
  const app = mkdtempSync(path.join(tmpdir(), 'css-file-app-'))
  mkdirSync(path.join(app, 'src', 'styles'), { recursive: true })
  writeFileSync(path.join(app, 'src', 'styles', 'global.css'), '.h-1{font-size:2rem}\n')
  const { root, cwd } = siteFolder('emcss1', 'emdash', {})
  const { listeners, fetched } = boot(
    root,
    {
      '/': '<link rel="stylesheet" href="/_astro/Base.Bx1.css">',
      '/_astro/Base.Bx1.css': '.h-1{font-size:2rem}.btn-x{border-radius:9999px}'
    },
    { app }
  )
  const edit = await call(
    listeners,
    {
      name: 'bash',
      arguments: {
        command:
          "printf '.btn-x{border-radius:9999px}' >> /app/src/styles/global.css && printf '.promo{color:#f0f}' > /app/src/styles/extra.css"
      },
      callId: 'e1',
      cwd
    },
    () => {
      appendFileSync(path.join(app, 'src', 'styles', 'global.css'), '.btn-x{border-radius:9999px}')
      writeFileSync(path.join(app, 'src', 'styles', 'extra.css'), '.promo{color:#f0f}')
    }
  )
  assert.equal(edit.length, 1, 'nothing said before the build: the page does not serve /app yet')
  assert.deepEqual(fetched, [])
  const rebuilt = await call(
    listeners,
    { name: 'tracy_site_build_emdash', arguments: { operation: 'site.rebuild' }, callId: 'e2', cwd },
    () => {}
  )
  const said = rebuilt.map((t) => JSON.parse(t)).find((v) => v.cssFile !== undefined)
  assert.ok(said, `the rebuild carries the check: ${JSON.stringify(rebuilt)}`)
  assert.equal(said.cssFile, 'not loaded')
  assert.deepEqual(said.loaded, ['/app/src/styles/global.css (its rule is in /_astro/Base.Bx1.css)'])
  assert.deepEqual(
    said.warnings.map((/** @type {any} */ w) => [w.code, w.file]),
    [['CSS_FILE_NOT_LOADED', '/app/src/styles/extra.css']]
  )
  // taken once: the next rebuild has nothing to say
  const again = await call(
    listeners,
    { name: 'tracy_site_build_emdash', arguments: { operation: 'site.rebuild' }, callId: 'e3', cwd },
    () => {}
  )
  assert.equal(again.length, 1)
})
