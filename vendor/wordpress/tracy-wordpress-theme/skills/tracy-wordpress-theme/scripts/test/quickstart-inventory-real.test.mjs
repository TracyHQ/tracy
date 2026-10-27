// Opt-in: the inventory over real downloaded quickstarts. Set P1_REAL_INPUT_DIR to a directory
// holding ja-resort, ja-phio, ja-nova, ja-morgan, ja-mood, ja-donate and ja-directory (.zip), and
// P1_ARTIFACT_ROOT to where the reports go (<root>/p1-inventory/). Needs gh (release digests of
// quickstart/ja-nova/j6 and quickstart/ja-morgan/j6) and docker (the runtime images pulled). Every
// fact the tool reports is checked here against a second reader — `unzip` and plain hashing — not
// against the tool's own helper. The baseline is complete when the implementation files are
// committed at HEAD (identity: that commit) or staged as written (identity: the staged tree, HEAD as
// context — the version under review, regenerated with the producing commit when a measured port
// starts); with unstaged edits its only gap is the missing tool version.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '..', 'ingest', 'quickstart-inventory.mjs')
const INPUT = process.env.P1_REAL_INPUT_DIR
const ROOT = process.env.P1_ARTIFACT_ROOT
const skip = !INPUT || !ROOT ? 'set P1_REAL_INPUT_DIR and P1_ARTIFACT_ROOT to run on real quickstarts' : false
const EXPECTED = {
  'ja-resort': ['T4', 'ja_resort'],
  'ja-phio': ['T4', 'ja_phio'],
  'ja-nova': ['T4', 'ja_nova'],
  'ja-morgan': ['T3', 'ja_morgan'],
  'ja-mood': ['T3', 'ja_mood'],
  'ja-donate': ['T3', 'ja_donate'],
  'ja-directory': ['T3', 'ja_directory']
}
const IMAGES = ['wordpress:php8.3-apache', 'wordpress:cli-php8.3', 'mariadb:11']

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
const unzipList = (zip) => {
  const r = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 256 << 20 })
  assert.equal(r.status, 0, r.stderr)
  return new Set(r.stdout.split('\n').filter(Boolean).map((p) => p.replace(/\/$/, '')))
}
const unzipText = (zip, member) => {
  const r = spawnSync('unzip', ['-p', zip, member], { encoding: 'utf8', maxBuffer: 256 << 20 })
  assert.equal(r.status, 0, `${zip}!${member}`)
  return r.stdout
}
const xmlVersion = (text) => /<version>([^<]+)<\/version>/.exec(text)?.[1].trim()
const IMPLEMENTATION = ['scripts/ingest/quickstart-inventory.mjs', 'scripts/ingest/quickstart-inventory-archive.py']
const git = (...args) => spawnSync('git', ['-C', HERE, ...args], { encoding: 'utf8' })
/** Whether each implementation file equals its blob at HEAD — decided here with git, not by the tool. */
const equalsBlob = (spec, rel) => {
  const blob = git('rev-parse', '-q', '--verify', spec)
  return blob.status === 0 && blob.stdout.trim() === git('hash-object', path.join(HERE, '..', '..', rel)).stdout.trim()
}
const committedAtHead = () => IMPLEMENTATION.every((rel) => equalsBlob(`HEAD:./../../${rel}`, rel))
/** Each file is committed, or staged exactly as it is on disk. */
const stagedAsWritten = () => IMPLEMENTATION.every((rel) => equalsBlob(`HEAD:./../../${rel}`, rel) || equalsBlob(`:./../../${rel}`, rel))

let inv = null
let out = null
test('real quickstarts: inventory + Nova/Morgan baseline generated', { skip, timeout: 280000 }, () => {
  out = path.join(ROOT, 'p1-inventory')
  mkdirSync(out, { recursive: true })
  const r = spawnSync(
    process.execPath,
    [CLI, '--input', INPUT, '--out', out, '--tag', 'ja-nova=quickstart/ja-nova/j6', '--tag', 'ja-morgan=quickstart/ja-morgan/j6', '--verify-tags', '--baseline', 'ja-nova,ja-morgan', ...IMAGES.flatMap((i) => ['--image', i]), '--timeout', '270'],
    { encoding: 'utf8', timeout: 275000 }
  )
  process.stdout.write(r.stdout)
  assert.equal(r.status, 0, r.stderr)
  if (stagedAsWritten()) assert.equal(r.stderr, '', 'no incomplete-baseline warning')
  else assert.match(r.stderr, /baseline incomplete — 1 gap\(s\)/)
  inv = JSON.parse(readFileSync(path.join(out, 'inventory.json'), 'utf8'))
})

test('real quickstarts: every archive hashed independently; framework reproduced with evidence present in the archive', { skip }, async () => {
  assert.deepEqual(inv.quickstarts.map((q) => q.id).sort(), Object.keys(EXPECTED).sort())
  for (const q of inv.quickstarts) {
    const zip = path.join(INPUT, `${q.id}.zip`)
    assert.equal(q.assets.length, 1)
    assert.equal(q.assets[0].sha256, await sha256(zip), `${q.id} hash`)
    assert.equal(q.format, 'installer', q.id)
    const [fw, tpl] = EXPECTED[q.id]
    assert.equal(q.framework, fw, q.id)
    assert.equal(q.frameworkTemplate, tpl, q.id)
    const members = unzipList(zip)
    const site = q.sites[0]
    // every site template in the archive is inventoried, each with its own verdict
    const inArchive = [...members].filter((p) => /^templates\/[^/]+\/templateDetails\.xml$/.test(p)).map((p) => p.split('/')[1]).sort()
    assert.deepEqual(site.templates.filter((t) => t.client === 'site').map((t) => t.dir).sort(), inArchive, q.id)
    for (const t of site.templates.filter((x) => x.client === 'site')) {
      if (t.dir === tpl) {
        assert.equal(t.framework, fw, `${q.id} ${t.dir}`)
        assert.ok(t.evidence.length >= 2, `${q.id}: more than one marker`)
        // a directory marker (tpls/) is a prefix of members: these ZIPs carry no directory entries
        for (const e of t.evidence)
          assert.ok(e.path.endsWith('/') ? [...members].some((p) => p.startsWith(e.path)) : members.has(e.path), `${q.id}: evidence ${e.path} is in the archive`)
        assert.ok(t.evidence.every((e) => e.framework === fw))
        const el = fw.toLowerCase()
        assert.ok(members.has(`plugins/system/${el}/${el}.xml`))
        assert.equal(t.plugin.version, xmlVersion(unzipText(zip, `plugins/system/${el}/${el}.xml`)), `${q.id} plugin version`)
      } else assert.equal(t.framework, 'other', `${q.id} ${t.dir} does not inherit the site plugin`)
    }
    // T3 templates carry etc/layout too — as INI: the reason etc/layout alone is not T4
    if (fw === 'T3') assert.ok([...members].some((p) => p.startsWith(`templates/${tpl}/etc/layout/`) && p.endsWith('.ini')), `${q.id} has INI layouts`)
    console.log(`${q.id}: ${fw} — ${site.templates.find((t) => t.dir === tpl).evidence.map((e) => `${e.path} (${e.detail})`).join('; ')}`)
  }
})

test('real quickstarts: Joomla/PHP, extensions, styles and languages match a second reading of the archive', { skip }, () => {
  for (const q of inv.quickstarts) {
    const zip = path.join(INPUT, `${q.id}.zip`)
    const site = q.sites[0]
    assert.equal(q.joomla, xmlVersion(unzipText(zip, 'administrator/manifests/files/joomla.xml')), q.id)
    assert.equal(q.phpMinimum, /define\('JOOMLA_MINIMUM_PHP', '([^']+)'\)/.exec(unzipText(zip, 'index.php'))[1], q.id)
    // every plugin manifest in the archive is an extension record with its version
    const members = unzipList(zip)
    const pluginManifests = [...members].filter((p) => {
      const m = /^plugins\/([^/]+)\/([^/]+)\/([^/]+)\.xml$/.exec(p)
      return m && m[2] === m[3]
    })
    const plugins = site.extensions.present.filter((e) => e.type === 'plugin')
    for (const p of pluginManifests) {
      const text = unzipText(zip, p)
      if (!/<extension[^>]*type="plugin"/.test(text)) continue
      const rec = plugins.find((e) => e.manifest === p)
      assert.ok(rec, `${q.id}: ${p} inventoried`)
      assert.equal(rec.version, xmlVersion(text), `${q.id}: ${p}`)
    }
    // template styles: custom.sql's #__template_styles rows, counted from the raw text
    const custom = unzipText(zip, 'installation/sql/mysql/custom.sql')
    const block = /INSERT INTO `#__template_styles` [^\n]*VALUES\s*\n([\s\S]*?\));\n/.exec(custom)[1]
    const rows = block.split(/\n,\(/).length
    assert.equal(site.templateStyles.length, rows, `${q.id} style rows`)
    const home = site.templateStyles.find((s) => s.client === 'site' && s.home === '1')
    assert.equal(home.template, EXPECTED[q.id][1], `${q.id} default style`)
    assert.ok(site.languages.content.some((l) => l.langCode === 'en-GB'))
    assert.ok(site.languages.installed.some((l) => l.client === 'site' && l.tag === 'en-GB'))
    console.log(`${q.id}: Joomla ${q.joomla}, PHP ≥ ${q.phpMinimum}, ${site.extensions.present.length} manifests, ${site.templateStyles.length} styles; unknowns: ${q.unknowns.length ? q.unknowns.join(' | ') : 'none'}`)
  }
  const by = Object.fromEntries(inv.quickstarts.map((q) => [q.id, q]))
  for (const id of ['ja-nova', 'ja-morgan']) {
    assert.equal(by[id].joomla, '6.1.1')
    assert.equal(by[id].phpMinimum, '8.3.0')
  }
  const md = readFileSync(path.join(out, 'inventory.md'), 'utf8')
  for (const id of Object.keys(EXPECTED)) assert.ok(md.includes(`## ${id}`))
})

test('real quickstarts: baseline freezes Nova + Morgan — release-bound hashes, image digests, tool identity', { skip }, async () => {
  const b = JSON.parse(readFileSync(path.join(out, 'baseline.json'), 'utf8'))
  const head = git('rev-parse', 'HEAD').stdout.trim()
  if (committedAtHead()) {
    assert.equal(b.complete, true, b.gaps.join('\n'))
    assert.deepEqual(b.tool.identity, { kind: 'commit', commit: head })
  } else if (stagedAsWritten()) {
    // before the commit: the staged tree is the version that produced it — never HEAD, which lacks the tool
    assert.equal(b.complete, true, b.gaps.join('\n'))
    assert.deepEqual(b.tool.identity, { kind: 'staged-tree', tree: git('write-tree').stdout.trim(), baseCommit: head })
    for (const rel of IMPLEMENTATION) {
      const held = spawnSync('git', ['-C', HERE, 'cat-file', 'blob', `${b.tool.identity.tree}:./../../${rel}`], { maxBuffer: 64 << 20 })
      assert.equal(held.status, 0, rel)
      assert.equal(createHash('sha256').update(held.stdout).digest('hex'), createHash('sha256').update(readFileSync(path.join(HERE, '..', '..', rel))).digest('hex'), rel)
    }
    console.log(`baseline produced by staged tree ${b.tool.identity.tree} on ${head}; regenerate with the producing commit when the measured port starts`)
  } else {
    // unstaged edits: no version names these bytes, and the baseline says so
    assert.equal(b.complete, false)
    assert.deepEqual(b.gaps.map((g) => g.replace(/:.*/, '')), ['tool version'])
    console.log(`baseline incomplete: ${b.gaps.join(' | ')}`)
  }
  assert.deepEqual(b.pair, ['ja-nova', 'ja-morgan'])
  for (const q of b.quickstarts) {
    assert.equal(q.tag.value, `quickstart/${q.id}/j6`)
    assert.equal(q.tag.source, 'release-digest')
    assert.equal(q.tag.bindings[0].releaseAsset, `${q.id}-j6-quickstart.zip`)
    assert.equal(q.assets[0].sha256, await sha256(path.join(INPUT, `${q.id}.zip`)))
  }
  assert.deepEqual(b.runtimeImages.map((i) => i.ref).sort(), [...IMAGES].sort())
  for (const i of b.runtimeImages) assert.match(i.repoDigest, /@sha256:[0-9a-f]{64}$/)
  assert.equal(b.tool.gitHead, head)
  for (const f of b.tool.implementationFiles) {
    const now = createHash('sha256').update(readFileSync(path.join(HERE, '..', '..', f.path))).digest('hex')
    assert.equal(f.sha256, now, f.path)
  }
  assert.deepEqual(b.tool.implementationFiles.map((f) => f.state), IMPLEMENTATION.map((rel) => (equalsBlob(`HEAD:./../../${rel}`, rel) ? 'committed' : equalsBlob(`:./../../${rel}`, rel) ? 'staged' : 'unstaged')))
  // the release bound every asset by its own digest, equal to the bytes on disk
  for (const q of b.quickstarts) for (const bd of q.tag.bindings) assert.equal(bd.sha256, q.assets.find((a) => a.path === bd.asset).sha256)
})
