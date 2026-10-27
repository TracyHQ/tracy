/**
 * A look change made in a comment turn gets an undo (29/09/2026 ~17:00, "Comment → edit" stage 5).
 *
 * Why: stand E2E round 2 G1 (`tasks/evidence/comment-thread/stand-e2e.md`, round 2 section) — a comment "make
 * this heading lighter" on Joomla T4 edited the template's `.scss` and ran `php tools/t4-scss.php`,
 * which rewrote `css/template.css`: the whole template changed, every card and every language, and
 * nothing the person could undo. The comment fence lets a look write through (`comment-fence.mjs`);
 * this is what it keeps before it does, and what `look.revert` puts back.
 *
 *   node --test packages/tools/tracy-site-tools/test/look-undo.test.mjs
 */
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import { commentTurnOf } from '../src/host/comment-fence.mjs'
import {
  cssHash,
  LOOK_UNDO_DIR,
  LOOK_UNDO_KEEP,
  lookFiles,
  lookIo,
  lookWriteTargets,
  noteLookAfter,
  revertLook,
  takeLookSnapshot,
  WP_CUSTOM_CSS_PHP
} from '../src/host/look-undo.mjs'

const message = (kind, content) => ({ type: 'user/message', data: { source: { kind }, content } })
const ELEMENT = {
  url: 'https://capi.test/',
  selector: 'h3',
  label: 'Card',
  text: 'Frame erection',
  marks: []
}
const COMMENT = [message('user', buildCommentTurn({ text: 'Make this heading lighter.', element: ELEMENT }))]
const PLAIN = [message('user', 'Make the card headings lighter.')]

/** A sites root with one site folder; the files given are written under it. */
function site(files = {}, label = 'capi') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-look-undo-'))
  const siteRoot = path.join(root, label)
  mkdirSync(siteRoot, { recursive: true })
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(siteRoot, rel)), { recursive: true })
    writeFileSync(path.join(siteRoot, rel), text)
  }
  return siteRoot
}

const read = (siteRoot, rel) => readFileSync(path.join(siteRoot, rel), 'utf8')

/** The files a call writes that need a copy first, as `lookFiles` answers for a session in `siteRoot`. */
const planned = (siteRoot, name, args, events = COMMENT) =>
  lookFiles({ name, args, cwd: siteRoot, siteRoot, turn: commentTurnOf(events) })

/** A container `/app/` tree held in memory, answering the same argv `lookIo` sends `docker exec`. */
function fakeContainer(files = {}) {
  const tree = new Map(Object.entries(files))
  const calls = []
  const run = async ({ argv, stdin }) => {
    calls.push(argv)
    const file = argv.at(-1)
    const mode = argv.at(-2)
    if (mode === 'read')
      return tree.has(file)
        ? {
            code: 0,
            stdout: `TRACY_LOOK_B64 ${Buffer.from(tree.get(file)).toString('base64')}\n`,
            stderr: ''
          }
        : { code: 0, stdout: 'TRACY_LOOK_ABSENT\n', stderr: '' }
    if (mode === 'write') {
      tree.set(file, Buffer.from(String(stdin), 'base64').toString('utf8'))
      return { code: 0, stdout: 'TRACY_LOOK_OK\n', stderr: '' }
    }
    if (mode === 'remove') {
      tree.delete(file)
      return { code: 0, stdout: 'TRACY_LOOK_OK\n', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: 'unknown mode' }
  }
  return { tree, calls, run }
}

const ioFor = (siteRoot, container = fakeContainer()) =>
  lookIo({ siteRoot, container: 'capi-web-1', run: container.run })

test('a comment turn: an allowed stylesheet write is planned for a copy — the file itself', () => {
  const siteRoot = site({ '.webroot/wp-content/themes/tracy/style.css': 'h3{font-weight:700}' })
  const files = planned(siteRoot, 'edit', {
    file_path: '.webroot/wp-content/themes/tracy/style.css',
    old_string: '700',
    new_string: '500'
  })
  assert.deepEqual(files, [path.join(siteRoot, '.webroot/wp-content/themes/tracy/style.css')])
})

test('a Joomla T4 scss write is planned with the css t4-scss.php compiles from it', () => {
  const siteRoot = site()
  const tpl = path.join(siteRoot, '.webroot/templates/tracy_business')
  // A partial: only `template.css`, the file t4-scss.php builds by default.
  assert.deepEqual(
    planned(siteRoot, 'edit', { file_path: '.webroot/templates/tracy_business/scss/blocks/_cards.scss' }),
    [path.join(tpl, 'scss/blocks/_cards.scss'), path.join(tpl, 'css/template.css')]
  )
  // An entry file of its own (`--all` / `--only` build it to css/<name>.css) — both outputs.
  assert.deepEqual(
    planned(siteRoot, 'bash', {
      command: "sed -i 's/700/500/' .webroot/templates/tracy_business/scss/theme.scss"
    }),
    [path.join(tpl, 'scss/theme.scss'), path.join(tpl, 'css/template.css'), path.join(tpl, 'css/theme.css')]
  )
})

test("theme.json, a new stylesheet and EmDash's /app source are planned; nothing else is", () => {
  const siteRoot = site()
  assert.deepEqual(
    planned(siteRoot, 'write', { file_path: '.webroot/wp-content/themes/tracy/theme.json', content: '{}' }),
    [path.join(siteRoot, '.webroot/wp-content/themes/tracy/theme.json')]
  )
  assert.deepEqual(
    planned(siteRoot, 'bash', { command: 'cat > /app/src/styles/cards.css <<EOF\n.h{}\nEOF' }),
    ['/app/src/styles/cards.css']
  )
  // Not a look file: the fence refuses it, so no copy either.
  assert.deepEqual(
    planned(siteRoot, 'edit', { file_path: '.webroot/templates/tracy_business/index.php' }),
    []
  )
  // A read, and a stylesheet outside the served tree (a scratch note): nothing to keep.
  assert.deepEqual(planned(siteRoot, 'read', { file_path: '.webroot/templates/x/css/template.css' }), [])
  assert.deepEqual(planned(siteRoot, 'write', { file_path: 'TracyWork/draft.css', content: '' }), [])
})

test("an ordinary (non-comment) turn plans no copy: ADR 0022, the undo is the comment turn's promise", () => {
  const siteRoot = site()
  assert.deepEqual(
    planned(siteRoot, 'edit', { file_path: '.webroot/wp-content/themes/tracy/style.css' }, PLAIN),
    []
  )
})

test('a snapshot keeps the bytes before the write, and look.revert puts them back byte for byte', async () => {
  const before = 'h3{font-weight:700}\n/* ünïcode */'
  const siteRoot = site({ '.webroot/wp-content/themes/tracy/style.css': before })
  const io = ioFor(siteRoot)
  const files = planned(siteRoot, 'edit', { file_path: '.webroot/wp-content/themes/tracy/style.css' })
  const { id } = await takeLookSnapshot({ siteRoot, files, io, tool: 'edit' })
  assert.match(id, /^[0-9a-f]{6}$/)
  assert.ok(existsSync(path.join(siteRoot, LOOK_UNDO_DIR, id, 'manifest.json')))

  writeFileSync(path.join(siteRoot, '.webroot/wp-content/themes/tracy/style.css'), 'h3{font-weight:500}')
  const answer = await revertLook({ siteRoot, undo: id, io })
  assert.equal(answer.ok, true, JSON.stringify(answer))
  assert.deepEqual(answer.restored, ['.webroot/wp-content/themes/tracy/style.css'])
  assert.equal(read(siteRoot, '.webroot/wp-content/themes/tracy/style.css'), before)
})

test('T4: undo restores the scss AND the compiled template.css, so nothing is recompiled', async () => {
  const siteRoot = site({
    '.webroot/templates/tb/scss/_cards.scss': '.card h3{font-weight:700}',
    '.webroot/templates/tb/css/template.css': '.card h3{font-weight:700}/*compiled*/'
  })
  const io = ioFor(siteRoot)
  const files = planned(siteRoot, 'edit', { file_path: '.webroot/templates/tb/scss/_cards.scss' })
  const { id } = await takeLookSnapshot({ siteRoot, files, io, tool: 'edit' })
  writeFileSync(path.join(siteRoot, '.webroot/templates/tb/scss/_cards.scss'), '.card h3{font-weight:500}')
  writeFileSync(path.join(siteRoot, '.webroot/templates/tb/css/template.css'), 'rewritten by t4-scss.php')

  const answer = await revertLook({ siteRoot, undo: id, io })
  assert.deepEqual(answer.restored, [
    '.webroot/templates/tb/scss/_cards.scss',
    '.webroot/templates/tb/css/template.css'
  ])
  assert.equal(read(siteRoot, '.webroot/templates/tb/scss/_cards.scss'), '.card h3{font-weight:700}')
  assert.equal(
    read(siteRoot, '.webroot/templates/tb/css/template.css'),
    '.card h3{font-weight:700}/*compiled*/'
  )
})

test('a file that did not exist before the write is deleted by the undo', async () => {
  const siteRoot = site({ '.webroot/templates/tb/scss/_cards.scss': 'a{}' })
  const io = ioFor(siteRoot)
  const files = planned(siteRoot, 'write', {
    file_path: '.webroot/templates/tb/css/custom.css',
    content: 'x'
  })
  const { id } = await takeLookSnapshot({ siteRoot, files, io, tool: 'write' })
  mkdirSync(path.join(siteRoot, '.webroot/templates/tb/css'), { recursive: true })
  writeFileSync(path.join(siteRoot, '.webroot/templates/tb/css/custom.css'), 'h3{color:red}')

  const answer = await revertLook({ siteRoot, undo: id, io })
  assert.deepEqual(answer.removed, ['.webroot/templates/tb/css/custom.css'])
  assert.equal(existsSync(path.join(siteRoot, '.webroot/templates/tb/css/custom.css')), false)
})

test("EmDash: a /app file is kept and restored through the site's own container", async () => {
  const siteRoot = site()
  const container = fakeContainer({ '/app/src/styles/global.css': '.h-2{font-weight:700}' })
  const io = ioFor(siteRoot, container)
  const { id } = await takeLookSnapshot({
    siteRoot,
    files: ['/app/src/styles/global.css', '/app/src/styles/new.css'],
    io,
    tool: 'bash'
  })
  container.tree.set('/app/src/styles/global.css', '.h-2{font-weight:500}')
  container.tree.set('/app/src/styles/new.css', '.x{}')

  const answer = await revertLook({ siteRoot, undo: id, io })
  assert.deepEqual(answer.restored, ['/app/src/styles/global.css'])
  assert.deepEqual(answer.removed, ['/app/src/styles/new.css'])
  assert.equal(container.tree.get('/app/src/styles/global.css'), '.h-2{font-weight:700}')
  assert.equal(container.tree.has('/app/src/styles/new.css'), false)
  assert.ok(
    container.calls.every((argv) => argv.includes('capi-web-1')),
    "only this site's container"
  )
  // The source is back; the served build is not until the site is rebuilt — the answer says so.
  assert.match(answer.next ?? '', /site\.rebuild/)
})

test(`only the newest ${LOOK_UNDO_KEEP} undo entries of a site are kept; older ones are pruned`, async () => {
  const siteRoot = site({ '.webroot/a.css': 'a' })
  const io = ioFor(siteRoot)
  const ids = []
  let clock = Date.parse('2026-09-29T10:00:00Z')
  for (let i = 0; i < LOOK_UNDO_KEEP + 3; i += 1) {
    clock += 1000
    const { id } = await takeLookSnapshot({
      siteRoot,
      files: [path.join(siteRoot, '.webroot/a.css')],
      io,
      tool: 'edit',
      now: clock
    })
    ids.push(id)
  }
  const kept = readdirSync(path.join(siteRoot, LOOK_UNDO_DIR)).sort()
  assert.equal(kept.length, LOOK_UNDO_KEEP)
  assert.deepEqual(kept, ids.slice(3).sort())
  const gone = await revertLook({ siteRoot, undo: ids[0], io })
  assert.equal(gone.ok, false)
  assert.equal(gone.code, 'LOOK_UNDO_UNKNOWN')
})

test("look.revert refuses an unknown id, a malformed one, and another site's id — naming what it can undo", async () => {
  const siteA = site({ '.webroot/a.css': 'A' }, 'sitea')
  const siteB = path.join(path.dirname(siteA), 'siteb')
  mkdirSync(path.join(siteB, '.webroot'), { recursive: true })
  writeFileSync(path.join(siteB, '.webroot/b.css'), 'B')
  const { id } = await takeLookSnapshot({
    siteRoot: siteA,
    files: [path.join(siteA, '.webroot/a.css')],
    io: ioFor(siteA),
    tool: 'edit'
  })
  writeFileSync(path.join(siteA, '.webroot/a.css'), 'A changed')

  // Site B cannot reach site A's entry: its store holds no such id.
  const foreign = await revertLook({ siteRoot: siteB, undo: id, io: ioFor(siteB) })
  assert.equal(foreign.ok, false)
  assert.equal(foreign.code, 'LOOK_UNDO_UNKNOWN')
  assert.equal(read(siteA, '.webroot/a.css'), 'A changed')

  for (const undo of ['../sitea/.tracy/undo/look/' + id, 'zzzzzz', '', undefined]) {
    const answer = await revertLook({ siteRoot: siteB, undo, io: ioFor(siteB) })
    assert.equal(answer.ok, false, String(undo))
    assert.match(answer.code, /^LOOK_UNDO_(UNKNOWN|BAD_ID)$/)
    assert.ok(typeof answer.next === 'string' && answer.next.length > 0)
  }
  const unknown = await revertLook({ siteRoot: siteA, undo: 'abcdef', io: ioFor(siteA) })
  assert.match(unknown.next, new RegExp(id), 'the next step names the undo ids this site has')
})

test('a manifest pointing outside its own site is refused whole, and nothing is written', async () => {
  const siteA = site({ '.webroot/a.css': 'A' }, 'sitea')
  const siteB = path.join(path.dirname(siteA), 'siteb')
  mkdirSync(path.join(siteB, '.webroot'), { recursive: true })
  writeFileSync(path.join(siteB, '.webroot/b.css'), 'B')
  const io = ioFor(siteA)
  const { id } = await takeLookSnapshot({
    siteRoot: siteA,
    files: [path.join(siteA, '.webroot/a.css')],
    io,
    tool: 'edit'
  })
  // Someone rewrites the manifest to aim at the other site (or out of the served tree).
  const file = path.join(siteA, LOOK_UNDO_DIR, id, 'manifest.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  // A symlink in this site's webroot that leads into the other site passes a string check, not this one.
  symlinkSync(path.join(siteB, '.webroot'), path.join(siteA, '.webroot/elsewhere'))
  for (const target of [
    path.join(siteB, '.webroot/b.css'),
    path.join(siteA, 'AGENTS.md'),
    path.join(siteA, '.webroot/elsewhere/b.css'),
    '/etc/passwd',
    '/app/../etc/passwd'
  ]) {
    manifest.files = [{ ...manifest.files[0], path: target }]
    writeFileSync(file, JSON.stringify(manifest))
    const answer = await revertLook({ siteRoot: siteA, undo: id, io })
    assert.equal(answer.ok, false, target)
    assert.equal(answer.code, 'LOOK_UNDO_OUTSIDE_SITE')
  }
  assert.equal(read(siteB, '.webroot/b.css'), 'B')
})

test('lookWriteTargets: the served look files a write names, in any turn; lookFiles still only in a comment turn', () => {
  const siteRoot = '/site/capi'
  const cwd = siteRoot
  const style = {
    name: 'edit',
    args: { file_path: '.webroot/wp-content/themes/tracy/style.css' },
    cwd,
    siteRoot
  }
  assert.deepEqual(lookWriteTargets(style), ['/site/capi/.webroot/wp-content/themes/tracy/style.css'])
  assert.deepEqual(lookFiles({ ...style, turn: null }), [])
  assert.deepEqual(
    lookWriteTargets({ ...style, args: { file_path: '.webroot/wp-content/themes/tracy/functions.php' } }),
    []
  )
  assert.deepEqual(lookWriteTargets({ ...style, args: { file_path: 'notes/style.css' } }), [], 'not served')
  assert.deepEqual(lookWriteTargets({ name: 'read', args: { file_path: 'x.css' }, cwd, siteRoot }), [])
})

test("WordPress Additional CSS: lookIo reads and writes it with wp-cli in the site's own container, compare-and-set, and says when wp-cli is missing", async () => {
  const siteRoot = site({ '.webroot/wp-config.php': '<?php\n' })
  let css = '.a { color: red; }'
  const calls = []
  const answer = (a) => ({
    code: 0,
    stdout: `PHP Notice: noise\nTRACY_WP_CSS ${Buffer.from(JSON.stringify(a)).toString('base64')}\n`,
    stderr: ''
  })
  const io = lookIo({
    siteRoot,
    container: 'capi-web-1',
    run: async ({ argv, stdin, timeoutMs }) => {
      calls.push({ argv, timeoutMs })
      const q = JSON.parse(stdin)
      if (q.mode === 'read') return answer({ ok: true, stylesheet: 'twentytwentyfive', css })
      if (q.expect !== cssHash(css)) return answer({ ok: false, conflict: true })
      css = q.css
      return answer({ ok: true, stylesheet: q.stylesheet, css })
    }
  })
  assert.deepEqual(await io.customCss.read(), {
    stylesheet: 'twentytwentyfive',
    css: '.a { color: red; }',
    block: false,
    exists: true
  })
  assert.deepEqual(
    await io.customCss.write({ stylesheet: 'twentytwentyfive', css: '.b{}', expect: cssHash('stale') }),
    { ok: false, conflict: true }
  )
  assert.equal(css, '.a { color: red; }', 'a stale expect writes nothing')
  assert.deepEqual(
    await io.customCss.write({
      stylesheet: 'twentytwentyfive',
      css: '.b{}',
      expect: cssHash('.a { color: red; }')
    }),
    { ok: true, css: '.b{}' }
  )
  assert.deepEqual(calls[0].argv.slice(0, 11), [
    'exec',
    '-i',
    '-u',
    'www-data',
    'capi-web-1',
    'wp',
    '--path=/var/www/html',
    '--skip-plugins',
    '--skip-themes',
    '--no-color',
    'eval'
  ])
  const missing = lookIo({
    siteRoot,
    container: 'capi-web-1',
    run: async () => ({
      code: 127,
      stdout: '',
      stderr: 'OCI runtime exec failed: exec: "wp": executable file not found in $PATH'
    })
  })
  await assert.rejects(missing.customCss.read(), /wp-cli is not in capi-web-1/)
  const nobody = lookIo({ siteRoot, container: null, run: async () => assert.fail('no container, no run') })
  await assert.rejects(nobody.customCss.read(), /no site container/)
})

test('🔒 WordPress Additional CSS a look write CREATED is deleted by its undo, not emptied — an older entry, which cannot tell, is emptied as before (uiweekwp)', async () => {
  // what WP_CUSTOM_CSS_PHP answers, played by a site whose theme has no `custom_css` post yet
  /** @type {string | null} */
  let post = null
  const asked = []
  const answer = (a) => ({
    code: 0,
    stdout: `TRACY_WP_CSS ${Buffer.from(JSON.stringify(a)).toString('base64')}\n`,
    stderr: ''
  })
  const io = lookIo({
    siteRoot: site(),
    container: 'uiweekwp-web-1',
    run: async ({ argv, stdin }) => {
      assert.equal(argv.at(-1), WP_CUSTOM_CSS_PHP)
      const q = JSON.parse(stdin)
      asked.push(q.mode)
      const now = post ?? ''
      if (q.mode === 'read')
        return answer({
          ok: true,
          stylesheet: 'wp-tracy-business',
          css: now,
          exists: post !== null,
          block: true
        })
      if (q.expect !== cssHash(now)) return answer({ ok: false, conflict: true })
      post = q.mode === 'remove' ? null : q.css
      return answer({ ok: true, stylesheet: q.stylesheet, css: post ?? '', exists: post !== null })
    }
  })
  const before = await io.customCss.read()
  assert.equal(before.exists, false)
  const siteRoot = site({ '.webroot/wp-config.php': '<?php\n' })
  const kept = await takeLookSnapshot({
    siteRoot,
    files: [],
    io,
    tool: 'look.set',
    customCss: { stylesheet: before.stylesheet, css: before.css, existed: before.exists }
  })
  const put = await io.customCss.write({
    stylesheet: 'wp-tracy-business',
    css: '.x{color:red}',
    expect: cssHash('')
  })
  assert.equal(post, '.x{color:red}', 'the look write created the post')
  await noteLookAfter({ siteRoot, id: kept.id, css: /** @type {any} */ (put).css })
  const manifest = JSON.parse(read(siteRoot, `${LOOK_UNDO_DIR}/${kept.id}/manifest.json`))
  assert.deepEqual(manifest.customCss, {
    stylesheet: 'wp-tracy-business',
    before: 'c0',
    existed: false,
    after: 'c1'
  })
  const back = /** @type {any} */ (await revertLook({ siteRoot, undo: kept.id, io }))
  assert.equal(back.ok, true, JSON.stringify(back))
  assert.deepEqual(back.restored, ['Additional CSS'])
  assert.equal(post, null, 'no empty custom_css post is left behind')
  assert.deepEqual(asked, ['read', 'write', 'remove'])

  // an entry kept before `existed` was recorded: "" may be an empty post or none — put back as ""
  post = '.y{}'
  const old = site({ '.webroot/wp-config.php': '<?php\n' })
  const entry = await takeLookSnapshot({
    siteRoot: old,
    files: [],
    io,
    tool: 'look.set',
    customCss: { stylesheet: 'wp-tracy-business', css: '' }
  })
  await noteLookAfter({ siteRoot: old, id: entry.id, css: '.y{}' })
  const again = /** @type {any} */ (await revertLook({ siteRoot: old, undo: entry.id, io }))
  assert.equal(again.ok, true, JSON.stringify(again))
  assert.equal(post, '', 'emptied, as it always was')
  assert.equal(asked.at(-1), 'write')
})
