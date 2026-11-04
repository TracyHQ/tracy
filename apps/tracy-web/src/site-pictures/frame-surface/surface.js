// The frame surface of a kit (ADR 0043 section 3e): for every picture frame, whether the block's text sits over it
// (text-over.js) and the overlay the template's own CSS paints over it (acm-markup.js, css-overlays.js). It is picture
// step data computed once per kit version and quickstart archive, never a change of the kit: `frame-surface/1`
// { kit, quickstart: { file, sha256 }, frames: { <frame id>: { textOver, textOverFrom, overlay } } }, `overlay` an
// object, null (the template paints none) or "unknown" (the frame's picture element could not be read). Without a
// quickstart every overlay is "unknown"; the text over a picture is known from the kit alone. `behindTitle`: the
// template also paints this article picture dimmed behind the page title (behind-title.js), shown on the reading page.
import { contentMapKey } from '../../lib/content-map-key.js'
import { acmFieldOf, acmLayoutOf, pictureElementIn } from './acm-markup.js'
import { behindTitleFrames } from './behind-title.js'
import { overlayOver, rulesOf } from './css-overlays.js'
import { textOverOf } from './text-over.js'

export const SURFACE_VERSION = 'frame-surface/1'
/** A template overlay at least this strong already darkens the picture enough for light text over it. */
export const OVERLAY_COVERS = 0.45

const arr = (x) => (Array.isArray(x) ? x : [])

/** The quickstart files the surface reads: the template's stylesheets, its ACM layouts and the demo data SQL. */
export function wantedQuickstartFile(name, template) {
  const t = `templates/${template}/`
  if (/(^|\/)installation\/sql\/mysql\/[^/]+\.sql$/.test(name)) return true
  if (!name.startsWith(t) || /\/rtl\//.test(name)) return false
  const rest = name.slice(t.length)
  return (
    /^(css|local\/css)\/[^/]+\.css$/.test(rest) ||
    /^acm\/[^/]+\/css\/[^/]+\.css$/.test(rest) ||
    /^acm\/[^/]+\/tmpl\/[^/]+\.php$/.test(rest) ||
    /^html\/com_content\/article\/[^/]+\.php$/.test(rest)
  )
}

/**
 * @param {{ kit: object, contentMap?: { slots?: object[] } | null, template?: string | null,
 *   quickstart?: { file: string, sha256: string, files: Map<string, string> } | null, kitId?: string | null }} input
 *   `quickstart.files` the wanted files by their path in the archive (wantedQuickstartFile), as text
 */
export function measureSurface({ kit, contentMap = null, template = null, quickstart = null, kitId = null }) {
  const slots = new Map(arr(contentMap?.slots).map((s) => [s?.key, s]))
  const tpl = template ?? kit?.template?.name ?? null
  const qs = quickstart?.files ?? null
  const css = qs
    ? [...qs]
        .filter(([n]) => n.includes(`templates/${tpl}/`) && n.endsWith('.css'))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .flatMap(([, text]) => rulesOf(text))
    : []
  const sql = qs
    ? [...qs]
        .filter(([n]) => n.endsWith('.sql'))
        .map(([, t]) => t)
        .join('\n')
    : ''
  const php = (type, layout) =>
    qs
      ? ([...qs].find(([n]) => n.endsWith(`templates/${tpl}/acm/${type}/tmpl/${layout}.php`))?.[1] ?? null)
      : null

  const behind = qs ? behindTitleFrames({ files: qs, template: tpl, sql, kit, slots }) : new Map()
  const frames = {}
  for (const block of arr(kit?.blocks))
    for (const frame of arr(block?.frames)) {
      if (typeof frame?.id !== 'string' || frames[frame.id]) continue
      const { textOver, textOverFrom } = textOverOf(block, frame)
      frames[frame.id] = {
        textOver,
        textOverFrom,
        ...overlayFor({ frame, slot: slots.get(contentMapKey(frame.id)), qs, css, sql, php }),
        ...(behind.has(frame.id) ? { behindTitle: behind.get(frame.id) } : {})
      }
    }
  return {
    version: SURFACE_VERSION,
    kit: kitId,
    quickstart: quickstart ? { file: quickstart.file, sha256: quickstart.sha256 } : null,
    frames
  }
}

function overlayFor({ slot, qs, css, sql, php }) {
  const unknown = (why) => ({ overlay: 'unknown', overlayWhy: why })
  if (!qs) return unknown('no quickstart archive was read')
  if (!slot) return unknown('the content map has no slot for this frame')
  if (slot.nestedJson !== 'jatools-config')
    return unknown(`a ${slot.entity?.split('-')[0] ?? 'slot'} picture is not read yet (only ACM modules)`)
  const id = /^module-(\d+)$/.exec(String(slot.entity ?? ''))?.[1]
  const layout = id ? acmLayoutOf(sql, id) : null
  if (!layout) return unknown(`no ACM row for ${slot.entity} in the demo data`)
  const field = acmFieldOf(slot.jsonPath)
  const tmpl = php(layout.type, layout.layout)
  if (!field || !tmpl) return unknown(`no template acm/${layout.type}/tmpl/${layout.layout}.php`)
  const el = pictureElementIn(tmpl, field)
  if (el.unknown) return unknown(el.unknown)
  const overlay = overlayOver(css, el)
  return {
    overlay,
    container: `${el.container.tag}.${el.container.classes.join('.')}`,
    shownAs: el.shownAs
  }
}

/** Whether a frame's template overlay already darkens its picture enough for light text over it. */
export const overlayCovers = (frame) =>
  typeof frame?.templateOverlay === 'object' &&
  frame.templateOverlay !== null &&
  frame.templateOverlay.strength >= OVERLAY_COVERS

/**
 * The kit document with each frame's surface joined in as `textOver`, `textOverFrom` and `templateOverlay`; the kit's
 * own fields are left as they are. A frame the surface does not hold gets the kit's own answer and an unknown overlay.
 */
export function joinSurface(doc, surface) {
  if (!doc || !Array.isArray(doc.blocks)) return doc
  const of = surface?.frames ?? {}
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      Array.isArray(b?.frames)
        ? {
            ...b,
            frames: b.frames.map((f) => {
              const s = of[f?.id] ?? { ...textOverOf(b, f), overlay: 'unknown' }
              return { ...f, textOver: s.textOver, textOverFrom: s.textOverFrom, templateOverlay: s.overlay }
            })
          }
        : b
    )
  }
}

/** What a manifest entry records of its frame's surface. */
export const surfaceFields = (frame) => ({
  textOver: frame?.textOver === true,
  templateOverlay: frame?.templateOverlay === undefined ? 'unknown' : frame.templateOverlay
})

/**
 * The manifest with every entry of `frames` and `siteSettings` carrying its frame's surface (surfaceFields), so step
 * 9 and the reading page see it. `frames` the kit frames by id, the surface joined in (joinSurface). Never modifies doc.
 */
export function stampSurface(doc, frames) {
  if (!doc || !frames) return doc
  const stamp = (list) =>
    Array.isArray(list)
      ? list.map((e) => (e?.frame ? { ...e, ...surfaceFields(frames.get(e.frame)) } : e))
      : list
  return { ...doc, frames: stamp(doc.frames), siteSettings: stamp(doc.siteSettings) }
}
