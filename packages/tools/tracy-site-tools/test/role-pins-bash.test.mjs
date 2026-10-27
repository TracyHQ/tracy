/**
 * A bash command that writes a stylesheet (`sed -i`, `cat >`, a heredoc) hands no `new_string` over, so
 * the stylesheets it names are read around it, in the site's own container from its own working
 * directory, and only the pins its new text has that the old did not reach the agent — before the next
 * step, once a turn (council, 20/10/2026). The container read below runs for real, by this machine's sh.
 *
 *   node --test packages/tools/tracy-site-tools/test/role-pins-bash.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'
import {
  LOOK_FILES_SH,
  lookFilesArgv,
  NOT_READ,
  newRolePins,
  parseLookFiles
} from '../src/host/role-pins.mjs'
import { templateRolesOf } from '../src/host/ds-slot-worn.mjs'
import { shellLookFiles, shellLookWrites } from '../src/host/shell-look-write.mjs'

/** The template's stylesheet: its roles and its own values. */
const TEMPLATE = [
  '.btn{background:var(--ds-c-accent, #a3e635);border-radius:var(--ds-btn-radius, 8px);color:var(--ds-c-accent-on, #0b0f0a)}',
  'body{color:var(--ds-c-fg, #14171a);background:var(--ds-c-bg, #fbfcfa)}'
].join('')
const ROLES = /** @type {any} */ (templateRolesOf(TEMPLATE))

test('the files a bash command writes: every stylesheet of every form, never one it only reads, never a compiler', () => {
  assert.deepEqual(shellLookFiles("sed -i 's/#000/#111/' a.css b/c.scss && cat x.css"), ['a.css', 'b/c.scss'])
  assert.deepEqual(shellLookFiles('cat > wp-content/themes/t/style.css <<EOF\n.a{color:#111}\nEOF'), [
    'wp-content/themes/t/style.css'
  ])
  assert.deepEqual(shellLookFiles('echo x | tee -a one.css two.less'), ['one.css', 'two.less'])
  assert.deepEqual(shellLookFiles('cp /tmp/n.css templates/t/css/custom.css'), ['templates/t/css/custom.css'])
  assert.deepEqual(
    shellLookFiles("python3 - <<'EOF'\nopen('/app/src/styles/tokens.css','w').write(s)\nEOF"),
    ['/app/src/styles/tokens.css']
  )
  assert.deepEqual(shellLookFiles("grep -rn 'color' a.css | sed 's/:.*/ -> x/'"), [], 'a read')
  assert.deepEqual(shellLookFiles('php tools/t4-scss.php'), [], 'the compiler writes compiled output')
  assert.deepEqual(shellLookFiles("echo 'unclosed"), [], 'a command that cannot be split')
})

test('🔒 only the new pins: one edit in a minified stylesheet names the literal it added, never the template’s older ones', () => {
  const old = `${TEMPLATE}.legacy{color:#14171a;border-radius:8px}`
  const now = `${old}.promo{background:#a3e635}`
  const pins = newRolePins([old], [now], { ruler: ROLES, worn: false })
  assert.deepEqual(
    pins.map((p) => p.use),
    ['background: var(--ds-c-accent, #a3e635)']
  )
  // the same literal written once more than before is new; a new file reads against an empty one
  assert.equal(newRolePins([old], [`${old}.legacy2{color:#14171a}`], { ruler: ROLES, worn: false }).length, 1)
  assert.equal(newRolePins([''], ['.x{border-radius:4px}'], { ruler: ROLES, worn: false }).length, 1)
  assert.deepEqual(newRolePins([old], [old], { ruler: ROLES, worn: false }), [])
})

test('the container read, run by sh: each file’s text from the command’s own directory; not a plain file, or cut, reads null', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'look-files-'))
  mkdirSync(path.join(dir, 'css'))
  writeFileSync(path.join(dir, 'css', 'a.css'), '.a{color:#111}\n')
  writeFileSync(path.join(dir, 'big.css'), 'x'.repeat(256 * 1024 + 1))
  const out = execFileSync('sh', ['-c', LOOK_FILES_SH, 'sh', 'css/a.css', 'missing.css', 'css', 'big.css'], {
    cwd: dir,
    encoding: 'utf8'
  })
  const files = parseLookFiles(out)
  assert.equal(files.get('css/a.css'), '.a{color:#111}\n')
  assert.equal(files.get('missing.css'), null, 'not there: a write may create it')
  assert.equal(files.get('css'), NOT_READ, 'a directory')
  assert.equal(files.get('big.css'), NOT_READ, 'past the byte bound: not checked')
  assert.deepEqual(lookFilesArgv('jo1-web-1', '/site/jo1/.webroot', ['a.css']).slice(0, 7), [
    'exec',
    '-u',
    'www-data',
    '-w',
    '/site/jo1/.webroot',
    'jo1-web-1',
    'sh'
  ])
  assert.throws(() => lookFilesArgv('../x', '/', []), /not a site web container/)
})

// ── the wiring: tools/execute around the command, the notice before the next step ────────────────

/** A WordPress site folder under a fresh sites root, its stylesheet in the webroot. */
function site(/** @type {string} */ label) {
  const root = mkdtempSync(path.join(tmpdir(), 'role-pins-bash-'))
  const cwd = path.join(root, label)
  mkdirSync(path.join(cwd, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(cwd, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform: 'wordpress' })
  )
  mkdirSync(path.join(cwd, '.webroot', 'wp-content', 'themes', 't'), { recursive: true })
  writeFileSync(path.join(cwd, '.webroot', 'wp-content', 'themes', 't', 'style.css'), TEMPLATE)
  process.env.TRACY_SITES_ROOT = root
  return { root, cwd }
}

/** The plugin with a docker transport that answers the slot read (wearing nothing) and runs the file read for real. */
function boot(
  /** @type {string} */ root,
  /** @type {{ failReads?: number, slotUnknown?: boolean }} */ opts = {}
) {
  let failReads = opts.failReads ?? 0
  const listeners = new Map()
  const exec = async (/** @type {{ argv: string[] }} */ { argv }) => {
    if (argv.includes(LOOK_FILES_SH)) {
      if (failReads > 0) {
        failReads -= 1
        return { code: null, stdout: '', stderr: '', timedOut: true }
      }
      // `-w /site/<label>/…` is the same folder under this test's sites root
      const w = argv[argv.indexOf('-w') + 1].replace(/^\/site\//, `${root}/`)
      // an absolute `/site/…` path is the same file here; the answer names it as the call did
      const asked = argv.slice(argv.indexOf(LOOK_FILES_SH) + 2)
      const files = asked.map((f) => f.replace(/^\/site\//, `${root}/`))
      let stdout = execFileSync('sh', ['-c', LOOK_FILES_SH, 'sh', ...files], { cwd: w, encoding: 'utf8' })
      files.forEach((f, i) => {
        stdout = stdout.replace(Buffer.from(f).toString('base64'), Buffer.from(asked[i]).toString('base64'))
      })
      return {
        code: 0,
        stdout,
        stderr: '',
        timedOut: false
      }
    }
    if (opts.slotUnknown && argv.some((a) => typeof a === 'string' && a.includes('tracy-ds-slot:')))
      return { code: 1, stdout: '', stderr: 'no answer', timedOut: false }
    if (argv.some((a) => typeof a === 'string' && a.includes('tracy-ds-slot:')))
      return {
        code: 0,
        stdout: `TRACY_DS_SLOT ${Buffer.from(JSON.stringify({ ok: true, css: null, roles: TEMPLATE })).toString('base64')}\n`,
        stderr: '',
        timedOut: false
      }
    return { code: 1, stdout: '', stderr: 'not answered in this test', timedOut: false }
  }
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
  return listeners
}

/** One bash call through `tools/execute` then `tools/result`, then the next step's notices. */
async function bashThenStep(
  /** @type {Map<string, Function[]>} */ listeners,
  /** @type {string} */ cwd,
  /** @type {string} */ command,
  /** @type {() => void} */ effect,
  /** @type {{ name?: string, args?: Record<string, unknown>, before?: () => void }} */ opts = {}
) {
  const agent = { session: { id: 'session-bash', header: { cwd } } }
  const call = { name: opts.name ?? 'bash', arguments: opts.args ?? { command }, agent }
  const [around] = listeners.get('tools/execute') ?? []
  assert.ok(around, 'the middleware is registered')
  await around(call, async () => {
    effect()
    return { content: [{ type: 'text', text: '' }] }
  })
  for (const fn of listeners.get('tools/result') ?? []) fn(call, { isError: false, content: [] })
  opts.before?.()
  const messages = [
    { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'done' }], source: { kind: 'assistant' } }
  ]
  let out
  for (const fn of listeners.get('agent/pre-step') ?? [])
    out = await fn({ messages, agent }, async () => ({ kind: 'enter', messages }))
  return (out?.messages ?? []).flatMap((/** @type {any} */ m) =>
    (m.content ?? [])
      .filter((/** @type {any} */ c) => c.type === 'text')
      .map((/** @type {any} */ c) => c.text)
  )
}

test('🔒 a bash sed on the theme’s stylesheet: the literal it added is named before the next step, the template’s own are not, and once a turn', async () => {
  const { root, cwd } = site('wpbash1')
  const listeners = boot(root)
  const css = path.join(cwd, '.webroot', 'wp-content', 'themes', 't', 'style.css')
  const command =
    "cd .webroot && sed -i 's/$/.btn-cta{background:#a3e635;border-radius:999px}/' wp-content/themes/t/style.css"
  // `cd` first: the command's own directory is the session's; the file is named relative to it
  const texts = await bashThenStep(listeners, cwd, command.replace('cd .webroot && ', ''), () => {})
  // a path the command names that is not there from its directory: said as not checked, never as clean
  const unchecked = texts.find((t) => t.startsWith('After your look edit (style.css):')) ?? ''
  assert.match(
    unchecked,
    /Not checked for literals over the design-system roles: wp-content\/themes\/t\/style\.css/
  )
  assert.doesNotMatch(unchecked, /→ `/)
  const written = await bashThenStep(
    listeners,
    path.join(cwd, '.webroot'),
    "sed -i 's/$/.btn-cta{background:#a3e635;border-radius:999px}/' wp-content/themes/t/style.css",
    () => writeFileSync(css, `${readFileSync(css, 'utf8')}.btn-cta{background:#a3e635;border-radius:999px}`)
  )
  const said = written.find((t) => t.startsWith('After your look edit (style.css):')) ?? ''
  assert.match(said, /`background: #a3e635` → `background: var\(--ds-c-accent, #a3e635\)`/)
  assert.match(
    said,
    /`border-radius: 999px` → `border-radius: var\(--ds-btn-radius, 999px\)`/,
    'nothing worn: the literal stays the fallback'
  )
  assert.match(said, /a design system the customer applies later will not reach them/)
  assert.doesNotMatch(said, /#14171a|#fbfcfa/, 'the template’s own reads are not this edit’s')
  // the same literal written again in the same turn is not said twice
  const again = await bashThenStep(
    listeners,
    path.join(cwd, '.webroot'),
    "sed -i 's/$/.cta2{background:#a3e635}/' wp-content/themes/t/style.css",
    () => writeFileSync(css, `${readFileSync(css, 'utf8')}.cta2{background:#a3e635}`)
  )
  assert.ok(
    !again.some((t) => t.startsWith('After your look edit') && /→ `background: var\(--ds-c-accent/.test(t)),
    'once a turn'
  )
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 a file tool’s edit: only what it added is named — the lines its new_string repeats from the file are not', async () => {
  const { root, cwd } = site('wpedit1')
  const listeners = boot(root)
  const css = path.join(cwd, '.webroot', 'wp-content', 'themes', 't', 'style.css')
  writeFileSync(css, `${TEMPLATE}.old{color:#14171a}`)
  const texts = await bashThenStep(
    listeners,
    cwd,
    '',
    () => writeFileSync(css, `${TEMPLATE}.old{color:#14171a}.new{background:#a3e635}`),
    {
      name: 'edit',
      args: {
        file_path: css,
        old_string: '.old{color:#14171a}',
        new_string: '.old{color:#14171a}.new{background:#a3e635}'
      }
    }
  )
  const said = texts.find((t) => t.startsWith('After your look edit (')) ?? ''
  assert.match(said, /`background: #a3e635` → `background: var\(--ds-c-accent, #a3e635\)`/)
  assert.doesNotMatch(said, /#14171a/, 'the line the edit repeated is not its literal')
  delete process.env.TRACY_SITES_ROOT
})

test('the pins are said even when the agent runs tracy_design_check right after the edit', async () => {
  const { root, cwd } = site('wpcheck1')
  const listeners = boot(root)
  const css = path.join(cwd, '.webroot', 'wp-content', 'themes', 't', 'style.css')
  const texts = await bashThenStep(
    listeners,
    path.join(cwd, '.webroot'),
    "sed -i 's/$/.x{background:#a3e635}/' wp-content/themes/t/style.css",
    () => writeFileSync(css, `${readFileSync(css, 'utf8')}.x{background:#a3e635}`),
    {
      before: () => {
        for (const fn of listeners.get('tools/result') ?? [])
          fn(
            {
              name: 'tracy_design_check',
              arguments: {},
              agent: { session: { id: 'session-bash', header: { cwd } } }
            },
            { isError: false, content: [] }
          )
      }
    }
  )
  assert.ok(
    texts.some((t) => t.startsWith('After your look edit') && /var\(--ds-c-accent, #a3e635\)/.test(t))
  )
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 a read before the command that ran out of time proves nothing: the file is not checked, its old literals never named', async () => {
  const { root, cwd } = site('wpslow1')
  const listeners = boot(root, { failReads: 1 })
  const css = path.join(cwd, '.webroot', 'wp-content', 'themes', 't', 'style.css')
  writeFileSync(css, `${TEMPLATE}.old{background:#a3e635;color:#14171a}`)
  const texts = await bashThenStep(
    listeners,
    path.join(cwd, '.webroot'),
    "sed -i 's/$/.new{margin:0}/' wp-content/themes/t/style.css",
    () => writeFileSync(css, `${readFileSync(css, 'utf8')}.new{margin:0}`)
  )
  const said = texts.find((t) => t.startsWith('After your look edit')) ?? ''
  assert.match(
    said,
    /Not checked for literals over the design-system roles: wp-content\/themes\/t\/style\.css/
  )
  assert.doesNotMatch(said, /→ `/, 'nothing named from a file read once')
  delete process.env.TRACY_SITES_ROOT
})

test('review 10 (second round): a stylesheet named after a `cd` to a place the text does not tell is unresolved, said, never dropped', () => {
  assert.deepEqual(shellLookWrites('cd "$THEME" && sed -i s/a/b/ style.css'), {
    files: [],
    unresolved: ['style.css']
  })
  assert.deepEqual(shellLookWrites('cd wp-content && sed -i s/a/b/ themes/t/style.css /abs/x.css'), {
    files: ['wp-content/themes/t/style.css', '/abs/x.css'],
    unresolved: []
  })
})

test('🔒 whether a system is worn not known (the slot read did not answer): nothing is judged, the file is said as not checked', async () => {
  const { root, cwd } = site('wpunknown1')
  const listeners = boot(root, { slotUnknown: true })
  const css = path.join(cwd, '.webroot', 'wp-content', 'themes', 't', 'style.css')
  const texts = await bashThenStep(
    listeners,
    path.join(cwd, '.webroot'),
    "sed -i 's/$/.x{background:#a3e635}/' wp-content/themes/t/style.css",
    () => writeFileSync(css, `${readFileSync(css, 'utf8')}.x{background:#a3e635}`)
  )
  const said = texts.find((t) => t.startsWith('After your look edit')) ?? ''
  assert.match(
    said,
    /Not checked for literals over the design-system roles: wp-content\/themes\/t\/style\.css/
  )
  assert.doesNotMatch(said, /→ `/)
  delete process.env.TRACY_SITES_ROOT
})

test('review 4.1: CSS a heredoc or a sed script carries (calc, @media, $(…)) never makes a cd unknown; a subshell cd ends with it', () => {
  assert.deepEqual(
    shellLookWrites(
      "cd /var/www/html/wp-content/themes/t && cat >> style.css <<'EOF'\n.a{width:calc(100% - (2rem))}\n@media (max-width: 600px){.b{color:#111}}\nEOF"
    ),
    { files: ['/var/www/html/wp-content/themes/t/style.css'], unresolved: [] }
  )
  assert.deepEqual(shellLookWrites("cd t && sed -E 's/color: (#fff)/x/' -i a.css"), {
    files: ['t/a.css'],
    unresolved: []
  })
  assert.deepEqual(shellLookWrites('(cd sub && sed -i s/a/b/ x.css); echo y > t.css'), {
    files: ['sub/x.css', 't.css'],
    unresolved: []
  })
})
