// The theme is reinstalled only when its zip changed. build.mjs rewrites every generated file
// before zipping, so the zip's bytes differ on every build (mtimes) while its content does not —
// the hash is over the entries (name, size, crc32), and a no-op seed makes no `theme install`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { rebuildTheme, zipContentHash, generateNoTitlePageTemplate, zipGeneratedTheme } from '../seed.mjs'

const dir = mkdtempSync(join(tmpdir(), 'seed-theme-'))
test.after(() => rmSync(dir, { recursive: true, force: true }))

/** A theme source tree whose build writes a zip of `files` into dist/<theme>.zip, touching mtimes. */
function themeSrc(name, files) {
  const src = join(dir, name)
  mkdirSync(join(src, 'src', 'tracy'), { recursive: true })
  let builds = 0
  const build = (opts) => {
    builds++
    for (const [f, text] of Object.entries(files)) {
      const path = join(src, 'src', 'tracy', f)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text)
      utimesSync(path, new Date(2020, 0, 1 + builds), new Date(2020, 0, 1 + builds))
    }
    mkdirSync(join(src, 'dist'), { recursive: true })
    const zip = join(src, 'dist', `${opts.theme}.zip`)
    spawnSync('rm', ['-f', zip])
    const r = spawnSync('zip', ['-qrX', zip, 'tracy'], { cwd: join(src, 'src') })
    assert.equal(r.status, 0)
  }
  return { src, build, builds: () => builds }
}

function fakeWp({ inspiration = '' } = {}) {
  const calls = []
  return {
    calls,
    dryRun: false,
    run: (args) => {
      calls.push(args.join(' '))
      if (args[0] === 'option' && args[1] === 'get') return { code: inspiration ? 0 : 1, stdout: inspiration, stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    }
  }
}

test('zipContentHash: same content on different dates is the same hash; a changed byte is not', () => {
  const t = themeSrc('hash', { 'style.css': 'a', 'theme.json': '{}' })
  t.build({ theme: 'tracy' })
  const h1 = zipContentHash(join(t.src, 'dist', 'tracy.zip'))
  const bytes1 = readFileSync(join(t.src, 'dist', 'tracy.zip'))
  t.build({ theme: 'tracy' })
  const h2 = zipContentHash(join(t.src, 'dist', 'tracy.zip'))
  assert.match(h1, /^[0-9a-f]{64}$/)
  assert.equal(h1, h2)
  assert.notEqual(bytes1.equals(readFileSync(join(t.src, 'dist', 'tracy.zip'))), true, 'the bytes did change (mtimes) — the hash is over the content')
  const u = themeSrc('hash2', { 'style.css': 'b', 'theme.json': '{}' })
  u.build({ theme: 'tracy' })
  assert.notEqual(zipContentHash(join(u.src, 'dist', 'tracy.zip')), h1)
})

test('rebuildTheme: installs on the first run, skips while the zip content is unchanged, installs again when it changes', () => {
  const files = { 'style.css': 'v1', 'theme.json': '{}' }
  const t = themeSrc('rebuild', files)
  const out = join(dir, 'seed-out')
  const dist = join(dir, 'stand-dist')
  const opts = { theme: 'tracy', themeSrc: t.src, dist, out, report: join(out, 'report-1.json') }
  const r1 = {}
  const wp = fakeWp()
  rebuildTheme(wp, opts, r1, { build: t.build })
  assert.deepEqual(wp.calls, ['theme install /dist/tracy.zip --force --activate', 'option get tracy_inspiration'])
  assert.equal(r1.theme.rebuilt, true)
  assert.match(r1.theme.hash, /^[0-9a-f]{64}$/)
  assert.equal(r1.theme.zip, join(dist, 'tracy.zip'))
  assert.equal(readFileSync(join(out, 'theme.sha256'), 'utf8').trim(), r1.theme.hash)

  const r2 = {}
  rebuildTheme(wp, { ...opts, report: join(out, 'report-2.json') }, r2, { build: t.build })
  assert.equal(wp.calls.filter((c) => c.startsWith('theme install')).length, 1, 'no second theme install')
  assert.equal(t.builds(), 2, 'the zip is still built — that is what is compared')
  assert.equal(r2.theme.rebuilt, false)
  assert.equal(r2.theme.hash, r1.theme.hash)
  assert.match(r2.theme.reason, /unchanged/)
  assert.ok(existsSync(join(dist, 'tracy.zip')), 'the stand keeps its copy')

  files['style.css'] = 'v2'
  const r3 = {}
  rebuildTheme(wp, opts, r3, { build: t.build })
  assert.equal(wp.calls.filter((c) => c.startsWith('theme install')).length, 2)
  assert.equal(r3.theme.rebuilt, true)
  assert.notEqual(r3.theme.hash, r1.theme.hash)
  assert.equal(readFileSync(join(out, 'theme.sha256'), 'utf8').trim(), r3.theme.hash)
})

test('rebuildTheme: the previous report is the fallback when <out>/theme.sha256 is missing; a dry run writes neither', () => {
  const t = themeSrc('fallback', { 'style.css': 'x' })
  const out = join(dir, 'seed-out-2')
  mkdirSync(out, { recursive: true })
  const opts = { theme: 'tracy', themeSrc: t.src, dist: join(dir, 'stand-dist-2'), out, report: join(out, 'report.json') }
  const wp = fakeWp()
  const first = {}
  rebuildTheme(wp, opts, first, { build: t.build })
  writeFileSync(opts.report, JSON.stringify(first))
  spawnSync('rm', ['-f', join(out, 'theme.sha256')])
  const second = {}
  rebuildTheme(wp, opts, second, { build: t.build })
  assert.equal(second.theme.rebuilt, false)
  assert.equal(wp.calls.filter((c) => c.startsWith('theme install')).length, 1)

  const dry = { ...wp, dryRun: true, run: (args) => (wp.calls.push('[dry] ' + args.join(' ')), { code: 0, stdout: '', stderr: '' }) }
  spawnSync('rm', ['-f', join(out, 'theme.sha256'), opts.report])
  const third = {}
  rebuildTheme(dry, opts, third, { build: t.build })
  assert.equal(third.theme.rebuilt, true)
  assert.equal(existsSync(join(out, 'theme.sha256')), false, 'a dry run installed nothing, so it records nothing')
})


// A reinstalled theme does not change the site's look on its own: the user global styles post is a
// snapshot of styles/<id>.json taken when the inspiration was applied, and it beats theme.json
// (D7, 14/09; the 1176 container that every shot still measured at 1240, 15/09). After the
// install the inspiration the site wears is applied again — the same id, the new file.
test('rebuildTheme: after an install the worn inspiration is applied again so the global styles post follows the new tokens', () => {
  const t = themeSrc('reapply', { 'style.css': 'v1', 'theme.json': '{}' })
  const out = join(dir, 'seed-out-reapply')
  const opts = { theme: 'tracy', themeSrc: t.src, dist: join(dir, 'stand-dist-reapply'), out, report: join(out, 'report-1.json') }
  const wp = fakeWp({ inspiration: 'apple' })
  const r = {}
  rebuildTheme(wp, opts, r, { build: t.build })
  assert.deepEqual(wp.calls, [
    'theme install /dist/tracy.zip --force --activate',
    'option get tracy_inspiration',
    `eval exit(function_exists('tracy_apply_inspiration') && tracy_apply_inspiration("apple") ? 0 : 1);`
  ])
  assert.equal(r.theme.inspiration, 'apple')
  assert.equal(r.theme.globalStylesReapplied, true)
  // no inspiration recorded (a fresh site): nothing to re-apply, and the report says so
  const bare = fakeWp()
  const r2 = {}
  rebuildTheme(bare, { ...opts, out: join(dir, 'seed-out-reapply-2'), report: join(dir, 'seed-out-reapply-2', 'r.json') }, r2, { build: t.build })
  assert.equal(r2.theme.inspiration, null)
  assert.ok(!bare.calls.some((c) => c.startsWith('eval')))
})

// A page's `_wp_page_template` may name any template the theme ships, not a fixed list of five:
// the meta was dropped for `page-style-guide`, so the page got its template only where WordPress
// resolved page-<slug>.html by slug — the EN page — and the RU translation, whose slug is Cyrillic,
// rendered on the default template (full-2, 15/09).
test('themeTemplates: the base set plus the theme source templates/*.html, or the site\'s block templates, or the base set alone with a note', async () => {
  const { themeTemplates, BASE_TEMPLATES } = await import('../seed.mjs')
  const src = join(dir, 'tpl-src')
  mkdirSync(join(src, 'src', 'acme', 'templates'), { recursive: true })
  writeFileSync(join(src, 'src', 'acme', 'templates', 'page-style-guide.html'), '<!-- wp:group /-->')
  writeFileSync(join(src, 'src', 'acme', 'templates', 'page-contact.html'), '<!-- wp:group /-->')
  writeFileSync(join(src, 'src', 'acme', 'templates', 'README.md'), 'not a template')
  const report = { notes: [] }
  const fromSrc = themeTemplates({ themeSrc: src, theme: 'acme', report })
  for (const t of BASE_TEMPLATES) assert.ok(fromSrc.has(t))
  assert.ok(fromSrc.has('page-style-guide') && fromSrc.has('page-contact') && !fromSrc.has('README'))
  assert.equal(report.templates.from, join(src, 'src', 'acme', 'templates'))
  // No source tree: the site is asked.
  const wp = { dryRun: false, phpEval: (code) => (assert.match(code, /get_block_templates/), JSON.stringify(['page-email', 'single', 'page-email'])) }
  const fromSite = themeTemplates({ theme: 'acme', wp, report: { notes: [] } })
  assert.ok(fromSite.has('page-email') && fromSite.has('single') && fromSite.has('page-landing'))
  // A dry run without a source tree: the base set, and the report says a named template is dropped.
  const dry = { notes: [] }
  const base = themeTemplates({ wp: { dryRun: true, phpEval: () => assert.fail('a dry run asks nothing of the site') }, report: dry })
  assert.deepEqual([...base].sort(), [...BASE_TEMPLATES].sort())
  assert.equal(dry.notes.length, 1)
})

test('generated page-no-title exists only when needed and removes the source page-title block', () => {
  const t = themeSrc('no-title', {
    'theme.json': JSON.stringify({ version: 3 }),
    'templates/page.html': '<!-- wp:group --><div class="wp-block-group"><!-- wp:post-title {"level":1} /--><!-- wp:post-content /--></div><!-- /wp:group -->'
  })
  t.build({ theme: 'tracy' })
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: false }), false)
  assert.equal(existsSync(join(t.src, 'src', 'tracy', 'templates', 'page-no-title.html')), false)
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true }), true)
  const templatePath = join(t.src, 'src', 'tracy', 'templates', 'page-no-title.html')
  const generated = readFileSync(templatePath, 'utf8')
  assert.doesNotMatch(generated, /core\/post-title|wp:post-title/)
  assert.match(generated, /wp:post-content/)
  writeFileSync(join(t.src, 'src', 'tracy', 'theme.json'), JSON.stringify({ version: 3 }))
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true }), true, 'a retained generated file is registered again if the base build rewrote theme.json')
  assert.deepEqual(JSON.parse(readFileSync(join(t.src, 'src', 'tracy', 'theme.json'), 'utf8')).customTemplates, [
    { name: 'page-no-title', title: 'Page without title', postTypes: ['page'] }
  ])
  zipGeneratedTheme(t.src, 'tracy')
  let entries = spawnSync('unzip', ['-Z1', join(t.src, 'dist', 'tracy.zip')], { encoding: 'utf8' })
  assert.equal(entries.status, 0)
  assert.match(entries.stdout, /tracy\/templates\/page-no-title\.html/)
  assert.match(spawnSync('unzip', ['-p', join(t.src, 'dist', 'tracy.zip'), 'tracy/theme.json'], { encoding: 'utf8' }).stdout, /page-no-title/)

  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: false }), true)
  zipGeneratedTheme(t.src, 'tracy')
  assert.equal(existsSync(templatePath), false)
  entries = spawnSync('unzip', ['-Z1', join(t.src, 'dist', 'tracy.zip')], { encoding: 'utf8' })
  assert.equal(entries.status, 0)
  assert.doesNotMatch(entries.stdout, /page-no-title/)
  assert.equal(JSON.parse(readFileSync(join(t.src, 'src', 'tracy', 'theme.json'), 'utf8')).customTemplates, undefined)
})

test('page-no-title only updates or removes the exact template content generated by the seeder', () => {
  const t = themeSrc('no-title-ownership', {
    'theme.json': JSON.stringify({ version: 3 }),
    'templates/page.html': '<!-- wp:group --><div class="wp-block-group"><!-- wp:post-title /--><!-- wp:post-content /--></div><!-- /wp:group -->'
  })
  t.build({ theme: 'tracy' })
  const themeDir = join(t.src, 'src', 'tracy')
  const templatePath = join(themeDir, 'templates', 'page-no-title.html')
  const themeJsonPath = join(themeDir, 'theme.json')
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true }), true)
  const generated = readFileSync(templatePath, 'utf8')

  writeFileSync(templatePath, `${generated}\n<!-- owner edit -->\n`)
  const edited = readFileSync(templatePath, 'utf8')
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true }), false)
  assert.equal(readFileSync(templatePath, 'utf8'), edited, 'an edited template is not overwritten while still needed')
  const keptReport = { notes: [] }
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: false, report: keptReport }), false)
  assert.equal(readFileSync(templatePath, 'utf8'), edited, 'an edited template is kept when no longer needed')
  assert.deepEqual(JSON.parse(readFileSync(themeJsonPath, 'utf8')).customTemplates, [
    { name: 'page-no-title', title: 'Page without title', postTypes: ['page'] }
  ])
  assert.match(JSON.stringify(keptReport.notes), /page-no-title.*kept/i)

  writeFileSync(templatePath, generated)
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: false }), true)
  assert.equal(existsSync(templatePath), false, 'an unchanged generated template is removed')
  assert.equal(JSON.parse(readFileSync(themeJsonPath, 'utf8')).customTemplates, undefined)

  const preexisting = '<!-- tracy-generated: page-no-title -->\n<!-- owner-authored template -->\n'
  writeFileSync(templatePath, preexisting)
  const registered = { version: 3, customTemplates: [{ name: 'page-no-title', title: 'Owner template', postTypes: ['page'] }] }
  writeFileSync(themeJsonPath, JSON.stringify(registered))
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: false }), false)
  assert.equal(readFileSync(templatePath, 'utf8'), preexisting)
  assert.deepEqual(JSON.parse(readFileSync(themeJsonPath, 'utf8')), registered)
})

test('page-no-title keeps the generated file when its theme.json entry was edited', () => {
  const t = themeSrc('no-title-entry-ownership', {
    'theme.json': JSON.stringify({ version: 3 }),
    'templates/page.html': '<!-- wp:group --><div class="wp-block-group"><!-- wp:post-title /--><!-- wp:post-content /--></div><!-- /wp:group -->'
  })
  t.build({ theme: 'tracy' })
  const themeDir = join(t.src, 'src', 'tracy')
  const templatePath = join(themeDir, 'templates', 'page-no-title.html')
  const themeJsonPath = join(themeDir, 'theme.json')
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true }), true)
  const generated = readFileSync(templatePath, 'utf8')
  const editedEntry = { name: 'page-no-title', title: 'My title-free page', postTypes: ['page'] }
  writeFileSync(themeJsonPath, JSON.stringify({ version: 3, customTemplates: [editedEntry] }))

  const report = { notes: [] }
  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: false, report }), false)
  assert.equal(readFileSync(templatePath, 'utf8'), generated, 'the unchanged file is kept when its paired entry was edited')
  assert.deepEqual(JSON.parse(readFileSync(themeJsonPath, 'utf8')).customTemplates, [editedEntry])
  assert.match(JSON.stringify(report.notes), /page-no-title.*kept/i)

  assert.equal(generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true, report: { notes: [] } }), false)
  assert.equal(readFileSync(templatePath, 'utf8'), generated)
  assert.deepEqual(JSON.parse(readFileSync(themeJsonPath, 'utf8')).customTemplates, [editedEntry], 'the seeder does not rewrite the edited entry')
})

test('rebuildTheme packages page-no-title only for hidden-heading routes and reuses the unchanged zip', async () => {
  const { themeTemplates } = await import('../seed.mjs')
  const t = themeSrc('no-title-build', {
    'theme.json': JSON.stringify({ version: 3 }),
    'templates/page.html': '<!-- wp:group --><div class="wp-block-group"><!-- wp:post-title /--><!-- wp:post-content /--></div><!-- /wp:group -->'
  })
  const out = join(dir, 'no-title-build-out')
  const opts = { theme: 'tracy', themeSrc: t.src, dist: join(dir, 'no-title-build-stand'), out, report: join(out, 'report.json') }
  const wp = fakeWp()
  const first = {}
  rebuildTheme(wp, opts, first, {
    build: t.build,
    afterBuild: () => {
      if (generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true })) zipGeneratedTheme(t.src, 'tracy')
    },
    beforeInstall: () => assert.ok(themeTemplates({ themeSrc: t.src, theme: 'tracy' }).has('page-no-title'))
  })
  assert.equal(first.theme.rebuilt, true)
  const second = {}
  rebuildTheme(wp, { ...opts, report: join(out, 'report-2.json') }, second, {
    build: t.build,
    afterBuild: () => {
      if (generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: true })) zipGeneratedTheme(t.src, 'tracy')
    },
    beforeInstall: () => assert.ok(themeTemplates({ themeSrc: t.src, theme: 'tracy' }).has('page-no-title'))
  })
  assert.equal(second.theme.rebuilt, false)
  assert.equal(t.builds(), 2)
  assert.ok(wp.calls.filter((call) => call.startsWith('theme install')).length === 1)

  const third = {}
  rebuildTheme(wp, { ...opts, report: join(out, 'report-3.json') }, third, {
    build: t.build,
    afterBuild: () => {
      if (generateNoTitlePageTemplate({ themeSrc: t.src, theme: 'tracy', needed: false })) zipGeneratedTheme(t.src, 'tracy')
    },
    beforeInstall: () => assert.ok(!themeTemplates({ themeSrc: t.src, theme: 'tracy' }).has('page-no-title'))
  })
  assert.equal(third.theme.rebuilt, true)
  assert.equal(wp.calls.filter((call) => call.startsWith('theme install')).length, 2)
})

// The patterns a page is filled from come from the site's registry, so the theme that registers
// them must be installed first: with the rebuild at the end of the run, a pattern edited in the
// overlay reached the pages one seed late (seed 57 on wp-tracy-business filled the team cards
// from the old slots while the new zip was installed afterwards).
test('seed: the theme is rebuilt and reinstalled before the patterns are read from the site', () => {
  const src = readFileSync(new URL('../seed.mjs', import.meta.url), 'utf8')
  const rebuild = src.indexOf('rebuildTheme(wp, opts, report')
  const load = src.indexOf('loadPatterns(wp, [')
  assert.ok(rebuild > 0 && load > 0)
  assert.ok(rebuild < load, 'rebuildTheme must run before loadPatterns')
})
