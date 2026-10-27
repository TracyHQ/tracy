/**
 * The images and clips under a changelog Highlight (`public/changelog/<X.Y>/`; tasks/todo-desktop-update-policy.md,
 * the follow-up line on media for Highlights). The docs build has no image toolchain (no `sharp`), so a
 * file is made small BEFORE it is committed — `pnpm docs:media add` — and what is committed is
 * checked here: the one shape of file the page may point at, under its limits, and where it came
 * from (`media.json`).
 *
 * A still is one `.webp`/`.png`. A clip is three files, as onorca.dev's changelog has them: `<name>.mp4`
 * (plays on the page), `<name>.gif` (for places that play no video) and `posters/<name>.jpg` (the
 * still shown before it plays, or instead of it when motion is turned down).
 *
 * The fixtures in `fixtures/media/` were made by cwebp 1.5.0 and ffmpeg 9.0.2 with known sizes, rates
 * and lengths (in the file names), so the values asserted here come from the encoders, not from the
 * parser under test.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  changelogMediaProblems,
  gifInfo,
  imageSize,
  MEDIA_LIMITS,
  mediaFileProblems,
  videoInfo
} from '../scripts/media.mjs'

const FIXTURES = fileURLToPath(new URL('./fixtures/media/', import.meta.url))
const SCRIPT = fileURLToPath(new URL('../scripts/media.mjs', import.meta.url))
const fixture = (name) => path.join(FIXTURES, name)
const KB = 1024
const MB = 1024 * 1024

function scratch(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-docs-media-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A copy of `from` at `dir/name` (folders made), padded with zeros up to `bytes` when given. */
function copyAs(dir, from, name, bytes) {
  const file = path.join(dir, name)
  mkdirSync(path.dirname(file), { recursive: true })
  const data = readFileSync(from)
  writeFileSync(file, bytes ? Buffer.concat([data, Buffer.alloc(bytes - data.length)]) : data)
  return file
}

const has = (tool) => spawnSync(tool, ['-version'], { stdio: 'ignore' }).status === 0

test('imageSize reads a PNG, the three kinds of WebP, a GIF and a JPEG', () => {
  const size = (name) => imageSize(readFileSync(fixture(name)))
  assert.deepEqual(size('png-40x20.png'), { width: 40, height: 20 })
  assert.deepEqual(size('png-1700x10.png'), { width: 1700, height: 10 })
  assert.deepEqual(size('lossy-40x20.webp'), { width: 40, height: 20 })
  assert.deepEqual(size('lossless-40x20.webp'), { width: 40, height: 20 })
  assert.deepEqual(size('alpha-24x12.webp'), { width: 24, height: 12 })
  assert.deepEqual(size('gif-40x20-12fps.gif'), { width: 40, height: 20 })
  assert.deepEqual(size('jpeg-40x20.jpg'), { width: 40, height: 20 })
  assert.equal(size('h264-32x16.mp4'), null)
  assert.equal(imageSize(Buffer.from('not an image')), null)
})

test('gifInfo reads a GIF: frames, length, and its rate from its shortest frame (gifski holds a still frame longer)', () => {
  const twelve = gifInfo(readFileSync(fixture('gif-40x20-12fps.gif')))
  assert.equal(twelve.frames, 12)
  // GIF delays are whole hundredths: 1/12 s is written as 8 or 9, 12.5 or 11.1 frames a second.
  assert.ok(twelve.fps >= 11 && twelve.fps <= 13, `fps ${twelve.fps}`)
  assert.ok(Math.abs(twelve.seconds - 1) < 0.1, `seconds ${twelve.seconds}`)
  const thirty = gifInfo(readFileSync(fixture('gif-40x20-30fps.gif')))
  assert.equal(thirty.frames, 30)
  assert.ok(thirty.fps > 15, `fps ${thirty.fps}`)
  assert.equal(gifInfo(readFileSync(fixture('png-40x20.png'))), null)
})

test('videoInfo reads an MP4: its size, its length and whether its track is H.264', () => {
  const short = videoInfo(readFileSync(fixture('h264-32x16.mp4')))
  assert.deepEqual(
    { ...short, seconds: Math.round(short.seconds * 10) / 10 },
    {
      width: 32,
      height: 16,
      seconds: 0.2,
      h264: true
    }
  )
  assert.equal(Math.round(videoInfo(readFileSync(fixture('h264-32x16-11s.mp4'))).seconds), 11)
  assert.equal(videoInfo(readFileSync(fixture('not-h264-32x16.mp4'))).h264, false)
  assert.equal(videoInfo(readFileSync(fixture('png-40x20.png'))), null)
})

test('a small still, clip, gif or poster has no problem', () => {
  for (const name of [
    'lossy-40x20.webp',
    'lossless-40x20.webp',
    'alpha-24x12.webp',
    'png-40x20.png',
    'h264-32x16.mp4',
    'gif-40x20-12fps.gif',
    'jpeg-40x20.jpg'
  ])
    assert.deepEqual(mediaFileProblems(fixture(name)), [], name)
})

test('a file is refused when it is another type, over its limit, too large on screen, too long or too fast', (t) => {
  const dir = scratch(t)
  const problems = (file) => mediaFileProblems(file).join('\n')
  assert.match(
    problems(copyAs(dir, fixture('jpeg-40x20.jpg'), 'shot.jpeg')),
    /\.jpeg.*webp, png, mp4, gif or jpg/
  )
  assert.match(
    problems(copyAs(dir, fixture('png-40x20.png'), 'shot.svg')),
    /\.svg.*webp, png, mp4, gif or jpg/
  )
  // stills
  assert.match(
    problems(copyAs(dir, fixture('lossy-40x20.webp'), 'big.webp', 500 * KB + 1)),
    /big\.webp.*512001 bytes.*at most 512000/
  )
  assert.deepEqual(mediaFileProblems(copyAs(dir, fixture('lossy-40x20.webp'), 'edge.webp', 500 * KB)), [])
  assert.match(problems(fixture('png-1700x10.png')), /1700×10.*1600 px/)
  assert.match(problems(copyAs(dir, fixture('png-40x20.png'), 'fake.webp')), /fake\.webp is not a WebP image/)
  assert.match(problems(copyAs(dir, fixture('lossy-40x20.webp'), 'fake.png')), /fake\.png is not a PNG image/)
  // clips
  assert.match(
    problems(copyAs(dir, fixture('h264-32x16.mp4'), 'long.mp4', 2 * MB + 1)),
    /long\.mp4.*2097153 bytes.*at most 2097152.*R2/
  )
  assert.match(problems(fixture('h264-32x16-11s.mp4')), /11\.0 s.*at most 10 s/)
  assert.match(problems(fixture('h264-1700x16.mp4')), /1700×16.*1600 px/)
  assert.match(problems(fixture('not-h264-32x16.mp4')), /not an H\.264 MP4/)
  assert.match(problems(copyAs(dir, fixture('png-40x20.png'), 'fake.mp4')), /not an H\.264 MP4/)
  // gifs
  assert.match(
    problems(copyAs(dir, fixture('gif-40x20-12fps.gif'), 'big.gif', 3 * MB + 1)),
    /big\.gif.*3145729 bytes.*at most 3145728/
  )
  assert.match(problems(fixture('gif-1300x10-12fps.gif')), /1300×10.*1200 px/)
  assert.match(problems(fixture('gif-40x20-30fps.gif')), /frames a second.*10 to 15/)
  assert.match(problems(copyAs(dir, fixture('png-40x20.png'), 'fake.gif')), /fake\.gif is not a GIF image/)
  // posters
  assert.match(
    problems(copyAs(dir, fixture('jpeg-40x20.jpg'), 'big.jpg', 150 * KB + 1)),
    /big\.jpg.*153601 bytes.*at most 153600/
  )
  assert.match(problems(copyAs(dir, fixture('png-40x20.png'), 'fake.jpg')), /fake\.jpg is not a JPEG image/)
  assert.match(problems(path.join(dir, 'missing.webp')), /missing\.webp does not exist/)
})

// ── a page, its folder and media.json ──────────────────────────────────────────────────────────────

const STILL = '  ![Getting started screen](/changelog/0.9/getting-started.webp)'
const CLIP =
  '  <video src="/changelog/0.9/sound.mp4" poster="/changelog/0.9/posters/sound.jpg" aria-label="The sound setting" autoplay muted loop playsinline controls></video>'
const PAGE = (lines) =>
  `---\ntitle: Tracy Cowork 0.9\nversion: "0.9"\nslug: changelog/desktop/0.9\n---\n\n## Highlights\n${lines}\n\n## Changes\n- One.\n`
const TWO = PAGE(
  `- Getting started on first launch. _(Desktop only)_\n${STILL}\n- A sound when the agent finishes.\n${CLIP}`
)
const ENTRIES = [
  {
    slug: 'getting-started',
    version: '0.9.0',
    highlight: 'Getting started on first launch.',
    recordedAt: '2026-10-11T10:30:00.000Z',
    capturedWith: 'imac-app + CDP screencast, pnpm docs:media add',
    files: { image: '/changelog/0.9/getting-started.webp' }
  },
  {
    slug: 'sound',
    version: '0.9.0',
    highlight: 'A sound when the agent finishes.',
    recordedAt: '2026-10-11T10:31:00.000Z',
    capturedWith: 'imac-app + CDP screencast, pnpm docs:media add',
    files: {
      mp4: '/changelog/0.9/sound.mp4',
      gif: '/changelog/0.9/sound.gif',
      poster: '/changelog/0.9/posters/sound.jpg'
    }
  }
]

/** A public/ folder holding the files of TWO and its media.json (`entries`). */
function folder(t, entries = ENTRIES) {
  const publicDir = scratch(t)
  copyAs(publicDir, fixture('lossy-40x20.webp'), 'changelog/0.9/getting-started.webp')
  copyAs(publicDir, fixture('h264-32x16.mp4'), 'changelog/0.9/sound.mp4')
  copyAs(publicDir, fixture('gif-40x20-12fps.gif'), 'changelog/0.9/sound.gif')
  copyAs(publicDir, fixture('jpeg-40x20.jpg'), 'changelog/0.9/posters/sound.jpg')
  writeFileSync(path.join(publicDir, 'changelog/0.9/media.json'), `${JSON.stringify(entries, null, 2)}\n`)
  return publicDir
}

const problemsOf = (publicDir, text = TWO) =>
  changelogMediaProblems({ publicDir, pages: [{ name: '0.9.md', text }] }).join('\n')

test('a still and a clip under their Highlights, every file present and fitting, each with its media.json entry', (t) => {
  assert.equal(problemsOf(folder(t)), '')
})

test('every image or clip on a page has its files and its entry; every entry and file has its place on a page', (t) => {
  const publicDir = folder(t)
  // The page loses its clip: its entry and its three files no longer belong anywhere.
  const named = problemsOf(publicDir, PAGE(`- Getting started on first launch. _(Desktop only)_\n${STILL}`))
  assert.match(named, /media\.json: sound has no image or clip on 0\.9\.md/)
  assert.match(named, /public\/changelog\/0\.9\/sound\.mp4 is not used/)
  assert.match(named, /public\/changelog\/0\.9\/sound\.gif is not used/)
  assert.match(named, /public\/changelog\/0\.9\/posters\/sound\.jpg is not used/)
  // A clip whose gif or poster is missing is not complete.
  rmSync(path.join(publicDir, 'changelog/0.9/sound.gif'))
  assert.match(problemsOf(publicDir), /0\.9\.md: \/changelog\/0\.9\/sound\.gif.*does not exist/)
})

test('media.json says where each one came from: the Highlight it shows, the release, when and how it was recorded', (t) => {
  const withEntries = (change) => problemsOf(folder(t, change(structuredClone(ENTRIES))))
  assert.match(
    withEntries((e) => e.slice(1)),
    /0\.9\.md: \/changelog\/0\.9\/getting-started\.webp has no entry in public\/changelog\/0\.9\/media\.json/
  )
  assert.match(
    withEntries((e) => ((e[1].highlight = 'Something else.'), e)),
    /sound.*shows "Something else\.", but sits under "A sound when the agent finishes\."/
  )
  assert.match(
    withEntries((e) => ((e[1].version = '0.8.0'), e)),
    /sound.*version 0\.8\.0 is not a 0\.9 release/
  )
  assert.match(
    withEntries((e) => ((e[1].recordedAt = 'yesterday'), e)),
    /sound.*recordedAt/
  )
  assert.match(
    withEntries((e) => ((e[1].capturedWith = ''), e)),
    /sound.*capturedWith/
  )
  assert.match(
    withEntries((e) => ((e[1].files = { mp4: '/changelog/0.9/sound.mp4' }), e)),
    /sound.*files.*mp4, gif, poster/
  )
  const broken = folder(t)
  writeFileSync(path.join(broken, 'changelog/0.9/media.json'), '{ not json')
  assert.match(problemsOf(broken), /public\/changelog\/0\.9\/media\.json is not a JSON array/)
})

test('pnpm docs:media check exits 0 on a clean public/ folder and 1 naming each problem', (t) => {
  const root = scratch(t)
  const pages = path.join(root, 'pages')
  mkdirSync(pages)
  writeFileSync(path.join(pages, '0.9.md'), TWO)
  const publicDir = folder(t)
  const run = () =>
    spawnSync(process.execPath, [SCRIPT, 'check', '--pages', pages, '--public', publicDir], {
      encoding: 'utf8'
    })
  const ok = run()
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /4 files.*fit/)
  copyFileSync(fixture('png-1700x10.png'), path.join(publicDir, 'changelog/0.9/b.png'))
  const bad = run()
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /b\.png.*not used/)
  assert.match(bad.stderr, /b\.png.*1600 px/)
})

// ── add ───────────────────────────────────────────────────────────────────────────────────────────

/** A pages folder with TWO's bullets and no media yet, and an empty public folder. */
function addRoot(t) {
  const root = scratch(t)
  mkdirSync(path.join(root, 'pages'))
  writeFileSync(
    path.join(root, 'pages/0.9.md'),
    PAGE('- Getting started on first launch. _(Desktop only)_\n- A sound when the agent finishes.')
  )
  return root
}
const addArgs = (root, input, name, highlight, extra = []) => [
  SCRIPT,
  'add',
  input,
  '--page',
  '0.9',
  '--name',
  name,
  '--highlight',
  highlight,
  '--pages',
  path.join(root, 'pages'),
  '--public',
  path.join(root, 'public'),
  ...extra
]
const entriesIn = (root) =>
  JSON.parse(readFileSync(path.join(root, 'public/changelog/0.9/media.json'), 'utf8'))

test('add makes a screenshot fit — WebP, 1600 px on the long side, under 500 KB — and records it in media.json', {
  skip: !(has('cwebp') && has('ffmpeg')) && 'cwebp or ffmpeg is not installed'
}, (t) => {
  const root = addRoot(t)
  const shot = path.join(root, 'shot.png')
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=2400x1500',
    '-frames:v',
    '1',
    shot
  ])
  const before = Date.now()
  const out = execFileSync(
    process.execPath,
    addArgs(root, shot, 'getting-started', 'Getting started on first launch.', ['--captured-with', 'a test']),
    { encoding: 'utf8' }
  )
  const file = path.join(root, 'public/changelog/0.9/getting-started.webp')
  assert.deepEqual(imageSize(readFileSync(file)), { width: 1600, height: 1000 })
  assert.ok(statSync(file).size <= MEDIA_LIMITS.image.bytes)
  assert.match(
    out,
    /^ {2}!\[.*\]\(\/changelog\/0\.9\/getting-started\.webp\)$/m,
    'prints the line to paste under the bullet'
  )
  const [entry] = entriesIn(root)
  assert.deepEqual(
    { ...entry, recordedAt: undefined },
    {
      slug: 'getting-started',
      version: '0.9.0',
      highlight: 'Getting started on first launch.',
      recordedAt: undefined,
      capturedWith: 'a test',
      files: { image: '/changelog/0.9/getting-started.webp' }
    }
  )
  assert.ok(Date.parse(entry.recordedAt) >= before - 1000, entry.recordedAt)
})

test('add takes a slug for a name and a Highlight that is on the page', {
  skip: !has('cwebp') && 'cwebp is not installed'
}, (t) => {
  const root = addRoot(t)
  const run = (name, highlight) =>
    spawnSync(process.execPath, addArgs(root, fixture('png-40x20.png'), name, highlight), {
      encoding: 'utf8'
    })
  const named = run('Getting Started', 'Getting started on first launch.')
  assert.equal(named.status, 2)
  assert.match(named.stderr, /--name.*lowercase/)
  const elsewhere = run('small', 'A line that is not a Highlight.')
  assert.equal(elsewhere.status, 2)
  assert.match(
    elsewhere.stderr,
    /--highlight.*not a Highlight of 0\.9\.md.*Getting started on first launch\./s
  )
  assert.equal(run('small', 'Getting started on first launch.').status, 0)
  assert.deepEqual(imageSize(readFileSync(path.join(root, 'public/changelog/0.9/small.webp'))), {
    width: 40,
    height: 20
  })
})

test('add makes a clip from screenshots as Orca does: ffmpeg H.264 (crf 26), a gifski GIF at 12 fps, the first frame as poster', {
  skip:
    !(has('ffmpeg') && spawnSync('gifski', ['--version']).status === 0) && 'ffmpeg or gifski is not installed'
}, (t) => {
  const root = addRoot(t)
  const frames = path.join(root, 'frames')
  mkdirSync(frames)
  // 2 s of frames at 10 a second; the first one is plain red, so the poster can be told from the rest.
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=2001x1201',
    '-frames:v',
    '1',
    path.join(frames, 'f-000.png')
  ])
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=2001x1201:r=10:d=2',
    '-start_number',
    '1',
    path.join(frames, 'f-%03d.png')
  ])
  const out = execFileSync(
    process.execPath,
    addArgs(root, frames, 'sound', 'A sound when the agent finishes.', ['--fps', '10']),
    {
      encoding: 'utf8'
    }
  )
  const dir = path.join(root, 'public/changelog/0.9')
  for (const rel of ['sound.mp4', 'sound.gif', 'posters/sound.jpg'])
    assert.deepEqual(mediaFileProblems(path.join(dir, rel)), [], rel)
  const clip = videoInfo(readFileSync(path.join(dir, 'sound.mp4')))
  assert.deepEqual([clip.width, clip.height, clip.h264], [1600, 960, true])
  assert.ok(Math.abs(clip.seconds - 2.1) < 0.15, `clip ${clip.seconds} s`)
  const gif = gifInfo(readFileSync(path.join(dir, 'sound.gif')))
  assert.deepEqual([gif.width, gif.height], [1200, 720])
  // gifski marks its files with a `gif.ski` comment; the GIF plays as long as the clip, at 12 a second.
  assert.ok(readFileSync(path.join(dir, 'sound.gif')).includes('gif.ski'), 'made by gifski')
  assert.ok(Math.abs(gif.seconds - 2.1) < 0.2, `gif ${gif.seconds} s`)
  assert.ok(gif.fps >= 11.5 && gif.fps <= 12.6, `gif fps ${gif.fps}`)
  const poster = path.join(dir, 'posters/sound.jpg')
  assert.deepEqual(imageSize(readFileSync(poster)), { width: 1600, height: 960 })
  // The first frame: plain red (ffmpeg reads one pixel of it back).
  const pixel = execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    poster,
    '-vf',
    'crop=1:1:800:480',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  assert.ok(pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60, `poster pixel ${[...pixel]}`)
  assert.match(
    out,
    /^ {2}<video src="\/changelog\/0\.9\/sound\.mp4" poster="\/changelog\/0\.9\/posters\/sound\.jpg" aria-label=".*" autoplay muted loop playsinline controls><\/video>$/m
  )
  assert.deepEqual(entriesIn(root)[0].files, {
    mp4: '/changelog/0.9/sound.mp4',
    gif: '/changelog/0.9/sound.gif',
    poster: '/changelog/0.9/posters/sound.jpg'
  })
})
