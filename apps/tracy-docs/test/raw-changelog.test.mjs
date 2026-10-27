/**
 * The build serves every changelog page a second time as raw markdown, at
 * `/changelog/desktop/<X.Y>.md` (tasks/todo-desktop-update-policy.md E3): the page without its front
 * matter and its image/video lines, the rest verbatim, badges included. The app does not read it (it ships its notes in the
 * bundle); `release.mjs publish` does (E8): before a stable feed moves it fetches that file from the
 * docs host and checks the notes in it are the ones the candidate froze. So what is pinned here is
 * that contract, read with the release tooling's own functions, not copies of them.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

import {
  docsServeNotes,
  frontMatter,
  highlightsOf,
  notesSha256,
  releaseNotesFromPage
} from '../../../packages/desktop/tracy-desktop/build/release-notes-page.mjs'
import config from '../astro.config.mjs'
import { changelogFeed, copyRawChangelog } from '../scripts/raw-changelog.mjs'

const SRC = fileURLToPath(new URL('../src/content/docs/changelog/desktop/', import.meta.url))
const PAGES = readdirSync(SRC).filter((name) => /^\d+\.\d+\.md$/.test(name))

function dist(t) {
  const out = mkdtempSync(path.join(tmpdir(), 'tracy-docs-raw-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  return out
}

/** Every version a page covers: X.Y.0 (Highlights) and each `## X.Y.Z` section. */
function versionsOf(name, text) {
  const page = name.replace(/\.md$/, '')
  return [`${page}.0`, ...[...text.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1])]
}

test('copies each X.Y.md page to changelog/desktop/X.Y.md, and nothing else', (t) => {
  const out = dist(t)
  const written = copyRawChangelog(SRC, out)
  assert.ok(PAGES.includes('0.5.md'))
  assert.deepEqual(written.sort(), PAGES.map((name) => `changelog/desktop/${name}`).sort())
  assert.equal(existsSync(path.join(out, 'changelog/desktop/index.md')), false)
})

test('a copied page has no front matter and is otherwise the page verbatim, badges included, media lines left out', (t) => {
  const out = dist(t)
  copyRawChangelog(SRC, out)
  const served = readFileSync(path.join(out, 'changelog/desktop/0.5.md'), 'utf8')
  const source = readFileSync(path.join(SRC, '0.5.md'), 'utf8')
  assert.doesNotMatch(served, /^---/)
  assert.doesNotMatch(served, /^(title|slug|version|released):/m)
  assert.match(served, /^## Highlights$/m)
  assert.match(served, /_\(Desktop only\)_$/m)
  const textOnly = source
    .split('\n')
    .filter((line) => !/^\s*(!\[|<video\b|<img\b)/.test(line))
    .join('\n')
  assert.ok(
    textOnly.endsWith(served),
    'the body is the source page after its front matter, without media lines'
  )
})

test('the raw copy carries no image or video line: the markdown is text, the media are for the web page', (t) => {
  const src = dist(t)
  const out = dist(t)
  mkdirSync(src, { recursive: true })
  writeFileSync(
    path.join(src, '0.9.md'),
    '---\ntitle: Tracy Cowork 0.9\nslug: changelog/desktop/0.9\n---\n\n## Highlights\n' +
      '- Getting started on first launch. _(Desktop only)_\n' +
      '  ![Getting started screen](/changelog/0.9/getting-started.webp)\n' +
      '- Faster sign-in.\n' +
      '  <video src="/changelog/0.9/sign-in.mp4" poster="/changelog/0.9/posters/sign-in.jpg" aria-label="Signing in" autoplay muted loop playsinline controls></video>\n' +
      '\n## Changes\n- Faster sign-in.\n'
  )
  copyRawChangelog(src, out)
  assert.equal(
    readFileSync(path.join(out, 'changelog/desktop/0.9.md'), 'utf8'),
    '\n## Highlights\n- Getting started on first launch. _(Desktop only)_\n- Faster sign-in.\n\n## Changes\n- Faster sign-in.\n'
  )
})

test('a no-media comment stays on the web page: the raw copy and changelog.json never carry it', (t) => {
  const src = dist(t)
  const out = dist(t)
  const withComment =
    '---\ntitle: Tracy Cowork 0.9\nversion: "0.9"\nreleased: 2026-11-02\nslug: changelog/desktop/0.9\n---\n\n## Highlights\n' +
    '- Faster sign-in.\n' +
    '  <!-- no-media: a speed-up, nothing a still would show -->\n' +
    '\n## Changes\n- Faster sign-in.\n'
  writeFileSync(path.join(src, '0.9.md'), withComment)
  copyRawChangelog(src, out)
  assert.equal(
    readFileSync(path.join(out, 'changelog/desktop/0.9.md'), 'utf8'),
    '\n## Highlights\n- Faster sign-in.\n\n## Changes\n- Faster sign-in.\n'
  )
  const [entry] = changelogFeed(src, 'https://docs.example.test')
  assert.deepEqual(entry.highlights, ['Faster sign-in.'])
  assert.equal(entry.mediaUrl, null)
  assert.doesNotMatch(JSON.stringify(entry), /no-media/)
})

for (const name of PAGES)
  test(`${name}: the release tooling reads the same notes from the served copy as from the page`, (t) => {
    const out = dist(t)
    copyRawChangelog(SRC, out)
    const served = readFileSync(path.join(out, 'changelog/desktop', name), 'utf8')
    const source = readFileSync(path.join(SRC, name), 'utf8')
    for (const version of versionsOf(name, source)) {
      const notes = releaseNotesFromPage(source, version)
      assert.ok(notes, version)
      assert.equal(releaseNotesFromPage(served, version), notes, version)
    }
  })

test('publish (E8) accepts a docs host serving the built copy, and names it when it does not', async (t) => {
  const out = dist(t)
  copyRawChangelog(SRC, out)
  const source = readFileSync(path.join(SRC, '0.5.md'), 'utf8')
  const origin = 'https://docs.example.test'
  const fetchDocs = async (url) => {
    const rel = url.slice(origin.length + 1)
    if (rel === 'changelog/desktop/0.5/') return { status: 200, text: '<!doctype html>' }
    const file = path.join(out, rel)
    return existsSync(file) ? { status: 200, text: readFileSync(file, 'utf8') } : { status: 404, text: '' }
  }
  for (const version of ['0.5.0', '0.5.1'])
    assert.equal(
      await docsServeNotes({
        origin,
        version,
        contentSha256: notesSha256(releaseNotesFromPage(source, version)),
        fetchDocs
      }),
      null,
      version
    )
  rmSync(path.join(out, 'changelog/desktop/0.5.md'))
  assert.match(
    await docsServeNotes({ origin, version: '0.5.1', contentSha256: 'x', fetchDocs }),
    /0\.5\.md: HTTP 404/
  )
})

test('astro build writes the copies: the config carries the integration and its build:done hook does it', async (t) => {
  const out = dist(t)
  const integration = config.integrations.find((i) => i.name === 'tracy-raw-changelog')
  assert.ok(integration, 'integration tracy-raw-changelog in astro.config.mjs')
  const logged = []
  await integration.hooks['astro:build:done']({
    dir: pathToFileURL(`${out}/`),
    logger: { info: (line) => logged.push(line) }
  })
  assert.ok(existsSync(path.join(out, 'changelog/desktop/0.5.md')))
  assert.match(logged.join('\n'), /changelog\/desktop\/0\.5\.md/)
})

// ── changelog.json: every release in one file, newest first (as onorca.dev/whats-new/changelog.json) ──

const page = (version, released, lines) =>
  `---\ntitle: Tracy Cowork ${version}\ndescription: What changed.\nversion: "${version}"\nreleased: ${released}\nslug: changelog/desktop/${version}\n---\n\n## Highlights\n${lines}\n\n## Changes\n- One.\n`

test('changelog.json lists every release newest first: title, day, Highlights as plain text, first media, page URL', (t) => {
  const src = dist(t)
  writeFileSync(
    path.join(src, '0.9.md'),
    page(
      '0.9',
      '2026-11-02',
      '- Faster sign-in.\n- A new sound. _(Desktop only)_\n  ![The sound setting](/changelog/0.9/sound.webp)'
    )
  )
  writeFileSync(
    path.join(src, '0.10.md'),
    page(
      '0.10',
      '2026-12-01',
      '- Getting started on first launch. _(Desktop only)_\n' +
        '  <video src="/changelog/0.10/getting-started.mp4" poster="/changelog/0.10/posters/getting-started.jpg" aria-label="Getting started" autoplay muted loop playsinline controls></video>\n' +
        '- Settings opens faster.\n  ![Settings](/changelog/0.10/settings.webp)'
    )
  )
  writeFileSync(path.join(src, '0.8.md'), page('0.8', '2026-10-01', '- Plain text only.'))
  writeFileSync(path.join(src, 'index.md'), '---\ntitle: Changelog\n---\n')
  assert.deepEqual(changelogFeed(src, 'https://docs.example.test/'), [
    {
      version: '0.10',
      title: 'Tracy Cowork 0.10',
      released: '2026-12-01',
      highlights: ['Getting started on first launch.', 'Settings opens faster.'],
      // A clip's GIF: the one form of it every reader can show.
      mediaUrl: 'https://docs.example.test/changelog/0.10/getting-started.gif',
      releaseNotesUrl: 'https://docs.example.test/changelog/desktop/0.10/'
    },
    {
      version: '0.9',
      title: 'Tracy Cowork 0.9',
      released: '2026-11-02',
      highlights: ['Faster sign-in.', 'A new sound.'],
      mediaUrl: 'https://docs.example.test/changelog/0.9/sound.webp',
      releaseNotesUrl: 'https://docs.example.test/changelog/desktop/0.9/'
    },
    {
      version: '0.8',
      title: 'Tracy Cowork 0.8',
      released: '2026-10-01',
      highlights: ['Plain text only.'],
      mediaUrl: null,
      releaseNotesUrl: 'https://docs.example.test/changelog/desktop/0.8/'
    }
  ])
})

test('astro build writes changelog.json next to the raw pages, one entry per committed page, read from the page itself', async (t) => {
  const out = dist(t)
  const integration = config.integrations.find((i) => i.name === 'tracy-raw-changelog')
  await integration.hooks['astro:build:done']({ dir: pathToFileURL(`${out}/`), logger: { info: () => {} } })
  const feed = JSON.parse(readFileSync(path.join(out, 'changelog/desktop/changelog.json'), 'utf8'))
  assert.deepEqual(
    feed.map((e) => e.version),
    PAGES.map((n) => n.replace(/\.md$/, '')).sort((a, b) => {
      const [am, an] = a.split('.').map(Number)
      const [bm, bn] = b.split('.').map(Number)
      return bm - am || bn - an
    })
  )
  for (const entry of feed) {
    const text = readFileSync(path.join(SRC, `${entry.version}.md`), 'utf8')
    const fm = frontMatter(text)
    assert.equal(entry.title, fm.title.value)
    assert.equal(entry.released, fm.released.value)
    assert.deepEqual(entry.highlights, highlightsOf(text))
    for (const line of entry.highlights) assert.doesNotMatch(line, /Desktop only|^- |!\[|<video/)
    assert.equal(entry.releaseNotesUrl, `${config.site}/changelog/desktop/${entry.version}/`)
    assert.ok(
      entry.mediaUrl === null || entry.mediaUrl.startsWith(`${config.site}/changelog/${entry.version}/`),
      entry.mediaUrl
    )
  }
})
