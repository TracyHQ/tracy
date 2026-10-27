/**
 * The desktop changelog page — `apps/tracy-docs/src/content/docs/changelog/desktop/<X.Y>.md` — is the
 * one source of a release's notes (tasks/todo-desktop-update-policy.md "One-source changelog — rule (E)").
 * Front matter: title, description, `version: "X.Y"`, `released: YYYY-MM-DD` and
 * `slug: changelog/desktop/X.Y` (the build would otherwise drop the dot from the address).
 * One page per minor version; a minor release (`X.Y.0`) ships the page's `## Highlights`, a patch
 * release (`X.Y.Z`) its own `## X.Y.Z` section, so a hotfix never shows the minor's launch text again.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { nonEnglishLines } from './english.mjs'
import { thirdPartyLines } from './third-party-names.mjs'

const updateChannel = createRequire(import.meta.url)('./update-channel.cjs')

/** Where the pages live, from the repo root. */
export const CHANGELOG_DIR = 'apps/tracy-docs/src/content/docs/changelog/desktop'

/*
 * ONE LABEL (E9, 11/10/2026). A page covers the whole product — the web and the desktop app — from
 * the previous desktop release to this one; the desktop version number labels it. A change with no
 * label is everywhere (the app shows the web pages too, so there is no "Web" label); a change that only
 * the desktop app has carries exactly one label, and only on its way to the web page:
 *
 *   - in a PR's ```release-note``` block: the prefix `desktop: ` at the start of the line;
 *   - on the page: the suffix ` _(Desktop only)_` at the end of the bullet (the draft turns one into
 *     the other);
 *   - in a release's notes (the feed's `releaseNotes`, the bundle's `release-notes.txt`): NO label.
 *     Apps already released (0.5.x) show `releaseNotes` verbatim, so a label there would reach people
 *     as raw text; every line an app shows is in the app anyway.
 *
 * Why a plain markdown suffix and not Starlight's `<Badge>`: the component only works in `.mdx`, and
 * moving the pages to `.mdx` would change the `X.Y.md` name every tool and address uses (the raw
 * markdown the docs host serves next to the page, the file `prepare` reads at the release sha); its
 * style is also scoped to the component, so a hand-written `<span class="sl-badge">` in `.md` renders
 * unstyled. The suffix renders as a clear italic label on the web page, reads the same in the raw
 * markdown the app may fetch, and is dropped by `releaseNotesFromPage`, so the notes a release
 * ships — and the sha256 it freezes — are plain text with no label.
 */
export const DESKTOP_PREFIX = 'desktop: '
export const DESKTOP_BADGE = '_(Desktop only)_'

/** A bullet's leading lowercase `word:` — a label, as opposed to prose like "Mac: now needs …". */
const LABEL = /^(-\s+)?([a-z][a-z-]*):\s*/
const DESKTOP_LABEL = /^(-\s+)?desktop:\s*/i

/**
 * A release-note line with its `desktop:` prefix written the one way (`Desktop:x` → `desktop: x`),
 * keeping any bullet before it. Other lines are returned as they are.
 * @param {string} line
 */
export function normalizeLabel(line) {
  const found = DESKTOP_LABEL.exec(line)
  return found ? `${found[1] ?? ''}${DESKTOP_PREFIX}${line.slice(found[0].length)}` : line
}

/**
 * Whether a line starts with a label other than `desktop:` (`web:`, `mobile:` …); there is one label.
 * @param {string} line
 */
export const hasForeignLabel = (line) => {
  const found = LABEL.exec(line)
  return found !== null && found[2] !== 'desktop'
}

const BADGE_AT_END = /^(-\s+)(.*?)\s*_\(Desktop only\)_\s*$/

/**
 * A page bullet as a release ships it: plain, without the ` _(Desktop only)_` badge at its end.
 * @param {string} line
 */
export const withoutBadge = (line) => {
  const found = BADGE_AT_END.exec(line)
  return found ? `${found[1]}${found[2]}` : line
}

const MARKDOWN_LINK = /\[([^\]]+)\]\((?:https?:\/\/|\/)[^)\s]*\)/g

/**
 * A page bullet's links as a release ships them: the app shows the notes as plain text (Help & about,
 * the channel file, `release-notes.txt`), so `[docs.tracy.ai](https://docs.tracy.ai/)` ships as
 * `docs.tracy.ai`. The page keeps its links.
 * @param {string} line
 */
export const withoutLinks = (line) => line.replace(MARKDOWN_LINK, '$1')

/**
 * A release-note line as the page writes it: the `desktop: ` prefix becomes ` _(Desktop only)_` at its
 * end. A line without the prefix is returned as it is.
 * @param {string} line
 */
export const prefixToBadge = (line) => {
  const found = DESKTOP_LABEL.exec(normalizeLabel(line))
  return found ? `${found[1] ?? ''}${line.slice(found[0].length).trim()} ${DESKTOP_BADGE}` : line
}

/*
 * MEDIA UNDER A HIGHLIGHT (tasks/todo-desktop-update-policy.md "Follow-up line › Images/video for
 * Highlights", 11/10/2026). A bullet of `## Highlights` may be followed by ONE line of its own,
 * indented, holding a still image or a short clip the docs site serves from `apps/tracy-docs/public/`:
 *
 *   - A Getting started screen on first launch. _(Desktop only)_
 *     ![Getting started screen: pick your default agent](/changelog/0.5/getting-started.webp)
 *   - Settings › AI accounts can connect two more. _(Desktop only)_
 *     <video src="/changelog/0.5/x.mp4" poster="/changelog/0.5/posters/x.jpg" aria-label="What it shows" autoplay muted loop playsinline controls></video>
 *
 * A clip plays by itself, muted and looping, like a moving screenshot (as onorca.dev's changelog
 * does); its poster — the still of the same clip, `posters/<name>.jpg` — shows before it plays and
 * where motion is turned down (the site pauses it under `prefers-reduced-motion`). Each clip also
 * has a `<name>.gif` beside it for places that play no video (`changelog.json`'s `mediaUrl`); where
 * every file came from is in `public/changelog/<X.Y>/media.json`.
 *
 * The web page shows it under the bullet; the notes a release ships (`releaseNotesFromPage`, hence
 * `notes.contentSha256`) and the raw markdown copy never carry it — the app shows plain text, and a
 * path on the docs host means nothing there. Any line that STARTS like media (`![`, `<video`, `<img`)
 * is dropped from the notes, well-formed or not, so a typo can never reach an app; `pageProblems`
 * names the malformed ones. The files themselves (they exist, size, dimensions) are checked by
 * `apps/tracy-docs/scripts/media.mjs`.
 */
const MEDIA_START = /^\s*(!\[|<video\b|<img\b)/i
const IMAGE_LINE =
  /^ {2,}!\[([^\]]*)\]\((\/changelog\/(\d+\.\d+)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:webp|png))\)\s*$/
const VIDEO_LINE =
  /^ {2,}<video src="(\/changelog\/(\d+\.\d+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.mp4)" poster="(\/changelog\/[^"]*)" aria-label="([^"]*)" autoplay muted loop playsinline controls><\/video>\s*$/

/**
 * Whether a page line is a media line (an image or a video under a bullet), well-formed or not.
 * @param {string} line
 */
export const isMediaLine = (line) => MEDIA_START.test(line)

/*
 * EVERY HIGHLIGHT HAS A PICTURE OR A CLIP (11/10/2026). A minor page's Highlight carries its one
 * media line, or says on the next line why it has none — an HTML comment the web page does not show:
 *
 *   - Windows open larger by default. _(Desktop only)_
 *     <!-- no-media: a window size, nothing a still would show -->
 *
 * `release.mjs prepare` of an X.Y.0 refuses a stable build while a Highlight has neither, and a dev
 * build warns (`notesForRelease`); the manifest lists the no-media ones (`notes.noMedia`). Like a media
 * line, the comment is the page's only: the notes a release ships, their sha256 and the raw markdown
 * copy never carry it (`isPageOnlyLine`). Any line that STARTS like one is dropped, well-formed or not.
 */
const NO_MEDIA_START = /^\s*<!--\s*no-media\b/i
const NO_MEDIA_LINE = /^\s*<!--\s*no-media:(.*?)-->\s*$/i

/**
 * Whether a page line is a `<!-- no-media: … -->` comment, well-formed or not.
 * @param {string} line
 */
export const isNoMediaLine = (line) => NO_MEDIA_START.test(line)

/**
 * Whether a page line is for the web page only — media or a no-media comment — and never part of the
 * notes a release ships or the raw markdown copy.
 * @param {string} line
 */
export const isPageOnlyLine = (line) => isMediaLine(line) || isNoMediaLine(line)

/** The reason a no-media comment gives; '' when it gives none, null when the line is not one. */
const noMediaReason = (line) => {
  const found = NO_MEDIA_LINE.exec(line)
  return found ? found[1].trim() : null
}

/**
 * A media line read: its kind, the path the docs site serves it at, the page (`X.Y`) that path is
 * under and its text alternative. Null when the line is not media in the one accepted shape.
 * @param {string} line
 * A clip's `poster` is the one its line names (`posterOf` says where it must be).
 * @returns {{ kind: 'image' | 'video', src: string, page: string, alt: string, poster?: string } | null}
 */
export function mediaLine(line) {
  const image = IMAGE_LINE.exec(line)
  if (image) return { kind: 'image', src: image[2], page: image[3], alt: image[1].trim() }
  const video = VIDEO_LINE.exec(line)
  if (video) return { kind: 'video', src: video[1], page: video[2], poster: video[4], alt: video[5].trim() }
  return null
}

/**
 * Where a clip's poster and animated stand-in live: `posters/<name>.jpg` and `<name>.gif` beside it.
 * @param {string} src - `/changelog/X.Y/<name>.mp4`
 */
export const posterOf = (src) => src.replace(/\/([^/]+)\.mp4$/, '/posters/$1.jpg')
export const gifOf = (src) => src.replace(/\.mp4$/, '.gif')

/** What is wrong with the labels of a page's bullets: one label, the badge, at the end. */
function labelProblems(list) {
  const problems = []
  for (const { lines } of list)
    for (const line of lines.map((l) => l.trim()).filter((l) => BULLET.test(l))) {
      if (DESKTOP_LABEL.test(line))
        problems.push(
          `the desktop: prefix is for PR notes; on the page write the ${DESKTOP_BADGE} badge at the end of the bullet: ${line}`
        )
      else if (hasForeignLabel(line))
        problems.push(
          `label "${LABEL.exec(line)[2]}:" — a change has one label, ${DESKTOP_BADGE}, or none: ${line}`
        )
      for (const [, name] of line.matchAll(/_\(\s*([^)]*?)\s+only\s*\)_/gi))
        if (name !== 'Desktop')
          problems.push(`"${name} only" is not a label — there is one label, ${DESKTOP_BADGE}: ${line}`)
      if (line.includes(DESKTOP_BADGE) && !BADGE_AT_END.test(line))
        problems.push(`the ${DESKTOP_BADGE} badge goes at the end of the bullet: ${line}`)
    }
  return problems
}

/** Every `## ` section of a page body, in order: its heading and the lines under it. */
function sectionList(text) {
  const body = text.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '')
  const out = []
  for (const line of body.split('\n')) {
    const heading = /^## (.+?)\s*$/.exec(line)
    if (heading) out.push({ heading: heading[1], lines: [] })
    else out.at(-1)?.lines.push(line)
  }
  return out
}

/** The sections by heading (the first, when a heading repeats). */
function sections(text) {
  const out = new Map()
  for (const { heading, lines } of sectionList(text)) if (!out.has(heading)) out.set(heading, lines)
  return out
}

/**
 * The notes a release ships, read from its minor version's page.
 * @param {string} text - the page, with or without its front matter
 * @param {string} version - `X.Y.Z`
 * @returns {string | null}
 */
export function releaseNotesFromPage(text, version) {
  const { page, section } = changelogSection(version)
  // The page the docs host serves has no front matter; the one in the repo must be this minor's.
  const declared = frontMatter(text)?.version
  if (declared !== undefined && declared.value !== page) return null
  const found = sections(text).get(section)
  if (!found) return null
  // A patch section opens with the day it shipped; that line is the page's, not the notes'.
  const lines = section === 'Highlights' ? found : dropReleasedLine(found)
  const notes = lines
    .filter((line) => !isPageOnlyLine(line))
    .map(withoutBadge)
    .map(withoutLinks)
    .join('\n')
    .trim()
  return notes === '' ? null : notes
}

/**
 * The page's front matter as `key: value` lines (all this page format uses), each value unquoted
 * and marked `quoted` when it was written as a string. Null when the page has none.
 * @param {string} text
 * @returns {Record<string, { value: string, quoted: boolean }> | null}
 */
export function frontMatter(text) {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text.replace(/\r\n?/g, '\n'))
  if (!block) return null
  const out = {}
  for (const line of block[1].split('\n')) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*?)\s*(?:#.*)?$/.exec(line)
    if (!pair) continue
    const quoted = /^(["'])(.*)\1$/.exec(pair[2])
    out[pair[1]] = quoted ? { value: quoted[2], quoted: true } : { value: pair[2], quoted: false }
  }
  return out
}

/** The first non-blank line, when it is `Released YYYY-MM-DD.`, removed. */
function dropReleasedLine(lines) {
  const first = lines.findIndex((line) => line.trim() !== '')
  return first !== -1 && RELEASED_LINE.test(lines[first].trim())
    ? [...lines.slice(0, first), ...lines.slice(first + 1)]
    : lines
}

const RELEASED_LINE = /^Released \d{4}-\d{2}-\d{2}\.$/

/**
 * Where a version's notes live: its minor's page and the section in it. A dev version
 * (`X.Y.Z-dev.N`) reads the section of the release it leads to.
 * @param {string} version
 * @returns {{ page: string, section: string }}
 */
export function changelogSection(version) {
  const found = /^(\d+)\.(\d+)\.(\d+)(?:-dev\.\d+)?$/.exec(version)
  if (!found) throw new Error(`not a desktop version: ${version}`)
  const [, major, minor, patch] = found
  const page = `${major}.${minor}`
  return { page, section: patch === '0' ? 'Highlights' : `${page}.${patch}` }
}

/**
 * What is wrong with a changelog page, one line per problem; empty when it is fit to ship from.
 * The English and third-party rules of the release notes hold for the WHOLE page: every line of it
 * is public, and any section may become a release's notes.
 * @param {string} text
 * @param {string} fileName - `X.Y.md`
 * @returns {string[]}
 */
export function pageProblems(text, fileName) {
  const problems = []
  const page = /^(\d+\.\d+)\.md$/.exec(fileName)?.[1]
  if (page === undefined) problems.push(`${fileName}: a changelog page is named X.Y.md`)
  const fm = frontMatter(text)
  if (fm === null) problems.push('no front matter (title, description, version, released)')
  else {
    for (const key of ['title', 'description', 'version', 'released'])
      if (!fm[key]?.value) problems.push(`front matter has no ${key}`)
    const version = fm.version
    if (version?.value && !version.quoted)
      problems.push(
        `front matter version must be a string ("${version.value}"), or YAML reads it as a number`
      )
    if (version?.value && page !== undefined && version.value !== page)
      problems.push(`front matter version "${version.value}" is not the page's own, ${fileName}`)
    // Without it the docs build drops the dot from the file name (`0.5.md` → /changelog/desktop/05/).
    if (page !== undefined && fm.slug?.value !== `changelog/desktop/${page}`)
      problems.push(
        `front matter needs slug: changelog/desktop/${page} (the address the app and publish use)`
      )
    if (fm.released?.value && !/^\d{4}-\d{2}-\d{2}$/.test(fm.released.value))
      problems.push(`front matter released must be the day of X.Y.0, YYYY-MM-DD, got: ${fm.released.value}`)
  }
  problems.push(...structureProblems(sectionList(text), page))
  problems.push(...labelProblems(sectionList(text)))
  for (const line of nonEnglishLines(text)) problems.push(`not English: ${line}`)
  for (const line of thirdPartyLines(text))
    problems.push(`names a third party (write the effect the user sees): ${line}`)
  return problems
}

const BULLET = /^- \S/

/** What is wrong with the sections of a page of minor version `page` (undefined when unknown). */
function structureProblems(list, page) {
  const problems = []
  if (list[0]?.heading !== 'Highlights') problems.push('the first section must be ## Highlights')
  const highlights = list.find((s) => s.heading === 'Highlights')
  if (highlights) {
    const lines = highlights.lines.filter((l) => l.trim() !== '')
    const bullets = lines.filter((l) => BULLET.test(l.trim()))
    if (lines.length === 0) problems.push('## Highlights is empty')
    for (const line of lines.filter((l) => !BULLET.test(l.trim()) && !isPageOnlyLine(l)))
      problems.push(`## Highlights holds bullets only ("- …"), not: ${line.trim()}`)
    if (bullets.length > 5) problems.push(`## Highlights has ${bullets.length} bullets, at most 5`)
  }
  problems.push(...mediaProblems(list, page))
  if (!list.some((s) => s.heading === 'Changes')) problems.push('no ## Changes section')
  const seen = new Set()
  for (const { heading, lines } of list) {
    if (heading === 'Highlights' || heading === 'Changes') continue
    const patch = /^(\d+\.\d+)\.(\d+)$/.exec(heading)
    if (!patch || (page !== undefined && patch[1] !== page) || patch[2] === '0') {
      problems.push(`## ${heading}: not a patch of ${page ?? 'this page'} (## X.Y.Z, Z above 0)`)
      continue
    }
    if (seen.has(heading)) problems.push(`## ${heading} appears twice`)
    seen.add(heading)
    const body = lines.map((l) => l.trim()).filter((l) => l !== '')
    if (!RELEASED_LINE.test(body[0] ?? ''))
      problems.push(`## ${heading} must open with "Released YYYY-MM-DD."`)
    if (body.filter((l) => !RELEASED_LINE.test(l)).length === 0) problems.push(`## ${heading} is empty`)
  }
  return problems
}

/** What is wrong with the media lines of a page of minor version `page` (undefined when unknown). */
function mediaProblems(list, page) {
  const problems = []
  for (const { heading, lines } of list) {
    let bullet = null
    let mediaOfBullet = 0
    let noMediaOfBullet = 0
    for (const line of lines) {
      if (BULLET.test(line.trim())) {
        bullet = line
        mediaOfBullet = 0
        noMediaOfBullet = 0
        continue
      }
      if (isNoMediaLine(line)) {
        const text = line.trim()
        if (heading !== 'Highlights')
          problems.push(`## ${heading}: <!-- no-media: … --> goes only under a ## Highlights bullet: ${text}`)
        else if (bullet === null)
          problems.push(
            `## Highlights: this no-media comment belongs to no bullet; put it under one: ${text}`
          )
        else {
          if (!noMediaReason(line))
            problems.push(
              `## Highlights: no-media needs a reason, "<!-- no-media: <why there is no picture> -->": ${text}`
            )
          if (++noMediaOfBullet === 2)
            problems.push(`## Highlights: one no-media comment per bullet, under: ${bullet.trim()}`)
          if (mediaOfBullet > 0 && noMediaOfBullet === 1)
            problems.push(
              `## Highlights: both an image or a video and a no-media comment under: ${bullet.trim()}`
            )
        }
        continue
      }
      if (!isMediaLine(line)) continue
      const text = line.trim()
      if (heading !== 'Highlights') {
        problems.push(`## ${heading}: an image or a video goes only under a ## Highlights bullet: ${text}`)
        continue
      }
      if (bullet === null) {
        problems.push(`## Highlights: this image or video belongs to no bullet; put it under one: ${text}`)
        continue
      }
      if (++mediaOfBullet === 2)
        problems.push(`## Highlights: one image or video per bullet, under: ${bullet.trim()}`)
      if (noMediaOfBullet > 0 && mediaOfBullet === 1)
        problems.push(
          `## Highlights: both an image or a video and a no-media comment under: ${bullet.trim()}`
        )
      const media = mediaLine(line)
      if (media === null) {
        problems.push(
          '## Highlights: not an image or a video in the one shape — an indented line under the bullet, ' +
            '"![alt](/changelog/X.Y/name.webp|png)" or ' +
            '"<video src="/changelog/X.Y/name.mp4" poster="/changelog/X.Y/posters/name.jpg" aria-label="…" ' +
            'autoplay muted loop playsinline controls></video>": ' +
            text
        )
        continue
      }
      if (media.alt === '')
        problems.push(`## Highlights: ${media.src} has no text alternative (alt / aria-label)`)
      if (page !== undefined && media.page !== page)
        problems.push(`## Highlights: ${media.src} is not under /changelog/${page}/, the folder of this page`)
      if (media.kind === 'video' && media.poster !== posterOf(media.src))
        problems.push(
          `## Highlights: the poster of ${media.src} is ${posterOf(media.src)}, not ${media.poster}`
        )
    }
  }
  return problems
}

/** A Highlights bullet as plain text: no `- `, no ` _(Desktop only)_` badge. */
const plainBullet = (line) => withoutBadge(line.trim()).replace(/^-\s+/, '').trim()

/**
 * The Highlights of a page as plain text, one per bullet, in order (`changelog.json`, media.json's
 * `highlight`).
 * @param {string} text
 * @returns {string[]}
 */
export function highlightsOf(text) {
  return (sections(text).get('Highlights') ?? []).filter((l) => BULLET.test(l.trim())).map(plainBullet)
}

/** A Highlight by its first words, enough to find it on the page. */
const firstWords = (highlight, count = 8) => {
  const words = highlight.split(/\s+/)
  return words.length > count ? `${words.slice(0, count).join(' ')}…` : highlight
}

/**
 * Which Highlights of a page have neither a media line nor a no-media comment (`missing`, each by its
 * first words), and which say why they have none (`noMedia`). Changes and patch sections need nothing.
 * @param {string} text
 * @returns {{ missing: string[], noMedia: { highlight: string, reason: string }[] }}
 */
export function highlightMedia(text) {
  const bullets = []
  for (const line of sections(text).get('Highlights') ?? []) {
    if (BULLET.test(line.trim())) bullets.push({ highlight: plainBullet(line), media: false, reason: null })
    else if (bullets.length === 0) continue
    else if (isMediaLine(line)) bullets.at(-1).media = true
    else if (isNoMediaLine(line)) bullets.at(-1).reason ??= noMediaReason(line) ?? ''
  }
  return {
    missing: bullets.filter((b) => !b.media && !b.reason).map((b) => firstWords(b.highlight)),
    noMedia: bullets
      .filter((b) => !b.media && b.reason)
      .map(({ highlight, reason }) => ({ highlight, reason }))
  }
}

/**
 * The image and clip lines of a page's Highlights that are in the one shape, in order, each with the
 * Highlight it sits under as plain text (what `apps/tracy-docs` checks against the files it serves
 * and their `media.json`).
 * @param {string} text
 * @returns {{ kind: 'image' | 'video', src: string, page: string, alt: string, poster?: string, highlight: string | null }[]}
 */
export function pageMedia(text) {
  const out = []
  let highlight = null
  for (const line of sections(text).get('Highlights') ?? []) {
    if (BULLET.test(line.trim())) highlight = plainBullet(line)
    const media = mediaLine(line)
    if (media) out.push({ ...media, highlight })
  }
  return out
}

/**
 * The notes a release ships and where they came from (`release.mjs prepare`, E5). The page is read
 * as committed at the release sha. A stable release ships its page section or nothing; a dev build
 * without one says why and falls back to the PR notes, and only a dev build takes a `--notes` file.
 * @param {{
 *   variant: 'stable' | 'dev', version: string, sha: string,
 *   explicit?: { text: string, prs?: object[], source?: string }, - a `--notes` file
 *   readPage: (sha: string, file: string) => string | null, - the file at that sha; null when absent
 *   collect: () => { text: string, prs: object[], source: string }, - the PR notes
 *   log: (line: string) => void
 * }} input
 * A minor release (`X.Y.0`) also checks every Highlight has a picture or a clip, or a no-media comment
 * (`highlightMedia`): stable refuses without, dev warns; `noMedia` lists the ones that say why not.
 * @returns {{ text: string, prs: object[], source: string | null, noMedia: { highlight: string, reason: string }[] }}
 */
export function notesForRelease({ variant, version, sha, explicit, readPage, collect, log }) {
  if (explicit) {
    if (variant === 'stable')
      throw new Error(
        'a stable release takes its notes from the changelog page only; --notes <file> is for a dev build'
      )
    return { text: explicit.text, prs: explicit.prs ?? [], source: explicit.source ?? null, noMedia: [] }
  }
  const { page, section } = changelogSection(version)
  const file = `${CHANGELOG_DIR}/${page}.md`
  const at = sha.slice(0, 10)
  const text = readPage(sha, file)
  let why
  if (text === null) why = `there is no ${file} at ${at}`
  else {
    const problems = pageProblems(text, `${page}.md`)
    const notes = releaseNotesFromPage(text, version)
    if (problems.length > 0) why = `${file} at ${at} is not fit to ship from: ${problems.join('; ')}`
    else if (notes === null) why = `${file} at ${at} has no "## ${section}" with notes for ${version}`
    else {
      // A minor's Highlights each carry a picture or a clip, or say why not; a patch ships its own
      // section and leaves the Highlights, already released, as they are.
      const media = section === 'Highlights' ? highlightMedia(text) : { missing: [], noMedia: [] }
      if (media.missing.length > 0) {
        const count = media.missing.length
        const list = media.missing.map((h) => `"${h}"`).join(' | ')
        const none = `no image or clip and no "<!-- no-media: <reason> -->" line under ${count === 1 ? 'it' : 'them'}`
        if (variant === 'stable')
          throw new Error(
            `stable ${version} ships the Highlights of ${file} at ${at}, but ${count} of them ${count === 1 ? 'has' : 'have'} ` +
              `${none}: ${list} — put one under each (docs/references/phat-hanh-app-desktop.md §6.1), ` +
              'merge it, and prepare from a sha that has it'
          )
        log(
          `prepare: WARNING ${file} at ${at}: ${count} Highlight${count === 1 ? ' has' : 's have'} ${none}: ` +
            `${list} — a stable ${page}.0 refuses this`
        )
      }
      return {
        text: notes,
        prs: [],
        source: `docs changelog/desktop/${page}.md#${section === 'Highlights' ? 'highlights' : section}@${sha}`,
        noMedia: media.noMedia
      }
    }
  }
  if (variant === 'stable')
    throw new Error(
      `stable ${version} ships the "## ${section}" section of ${file}, but ${why} — ` +
        `write it (a draft: node build/draft-release-notes.mjs --version ${section === 'Highlights' ? page : section}), ` +
        'merge it, and prepare from a sha that has it'
    )
  log(`prepare: WARNING ${why} — this dev build ships the PR notes instead`)
  return { ...collect(), noMedia: [] }
}

/** The hash a manifest records of the notes it froze (`notes.contentSha256`). */
export const notesSha256 = (text) =>
  createHash('sha256').update(text.replace(/\r\n?/g, '\n').trim()).digest('hex')

/**
 * Does the docs host serve a release's notes yet (`release.mjs publish`, E8)? Both the page people
 * open (`/changelog/desktop/X.Y/`) and the markdown the app links to (`/changelog/desktop/X.Y.md`)
 * must answer 200, and the markdown's section for this version must hash to what the candidate froze
 * — the docs are deployed before the app that points at them.
 * @param {{ origin: string, version: string, contentSha256: string,
 *   fetchDocs: (url: string) => Promise<{ status: number, text: string }> }} input
 * @returns {Promise<string | null>} what is missing; null when the docs serve the notes
 */
export async function docsServeNotes({ origin, version, contentSha256, fetchDocs }) {
  const { page } = changelogSection(version)
  const base = `${origin.replace(/\/+$/, '')}/changelog/desktop/${page}`
  let markdown
  for (const url of [`${base}/`, `${base}.md`]) {
    let got
    try {
      got = await fetchDocs(url)
    } catch (error) {
      return `${url}: ${error.message}`
    }
    if (got.status !== 200) return `${url}: HTTP ${got.status}`
    markdown = got.text
  }
  const served = releaseNotesFromPage(markdown, version)
  if (served === null || notesSha256(served) !== contentSha256)
    return `${base}.md: not the notes this candidate froze (${served === null ? 'no section for' : 'another text for'} ${version})`
  return null
}

/**
 * The notes of the build itself, written into the bundle's resources folder (`Contents/Resources` on
 * a Mac, `resources` on Windows and Linux) next to `app-update.yml`, before signing seals it (D1):
 * the app shows what it is running from these, offline and right after a fresh install.
 *   `release-notes.txt`  - the notes the release froze (the feed's `releaseNotes`); only when given
 *   `release-notes.json` - `{ version, page: "X.Y", docsOrigin }`, where the full changelog is
 * @param {string} dir - the resources folder
 * @param {{ version: string, channel: 'stable' | 'dev', notes?: string, docsOrigin?: string }} input
 */
export function writeBundleNotes(dir, { version, channel, notes, docsOrigin }) {
  if (notes !== undefined) writeFileSync(path.join(dir, 'release-notes.txt'), `${normalize(notes)}\n`)
  writeFileSync(
    path.join(dir, 'release-notes.json'),
    `${JSON.stringify(bundleInfo({ version, channel, docsOrigin }))}\n`
  )
}

/**
 * What differs between a bundle's notes and the ones its release froze; empty when they agree.
 * @param {string} dir - the resources folder
 * @param {{ version: string, channel: 'stable' | 'dev', notes: string, docsOrigin?: string }} want
 * @returns {string[]}
 */
export function bundleNotesProblems(dir, want) {
  const problems = []
  const txt = path.join(dir, 'release-notes.txt')
  if (!existsSync(txt)) problems.push(`no release-notes.txt in ${dir}`)
  else if (normalize(readFileSync(txt, 'utf8')) !== normalize(want.notes))
    problems.push(`${txt} is not the notes this release froze`)
  const json = path.join(dir, 'release-notes.json')
  let info = null
  try {
    info = JSON.parse(readFileSync(json, 'utf8'))
  } catch {}
  if (JSON.stringify(info) !== JSON.stringify(bundleInfo(want)))
    problems.push(`${json} says ${JSON.stringify(info)}, the release ${JSON.stringify(bundleInfo(want))}`)
  return problems
}

const normalize = (text) => text.replace(/\r\n?/g, '\n').trim()

const bundleInfo = ({ version, channel, docsOrigin }) => ({
  version,
  page: changelogSection(version).page,
  docsOrigin: (docsOrigin || updateChannel.docsOriginFor(channel)).replace(/\/+$/, '')
})

// `node build/release-notes-page.mjs bundle <resources dir> --version <v> --channel stable|dev
//    [--notes-file <file>] [--docs-origin <url>]` — how build/package.sh writes the bundle notes.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dir, ...rest] = process.argv.slice(2)
  const { values } = parseArgs({
    args: rest,
    options: {
      version: { type: 'string' },
      channel: { type: 'string' },
      'notes-file': { type: 'string' },
      'docs-origin': { type: 'string' }
    },
    strict: true
  })
  if (command !== 'bundle' || !dir || !values.version || !values.channel) {
    process.stderr.write(
      'usage: release-notes-page.mjs bundle <resources dir> --version <v> --channel stable|dev [--notes-file <file>] [--docs-origin <url>]\n'
    )
    process.exit(2)
  }
  writeBundleNotes(dir, {
    version: values.version,
    channel: values.channel,
    notes: values['notes-file'] ? readFileSync(values['notes-file'], 'utf8') : undefined,
    docsOrigin: values['docs-origin']
  })
}
