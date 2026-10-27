// The seed's language rows are what a site in that language shows (a FULL or BLANK site built in
// Vietnamese takes the `vi` row, then swaps the name). Three leftovers measured on the g60 build
// (11/10/2026, TCH #1013, LANG-2/LANG-6) were all in the rows themselves:
// - an English phrase copied over unchanged ("NORTHGATE · INDUSTRY DIGEST" on /kit/newsletter);
// - a date with an English month ("28 Jul 2026" on /kit/style-guide);
// - two words glued at a link ("được mô tả trong" + link "Chính sách bảo mật" printed
//   "trongChính sách bảo mật" on /terms): the translation of the span before the link lost its
//   trailing space.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'))

/** Every [row, en row] pair of the seed's content. */
function pairs() {
  const out = []
  for (const [collection, rows] of Object.entries(seed.content)) {
    const en = new Map(rows.filter((r) => r.locale === 'en').map((r) => [r.slug ?? r.id, r]))
    for (const row of rows)
      if (row.locale !== 'en') out.push({ collection, row, en: en.get(row.slug ?? row.id) })
  }
  return out
}

/** Every string leaf of a value, with its path. */
function leaves(value, at = '', out = []) {
  if (typeof value === 'string') out.push([at, value])
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) leaves(v, at ? `${at}.${k}` : k, out)
  return out
}

/** The leaf at a dotted path, or undefined. */
const at = (value, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), value)

// Leaves that are the same in every language on purpose: people, places, companies, addresses,
// mail, tickers, font and tool names, the credit line; and a word that is the language's own too.
const SAME_EVERYWHERE = [
  /^\$ref:/,
  /^kit-[a-z-]+$/,
  /@[\w-]+\.\w+/,
  /^[\w.-]+\.(ru|com)\//,
  /^© \d{4} Northgate Industrial JSC\. EmDash CMS Template by Tracy/,
  /^(Andrey Kulagin|Igor Meshcheryakov|Olga Barsukova|Sergey Trofimov)$/,
  /^(Nizhny Novgorod|Nizhny Tagil|Lipetsk SEZ|Shushary, St Petersburg|Elektra JSC|MOEX · NGIN)$/,
  /^[\d,]+ m² · /,
  /^Lipetsk SEZ, 6 Tekhnologichesky proezd/,
  /^Litmus: Outlook 2016\+, Mail\.ru, Yandex$/,
  /^newsletter-top, newsletter-body$/,
  /^Archivo \+ Newsreader$/
]
const SAME_IN = {
  ca: ['{count} articles'],
  fr: ['{count} articles', 'Logos (SVG, PNG, EPS)'],
  cy: ['Logos (SVG, PNG, EPS)', 'Moscow / hybrid'],
  de: ['Logos (SVG, PNG, EPS)'],
  hr: ['LOD 350 BIM model'],
  sv: ['Regional expansion'],
  // A finance term written in English in these languages' own investor pages.
  ru: ['Free float'],
  cs: ['Free float'],
  nl: ['Free float'],
  pl: ['Free float'],
  pt: ['Free float'],
  ro: ['Free float']
}

test('no language row keeps an English phrase of the English row', () => {
  const left = []
  for (const { collection, row, en } of pairs()) {
    if (!en) continue
    for (const [path, text] of leaves(row.data)) {
      if (text !== at(en.data, path)) continue
      const words = text.replace(/Northgate( Industrial( JSC)?)?/g, ' ').match(/\b[A-Za-z]{3,}\b/g) ?? []
      if (words.length < 2 || /^(https?:|\/|#|mailto:)/.test(text)) continue
      if (SAME_EVERYWHERE.some((re) => re.test(text)) || SAME_IN[row.locale]?.includes(text)) continue
      left.push(`${row.locale} ${collection}/${row.slug ?? row.id} ${path}: ${text}`)
    }
  }
  assert.deepEqual(left, [])
})

const EN_MONTH =
  /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\b\.? \d{4}\b/g

/** The month names a language writes itself (short and long), lowercased, dots dropped. */
function ownMonths(locale) {
  const out = new Set()
  for (const month of ['short', 'long'])
    for (let m = 0; m < 12; m += 1)
      out.add(
        new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' })
          .format(Date.UTC(2026, m, 15))
          .replace(/\./g, '')
          .toLowerCase()
      )
  return out
}

test('a date in a language row uses that language’s month names', () => {
  const wrong = []
  for (const { collection, row } of pairs()) {
    const own = ownMonths(row.locale)
    for (const [path, text] of leaves(row.data))
      for (const m of text.matchAll(EN_MONTH))
        if (!own.has(m[1].toLowerCase()))
          wrong.push(`${row.locale} ${collection}/${row.slug ?? row.id} ${path}: ${m[0]}`)
  }
  assert.deepEqual(wrong, [])
})

// Scripts written without spaces between words: a span boundary there needs none.
const UNSPACED = new Set(['zh', 'ja', 'th', 'lo'])

test('the words on both sides of a link keep their space', () => {
  const glued = []
  for (const { collection, row } of pairs()) {
    if (UNSPACED.has(row.locale)) continue
    const walk = (v) => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (!v || typeof v !== 'object') return
      if (v._type === 'block' && Array.isArray(v.children))
        for (let i = 0; i + 1 < v.children.length; i += 1) {
          const [a, b] = [v.children[i].text ?? '', v.children[i + 1].text ?? '']
          if (/[\p{L}\p{N}]$/u.test(a) && /^[\p{L}\p{N}]/u.test(b))
            glued.push(
              `${row.locale} ${collection}/${row.slug ?? row.id}: …${a.slice(-16)}|${b.slice(0, 16)}`
            )
        }
      Object.values(v).forEach(walk)
    }
    walk(row.data)
  }
  assert.deepEqual(glued, [])
})

// 🔒 ONE ENGLISH WORD IS STILL ENGLISH (g62, TCH #1013, LANG-2). The test above reads phrases of two words or more, so the
// kit's colour names ("Ink", "Paper", "Forest", "Signal" on /kit/slides) and "ZIP · 4 MB", "Archivo + Newsreader",
// "Litmus: …" stayed English on a site in Vietnamese (audit english-left, g61-biz-emd-full). In a language whose words carry
// letters English has not (Vietnamese marks, another script), a leaf the English row shares is English unless it is a name,
// a code or a loanword that language writes as English does.
const OWN_LETTERS = {
  vi: /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i,
  ru: /\p{Script=Cyrillic}/u,
  uk: /\p{Script=Cyrillic}/u,
  be: /\p{Script=Cyrillic}/u,
  bg: /\p{Script=Cyrillic}/u,
  el: /\p{Script=Greek}/u,
  ka: /\p{Script=Georgian}/u,
  ta: /\p{Script=Tamil}/u,
  th: /\p{Script=Thai}/u,
  lo: /\p{Script=Lao}/u,
  ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  zh: /\p{Script=Han}/u
}
// Names and codes every language writes in Latin letters: networks, file formats, standards, tickers, cities and people
// of the demo company, the client logo placeholders; and the loanwords Vietnamese writes as English does.
const NAMES = [
  /^(Telegram|LinkedIn|YouTube|Dzen|VK|hh\.ru|NORTHGATE|Northgate Industrial)$/,
  /^(PDF|XLSX|EBITDA|M&E)$/,
  /^(PDF|XLSX) · [\d.]+ [KM]B$/,
  /^ZIP · [\d.]+ [KM]B$/,
  /^ISO \d+(:\d{4})?$/,
  /^Logo \d$/,
  /^(Moscow|Kazan|Kaluga|Lipetsk|Obninsk|Noginsk|Novosibirsk|Yekaterinburg|Chelyabinsk|Vorsino IP|Elektra JSC|A\. Sokolova)$/,
  /^[\d.,]+ m² · /,
  /^Shushary, St Petersburg$/,
  /^RUB [\d.,–\s]+(bn|M)?$/
]
const LOANS = { vi: [/^Logistics( · \d{4})?$/], el: [/^Logistics( · \d{4})?$/] }
// Names a language still says in its own words around them: Vietnamese writes "PDF" as its own but reads "ZIP" as English
// (the built-site audit's loanwords), so its row says "Tệp ZIP · 4 MB"; and it joins two font names or a tool's list with
// its own "và" ("Archivo và Newsreader", "Bằng Litmus: …").
const NOT_A_NAME_IN = { vi: [/^ZIP · /, /^Archivo \+ Newsreader$/, /^Litmus: /] }
// Machine values the template reads, never prints: block types, styles, slots, sectors, template names.
const MACHINE = /^(_type|_key|style|listItem|template|sector|key|layout|variant|fit|kind|slot|icon)$/

test('a language with its own letters keeps no English word of the English row, one word included', () => {
  const left = []
  for (const { collection, row, en } of pairs()) {
    const own = OWN_LETTERS[row.locale]
    if (!en || !own) continue
    for (const [path, text] of leaves(row.data)) {
      if (text !== at(en.data, path) || own.test(text)) continue
      if (MACHINE.test(path.split('.').pop() ?? '') || !/[A-Za-z]{3,}/.test(text)) continue
      if (/^(https?:|\/|#|mailto:|\$ref:|@|rgba?\()/.test(text) || /@|^[\w.-]+\.(ru|com)(\/|$)/.test(text))
        continue
      if (/^[a-z][\w-]*$/.test(text) || /^[a-z]+[A-Z]\w*$/.test(text)) continue
      // 🔒 AN ADDRESS LINE IS WORDS AROUND NAMES, NEVER A NAME AS A WHOLE (g63, TCH #1013, LANG-2). The vi row kept
      // "Lipetsk SEZ, 6 Tekhnologichesky proezd · +7 …" whole because the line was listed with the names, and a Vietnamese
      // site printed it in English beside "Xưởng chế tạo, Zavolzhye IP" (g62-biz-emd-full /contact). A line that carries a
      // phone number is judged by its words: the place and street names stay, "SEZ" and "Fabrication yard" are translated.
      const addressLine = /\s·\s\+\d/.test(text)
      const named =
        !addressLine &&
        [...SAME_EVERYWHERE, ...NAMES].some((re) => re.test(text)) &&
        !(NOT_A_NAME_IN[row.locale] ?? []).some((re) => re.test(text))
      if (
        named ||
        SAME_IN[row.locale]?.includes(text) ||
        (LOANS[row.locale] ?? []).some((re) => re.test(text))
      )
        continue
      left.push(`${row.locale} ${collection}/${row.slug ?? row.id} ${path}: ${text}`)
    }
  }
  assert.deepEqual(left, [])
})

// 🔒 AN ADDRESS'S CAPITALISED COMMON NOUNS ARE WORDS, NOT PART OF A NAME (final round 12/10, TCH #1013, LANG-2). The vi row
// still printed "Vorsino Industrial Park, lô 12" on /contact and on the Vietnamese /terms and /privacy (FULL keeps the
// template's legal text, decision (2) of 12/10), and "7/22 Derbenevskaya emb., tầng 8" in its branches; most language
// rows kept "Vorsino Industrial Park, plot 12, Borovsk District, Kaluga Region" in their legal pages. The tests above
// read only leaves equal to the English row, and a line half translated ("lô 12") is not. Same idea as personalize's
// ADDRESS_NOUNS: an English address noun written with a capital after a name ("Industrial Park", "Borovsk District",
// "Kaluga Region") or the English abbreviation "emb." is English in any other language's row.
const ADDRESS_HEADS =
  /(?<!\p{L})(\p{Lu}\p{Ll}+) (Park|District|Region|Province|County|Territory|Zone|Estate|Street|Road|Avenue|Boulevard|Lane|Square|Embankment|Quay|Highway)(?!\p{L})/gu
const ADDRESS_ABBREVIATIONS = /(?<!\p{L})\p{Lu}\p{Ll}+ (emb|str|ave|blvd|rd)\.(?=[\s,])/gu
// The language's own words that look so: Hungarian writes "Ipari Park" (industrial park) with English's "Park", German
// capitalises its own noun "Region" ("Andere Region", a form choice).
const OWN_ADDRESS_WORDS = { hu: ['Ipari Park'], de: ['Andere Region'] }

test('no language row keeps a capitalised English address noun or abbreviation', () => {
  const left = []
  for (const { collection, row } of pairs())
    for (const [path, text] of leaves(row.data))
      for (const m of [...text.matchAll(ADDRESS_HEADS), ...text.matchAll(ADDRESS_ABBREVIATIONS)])
        if (!(OWN_ADDRESS_WORDS[row.locale] ?? []).includes(m[0]))
          left.push(`${row.locale} ${collection}/${row.slug ?? row.id} ${path}: ${m[0]}`)
  assert.deepEqual(left, [])
})
