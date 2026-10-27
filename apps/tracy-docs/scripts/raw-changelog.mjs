// The changelog pages as raw markdown (tasks/todo-desktop-update-policy.md E3).
//
// Every `src/content/docs/changelog/desktop/<X.Y>.md` is also served at `/changelog/desktop/<X.Y>.md`:
// the page without its front matter, its image and video lines and its `<!-- no-media: … -->`
// comments, everything else verbatim (the ` _(Desktop only)_` badges included). Those lines are for
// the web page: a path on the docs host means nothing to a reader of the text, and the release notes
// never carry them (one rule, `isPageOnlyLine` of the release tooling, so the two can never disagree
// on what such a line is). Its reader is `packages/desktop/tracy-desktop/build/release.mjs publish` (E8): before a
// stable feed moves, it fetches this file from the docs host and checks the notes in it hash to what
// the candidate froze — "the docs are deployed" measured, not assumed. The app itself does not read
// it: it ships its notes inside the bundle.
//
// `astro.config.mjs` runs this from `astro:build:done`, so every `astro build` (the image build in
// CI included) writes the copies into `dist/`; the index page is not a version page and is skipped.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  frontMatter,
  gifOf,
  highlightsOf,
  isPageOnlyLine,
  pageMedia
} from '../../../packages/desktop/tracy-desktop/build/release-notes-page.mjs'

const VERSION_PAGE = /^\d+\.\d+\.md$/
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/

/**
 * Copy each version page of `srcDir` to `<distDir>/changelog/desktop/`, front matter, media lines and
 * no-media comments removed.
 * @param {string} srcDir - `src/content/docs/changelog/desktop/`
 * @param {string} distDir - the build output root
 * @returns {string[]} the written paths, relative to `distDir`
 */
export function copyRawChangelog(srcDir, distDir) {
  const target = path.join(distDir, 'changelog', 'desktop')
  mkdirSync(target, { recursive: true })
  const written = []
  for (const name of readdirSync(srcDir)
    .filter((n) => VERSION_PAGE.test(n))
    .sort()) {
    const text = readFileSync(path.join(srcDir, name), 'utf8')
    const body = text
      .replace(FRONT_MATTER, '')
      .split('\n')
      .filter((line) => !isPageOnlyLine(line))
      .join('\n')
    writeFileSync(path.join(target, name), body)
    written.push(`changelog/desktop/${name}`)
  }
  return written
}

/**
 * Every release in one file, newest first — `/changelog/desktop/changelog.json`, shaped as onorca.dev's
 * `whats-new/changelog.json` (tasks/todo-desktop-update-policy.md, the follow-up line on media for
 * Highlights): per page `{ version: "X.Y", title, released, highlights, mediaUrl, releaseNotesUrl }`.
 * `highlights` are the page's Highlights as plain text (no badge, no media); `mediaUrl` is the first
 * image or clip under them — a clip as its GIF, the form every reader can show — or null. Nothing reads
 * it yet: the app shows its own notes (What's new stays in Help & about); it is for the web and later.
 * @param {string} srcDir - `src/content/docs/changelog/desktop/`
 * @param {string} site - the docs host (`astro.config.mjs` `site`)
 */
export function changelogFeed(srcDir, site) {
  const origin = site.replace(/\/+$/, '')
  const minor = (v) => v.split('.').map(Number)
  return readdirSync(srcDir)
    .filter((n) => VERSION_PAGE.test(n))
    .map((name) => {
      const version = name.replace(/\.md$/, '')
      const text = readFileSync(path.join(srcDir, name), 'utf8')
      const fm = frontMatter(text) ?? {}
      const [media] = pageMedia(text)
      return {
        version,
        title: fm.title?.value ?? `Tracy Cowork ${version}`,
        released: fm.released?.value ?? null,
        highlights: highlightsOf(text),
        mediaUrl: media ? `${origin}${media.kind === 'video' ? gifOf(media.src) : media.src}` : null,
        releaseNotesUrl: `${origin}/changelog/desktop/${version}/`
      }
    })
    .sort((a, b) => {
      const [am, an] = minor(a.version)
      const [bm, bn] = minor(b.version)
      return bm - am || bn - an
    })
}

/**
 * Write `changelogFeed` to `<distDir>/changelog/desktop/changelog.json`.
 * @returns {string} the written path, relative to `distDir`
 */
export function writeChangelogFeed(srcDir, distDir, site) {
  const target = path.join(distDir, 'changelog', 'desktop')
  mkdirSync(target, { recursive: true })
  writeFileSync(
    path.join(target, 'changelog.json'),
    `${JSON.stringify(changelogFeed(srcDir, site), null, 2)}\n`
  )
  return 'changelog/desktop/changelog.json'
}
