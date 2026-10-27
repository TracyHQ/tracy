// The tracy-web image carries `apps/tracy-web` alone, so the Design system door's emitters
// (`apps/tracy-web/src/lib/ds-slot.js`) load `@tracy/ds-slot` from copies the Dockerfile lays out
// under `src/ds-slot/`: the package's `src/` and `templates/`, `@tracy/wordpress-theme/variation`
// in `src/ds-slot/node_modules/`, and under `src/ds-slot/root/` only the files the emitters read
// (the OpenDesign catalogue, each system's `tokens.css` + `manifest.json`, the WordPress overlays'
// `tokens.css`). A module that reaches anything else loads in a checkout and fails in the image.
//
// This suite rebuilds that layout in a temporary directory — with NOTHING else beside it — and, in a
// fresh Node process, reads the library and emits one system for each CMS through the image's copy.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

test('the Dockerfile lays out the ds-slot copy this suite rebuilds', () => {
  const dockerfile = readFileSync(join(ROOT, 'apps/tracy-web/Dockerfile'), 'utf8')
  for (const line of [
    /^COPY packages\/design\/tracy-ds-slot\/src \.\/src\/ds-slot\/src$/m,
    /^COPY packages\/design\/tracy-ds-slot\/templates \.\/src\/ds-slot\/templates$/m,
    /^COPY packages\/cms\/tracy-wordpress-theme\/lib\/variation\.mjs \.\/src\/ds-slot\/node_modules\/@tracy\/wordpress-theme\/lib\/variation\.mjs$/m,
    /^COPY vendor\/tracy\/od-design-system\/catalog\.json \.\/src\/ds-slot\/root\/vendor\/tracy\/od-design-system\/catalog\.json$/m,
    /^COPY --from=dslib \/lib\/systems \.\/src\/ds-slot\/root\/vendor\/tracy\/od-design-system\/systems$/m,
    /^COPY --from=dslib \/lib\/overlays \.\/src\/ds-slot\/root\/packages\/cms\/tracy-wordpress-theme\/overlays$/m
  ])
    assert.match(dockerfile, line)
})

test('the emitters load and emit for every CMS from the image layout alone', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tracy-web-ds-image-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const ds = join(root, 'src', 'ds-slot')
  mkdirSync(join(root, 'src', 'lib'), { recursive: true })
  // the image copies apps/tracy-web/src whole (COPY apps/tracy-web/src ./src), so ds-slot.js reaches its
  // neighbours in src/lib (refero-names.js, local-releases.js and what they import) as it does here
  cpSync(join(ROOT, 'apps/tracy-web/src/lib'), join(root, 'src/lib'), { recursive: true })
  cpSync(join(ROOT, 'apps/tracy-web/src/config.js'), join(root, 'src/config.js'))
  cpSync(join(ROOT, 'packages/design/tracy-ds-slot/src'), join(ds, 'src'), { recursive: true })
  cpSync(join(ROOT, 'packages/design/tracy-ds-slot/templates'), join(ds, 'templates'), { recursive: true })
  const theme = join(ds, 'node_modules/@tracy/wordpress-theme')
  mkdirSync(join(theme, 'lib'), { recursive: true })
  cpSync(join(ROOT, 'packages/cms/tracy-wordpress-theme/package.json'), join(theme, 'package.json'))
  cpSync(join(ROOT, 'packages/cms/tracy-wordpress-theme/lib/variation.mjs'), join(theme, 'lib/variation.mjs'))
  const od = join(ds, 'root/vendor/tracy/od-design-system')
  cpSync(join(ROOT, 'vendor/tracy/od-design-system/catalog.json'), join(od, 'catalog.json'))
  for (const id of readdirSync(join(ROOT, 'vendor/tracy/od-design-system/systems'))) {
    for (const f of ['tokens.css', 'manifest.json']) {
      try {
        cpSync(join(ROOT, 'vendor/tracy/od-design-system/systems', id, f), join(od, 'systems', id, f))
      } catch {}
    }
  }
  const overlays = join(ROOT, 'packages/cms/tracy-wordpress-theme/overlays')
  for (const o of readdirSync(overlays)) {
    try {
      cpSync(
        join(overlays, o, 'tokens.css'),
        join(ds, 'root/packages/cms/tracy-wordpress-theme/overlays', o, 'tokens.css')
      )
    } catch {}
  }
  // `package.json` beside `src/` makes `.js` an ES module there, as in the image (apps/tracy-web).
  cpSync(join(ROOT, 'apps/tracy-web/package.json'), join(root, 'package.json'))

  const probe = `
    const m = await import(${JSON.stringify(join(root, 'src/lib/ds-slot.js'))})
    if (!m.DS_SLOT_DIR.startsWith(${JSON.stringify(ds)})) throw new Error('not the image copy: ' + m.DS_SLOT_DIR)
    const lib = await m.dsLibrary()
    const out = { count: lib.length, ok: lib.filter((s) => s.ok).length }
    const e = await m.emitFor({ platform: 'emdash', contract: 'emdash-tracy-business', id: 'stripe' })
    const w = await m.emitFor({ platform: 'wordpress', contract: 'wordpress-ja-vega', id: 'stripe' })
    const j = await m.emitFor({ platform: 'joomla', contract: 'joomla-tracy-base', id: 'stripe' })
    out.emdash = e.ok && e.css.startsWith('/* tracy-ds-slot: od:stripe ')
    out.wordpress = w.ok && w.slug === 'ds-od-stripe' && JSON.stringify(w.variation).includes('tracy-ds-slot: od:stripe')
    out.joomla = j.ok && j.html.includes('tracy-ds-slot: od:stripe') && j.module.title === 'Tracy design system'
    console.log(JSON.stringify(out))
  `
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(run.status, 0, run.stderr)
  const out = JSON.parse(run.stdout.trim().split('\n').at(-1))
  assert.equal(out.count, 154)
  assert.ok(out.ok > 100, `${out.ok} systems pass the gate`)
  assert.deepEqual([out.emdash, out.wordpress, out.joomla], [true, true, true])
})

test('the image ships Refero card thumbnails, not the snapshot screenshots', () => {
  const dockerfile = readFileSync(join(ROOT, 'apps/tracy-web/Dockerfile'), 'utf8')
  assert.match(
    dockerfile,
    /^COPY packages\/design\/tracy-ds-slot\/refero-thumbs \.\/src\/ds-slot\/refero-thumbs$/m
  )
  assert.match(dockerfile, /^COPY --from=dslib \/lib\/refero \.\/src\/ds-slot\/root\/vendor\/tracy\/refero$/m)
  assert.doesNotMatch(dockerfile, /screenshot\.jpg -delete/, 'the dslib stage keeps no screenshot')
  const ignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
  assert.doesNotMatch(ignore, /^!vendor\/tracy\/refero\/.*screenshot/m, 'the 151 MB of originals stay out')
  // The thumbnails are exactly the offered systems (the quality gate's list): the generator's own check.
  const check = spawnSync(process.execPath, [join(ROOT, 'scripts/build-refero-thumbs.mjs'), '--check'], {
    encoding: 'utf8'
  })
  assert.equal(check.status, 0, check.stderr)
})

test('the dslib stage keeps the Refero data of the offered systems, judged from data, not a number', () => {
  const dockerfile = readFileSync(join(ROOT, 'apps/tracy-web/Dockerfile'), 'utf8')
  const stage = dockerfile.slice(
    dockerfile.indexOf('AS dslib'),
    dockerfile.indexOf('\nFROM ', dockerfile.indexOf('AS dslib'))
  )
  assert.match(stage, /^COPY packages\/design\/tracy-ds-slot\/refero-thumbs \/lib\/refero-thumbs$/m)
  assert.doesNotMatch(stage, /-ge \d{3,}/, 'no hard-coded count of systems')
  assert.doesNotMatch(
    stage,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    'no hard-coded system id'
  )
})

test('the image layout offers exactly what a checkout offers, with a thumbnail each and no other', async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tracy-web-refero-image-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const ds = join(root, 'src', 'ds-slot')
  mkdirSync(join(root, 'src', 'lib'), { recursive: true })
  // the image copies apps/tracy-web/src whole (COPY apps/tracy-web/src ./src), so ds-slot.js reaches its
  // neighbours in src/lib (refero-names.js, local-releases.js and what they import) as it does here
  cpSync(join(ROOT, 'apps/tracy-web/src/lib'), join(root, 'src/lib'), { recursive: true })
  cpSync(join(ROOT, 'apps/tracy-web/src/config.js'), join(root, 'src/config.js'))
  cpSync(join(ROOT, 'packages/design/tracy-ds-slot/src'), join(ds, 'src'), { recursive: true })
  cpSync(join(ROOT, 'packages/design/tracy-ds-slot/templates'), join(ds, 'templates'), { recursive: true })
  const thumbs = join(ROOT, 'packages/design/tracy-ds-slot/refero-thumbs')
  cpSync(thumbs, join(ds, 'refero-thumbs'), { recursive: true })
  // As the dslib stage does: of each system the two files `loadProfile` reads, and only for a system
  // that has a thumbnail (the offered list); a refused system's data stays out of the image.
  const refero = join(ds, 'root/vendor/tracy/refero')
  cpSync(join(ROOT, 'vendor/tracy/refero/catalog.json'), join(refero, 'catalog.json'))
  const shipped = readdirSync(thumbs)
    .filter((f) => f.endsWith('.webp'))
    .map((f) => f.slice(0, -5))
  for (const uuid of shipped) {
    for (const f of ['design-system.json', 'manifest.json'])
      cpSync(join(ROOT, 'vendor/tracy/refero/systems', uuid, f), join(refero, 'systems', uuid, f))
  }
  cpSync(join(ROOT, 'apps/tracy-web/package.json'), join(root, 'package.json'))

  const probe = `
    import { existsSync, statSync } from 'node:fs'
    const m = await import(${JSON.stringify(join(root, 'src/lib/ds-slot.js'))})
    if (!m.DS_SLOT_DIR.startsWith(${JSON.stringify(ds)})) throw new Error('not the image copy: ' + m.DS_SLOT_DIR)
    const rows = await m.referoLibrary()
    let missing = 0, biggest = 0, outside = 0
    for (const r of rows) {
      const file = await m.referoScreenshotPath(r.uuid)
      if (!file || !file.startsWith(${JSON.stringify(join(ds, 'refero-thumbs'))})) outside++
      else if (!existsSync(file)) missing++
      else biggest = Math.max(biggest, statSync(file).size)
    }
    console.log(JSON.stringify({ rows: rows.map((r) => [r.uuid, r.name]), missing, outside, biggest }))
  `
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(run.status, 0, run.stderr)
  const out = JSON.parse(run.stdout.trim().split('\n').at(-1))
  // The checkout reads every system's data and runs the gate on all of them; the image reads only the
  // offered ones. Same rows, same order, same names: dropping the refused data changes nothing offered.
  const { referoLibrary } = await import(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js'))
  const checkout = (await referoLibrary()).map((r) => [r.uuid, r.name])
  assert.ok(checkout.length > 0)
  assert.deepEqual(out.rows, checkout)
  assert.deepEqual(
    out.rows.map(([u]) => u).sort(),
    [...shipped].sort(),
    'a thumbnail per offered system, no other'
  )
  assert.deepEqual([out.missing, out.outside], [0, 0])
  assert.ok(out.biggest < 100_000, `the largest thumbnail is ${out.biggest} bytes`)
})
