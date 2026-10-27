// Slot fit from the coverage audit's findings (ADR 0039): every demo picture and text the audit matched to a slot, with
// the box it is drawn in per viewport and what its file is, becomes a `fit` on that slot of the content map. The shape
// and the kinds are the Website Opportunities domain's (`content-map-fit.mjs`); this file only gathers the evidence.
//
// The keep flag of a picture follows the kind measured: `capture-contract.py --full-coverage` marks every picture it
// declares `customize: "keep"` because, without a render, it cannot tell a class photo from an icon. Here it can: a photo
// loses the flag (a build may replace it), an icon, a face, a signature, a cut-out, decoration or a map gets it, and a
// logo keeps what capture said (the business logo replaces it through its own door).
import {
  SLOT_FIT_TOLERANCE,
  SLOT_FIT_VERSION,
  pictureKindOf,
  pictureReplaceOf
} from '../../../../wo/website-opportunities/domain/content-map-fit.mjs'

const round4 = (n) => Math.round(n * 10000) / 10000
const fileOf = (sample) =>
  String(sample ?? '')
    .split('#')[0]
    .split('?')[0]
    .trim()
    .replace(/^\/+/, '')
const formatOf = (file) =>
  (/\.([a-z0-9]+)$/i.exec(file)?.[1] ?? '').toLowerCase().replace('jpeg', 'jpg') || null
const area = (b) => b.width * b.height

/** How many characters a text box holds in its demo lines (0 when its characters were not measured). */
const perLine = (look, box) =>
  look?.charWidth > 0 ? Math.floor((look.width || box.width) / look.charWidth) : 0
const linesOf = (look) => Math.max(1, Math.round(Number(look?.lines) || 1))
const capacity = (look, box) => perLine(look, box) * linesOf(look)

/**
 * Per slot key: for a picture the widest visible box and the first look per viewport, and the file the page measured;
 * for a text the box and look that hold the fewest characters per viewport.
 */
function evidenceOf(findings) {
  /** @type {Map<string, {boxes: Record<string, any>, looks: Record<string, any>, file: any, value: string}>} */
  const bySlot = new Map()
  for (const page of findings?.pages ?? [])
    for (const item of page.items ?? []) {
      if (item.status !== 'matched' || !Array.isArray(item.slots) || item.slots.length === 0) continue
      // A text measures its slot only when it shows that slot's words whole (`exact`, or exact but for spaces and
      // punctuation). Words several slots share (the same title in two places) measure each of them; the tightest box wins.
      if (item.kind === 'text' && !/^exact( ignoring spaces\/punctuation)?$/.test(String(item.matchBy)))
        continue
      if (item.kind !== 'text' && item.kind !== 'image') continue
      for (const key of item.slots) {
        const ev = bySlot.get(key) ?? { boxes: {}, looks: {}, file: null, value: item.value }
        for (const [vp, v] of Object.entries(item.viewports ?? {})) {
          if (!v?.visible || !(v.rect?.w >= 2) || !(v.rect?.h >= 2)) continue
          const b = { width: v.rect.w, height: v.rect.h }
          if (item.kind === 'text') {
            if (v.look && (!ev.looks[vp] || capacity(v.look, b) < capacity(ev.looks[vp], ev.boxes[vp]))) {
              ev.boxes[vp] = b
              ev.looks[vp] = v.look
            }
            continue
          }
          if (!ev.boxes[vp] || area(b) > area(ev.boxes[vp])) ev.boxes[vp] = b
          if (v.look && !ev.looks[vp]) ev.looks[vp] = v.look
        }
        if (item.kind === 'image' && item.file?.width && !ev.file) ev.file = item.file
        bySlot.set(key, ev)
      }
    }
  return bySlot
}

/** object-position / background-position as a word, when the demo does not centre the picture. */
function focusOf(look) {
  const pos = String(look?.objectPosition ?? look?.backgroundPosition ?? '').trim()
  const [x = '50%', y = '50%'] = pos.split(/\s+/)
  const at = (v) =>
    v === '0%' || v === 'left' || v === 'top'
      ? 'low'
      : v === '100%' || v === 'right' || v === 'bottom'
        ? 'high'
        : 'mid'
  const ax = at(x)
  const ay = at(y)
  if (ay === 'low' && ax === 'mid') return 'top'
  if (ay === 'high' && ax === 'mid') return 'bottom'
  if (ax === 'low' && ay === 'mid') return 'left'
  if (ax === 'high' && ay === 'mid') return 'right'
  return null
}

function cropOf(kind, look) {
  if (kind === 'logo') return 'contain'
  if (pictureReplaceOf(kind) === 'keep') return 'none'
  const fit = String(look?.objectFit ?? look?.backgroundSize ?? '')
  return /contain|scale-down/.test(fit) ? 'contain' : 'cover'
}

function pictureFit(slot, ev) {
  const file = fileOf(slot.sample)
  const words = [slot.label, slot.column, ...(slot.jsonPath ?? []).filter((p) => typeof p === 'string')].join(
    ' '
  )
  const boxes = ev?.boxes ?? {}
  const shown = Object.keys(boxes).length > 0
  const raw = ev?.file ?? null
  const source = raw ? { width: raw.width, height: raw.height, format: formatOf(file) } : null
  const { kind } = pictureKindOf({ words, file, source: raw, boxes })
  const transparent = typeof raw?.alpha === 'boolean' ? raw.alpha : null
  const replace = pictureReplaceOf(kind)
  if (!shown) return { measured: false, kind, replace, transparent, source }
  const main = boxes.desktop ?? Object.values(boxes)[0]
  const look = ev.looks.desktop ?? Object.values(ev.looks)[0] ?? null
  const fit = {
    measured: true,
    kind,
    replace,
    transparent,
    source,
    boxes,
    aspect: round4(main.width / main.height),
    tolerance: SLOT_FIT_TOLERANCE,
    minWidth: Math.round(1.5 * Math.max(...Object.values(boxes).map((b) => b.width))),
    crop: cropOf(kind, look)
  }
  const focus = focusOf(look)
  return focus ? { ...fit, focus } : fit
}

const CASING = { uppercase: 'upper', lowercase: 'lower', capitalize: 'capitalize' }

function textFit(slot, ev) {
  const vps = Object.keys(ev?.looks ?? {}).filter((vp) => ev.boxes[vp])
  if (vps.length === 0) return { measured: false }
  const length = String(slot.sample ?? '').length
  const boxes = {}
  const lines = {}
  const maxChars = {}
  for (const vp of vps) {
    const look = ev.looks[vp]
    boxes[vp] = ev.boxes[vp]
    lines[vp] = linesOf(look)
    // The demo's own words fit by definition: a box measured narrower than them (a label shrunk to its text) holds them.
    maxChars[vp] = Math.max(length, capacity(look, ev.boxes[vp]), 1)
  }
  const first = ev.looks.desktop ?? ev.looks[vps[0]]
  return {
    measured: true,
    boxes,
    lines,
    maxChars,
    maxCharacters: Math.min(...Object.values(maxChars)),
    casing: CASING[first?.textTransform] ?? 'none',
    overflow: 'rewrite'
  }
}

/** Collections of role groups (`module-4.item.0` → `module-4.item`): items shown and whether their photos share a shape. */
function fitGroupsOf(slots) {
  /** @type {Map<string, {items: Set<number>, aspects: number[]}>} */
  const groups = new Map()
  for (const slot of slots) {
    const id = slot.group?.id
    if (typeof id !== 'string' || !/\.\d+$/.test(id)) continue
    const collection = id.replace(/\.\d+$/, '')
    const g = groups.get(collection) ?? { items: new Set(), aspects: [] }
    g.items.add(slot.group.item)
    if (slot.type === 'image' && slot.fit?.measured && slot.fit.replace === 'photo')
      g.aspects.push(slot.fit.aspect)
    groups.set(collection, g)
  }
  const out = {}
  for (const [id, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const [a0] = g.aspects
    out[id] = {
      items: g.items.size,
      uniform: g.aspects.every((a) => Math.abs(a / a0 - 1) <= SLOT_FIT_TOLERANCE),
      whenFewer: 'neutral'
    }
  }
  return out
}

/**
 * The content map with a `fit` on every text and image slot, `slotFitVersion` and `fitGroups`, and each picture's keep
 * flag set from its kind; plus a summary for the packaging report. The input map is not changed.
 * @param {{map: any, findings: any}} input
 */
export function measureSlotFit({ map, findings }) {
  const evidence = evidenceOf(findings)
  const out = structuredClone(map)
  const summary = {
    pictures: { total: 0, measured: 0, byKind: {}, kept: 0, keepBefore: 0, keptByKind: {}, cutouts: [] },
    text: { total: 0, measured: 0 }
  }
  for (const slot of out.slots ?? []) {
    if (slot.type === 'image') {
      const p = summary.pictures
      p.total += 1
      if (slot.customize === 'keep') p.keepBefore += 1
      slot.fit = pictureFit(slot, evidence.get(slot.key))
      if (slot.fit.replace === 'keep') slot.customize = 'keep'
      if (slot.fit.replace === 'photo') delete slot.customize
      if (slot.fit.measured) p.measured += 1
      p.byKind[slot.fit.kind] = (p.byKind[slot.fit.kind] ?? 0) + 1
      if (slot.customize === 'keep') {
        p.kept += 1
        p.keptByKind[slot.fit.kind] = (p.keptByKind[slot.fit.kind] ?? 0) + 1
      }
      if (slot.fit.kind === 'cutout') p.cutouts.push(slot.key)
    } else if (slot.type === 'text') {
      summary.text.total += 1
      slot.fit = textFit(slot, evidence.get(slot.key))
      if (slot.fit.measured) summary.text.measured += 1
    }
  }
  out.slotFitVersion = SLOT_FIT_VERSION
  out.fitGroups = fitGroupsOf(out.slots ?? [])
  return { map: out, summary }
}
