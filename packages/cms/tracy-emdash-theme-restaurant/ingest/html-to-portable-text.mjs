#!/usr/bin/env node
// Turns the HTML of every `portableText` field of seed/seed.json into Portable Text blocks (SF-15: compile-seed writes
// `prose` fields as the raw HTML string even when compile.config.json types the field `portableText`).
//   node ingest/html-to-portable-text.mjs <seed/seed.json>
// Also turns the `<br>` of five short plain-text fields into newlines (PLAIN). Handles what the source bodies use: p, h1-h6, blockquote, ul/ol/li, strong/b, em/i, a, br. Any other tag is
// dropped but its text kept; the counts are printed. Keys are deterministic (`b<n>`/`s<n>`), so a rerun writes the same seed.
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: html-to-portable-text.mjs <seed.json>')
  process.exit(2)
}
const seed = JSON.parse(readFileSync(file, 'utf8'))
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      )
    return ENT[e.toLowerCase()] ?? m
  })
// Short plain-text fields the source filled with `<br>`: a line break becomes a newline, the other tags go.
const PLAIN = [
  'hero.hero_heading',
  'teams.section_intro',
  'happyhours.hp_info',
  'happyhours.hp_desc',
  'happyhours.hp_other_info'
]
export const plainText = (html) =>
  decode(
    String(html)
      .replace(/\s*<br\s*\/?>\s*/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
const BLOCK = {
  p: 'normal',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  blockquote: 'blockquote'
}
const dropped = new Set()

export function htmlToPortableText(html) {
  let n = 0
  const blocks = []
  let cur = null
  let marks = []
  let defs = []
  let list = []
  const key = (p) => `${p}${++n}`
  const open = (style, extra = {}) => {
    cur = { _type: 'block', _key: key('b'), style, markDefs: [], children: [], ...extra }
    defs = cur.markDefs
  }
  const close = () => {
    if (!cur) return
    const kids = cur.children
    if (kids.length) kids[kids.length - 1].text = kids[kids.length - 1].text.replace(/\s+$/, '')
    if (kids.length) kids[0].text = kids[0].text.replace(/^\s+/, '')
    cur.children = kids.filter((c) => c.text !== '')
    if (cur.children.length) blocks.push(cur)
    cur = null
  }
  const text = (t) => {
    if (!t) return
    if (!cur)
      open(
        list.length ? 'normal' : 'normal',
        list.length ? { listItem: list[list.length - 1], level: list.length } : {}
      )
    cur.children.push({ _type: 'span', _key: key('s'), text: t, marks: marks.map((m) => m.mark) })
  }
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi
  let m
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      text(decode(m[4]).replace(/\s+/g, ' '))
      continue
    }
    const [, slash, rawTag, attrs] = m
    const tag = rawTag.toLowerCase()
    if (BLOCK[tag]) {
      close()
      if (!slash) open(BLOCK[tag])
    } else if (tag === 'ul' || tag === 'ol') {
      close()
      if (slash) list.pop()
      else list.push(tag === 'ul' ? 'bullet' : 'number')
    } else if (tag === 'li') {
      close()
      if (!slash)
        open('normal', { listItem: list[list.length - 1] ?? 'bullet', level: Math.max(list.length, 1) })
    } else if (tag === 'br') {
      text('\n')
    } else if (tag === 'strong' || tag === 'b') {
      slash
        ? (marks = marks.filter((x) => x.tag !== 'strong'))
        : marks.push({ tag: 'strong', mark: 'strong' })
    } else if (tag === 'em' || tag === 'i') {
      slash ? (marks = marks.filter((x) => x.tag !== 'em')) : marks.push({ tag: 'em', mark: 'em' })
    } else if (tag === 'a') {
      if (slash) marks = marks.filter((x) => x.tag !== 'a')
      else {
        const href = decode(attrs.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? '')
        if (!cur) open('normal')
        const id = key('l')
        defs.push({ _type: 'link', _key: id, href })
        marks.push({ tag: 'a', mark: id })
      }
    } else dropped.add(tag)
  }
  close()
  return blocks
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fields = new Map()
  for (const c of seed.collections ?? [])
    for (const f of c.fields ?? []) if (f.type === 'portableText') fields.set(`${c.slug}.${f.slug}`, true)
  let converted = 0
  for (const [coll, list] of Object.entries(seed.content ?? {}))
    for (const e of list)
      for (const [k, v] of Object.entries(e.data ?? {}))
        if (fields.has(`${coll}.${k}`) && typeof v === 'string') {
          e.data[k] = htmlToPortableText(v)
          converted++
        } else if (PLAIN.includes(`${coll}.${k}`) && typeof v === 'string') {
          e.data[k] = plainText(v)
          converted++
        }
  writeFileSync(file, JSON.stringify(seed, null, '\t').replace(/\n$/, '') + '\n')
  console.log(
    `html-to-portable-text: fields=${fields.size} converted=${converted} droppedTags=${[...dropped].join(',') || 'none'}`
  )
}
