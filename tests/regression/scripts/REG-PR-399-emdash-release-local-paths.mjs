/**
 * REG-PR-399: an EmDash release never publishes a path of the machine that built it. The QA gates record the artifact and
 * the fast-gate run through shownPath (relative to the template, else the last segment), and release.mjs writes every file
 * through a guard that refuses an absolute local path and names its JSON pointer. Checked in the kit and in every theme
 * (the published Business, Base and SaaS releases carried macOS temp and user-home paths; a rebuilt JA Restaurant release a Linux home and a checkout path).
 * At the parent of the fix (REPO_ROOT=<worktree>) shownPath does not exist and qa.mjs still calls path.resolve: red.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, ROOT } from './lib.mjs'

const c = checks()
// fixture paths are built from segments, so no literal machine path appears in this file
const abs = (...segments) => posix.join('/', ...segments)
const win = (drive, sep, ...segments) => `${drive}:${sep}${segments.join(sep)}`
const KIT = 'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts'
const PLACES = [
  ['kit', KIT],
  ...['base', 'business', 'saas', 'coffee', 'restaurant'].map((t) => [
    t,
    `packages/cms/tracy-emdash-theme-${t}`
  ])
]
for (const [name, dir] of PLACES) {
  const tools = join(ROOT, dir, 'tools')
  const src = (f) => (existsSync(join(tools, f)) ? readFileSync(join(tools, f), 'utf8') : '')
  const lib = existsSync(join(tools, 'distribution.mjs'))
    ? await import(pathToFileURL(join(tools, 'distribution.mjs')).href)
    : {}
  const ok = typeof lib.shownPath === 'function' && typeof lib.localPathProblems === 'function'
  c.check(`${name}: distribution.mjs exports shownPath and localPathProblems`, ok)
  if (ok) {
    c.check(
      `${name}: an absolute artifact path is shown by its last segment, one inside the template relative`,
      lib.shownPath('/home/builder/work/x/pack', '/home/builder/work/theme') === 'pack' &&
        lib.shownPath('/home/builder/work/theme/evidence/fg', '/home/builder/work/theme') === 'evidence/fg'
    )
    c.check(
      `${name}: a report with machine paths is refused, by JSON pointer`,
      JSON.stringify(
        lib.localPathProblems({
          gates: {
            distribution: { artifact: abs('Users', 'me', 'pack') },
            visual: { fastGate: { run: '/private/tmp/x' } }
          }
        })
      ) === '["/gates/distribution/artifact","/gates/visual/fastGate/run"]'
    )
    const builder = (dirs) => (d) => dirs.includes(d)
    c.check(
      `${name}: a drive path, ~/ and a path whose existing ancestor is two segments deep are refused (a route is exempt by field, not by shape)`,
      lib.holdsLocalPath(win('C', '/', 'Users', 'me', 'build'), [], builder([])) &&
        lib.holdsLocalPath('~/work/pack', [], builder([])) &&
        lib.holdsLocalPath(
          '/opt/builds/worker/pack',
          [],
          builder(['/opt', '/opt/builds', '/opt/builds/worker'])
        ) &&
        lib.holdsLocalPath('/home/contact', [], builder(['/home', '/home/contact'])) &&
        !lib.holdsLocalPath('/opt/pack', [], builder(['/opt']))
    )
    c.check(
      `${name}: no field of the release is exempt (no schema defines a site route), so a path in a question url or a page path is refused`,
      typeof lib.isRouteField === 'function' &&
        lib.localPathProblems(
          { questions: [{ id: 'n', url: '/home/builder/private/build' }] },
          [],
          '',
          builder(['/home']),
          (pointer) => lib.isRouteField('tracy_site_question.json', pointer)
        ).length === 1 &&
        lib.localPathProblems(
          { pages: [{ id: 'c', path: '/home/contact/form' }] },
          [],
          '',
          builder(['/home', '/home/contact']),
          (pointer) => lib.isRouteField('tracy_site_pages.json', pointer)
        ).length === 1
    )
    c.check(
      `${name}: relative paths and URLs pass`,
      lib.localPathProblems({
        a: 'pack',
        b: 'evidence/fg',
        c: 'https://github.com/home/x',
        d: 'http://127.0.0.1:18302'
      }).length === 0
    )
  }
  c.check(
    `${name}: qa.mjs names a reused run by its last segment`,
    /reusedFrom: shownPath\(opt\('--reuse'\)\)/.test(src('qa.mjs')) &&
      !/reusedFrom: path\.resolve/.test(src('qa.mjs'))
  )
  c.check(
    `${name}: qa.mjs records the artifact through shownPath`,
    /artifact: shownPath\(artifact\)/.test(src('qa.mjs'))
  )
  c.check(
    `${name}: visual-qa.mjs records the fast-gate run through shownPath`,
    /run: shownPath\(fastGateRun\)/.test(src('visual-qa.mjs'))
  )
  const release = src('release.mjs')
  c.check(
    `${name}: release.mjs writes every release file through the guard`,
    /const writeRelease = /.test(release) &&
      /const guardFolder = /.test(release) &&
      /const guardArchiveText = /.test(release) &&
      !/writeFileSync\(\s*path\.join\(out,/.test(release) &&
      /const guardFolder = /.test(release) &&
      /const guardArchiveText = /.test(release)
  )
}
c.done()
