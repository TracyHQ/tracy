// The demo corpus of one template version (ticket #585): every demo sentence, high signal string and demo picture a
// release of the template ships, from whichever sources the caller has, independent of the mapping. The demo baseline
// measured on an untouched site (ADR 0044, decision 8) is one source among them: what the kit misses is still caught.
// Interface words (language strings the template keeps, what the blank site keeps) are set apart so they are never a
// hit. Pure.
import { fileKey, isPictureFile, normalise, phoneKey, segmentsOf, shinglesOf } from './normalise.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
const bare = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const SIGNAL_ROLE = { 'contact.email': 'email', 'contact.phone': 'phone', 'contact.address': 'phrase' }
const DESIGN_ROLE = /^(?:design\.|editorial\.design_element$)/
/** A short name shorter than this is too common to be a hit. */
const NAME_MIN = 3

/** The slots a kit declares as design: design lines, design fields, design element roles. */
function designSlotsOf(kit, maps) {
  const slots = new Set()
  for (const entry of Object.values(kit?.mapping?.blocks ?? {}))
    for (const line of list(entry?.designLines)) if (line?.slot) slots.add(line.slot)
  for (const block of list(kit?.blockStore?.blocks))
    for (const f of [...list(block?.fields), ...list(block?.itemFields)])
      if (f?.type === 'design' && f.slot) slots.add(f.slot)
  for (const map of maps)
    for (const s of list(map?.slots)) if (DESIGN_ROLE.test(String(s?.role ?? ''))) slots.add(s.key)
  return slots
}

/** The interface words: language strings the mapping keeps, what the blank site keeps, and those given. */
function interfaceOf({ kit, contentMap, interfaceTexts }, sources) {
  const set = new Set()
  const add = (text) => {
    const n = bare(normalise(text))
    if (!n) return false
    set.add(n)
    for (const s of segmentsOf(text)) set.add(s)
    return true
  }
  const bySlot = new Map()
  for (const map of [kit?.contentMap, contentMap]) for (const s of list(map?.slots)) bySlot.set(s.key, s)
  let keep = 0
  for (const l of list(kit?.mapping?.overrides?.language))
    if (l?.keep && typeof bySlot.get(l.slot)?.sample === 'string' && add(bySlot.get(l.slot).sample)) keep++
  if (keep) sources.languageKeep = keep
  let blank = 0
  for (const s of list(kit?.contentMap?.slots))
    if (s?.type === 'text' && typeof s.sample === 'string' && add(s.sample)) blank++
  if (blank) sources.blankSite = blank
  if (interfaceTexts) sources.interfaceTexts = list(interfaceTexts).filter((t) => add(t)).length
  return set
}

/**
 * One corpus of demo words and pictures. Every input is optional; `sources` says which it had and how much each
 * gave (`demo` true when at least one demo source gave something).
 * @param {{kit?: object, demoBaseline?: object, contentMap?: object, fixedTexts?: Array<string | {text: string}>,
 *   companyNames?: string[], sqlLiterals?: string[], mediaFiles?: Array<string | {path: string, sha256?: string}>,
 *   interfaceTexts?: string[]}} [input] `contentMap`: the released content map of the demo site (the kit's own
 *   `contentMap` is the blank site's: its words are interface)
 */
export function demoCorpus(input = {}) {
  const { kit, demoBaseline, contentMap, fixedTexts, companyNames, sqlLiterals, mediaFiles } = input
  const sources = {}
  const iface = interfaceOf(input, sources)
  const corpus = {
    sources,
    interface: iface,
    blockKeys: new Set(),
    segments: new Map(),
    shingles: new Map(),
    shingleCount: new Map(),
    emails: new Set(),
    phones: new Map(),
    phrases: new Map(),
    pictures: { files: new Set(), shas: new Set() },
    design: new Set()
  }
  const addEmails = (text) => {
    for (const m of String(text ?? '').matchAll(EMAIL)) corpus.emails.add(m[0].toLowerCase())
  }
  const addText = (text) => {
    if (typeof text !== 'string' || !text.trim()) return 0
    addEmails(text)
    let n = 0
    for (const seg of segmentsOf(text)) {
      if (iface.has(seg) || corpus.segments.has(seg)) continue
      corpus.segments.set(seg, seg)
      const shingles = shinglesOf(seg)
      corpus.shingleCount.set(seg, shingles.length)
      for (const sh of shingles) corpus.shingles.set(sh, [...(corpus.shingles.get(sh) ?? []), seg])
      n++
    }
    return n
  }
  const addSignal = (kind, text) => {
    if (typeof text !== 'string' || !text.trim()) return 0
    if (kind === 'email') {
      addEmails(text)
      return 1
    }
    if (kind === 'phone') {
      const key = phoneKey(text)
      if (key) corpus.phones.set(key, text.trim())
      return key ? 1 : 0
    }
    const n = bare(normalise(text))
    if ([...n].length < NAME_MIN || iface.has(n)) return 0
    corpus.phrases.set(
      n,
      text
        .replace(/\(\([^()]*\)\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    return 1
  }
  const addPicture = (path, sha) => {
    const key = fileKey(path)
    if (key && isPictureFile(key)) corpus.pictures.files.add(key)
    if (typeof sha === 'string' && /^[0-9a-f]{64}$/i.test(sha)) corpus.pictures.shas.add(sha.toLowerCase())
  }
  const count = (name, n) => {
    if (n) sources[name] = (sources[name] ?? 0) + n
  }

  if (demoBaseline) {
    const keys = [...list(demoBaseline.texts), ...list(demoBaseline.labels)].filter(
      (k) => typeof k === 'string'
    )
    for (const k of keys) corpus.blockKeys.add(k)
    let n = keys.length
    for (const m of list(demoBaseline.maps)) n += addSignal('phrase', m?.address) + addText(m?.address)
    for (const f of list(demoBaseline.pictures?.files)) addPicture(f)
    for (const s of list(demoBaseline.pictures?.shas)) addPicture(null, s)
    count(
      'demoBaseline',
      n + list(demoBaseline.pictures?.files).length + list(demoBaseline.pictures?.shas).length
    )
  }
  if (contentMap) {
    let n = 0
    for (const s of list(contentMap.slots)) {
      if (typeof s?.sample !== 'string') continue
      if (s.type === 'image' || (s.type === 'url' && isPictureFile(s.sample))) {
        addPicture(s.sample)
        n++
      } else if (s.type === 'text') {
        n += addText(s.sample)
        if (SIGNAL_ROLE[s.role]) n += addSignal(SIGNAL_ROLE[s.role], s.sample)
      }
    }
    count('contentMap', n)
  }
  count(
    'fixedTexts',
    list(fixedTexts).reduce((n, f) => n + addText(typeof f === 'string' ? f : f?.text), 0)
  )
  count(
    'companyNames',
    list(companyNames).reduce((n, name) => n + addSignal('phrase', name), 0)
  )
  count(
    'sqlLiterals',
    list(sqlLiterals).reduce((n, t) => n + addText(t), 0)
  )
  for (const m of list(mediaFiles)) addPicture(typeof m === 'string' ? m : m?.path, m?.sha256)
  count('mediaFiles', list(mediaFiles).length)

  // A picture the mapping declares as design is the template's look, not demo content.
  const designSlots = designSlotsOf(kit, [kit?.contentMap, contentMap])
  for (const map of [kit?.contentMap, contentMap])
    for (const s of list(map?.slots))
      if (designSlots.has(s?.key) && typeof s.sample === 'string' && isPictureFile(s.sample))
        corpus.design.add(fileKey(s.sample))
  for (const f of corpus.design) corpus.pictures.files.delete(f)
  if (corpus.design.size) sources.designPictures = corpus.design.size

  sources.demo = [
    'demoBaseline',
    'contentMap',
    'fixedTexts',
    'companyNames',
    'sqlLiterals',
    'mediaFiles'
  ].some((k) => sources[k] > 0)
  return corpus
}
