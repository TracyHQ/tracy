// Reads a site-copy/1 file defensively (ADR 0042). readCopy never throws: it returns the valid entries as a "view"
// the other rules use, and every problem it found as a W01 failure. An entry that does not match the contract is
// left out of the view, so one bad entry cannot hide or crash the rules.
export const COPY_VERSION = 'site-copy/1'
export const OWNERS = ['writer', 'plan-label']

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const isText = (x) => typeof x === 'string'
const isNonEmpty = (x) => typeof x === 'string' && x.trim() !== ''
const isStrings = (x) => Array.isArray(x) && x.every(isText)
const HEX64 = /^[0-9a-f]{64}$/

export function readCopy(copy) {
  const problems = []
  const view = { slots: [], alts: [], seo: [], pages: [], notebook: [], returns: [] }
  const bad = (where, detail) => problems.push({ where, detail })
  if (!isObject(copy)) {
    bad('file', 'the copy file is not a JSON object')
    return { view, problems }
  }
  if (copy.version !== COPY_VERSION)
    bad('version', `version must be "${COPY_VERSION}", found ${JSON.stringify(copy.version)}`)
  const fp = copy.fingerprint
  if (!isObject(fp)) bad('fingerprint', 'fingerprint must be an object')
  else {
    if (!isNonEmpty(fp.kit)) bad('fingerprint.kit', 'kit must be a non-empty string')
    for (const key of ['planSha256', 'briefSha256', 'promptSha256'])
      if (!HEX64.test(String(fp[key] ?? '')))
        bad(`fingerprint.${key}`, `${key} must be a 64 character hex string`)
  }
  const list = (key) => {
    if (Array.isArray(copy[key])) return copy[key]
    bad(key, `${key} must be a list`)
    return []
  }
  list('slots').forEach((s, i) => {
    const at = `slots[${i}]`
    if (!isObject(s)) return bad(at, 'entry is not an object')
    if (!isNonEmpty(s.slot)) return bad(at, 'slot must be a non-empty string')
    if (!OWNERS.includes(s.owner))
      return bad(s.slot, `owner must be "writer" or "plan-label", found ${JSON.stringify(s.owner)}`)
    if (!(isText(s.text) || (Array.isArray(s.text) && s.text.length > 0 && isStrings(s.text))))
      return bad(s.slot, 'text must be a string or a non-empty list of strings')
    if (!isStrings(s.factIds)) return bad(s.slot, 'factIds must be a list of strings')
    // A writer text that replaced a plan label names the label it replaced (ADR 0042, 2026-11-04).
    if (s.replacedPlanLabel !== undefined && !(s.owner === 'writer' && isNonEmpty(s.replacedPlanLabel)))
      return bad(s.slot, 'replacedPlanLabel must be a non-empty string, on a writer entry only')
    // The words of the text drawn in the accent colour (ADR 0042 section 11): plain text, judged by W16.
    if (s.emphasis !== undefined && !isNonEmpty(s.emphasis))
      return bad(s.slot, 'emphasis must be a non-empty string')
    view.slots.push({
      slot: s.slot,
      owner: s.owner,
      items: Array.isArray(s.text) ? s.text : [s.text],
      factIds: s.factIds,
      ...(s.replacedPlanLabel !== undefined ? { replacedPlanLabel: s.replacedPlanLabel } : {}),
      ...(s.emphasis !== undefined ? { emphasis: s.emphasis } : {})
    })
  })
  list('alts').forEach((a, i) => {
    if (isObject(a) && isNonEmpty(a.frame) && isText(a.text)) view.alts.push({ frame: a.frame, text: a.text })
    else bad(`alts[${i}]`, 'alt entry needs a frame and a text string')
  })
  list('seo').forEach((s, i) => {
    if (isObject(s) && isNonEmpty(s.page) && isText(s.title) && isText(s.description))
      view.seo.push({ page: s.page, title: s.title, description: s.description })
    else bad(`seo[${i}]`, 'seo entry needs a page, a title string and a description string')
  })
  list('pages').forEach((p, i) => {
    if (
      isObject(p) &&
      isNonEmpty(p.page) &&
      isText(p.title) &&
      Array.isArray(p.body) &&
      p.body.length > 0 &&
      isStrings(p.body)
    )
      view.pages.push({ page: p.page, title: p.title, body: p.body })
    else bad(`pages[${i}]`, 'pages entry needs a page, a title string and a non-empty body list of strings')
  })
  list('notebook').forEach((n, i) => {
    const ok =
      isObject(n) &&
      isNonEmpty(n.page) &&
      ['points', 'openings', 'calls', 'phrases'].every((k) => isStrings(n[k]))
    if (ok) view.notebook.push(n)
    else bad(`notebook[${i}]`, 'notebook entry needs a page and the lists points, openings, calls, phrases')
  })
  list('returns').forEach((r, i) => {
    const ok = isObject(r) && isNonEmpty(r.reason) && (isNonEmpty(r.slot) || isNonEmpty(r.page))
    if (ok) view.returns.push({ slot: r.slot ?? null, page: r.page ?? null, reason: r.reason })
    else bad(`returns[${i}]`, 'returns entry needs a reason and a slot or a page')
  })
  return { view, problems }
}

// Every written string with the place it sits, for the rules that scan all text (W07, W08, W10, W11).
// kind: slot | label | alt | seo-title | seo-description | page-title | page-body.
export function allTexts(view) {
  const out = []
  for (const s of view.slots)
    for (const t of s.items)
      out.push({ where: s.slot, kind: s.owner === 'plan-label' ? 'label' : 'slot', text: t })
  for (const a of view.alts) out.push({ where: a.frame, kind: 'alt', text: a.text })
  for (const s of view.seo) {
    out.push({ where: `${s.page} (title)`, kind: 'seo-title', text: s.title })
    out.push({ where: `${s.page} (description)`, kind: 'seo-description', text: s.description })
  }
  for (const p of view.pages) {
    out.push({ where: `${p.page} (title)`, kind: 'page-title', text: p.title })
    p.body.forEach((t, i) => out.push({ where: `${p.page} (body ${i + 1})`, kind: 'page-body', text: t }))
  }
  return out
}
