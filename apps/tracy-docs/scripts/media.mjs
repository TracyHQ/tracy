// The images and clips under a changelog Highlight (tasks/todo-desktop-update-policy.md, the follow-up
// line on media for Highlights; how a page points at one: the MEDIA comment in
// `packages/desktop/tracy-desktop/build/release-notes-page.mjs`).
//
// They live in `public/changelog/<X.Y>/` and the build copies them as they are: the docs build has no
// image toolchain (`passthroughImageService`, no `sharp` — the image's build stage has no compiler), so
// a file is made small BEFORE it is committed, here. Two kinds, as onorca.dev's changelog has them:
//   - a STILL: `<slug>.webp` (or `.png`), at most 1600 px on its long side and 500 KB;
//   - a CLIP: three files — `<slug>.mp4` (H.264, no sound, at most 10 s, 2 MB, 1600 px) that plays
//     on the page, `<slug>.gif` (10–15 frames a second, at most 1200 px and 3 MB) for places that
//     play no video, and `posters/<slug>.jpg` (at most 150 KB), the still shown before it plays.
// `media.json` in the same folder says where each came from: `{ slug, version: "X.Y.Z", highlight,
// recordedAt, capturedWith, files }` — `files` is `{ image }` for a still, `{ mp4, gif, poster }` for a
// clip. `add` writes the entry; `check` (and the docs test) holds the page, the files and media.json
// to one another, both ways.
//
//   pnpm docs:media add <shot.png|shot.webp> --page X.Y --name <slug> --highlight "<the Highlight>"
//       [--alt "…"] [--lossless] [--version X.Y.Z] [--captured-with "…"]
//   pnpm docs:media add <frames dir|clip.mov|clip.mp4> --page X.Y --name <slug> --highlight "…"
//       [--fps 12] [--alt "…"] [--version X.Y.Z] [--captured-with "…"]
//   pnpm docs:media check
//
// Encoders: `cwebp` (libwebp's own command; `brew install webp`, `apt install webp`) for stills and
// `ffmpeg` with libx264 for clips — plain commands rather than an npm dependency, because only the
// person adding media needs them, never `pnpm install` nor CI. The check needs neither: it reads file
// headers in plain Node.
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  gifOf,
  highlightsOf,
  pageMedia,
  posterOf
} from '../../../packages/desktop/tracy-desktop/build/release-notes-page.mjs'

const KB = 1024
const MB = 1024 * 1024
export const MEDIA_LIMITS = Object.freeze({
  image: Object.freeze({ bytes: 500 * KB, longSide: 1600 }),
  video: Object.freeze({ bytes: 2 * MB, seconds: 10, longSide: 1600 }),
  gif: Object.freeze({ bytes: 3 * MB, longSide: 1200, minFps: 10, maxFps: 15 }),
  poster: Object.freeze({ bytes: 150 * KB, longSide: 1600 })
})

const DOCS = fileURLToPath(new URL('../', import.meta.url))
const DEFAULT_PAGES = path.join(DOCS, 'src/content/docs/changelog/desktop')
const DEFAULT_PUBLIC = path.join(DOCS, 'public')
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const human = (bytes) => (bytes >= MB ? `${bytes / MB} MB` : `${Math.round(bytes / KB)} KB`)

// ── reading headers ──────────────────────────────────────────────────────────────────────────────

const isPng = (buf) =>
  buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR'
const isWebp = (buf) =>
  buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
const isGif = (buf) => buf.length >= 13 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))
const isJpeg = (buf) => buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff

function jpegSize(buf) {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    // SOF0–SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but do not.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

/**
 * The width and height of a PNG, a WebP (lossy `VP8 `, lossless `VP8L` or extended `VP8X`), a GIF or
 * a JPEG, read from its header; null for anything else.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number } | null}
 */
export function imageSize(buf) {
  if (isPng(buf)) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  if (isGif(buf)) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  if (isJpeg(buf)) return jpegSize(buf)
  if (!isWebp(buf)) return null
  const chunk = buf.toString('ascii', 12, 16)
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8L' && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 }
  return null
}

/**
 * A GIF's size, its number of frames, how long it plays and its frame rate. Delays are in hundredths
 * of a second (0 plays as 10, as browsers do). The rate is that of its SHORTEST frame: gifski merges
 * frames that do not change into one shown longer, so frames ÷ length understates it.
 * Null when it is not a GIF.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, frames: number, seconds: number, fps: number } | null}
 */
export function gifInfo(buf) {
  if (!isGif(buf)) return null
  const skipBlocks = (j) => {
    while (j < buf.length && buf[j] !== 0) j += buf[j] + 1
    return j + 1
  }
  const table = (packed) => (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0)
  let i = 13 + table(buf[10])
  const delays = []
  let delay = 10
  while (i < buf.length) {
    if (buf[i] === 0x21) {
      if (buf[i + 1] === 0xf9) delay = buf.readUInt16LE(i + 4) || 10
      i = skipBlocks(i + 2)
    } else if (buf[i] === 0x2c) {
      delays.push(delay)
      delay = 10
      i = skipBlocks(i + 10 + table(buf[i + 9]) + 1)
    } else break
  }
  return {
    width: buf.readUInt16LE(6),
    height: buf.readUInt16LE(8),
    frames: delays.length,
    seconds: delays.reduce((sum, d) => sum + d, 0) / 100,
    fps: delays.length > 0 ? 100 / Math.min(...delays) : 0
  }
}

/** The boxes of an MP4 between `start` and `end`: `{ type, at, end }` (`at` = the content's start). */
function boxes(buf, start = 0, end = buf.length) {
  const out = []
  let i = start
  while (i + 8 <= end) {
    let size = buf.readUInt32BE(i)
    let header = 8
    if (size === 1 && i + 16 <= end) {
      size = Number(buf.readBigUInt64BE(i + 8))
      header = 16
    } else if (size === 0) size = end - i
    if (size < header) break
    out.push({ type: buf.toString('ascii', i + 4, i + 8), at: i + header, end: Math.min(end, i + size) })
    i += size
  }
  return out
}

/**
 * An MP4's picture size (its first video track), its length and whether that track is H.264 (an
 * `avc1` sample entry; MPEG-4 part 2 has `mp4v`). Null when it is not an MP4.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, seconds: number, h264: boolean } | null}
 */
export function videoInfo(buf) {
  if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return null
  const moov = boxes(buf).find((b) => b.type === 'moov')
  if (!moov) return { width: 0, height: 0, seconds: 0, h264: false }
  const inside = boxes(buf, moov.at, moov.end)
  let seconds = 0
  const mvhd = inside.find((b) => b.type === 'mvhd')
  if (mvhd) {
    const v1 = buf[mvhd.at] === 1
    const scale = buf.readUInt32BE(mvhd.at + (v1 ? 20 : 12))
    const length = v1 ? Number(buf.readBigUInt64BE(mvhd.at + 24)) : buf.readUInt32BE(mvhd.at + 16)
    seconds = scale ? length / scale : 0
  }
  let width = 0
  let height = 0
  for (const trak of inside.filter((b) => b.type === 'trak')) {
    const tkhd = boxes(buf, trak.at, trak.end).find((b) => b.type === 'tkhd')
    if (!tkhd) continue
    const at = tkhd.at + (buf[tkhd.at] === 1 ? 88 : 76)
    if (buf.readUInt32BE(at) === 0) continue
    width = buf.readUInt32BE(at) >>> 16
    height = buf.readUInt32BE(at + 4) >>> 16
    break
  }
  const avc1 = buf.indexOf('avc1', moov.at)
  return { width, height, seconds, h264: avc1 !== -1 && avc1 < moov.end }
}

// ── one file ─────────────────────────────────────────────────────────────────────────────────────

const tooLong = (label, { width, height }, longSide) =>
  Math.max(width, height) > longSide
    ? [`${label}: ${width}×${height}, at most ${longSide} px on the long side`]
    : []
const tooBig = (label, bytes, limit, what, more = '') =>
  bytes > limit ? [`${label}: ${bytes} bytes, at most ${limit} (${human(limit)}) for ${what}${more}`] : []

/**
 * What is wrong with one media file; empty when the page may point at it. The kind is its extension:
 * `.webp`/`.png` a still, `.mp4` a clip, `.gif` a clip's stand-in, `.jpg` a clip's poster.
 * @param {string} file
 * @param {string} [label] - how to name it (default: the path)
 * @returns {string[]}
 */
export function mediaFileProblems(file, label = file) {
  if (!existsSync(file)) return [`${label} does not exist`]
  const ext = path.extname(file).slice(1).toLowerCase()
  if (!['webp', 'png', 'mp4', 'gif', 'jpg'].includes(ext))
    return [`${label}: .${ext} — a changelog image or clip is webp, png, mp4, gif or jpg`]
  const buf = readFileSync(file)
  if (ext === 'mp4') {
    const limits = MEDIA_LIMITS.video
    const info = videoInfo(buf)
    const problems = tooBig(
      label,
      buf.length,
      limits.bytes,
      'a clip',
      ' — a longer clip goes to R2 and the page embeds its URL (docs/references/phat-hanh-app-desktop.md §6)'
    )
    if (!info?.h264) return [...problems, `${label} is not an H.264 MP4 (pnpm docs:media add makes one)`]
    if (info.seconds > limits.seconds)
      problems.push(`${label}: ${info.seconds.toFixed(1)} s, at most ${limits.seconds} s for a clip`)
    return [...problems, ...tooLong(label, info, limits.longSide)]
  }
  if (ext === 'gif') {
    if (!isGif(buf)) return [`${label} is not a GIF image`]
    const limits = MEDIA_LIMITS.gif
    const info = gifInfo(buf)
    const problems = [
      ...tooBig(label, buf.length, limits.bytes, 'a GIF'),
      ...tooLong(label, info, limits.longSide)
    ]
    if (info.frames > 1 && (info.fps < limits.minFps - 0.5 || info.fps > limits.maxFps + 0.5))
      problems.push(
        `${label}: ${info.fps.toFixed(1)} frames a second, a GIF plays ${limits.minFps} to ${limits.maxFps}`
      )
    return problems
  }
  const [is, name, limits, what] = {
    webp: [isWebp, 'a WebP', MEDIA_LIMITS.image, 'an image'],
    png: [isPng, 'a PNG', MEDIA_LIMITS.image, 'an image'],
    jpg: [isJpeg, 'a JPEG', MEDIA_LIMITS.poster, 'a poster']
  }[ext]
  if (!is(buf)) return [`${label} is not ${name} image`]
  const size = imageSize(buf)
  return [
    ...tooBig(label, buf.length, limits.bytes, what),
    ...(size === null ? [`${label}: cannot read its size`] : tooLong(label, size, limits.longSide))
  ]
}

// ── the pages, the files and media.json ─────────────────────────────────────────────────────────────

/** The files a media line needs: `{ image }` for a still, `{ mp4, gif, poster }` for a clip. */
const filesFor = (media) =>
  media.kind === 'video'
    ? { mp4: media.src, gif: gifOf(media.src), poster: posterOf(media.src) }
    : { image: media.src }
const slugOf = (src) => path.basename(src).replace(/\.[^.]+$/, '')
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/** Every file under `dir`, as paths relative to it with `/` separators. */
function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : entry.name === '.DS_Store'
        ? []
        : [`${prefix}${entry.name}`]
  )
}

/** `public/changelog/<X.Y>/media.json`: its entries, or a problem when it is not a JSON array. */
function readEntries(publicDir, page) {
  const file = path.join(publicDir, 'changelog', page, 'media.json')
  if (!existsSync(file)) return { entries: [], problem: null }
  try {
    const entries = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(entries)) return { entries, problem: null }
  } catch {}
  return { entries: [], problem: `public/changelog/${page}/media.json is not a JSON array of entries` }
}

/** What is wrong with one media.json entry against the media line it belongs to. */
function entryProblems(entry, media, page) {
  const at = `public/changelog/${page}/media.json: ${entry.slug}`
  const problems = []
  if (entry.highlight !== media.highlight)
    problems.push(`${at} shows "${entry.highlight}", but sits under "${media.highlight}" on ${page}.md`)
  if (
    typeof entry.version !== 'string' ||
    !new RegExp(`^${page.replace('.', '\\.')}\\.\\d+$`).test(entry.version)
  )
    problems.push(`${at}: version ${entry.version} is not a ${page} release (X.Y.Z)`)
  if (
    typeof entry.recordedAt !== 'string' ||
    !ISO.test(entry.recordedAt) ||
    Number.isNaN(Date.parse(entry.recordedAt))
  )
    problems.push(`${at}: recordedAt must be the ISO time it was recorded, got ${entry.recordedAt}`)
  if (typeof entry.capturedWith !== 'string' || entry.capturedWith.trim() === '')
    problems.push(`${at}: capturedWith must say how it was recorded`)
  const want = filesFor(media)
  if (JSON.stringify(entry.files) !== JSON.stringify(want))
    problems.push(
      `${at}: files are ${JSON.stringify(entry.files)}, not ${JSON.stringify(want)} (a clip has mp4, gif, poster; a still, image)`
    )
  return problems
}

/**
 * What is wrong between the changelog pages, the files in `public/changelog/` and each folder's
 * media.json: an image or clip a page shows whose files are missing or do not fit, or that has no
 * entry (or another one); an entry no page shows; a file no page uses.
 * @param {{ publicDir: string, pages: { name: string, text: string }[] }} input
 * @returns {string[]}
 */
export function changelogMediaProblems({ publicDir, pages }) {
  const problems = []
  const used = new Set()
  const shown = new Map() // folder → slugs a page shows
  const folders = new Set(
    existsSync(path.join(publicDir, 'changelog'))
      ? readdirSync(path.join(publicDir, 'changelog'), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : []
  )
  const entriesOf = new Map()
  const entries = (page) => {
    if (!entriesOf.has(page)) {
      const read = readEntries(publicDir, page)
      if (read.problem) problems.push(read.problem)
      entriesOf.set(page, read.entries)
    }
    return entriesOf.get(page)
  }
  for (const { name, text } of pages)
    for (const media of pageMedia(text)) {
      const slug = slugOf(media.src)
      if (!shown.has(media.page)) shown.set(media.page, new Set())
      shown.get(media.page).add(slug)
      for (const src of Object.values(filesFor(media))) {
        used.add(src)
        const file = path.join(publicDir, ...src.split('/'))
        if (!existsSync(file)) problems.push(`${name}: ${src} — public${src} does not exist`)
        else
          for (const problem of mediaFileProblems(file, `public${src}`)) problems.push(`${name}: ${problem}`)
      }
      const entry = entries(media.page).find((e) => e?.slug === slug)
      if (!entry)
        problems.push(`${name}: ${media.src} has no entry in public/changelog/${media.page}/media.json`)
      else problems.push(...entryProblems(entry, media, media.page))
    }
  for (const folder of folders)
    for (const entry of entries(folder))
      if (!shown.get(folder)?.has(entry?.slug))
        problems.push(
          `public/changelog/${folder}/media.json: ${entry?.slug} has no image or clip on ${folder}.md`
        )
  for (const rel of filesUnder(path.join(publicDir, 'changelog'))) {
    const src = `/changelog/${rel}`
    if (used.has(src) || /^[^/]+\/media\.json$/.test(rel)) continue
    problems.push(`public${src} is not used by any changelog page — point a Highlight at it, or delete it`)
    problems.push(...mediaFileProblems(path.join(publicDir, 'changelog', ...rel.split('/')), `public${src}`))
  }
  return problems
}

/** The version pages of a folder, `{ name, text }`. */
const readPages = (dir) =>
  readdirSync(dir)
    .filter((name) => /^\d+\.\d+\.md$/.test(name))
    .sort()
    .map((name) => ({ name, text: readFileSync(path.join(dir, name), 'utf8') }))

// ── add ──────────────────────────────────────────────────────────────────────────────────────────

class UsageError extends Error {}

/** Run a command; its output is shown only when it fails. */
function run(tool, args, install) {
  const got = spawnSync(tool, args, { encoding: 'utf8' })
  if (got.error?.code === 'ENOENT') throw new UsageError(`${tool} is not installed — ${install}`)
  if (got.status !== 0) throw new Error(`${tool} ${args.join(' ')} failed:\n${got.stderr || got.stdout}`)
}

const CWEBP_INSTALL =
  'brew install webp, apt install webp, or https://developers.google.com/speed/webp/download'
const FFMPEG_INSTALL = 'brew install ffmpeg, or apt install ffmpeg (it needs libx264)'
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], FFMPEG_INSTALL)
const sizeOf = (file) => statSync(file).size

function addStill(input, out, { lossless }) {
  const size = imageSize(readFileSync(input))
  if (size === null) throw new UsageError(`${input}: give a PNG or a WebP screenshot`)
  const scale = Math.min(1, MEDIA_LIMITS.image.longSide / Math.max(size.width, size.height))
  const quality = lossless ? ['-lossless', '-z', '9'] : ['-q', '80', '-m', '6']
  const args = [
    '-quiet',
    '-mt',
    ...quality,
    '-resize',
    String(Math.round(size.width * scale)),
    String(Math.round(size.height * scale))
  ]
  run('cwebp', [...args, input, '-o', out], CWEBP_INSTALL)
}

const GIF_FPS = 12
const GIFSKI_INSTALL = 'brew install gifski, or the binary in https://github.com/ImageOptim/gifski/releases'

/** The PNG files of a folder, sorted by name. */
const pngsIn = (dir) =>
  readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort()
    .map((name) => path.join(dir, name))

/**
 * A clip from frames, the way onorca.dev's changelog clips are made (measured from its files: libx264
 * crf 26, gifski): the MP4 with ffmpeg, the GIF with gifski at 12 frames a second, the poster from the
 * first frame. Each file that comes out over its limit is made again one setting lower.
 */
function addClip(input, { mp4, gif, poster }, { fps }) {
  const work = mkdtempSync(path.join(tmpdir(), 'docs-media-'))
  try {
    // The frames in order: the folder given, or the clip's own frames at `fps`.
    let frames = input
    if (!statSync(input).isDirectory()) {
      frames = path.join(work, 'frames')
      mkdirSync(frames)
      ffmpeg(['-i', input, '-vf', `fps=${fps}`, path.join(frames, '%05d.png')])
    }
    const pngs = pngsIn(frames)
    if (pngs.length === 0) throw new UsageError(`${input}: no PNG frames in it`)
    const source = ['-framerate', String(fps), '-pattern_type', 'glob', '-i', path.join(frames, '*.png')]
    // The long side at most 1600 px, both sides even (yuv420p needs it), the shape kept.
    const side = `trunc(min(${MEDIA_LIMITS.video.longSide}\\,max(iw\\,ih))/2)*2`
    // Square pixels (setsar=1): without it the rounding to even sizes leaves a sample aspect ratio that
    // players read as one pixel less wide.
    const scale = `scale=w='if(gte(iw\\,ih)\\,${side}\\,-2)':h='if(gte(iw\\,ih)\\,-2\\,${side})',setsar=1`
    for (const crf of [26, 30, 34, 38]) {
      ffmpeg([
        ...source,
        '-vf',
        scale,
        '-an',
        '-c:v',
        'libx264',
        '-crf',
        String(crf),
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        mp4
      ])
      if (sizeOf(mp4) <= MEDIA_LIMITS.video.bytes) break
    }
    // gifski shows each frame it is given for 1/--fps s: frames taken at another rate are resampled first,
    // so the GIF lasts as long as the clip.
    let gifFrames = pngs
    if (fps !== GIF_FPS) {
      const dir = path.join(work, 'gif')
      mkdirSync(dir)
      ffmpeg([...source, '-vf', `fps=${GIF_FPS}`, path.join(dir, '%05d.png')])
      gifFrames = pngsIn(dir)
    }
    const clip = videoInfo(readFileSync(mp4))
    const along = clip.width >= clip.height ? '--width' : '--height'
    for (const [quality, longSide] of [
      [80, MEDIA_LIMITS.gif.longSide],
      [70, MEDIA_LIMITS.gif.longSide],
      [60, 960],
      [50, 720]
    ]) {
      run(
        'gifski',
        [
          '--quiet',
          '--fps',
          String(GIF_FPS),
          along,
          String(longSide),
          '--quality',
          String(quality),
          '-o',
          gif,
          ...gifFrames
        ],
        GIFSKI_INSTALL
      )
      if (sizeOf(gif) <= MEDIA_LIMITS.gif.bytes) break
    }
    // The poster: the first frame, at the clip's size, JPEG (ffmpeg's -q:v 4 is about quality 80).
    mkdirSync(path.dirname(poster), { recursive: true })
    for (const q of [4, 6, 9, 13, 20]) {
      ffmpeg(['-i', pngs[0], '-vf', scale, '-frames:v', '1', '-q:v', String(q), poster])
      if (sizeOf(poster) <= MEDIA_LIMITS.poster.bytes) break
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function add(input, values) {
  if (!input || !existsSync(input))
    throw new UsageError('add: give a screenshot, a folder of PNG frames or a clip')
  const page = values.page ?? ''
  if (!/^\d+\.\d+$/.test(page)) throw new UsageError('add: --page is the minor version, X.Y (0.5)')
  if (!SLUG.test(values.name ?? ''))
    throw new UsageError('add: --name is a lowercase slug of what it shows (getting-started)')
  const pageFile = path.join(values.pages, `${page}.md`)
  if (!existsSync(pageFile))
    throw new UsageError(`add: there is no ${pageFile}; write the page's Highlights first`)
  const highlights = highlightsOf(readFileSync(pageFile, 'utf8'))
  if (!highlights.includes(values.highlight ?? ''))
    throw new UsageError(
      `add: --highlight "${values.highlight ?? ''}" is not a Highlight of ${page}.md; its Highlights are:\n` +
        highlights.map((h) => `  ${h}`).join('\n')
    )
  const version = values.version ?? `${page}.0`
  if (!new RegExp(`^${page.replace('.', '\\.')}\\.\\d+$`).test(version))
    throw new UsageError(`add: --version is a ${page} release, ${page}.Z`)
  const clip = statSync(input).isDirectory() || /\.(mp4|mov|m4v|webm)$/i.test(input)
  const dir = path.join(values.public, 'changelog', page)
  mkdirSync(dir, { recursive: true })
  const local = (src) => path.join(values.public, ...src.split('/'))
  const base = `/changelog/${page}/${values.name}`
  const files = clip
    ? { mp4: `${base}.mp4`, gif: `${base}.gif`, poster: `/changelog/${page}/posters/${values.name}.jpg` }
    : { image: `${base}.webp` }
  if (clip)
    addClip(
      input,
      { mp4: local(files.mp4), gif: local(files.gif), poster: local(files.poster) },
      {
        fps: Number(values.fps ?? GIF_FPS)
      }
    )
  else addStill(input, local(files.image), { lossless: values.lossless })
  const problems = []
  for (const src of Object.values(files)) {
    const buf = readFileSync(local(src))
    const size = imageSize(buf) ?? videoInfo(buf)
    process.stdout.write(
      `wrote public${src} (${size ? `${size.width}×${size.height}, ` : ''}${human(buf.length)})\n`
    )
    problems.push(...mediaFileProblems(local(src), `public${src}`))
  }
  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n')}\n`)
    return 1
  }
  // media.json: this slug's entry, new or replaced, the others as they were.
  const jsonFile = path.join(dir, 'media.json')
  const { entries, problem } = readEntries(values.public, page)
  if (problem) throw new Error(problem)
  const entry = {
    slug: values.name,
    version,
    highlight: values.highlight,
    recordedAt: new Date().toISOString(),
    capturedWith: values['captured-with'] ?? 'pnpm docs:media add',
    files
  }
  const at = entries.findIndex((e) => e?.slug === values.name)
  if (at === -1) entries.push(entry)
  else entries[at] = entry
  writeFileSync(jsonFile, `${JSON.stringify(entries, null, 2)}\n`)
  process.stdout.write(`recorded ${values.name} in public/changelog/${page}/media.json\n`)
  const alt = values.alt ?? 'Describe what it shows, in English'
  process.stdout.write(
    'Put this line under its Highlight bullet, indented two spaces:\n' +
      (clip
        ? `  <video src="${files.mp4}" poster="${files.poster}" aria-label="${alt}" autoplay muted loop playsinline controls></video>\n`
        : `  ![${alt}](${files.image})\n`)
  )
  return 0
}

function check(values) {
  const problems = changelogMediaProblems({ publicDir: values.public, pages: readPages(values.pages) })
  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n')}\n`)
    return 1
  }
  const count = filesUnder(path.join(values.public, 'changelog')).filter(
    (rel) => !rel.endsWith('media.json')
  ).length
  process.stdout.write(
    `docs:media: ${count} file${count === 1 ? '' : 's'} under public/changelog, all used and fit\n`
  )
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        page: { type: 'string' },
        name: { type: 'string' },
        highlight: { type: 'string' },
        version: { type: 'string' },
        alt: { type: 'string' },
        fps: { type: 'string' },
        'captured-with': { type: 'string' },
        lossless: { type: 'boolean', default: false },
        pages: { type: 'string', default: DEFAULT_PAGES },
        public: { type: 'string', default: DEFAULT_PUBLIC }
      }
    })
    const [command, input] = positionals
    if (command === 'add') process.exitCode = add(input, values)
    else if (command === 'check') process.exitCode = check(values)
    else
      throw new UsageError(
        'usage: media.mjs add <input> --page X.Y --name <slug> --highlight "…" [--alt …] [--lossless] [--fps N] [--version X.Y.Z] [--captured-with …] | media.mjs check'
      )
  } catch (error) {
    process.stderr.write(`docs:media: ${error.message}\n`)
    process.exitCode = error instanceof UsageError || error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? 2 : 1
  }
}
