// P06 repeats on a page, P07 any-real frames, P08 person frames, P09 owner photo labels, P10 icons, P11 twins.
import { OWNER_SOURCES as OWNER } from '../manifest-shape.js'

const MADE_UP = new Set(['drawn', 'owner-photo-extended'])
const where = (e) => (e.list === 'siteSettings' ? `siteSettings ${e.frame}` : e.frame)
const framesOnly = (view) => view.entries.filter((e) => e.list === 'frames')

// P06. One photo appears at most once per page. A photo is the brief asset for an owner photo (whatever the crop) and
// the file for a drawn picture. Twins, icons, initials and hidden frames are not photos here.
export function checkP06({ R, view, idx }) {
  const r = R.p06
  const seen = new Map()
  for (const e of framesOnly(view)) {
    const key = OWNER.has(e.source)
      ? `brief asset ${e.asset}`
      : e.source === 'drawn'
        ? `file ${e.sha256}`
        : null
    const pages = idx.wishes.get(e.frame)?.pages
    if (!key || !pages) continue
    let repeated = false
    for (const page of pages) {
      const first = seen.get(`${page} ${key}`)
      if (first) {
        r.fail(e.frame, `${key} is already shown in ${first} on ${page}`, 'pictures')
        repeated = true
      } else seen.set(`${page} ${key}`, e.frame)
    }
    if (!repeated) r.ok()
  }
}

// P07. A frame the plan asks to fill with any real photo holds a real photo, or is hidden; never drawn or extended.
export function checkP07({ R, view, idx }) {
  const r = R.p07
  for (const e of view.entries) {
    if (idx.wishes.get(e.frame)?.match !== 'any-real') continue
    if (MADE_UP.has(e.source))
      r.fail(where(e), `the plan asks for any real photo, the source is ${e.source}`, 'pictures')
    else r.ok()
  }
}

const portraitIdOf = (asset) => {
  const p = asset?.portraitOf
  return typeof p === 'string' ? p : typeof p?.id === 'string' ? p.id : null
}

// P08. A person frame holds a brief photo labelled as a portrait of that person, or the person's initials (or is
// hidden, judged by P12; a twin follows its source, judged by P11). It is never drawn, extended or an icon.
export function checkP08({ R, view, idx }) {
  const r = R.p08
  for (const e of view.entries) {
    const wish = idx.wishes.get(e.frame)
    if (wish?.match !== 'person') continue
    if (e.source === 'owner-photo') {
      const id = portraitIdOf(idx.assets.get(e.asset))
      if (id && idx.personIds(String(wish.person ?? '')).has(id)) r.ok()
      else
        r.fail(
          where(e),
          `brief asset ${e.asset} is not labelled as a portrait of ${wish.person ?? 'the planned person'}`,
          'pictures'
        )
    } else if (e.source === 'initials' || e.source === 'hide' || e.source === 'twin') r.ok()
    else
      r.fail(
        where(e),
        `a person frame holds only a confirmed portrait or initials, found ${e.source}`,
        'pictures'
      )
  }
}

const bool = (x) => (typeof x === 'boolean' ? x : null)
// The brief labels `hasTextOrWatermark` and `showsOtherBusiness` (true, false or null). When a label is absent, the
// vision label names are read instead (textPresence, hasTextOverlay; otherBusiness). null means nobody knows.
function lettering(a) {
  const own = bool(a.hasTextOrWatermark)
  if (own !== null) return own
  const vision = [
    a.textPresence === 'present' ? true : a.textPresence === 'absent' ? false : null,
    bool(a.hasTextOverlay)
  ].filter((x) => x !== null)
  return vision.length ? vision.includes(true) : null
}
const otherBusiness = (a) => bool(a.showsOtherBusiness) ?? bool(a.otherBusiness)

// P09. An owner photo is a brief asset whose labels show no lettering (words, logo, watermark) and no other business.
// A label that is unknown (null or absent) fails too: the picker must not use an unlabelled photo.
export function checkP09({ R, view, idx }) {
  const r = R.p09
  for (const e of view.entries) {
    if (!OWNER.has(e.source)) continue
    const a = idx.assets.get(e.asset)
    if (!a) {
      r.fail(where(e), `brief asset ${e.asset} does not exist in the brief`, 'pictures')
      continue
    }
    const text = lettering(a)
    const other = otherBusiness(a)
    if (text === true) r.fail(where(e), `brief asset ${e.asset} carries lettering or a watermark`, 'pictures')
    else if (other === true) r.fail(where(e), `brief asset ${e.asset} shows another business`, 'pictures')
    else if (text === null || other === null)
      r.fail(
        where(e),
        `brief asset ${e.asset} label unknown: ${[text === null && 'hasTextOrWatermark', other === null && 'showsOtherBusiness'].filter(Boolean).join(' and ')}`,
        'pictures'
      )
    else r.ok()
  }
}

// P10. An icon has a light and a dark file, and both icon names exist in the icon library (when one is given).
export function checkP10({ R, view, idx }) {
  const r = R.p10
  if (!idx.icons) r.note('no icon library given; icon names are not checked')
  for (const e of view.entries) {
    if (e.source !== 'icon') continue
    const unknown = idx.icons ? [e.icon.light, e.icon.dark].filter((n) => !idx.icons.has(n)) : []
    if (!e.dark) r.fail(where(e), 'icon has no dark file', 'pictures')
    else if (unknown.length)
      r.fail(where(e), `icon names not in the library: ${[...new Set(unknown)].join(', ')}`, 'pictures')
    else r.ok()
  }
}

// P11. A twin (a kit frame with twinOf, or a plan frame with sameAs) follows its source frame: it says source "twin",
// names that frame, and holds the same file (for an icon, its light or its dark file), or is hidden when its source
// is hidden or returned. Every
// writable kit twin of a placed frame has its entry.
export function checkP11({ R, view, idx }) {
  const r = R.p11
  const byFrame = new Map(view.entries.map((e) => [e.frame, e]))
  const sourceOf = (frame) => idx.frames.get(frame)?.twinOf || idx.wishes.get(frame)?.sameAs || null
  for (const e of framesOnly(view)) {
    const expected = sourceOf(e.frame)
    const sourceGone =
      expected && (byFrame.get(expected)?.source === 'hide' || view.returns.some((x) => x.frame === expected))
    if (e.source === 'hide' && sourceGone) {
      r.ok()
      continue
    }
    if (e.source !== 'twin') {
      if (expected)
        r.fail(
          e.frame,
          `this frame follows ${expected}; its source must be "twin", found ${e.source}`,
          'pictures'
        )
      continue
    }
    const src = byFrame.get(e.twinOf)
    if (expected !== e.twinOf)
      r.fail(
        e.frame,
        `${e.twinOf} is not the frame this one is a twin of (${expected ?? 'none'})`,
        'pictures'
      )
    else if (!src) r.fail(e.frame, `its source frame ${e.twinOf} has no entry`, 'pictures')
    else if (src.source === 'hide' || ![src.sha256, src.dark?.sha256].includes(e.sha256))
      r.fail(e.frame, `holds a different file than its source ${e.twinOf}`, 'pictures')
    else r.ok()
  }
  for (const [source, twins] of idx.twinsOf) {
    const src = byFrame.get(source)
    if (!src || src.list !== 'frames' || src.source === 'hide') continue
    for (const twin of twins) {
      if (idx.frames.get(twin)?.writable === false) continue
      if (byFrame.has(twin)) continue
      r.fail(twin, `kit twin of ${source} has no entry; it must follow its source`, 'pictures')
    }
  }
}
