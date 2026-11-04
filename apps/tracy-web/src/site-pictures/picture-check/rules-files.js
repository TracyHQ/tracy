// P03 files and hashes, P04 aspect and size, P05 enlarging and the sharpness gate.
import { OWNER_SOURCES, sitePathOf } from '../manifest-shape.js'

/**
 * The write door accepts a file whose aspect is within this of the demo file it replaces. The comparison is the
 * absolute difference of the two width / height ratios, the same form `drawHeroes` (tracy-seeder hero-images.mjs) and
 * `drawPicture` (tracy-seeder picture.mjs) use against the demo file; 0.02 is the Joomla plugin's own aspect check
 * (named in `placeFooterLogo`, brand-joomla-places.js). Absolute is loose for very wide bands (ADR 0043).
 */
export const ASPECT_TOLERANCE = 0.02
/** A photo is never enlarged more than this many times. */
export const MAX_ENLARGE = 1.5

const where = (e) => (e.list === 'siteSettings' ? `siteSettings ${e.frame}` : e.frame)
// Every placed file of an entry: the file itself and, for an icon, its dark version.
const placedFiles = (e) =>
  e.source === 'hide' ? [] : [{ ...e, label: 'file' }, ...(e.dark ? [{ ...e.dark, label: 'dark file' }] : [])]

// P03. The file exists, its sha256 and pixel size equal what the manifest records, and its site path is
// images/tracy-content/<sha256>.<extension>.
export function checkP03({ R, view, idx }) {
  const r = R.p03
  for (const e of view.entries)
    for (const f of placedFiles(e)) {
      const real = idx.readFile(f.file)
      if (!real) r.fail(where(e), `${f.label} ${f.file} does not exist`, 'pictures')
      else if (String(real.sha256).toLowerCase() !== f.sha256)
        r.fail(
          where(e),
          `${f.label} ${f.file} has sha256 ${real.sha256}, the manifest says ${f.sha256}`,
          'pictures'
        )
      else if (real.width !== f.width || real.height !== f.height)
        r.fail(
          where(e),
          `${f.label} ${f.file} is ${real.width} x ${real.height}, the manifest says ${f.width} x ${f.height}`,
          'pictures'
        )
      else if (f.sitePath !== sitePathOf(f.file, f.sha256))
        r.fail(
          where(e),
          `${f.label} site path must be ${sitePathOf(f.file, f.sha256)}, found ${f.sitePath}`,
          'pictures'
        )
      else r.ok()
    }
}

// P04. The aspect of the file is the aspect of the demo file the site holds for that frame (content map slot fit
// source), within ASPECT_TOLERANCE, and the file is at least the kit frame's display box on both sides.
export function checkP04({ R, view, idx }) {
  const r = R.p04
  for (const e of view.entries) {
    const frame = idx.frames.get(e.frame)
    if (!frame) continue
    const demo = idx.demoSize(e.frame)
    if (!demo && e.source !== 'hide') r.note(`no demo file size for ${e.frame}; its aspect is not checked`)
    const box = Number.isFinite(frame.width) && Number.isFinite(frame.height)
    if (!box && e.source !== 'hide') r.note(`no display box for ${e.frame}; its size is not checked`)
    for (const f of placedFiles(e)) {
      const size = idx.readFile(f.file) ?? f
      const aspect = size.width / size.height
      const wanted = demo ? demo.width / demo.height : null
      let fine = true
      if (wanted !== null && Math.abs(aspect - wanted) > ASPECT_TOLERANCE) {
        fine = false
        r.fail(
          where(e),
          `${f.label} aspect ${aspect.toFixed(3)} (${size.width} x ${size.height}) differs from the demo file aspect ${wanted.toFixed(3)} (${demo.width} x ${demo.height}) by more than ${ASPECT_TOLERANCE}`,
          'pictures'
        )
      }
      if (box && (size.width < frame.width || size.height < frame.height)) {
        fine = false
        r.fail(
          where(e),
          `${f.label} is ${size.width} x ${size.height}, below the display box ${frame.width} x ${frame.height}`,
          'pictures'
        )
      }
      if (fine) r.ok()
    }
  }
}

const LOW_QUALITY = new Set(['low'])
/** A low quality owner photo may only fill a frame whose display box has no side longer than this (gallery tiles). */
export const SMALL_FRAME_MAX = 600

// P05. A picture is enlarged at most MAX_ENLARGE times. Whenever it is enlarged at all, or it is an owner photo the
// brief grades low quality, the sharpness gate (measured by the picture step at the display size and recorded in
// `sharpness`) must have passed. A low quality owner photo fills only a small frame (longest display side at most
// SMALL_FRAME_MAX), even when the gate passed.
export function checkP05({ R, view, idx }) {
  const r = R.p05
  for (const e of view.entries) {
    const owner = OWNER_SOURCES.has(e.source)
    const low = owner && LOW_QUALITY.has(String(idx.assets.get(e.asset)?.quality))
    if (e.enlarge === null && !low) continue
    const frame = idx.frames.get(e.frame)
    const longest = Math.max(Number(frame?.width) || 0, Number(frame?.height) || 0)
    if (low && longest > SMALL_FRAME_MAX)
      r.fail(
        where(e),
        `a low quality owner photo in a frame of ${frame.width} x ${frame.height}; it fits only frames up to ${SMALL_FRAME_MAX} px on the longest side`,
        'pictures'
      )
    else if (e.enlarge !== null && e.enlarge > MAX_ENLARGE)
      r.fail(where(e), `enlarged ${e.enlarge} times, more than ${MAX_ENLARGE}`, 'pictures')
    else if ((low || e.enlarge > 1) && e.sharpness?.passed !== true)
      r.fail(
        where(e),
        `${low ? 'a low quality owner photo' : `enlarged ${e.enlarge} times`} without a passed sharpness gate`,
        'pictures'
      )
    else r.ok()
  }
}
