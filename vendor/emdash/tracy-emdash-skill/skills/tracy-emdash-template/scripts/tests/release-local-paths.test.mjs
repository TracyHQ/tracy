// A published release never carries a path of the machine that built it. The QA gates record the artifact, the fast-gate run
// and the run they reused as paths a reader can place (relative to the template, else the last segment), and release.mjs
// refuses to write a release whose files still hold a local path, naming the file and the JSON pointer.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { holdsLocalPath, isRouteField, localPathProblems, shownPath } from '../tools/distribution.mjs'

const tool = (name) => readFileSync(path.join(new URL('.', import.meta.url).pathname, '..', 'tools', name), 'utf8')
/** A builder disk with these directories on it. */
const disk = (...dirs) => {
  const set = new Set(dirs)
  return (dir) => set.has(dir)
}
const none = disk()
/** Fixture paths are built from segments, so no literal machine path appears in this file. */
const abs = (...segments) => path.posix.join('/', ...segments)
const win = (drive, sep, ...segments) => `${drive}:${sep}${segments.join(sep)}`

describe('shownPath', () => {
  it('is relative to the template when the path lies inside it, else its last segment, never absolute', () => {
    const base = '/work/theme'
    assert.equal(shownPath('/work/theme/evidence/fg-1', base), 'evidence/fg-1')
    assert.equal(shownPath('/work/theme', base), '.')
    assert.equal(shownPath('/home/builder/work/site/pack', base), 'pack')
    assert.equal(shownPath('/private/tmp/qa-art-x/a', base), 'a')
    assert.equal(shownPath('../outside/pack', base), 'pack')
    for (const p of [abs('Users', 'me', 'pack'), '/work/theme/x', '/tmp/a/b'])
      assert.equal(path.isAbsolute(shownPath(p, base)), false, p)
  })
})

describe('system paths', () => {
  it('a file below a system directory is a builder path whether or not it exists there', () => {
    const none = () => false
    assert.deepEqual(localPathProblems({ report: '/etc/passwd' }, [], '', none), ['/report'])
    assert.equal(holdsLocalPath('see /usr/local/bin/node', [], none), true)
    assert.deepEqual(localPathProblems({ report: '/usr/contact' }, [], '', none), [], 'a route may start with /usr')
    assert.deepEqual(localPathProblems({ report: '/usr/local/bin/x' }, [], '', none), ['/report'])
    assert.equal(holdsLocalPath('/home/contact and /etc', [], none), false, 'a route, and a lone segment')
  })
})

describe('localPathProblems', () => {
  const report = {
    origin: 'http://127.0.0.1:18302',
    gates: {
      distribution: { status: 'pass', artifact: '/home/builder/work/site/pack', files: 301 },
      browser: { status: 'pass', reusedFrom: '/private/tmp/qa-run-1' },
      visual: { fastGate: { run: '/home/builder/work/theme/evidence/fast-gate-1' } }
    },
    list: ['fine', { deep: '/private/tmp/x' }]
  }

  it('names the JSON pointer of every local path', () => {
    assert.deepEqual(localPathProblems(report, ['/home/builder/work/theme'], '', none), [
      '/gates/distribution/artifact',
      '/gates/browser/reusedFrom',
      '/gates/visual/fastGate/run',
      '/list/1/deep'
    ])
    assert.deepEqual(localPathProblems({ a: `see ${abs('Users', 'me', 'x')} for it` }, [], '', none), ['/a'], 'inside a sentence')
  })

  it('finds a Windows drive path in either slash, and a home path', () => {
    for (const p of [win('C', '\\', 'Users', 'me', 'build'), win('C', '/', 'Users', 'me', 'build'), 'd:/work/pack', '~/work/pack'])
      assert.equal(holdsLocalPath(p, [], none), true, p)
    assert.equal(holdsLocalPath('see ~/notes.txt', [], none), true)
  })

  it('finds a path outside any named prefix when its ancestor, two segments deep, exists on the builder', () => {
    const builder = disk('/opt', '/opt/builds', '/opt/builds/worker')
    assert.equal(holdsLocalPath('/opt/builds/worker/pack', [], builder), true, 'the builder has /opt/builds/worker')
    assert.equal(holdsLocalPath('/opt/builds/worker/pack/evidence', [], builder), true)
    assert.equal(holdsLocalPath('/opt/builds/worker/pack', [], none), false, 'a machine without it shows no evidence')
    // one existing segment is not evidence: every machine has /opt, /home, /usr and a route can start with one
    assert.equal(holdsLocalPath('/opt/pack', [], disk('/opt')), false)
  })

  it('is strict about a string whose field is not declared a route: /home/contact/form is a builder path there', () => {
    const builder = disk('/home', '/home/contact')
    // the static /home/<user>/<x> shape, and a directory that exists on the builder, are both evidence in a strict field
    assert.equal(holdsLocalPath('/home/contact/form', [], none), true)
    assert.equal(holdsLocalPath('/home/contact', [], builder), true)
    assert.equal(holdsLocalPath('/home/builder/work', [], none), true)
    assert.equal(holdsLocalPath(abs('Users', 'me', 'work'), [], none), true)
    // a lone segment with nothing on the builder behind it is still no evidence (an ordinary route)
    for (const word of ['/home', '/blog', '/menu/simple-menu', '/tmp']) assert.equal(holdsLocalPath(word, [], builder), false, word)
  })

  it('exempts a declared route field by field, and no field is declared today', () => {
    const builder = disk('/home', '/home/contact')
    // the mechanism: a field a schema defines as a route is exempt by its pointer, the same string elsewhere is refused
    const declared = (pointer) => /^\/pages\/\d+\/path$/.test(pointer)
    const pages = { pages: [{ id: 'a', path: '/home/contact/form' }, { id: 'b', label: '/home/contact/form' }] }
    assert.deepEqual(localPathProblems(pages, [], '', builder, declared), ['/pages/1/label'])
    // the real table, as release.mjs calls it: a builder path in every field of a release file that LOOKS like a route
    // (page fields, question url/href, manifest routes) is refused, because no schema defines a site route
    const home = abs('home', 'builder', 'work', 'site', 'pack')
    const asRelease = (file) => (pointer) => isRouteField(file, pointer)
    const fieldsLikeRoutes = {
      'tracy_site_pages.json': { pages: [{ id: home, label: 'x', path: home, href: home, route: home, url: home, slug: home }] },
      'tracy_site_question.json': {
        questions: [{ id: 'name', url: home, href: home, path: home, route: home, slug: home, options: [{ path: home }] }]
      },
      'manifest.json': { routes: [{ path: home, href: home, url: home }], pages: [{ path: home, slug: home }] }
    }
    for (const [file, doc] of Object.entries(fieldsLikeRoutes)) {
      const refused = localPathProblems(doc, [], '', none, asRelease(file))
      const everyString = JSON.stringify(doc).split(home).length - 1
      assert.equal(refused.length, everyString, `${file}: every field holding a builder path is refused (${refused.length}/${everyString})`)
    }
    for (const [file, pointer] of [
      ['tracy_site_pages.json', '/pages/0/path'],
      ['tracy_site_pages.json', '/pages/0/id'],
      ['tracy_site_question.json', '/questions/0/url'],
      ['tracy_site_question.json', '/questions/0/href'],
      ['tracy_site_question.json', '/questions/0/options/1/path'],
      ['manifest.json', '/pages/0/path']
    ])
      assert.equal(isRouteField(file, pointer), false, `${file}${pointer}`)
  })

  it('refuses a path in a question url, href or path, and in a page path, whatever the string looks like', () => {
    const builder = disk('/home', '/home/contact')
    const route = (file) => (pointer) => isRouteField(file, pointer)
    const question = { questions: [{ id: 'name', url: '/home/builder/private/build' }] }
    assert.deepEqual(localPathProblems(question, [], '', builder, route('tracy_site_question.json')), ['/questions/0/url'])
    assert.deepEqual(
      localPathProblems({ questions: [{ id: 'n', href: '/home/contact' }] }, [], '', builder, route('tracy_site_question.json')),
      ['/questions/0/href']
    )
    assert.deepEqual(
      localPathProblems({ pages: [{ id: 'c', path: '/home/contact/form' }] }, [], '', builder, route('tracy_site_pages.json')),
      ['/pages/0/path']
    )
    const gates = { gates: { distribution: { artifact: '/home/contact/form' }, browser: { reusedFrom: '/home/contact' } } }
    assert.deepEqual(localPathProblems(gates, [], '', builder, route('VERIFICATION.json')), [
      '/gates/distribution/artifact',
      '/gates/browser/reusedFrom'
    ])
    assert.deepEqual(
      localPathProblems('# Notes\nsee /home/contact/form\n', [], 'README.md', builder, route('README.md')),
      ['README.md:2']
    )
  })

  it('names the pointer and never the value (nothing secret in a refusal)', () => {
    const [pointer] = localPathProblems({ gates: { x: { artifact: '/home/builder/work/secret-project/pack' } } }, [], '', none)
    assert.equal(pointer, '/gates/x/artifact')
    assert.doesNotMatch(pointer, /secret/)
    assert.match(tool('release.mjs'), /isRouteField\(name, pointer\)/, 'release.mjs passes the table to the classifier')
  })

  it('catches the builder\'s own directories whatever they are called', () => {
    assert.equal(holdsLocalPath('/srv/builds/x/pack', ['/srv/builds/x'], none), true)
    assert.equal(holdsLocalPath('/srv/builds/xy', ['/srv/builds/x'], none), false, 'a longer name is not the root')
  })

  it('leaves relative paths, URLs and words alone', () => {
    assert.deepEqual(
      localPathProblems(
        {
          origin: 'http://127.0.0.1:18302',
          repo: 'https://github.com/home/x/tmp/y',
          rel: 'evidence/fast-gate-1',
          mail: 'a@home.test',
          text: 'the home page, Users and tmp are words, 1/2 and and/or too'
        },
        [],
        '',
        disk('/home', '/tmp')
      ),
      []
    )
  })

  it('reads a text file line by line', () => {
    assert.deepEqual(localPathProblems('# notes\nbuilt in /home/me/x\nfine', [], 'README.md', none), ['README.md:2'])
    assert.deepEqual(localPathProblems('# notes\nfine', [], 'README.md', none), [])
  })
})

describe('the tools', () => {
  it('qa.mjs and visual-qa.mjs record every path of a report through shownPath, not path.resolve', () => {
    const qa = tool('qa.mjs')
    assert.match(qa, /artifact: shownPath\(artifact\)/)
    assert.doesNotMatch(qa, /artifact: path\.resolve\(artifact\)/)
    assert.doesNotMatch(qa, /reusedFrom: path\.resolve/, 'a gate that reused a run names it by its last segment')
    assert.equal((qa.match(/reusedFrom: shownPath\(opt\('--reuse'\)\)/g) ?? []).length, 4)
    assert.match(tool('visual-qa.mjs'), /run: shownPath\(fastGateRun\)/)
    assert.doesNotMatch(tool('visual-qa.mjs'), /run: path\.resolve\(fastGateRun\)/)
  })

  it('release.mjs watches the metadata as written, the whole folder at the end, and the text that goes into the archives', () => {
    const release = tool('release.mjs')
    assert.doesNotMatch(release, /writeFileSync\(\s*path\.join\(out,/, 'no metadata file bypasses writeRelease')
    assert.match(release, /const writeRelease = /)
    // every non-archive file of the folder (design-system-roles.json, LICENSE and SHA256SUMS included) after all are written
    assert.match(release, /const guardFolder = /)
    assert.match(release, /\.(zip|tar\\\.gz|tgz)/)
    assert.ok(release.indexOf('guardFolder()') > release.indexOf('SHA256SUMS'), 'the folder is scanned after SHA256SUMS')
    // the text that ships in the zip is scanned before the zip is made: README.md and AGENTS.md of the artifact
    assert.match(release, /const guardArchiveText = /)
    assert.match(release, /'README\.md', 'AGENTS\.md', 'distribution\.json', 'artifact\.json'/)
    assert.ok(release.indexOf('guardArchiveText()') < release.indexOf("execFileSync('zip'"), 'scanned before the zip')
    assert.match(release, /seed-receipts\.json/)
    assert.match(release, /rmSync\(out, \{ recursive: true, force: true \}\)\s*\n\s*fail\(/)
  })

  it('release.mjs does not scan authored code or guides (restore.sh names a temp folder and a macOS home on purpose)', () => {
    const scanned = tool('release.mjs').match(/const files = \[([^\]]*)\]/)?.[1] ?? ''
    assert.doesNotMatch(scanned, /tools|restore|docs\/install|src/)
  })
})
