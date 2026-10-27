/**
 * The changelog (`src/content/docs/changelog/desktop/`) covers every change people see, on the web and
 * in the desktop app, one page per desktop minor version, Desktop only changes marked (E9); it is the
 * one source of the desktop app's release notes: `release.mjs prepare` ships a page's Highlights or `## X.Y.Z` section as a release's
 * notes (tasks/todo-desktop-update-policy.md E5/E6). A page that would be refused at release time must
 * be refused here first, so these tests run the SAME rules the release tooling does — imported from
 * the desktop package's build folder, not copied — plus a YAML reading of the front matter.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import yaml from 'js-yaml'

import { changelogMediaProblems } from '../scripts/media.mjs'

import {
  pageProblems,
  releaseNotesFromPage
} from '../../../packages/desktop/tracy-desktop/build/release-notes-page.mjs'

const DIR = fileURLToPath(new URL('../src/content/docs/changelog/desktop/', import.meta.url))
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))
const read = (name) => readFileSync(`${DIR}${name}`, 'utf8')

/** Every version page, newest first. */
const PAGES = readdirSync(DIR)
  .filter((name) => name !== 'index.md' && name.endsWith('.md'))
  .sort((a, b) => {
    const [am, an] = a.split('.').map(Number)
    const [bm, bn] = b.split('.').map(Number)
    return bm - am || bn - an
  })

test('there is a page per minor version, named X.Y.md, next to the index', () => {
  assert.ok(PAGES.length > 0)
  for (const name of PAGES) assert.match(name, /^\d+\.\d+\.md$/)
  assert.deepEqual(
    readdirSync(DIR).filter((name) => !PAGES.includes(name)),
    ['index.md']
  )
})

for (const name of PAGES)
  test(`${name}: in the format, English, naming no third party`, () => {
    assert.deepEqual(pageProblems(read(name), name), [])
  })

for (const name of PAGES)
  test(`${name}: YAML reads version as the string of the file name and released as a date`, () => {
    const front = yaml.load(/^---\n([\s\S]*?)\n---\n/.exec(read(name))[1])
    assert.equal(front.version, name.replace(/\.md$/, ''))
    assert.ok(front.released instanceof Date, `released is ${typeof front.released}`)
  })

for (const name of PAGES)
  test(`${name}: every release it covers has notes to ship`, () => {
    const text = read(name)
    const page = name.replace(/\.md$/, '')
    assert.ok(releaseNotesFromPage(text, `${page}.0`), 'Highlights')
    for (const [, patch] of text.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm))
      assert.ok(releaseNotesFromPage(text, patch), patch)
  })

test('a page with a line the release notes may not carry is refused: "Bump dsh-passwords"', () => {
  const [name] = PAGES
  const bad = read(name).replace(/^## Changes\n/m, '## Changes\n### Other\n- Bump dsh-passwords 2.7.7\n')
  assert.match(pageProblems(bad, name).join('\n'), /third party.*Bump dsh-passwords 2\.7\.7/)
})

test('a page line with a label other than the one Desktop only badge is refused: "web:", "_(Web only)_"', () => {
  const [name] = PAGES
  const prefixed = read(name).replace(
    /^## Changes\n/m,
    '## Changes\n### Other\n- web: The editor saves faster.\n'
  )
  assert.match(pageProblems(prefixed, name).join('\n'), /label "web:".*one label/)
  const badged = read(name).replace(
    /^## Changes\n/m,
    '## Changes\n### Other\n- The editor saves faster. _(Web only)_\n'
  )
  assert.match(pageProblems(badged, name).join('\n'), /"Web only" is not a label/)
})

test('0.5 marks its Desktop only changes, and its Highlights ship them as plain text, with no label', () => {
  const text = read('0.5.md')
  assert.ok(/^- .+ _\(Desktop only\)_$/m.test(text), 'no Desktop only line on 0.5.md')
  const notes = releaseNotesFromPage(text, '0.5.0')
  assert.match(notes, /^- Getting started on first launch/m)
  assert.doesNotMatch(notes, /desktop:/i)
  assert.doesNotMatch(notes, /Desktop only/)
})

test('the index links every page, newest first, each with a line of its own', () => {
  const index = read('index.md')
  assert.match(index, /^---\ntitle: .+\ndescription: .+\n---\n/)
  // One changelog for the whole product, labelled by the desktop version (E9).
  assert.match(index, /every change people see, on the web and in the desktop app/)
  assert.match(index, /Desktop only/)
  const linked = [...index.matchAll(/^- \[[^\]]+\]\(\.\/(\d+\.\d+)\/\) — \S.*$/gm)].map((m) => `${m[1]}.md`)
  assert.deepEqual(linked, PAGES)
  assert.deepEqual(
    pageProblems(index, '0.0.md').filter((p) => /English|third party/.test(p)),
    []
  )
})

test('every image or video under a Highlight is served from public/changelog/X.Y/ and fits; no file there is unused', () => {
  // The shape of the line (one per bullet, English alt text, under the page's own folder) is
  // pageProblems' job above; this is the files: they exist, webp/png ≤ 500 KB and ≤ 1600 px, H.264
  // mp4 ≤ 5 MB (`scripts/media.mjs`, the same check as `pnpm docs:media check`).
  assert.deepEqual(
    changelogMediaProblems({ publicDir: PUBLIC, pages: PAGES.map((name) => ({ name, text: read(name) })) }),
    []
  )
})
