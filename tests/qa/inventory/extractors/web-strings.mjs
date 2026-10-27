// tracy-web strings: English keys (AST of strings.js) crossed with the languages of
// @tracy/core/interface-languages; presence of each key in locales/<lang>.json is recorded as a fact.
import {
  cli,
  findConst,
  isMain,
  parse,
  parseJson,
  readSource,
  record,
  staticValue,
  topLevelConsts,
  SourceError
} from './common.mjs'
import { def as languages } from './languages.mjs'

const SRC = 'apps/tracy-web/src/lib/i18n/strings.js'
const LOCALES = 'apps/tracy-web/src/lib/i18n/locales'

export const def = {
  sourcePath: SRC,
  extractionKind: 'ast-object-literal x locale-json',
  extract(root) {
    const src = readSource(root, SRC)
    const sf = parse(src.text, SRC)
    const init = findConst(sf, 'en')
    if (!init) throw new SourceError('export const en not found')
    const ctx = { consts: topLevelConsts(sf), unresolved: [], sf, blocking: true }
    const en = staticValue(init, ctx)
    if (!en || typeof en !== 'object' || Array.isArray(en))
      throw new SourceError('en is not an object literal (a flat key -> string table is required)')
    const langRec = languages.extract(root)
    const codes = langRec.items.map((l) => l.code).filter((c) => c !== 'en')
    const read = [src, ...langRec.inputs.map((i) => ({ rel: i.path, hash: i.hash }))]
    const locales = new Map()
    // The language list is a source of this record: whatever it could not resolve stays visible and blocking here.
    const unresolved = [
      ...ctx.unresolved,
      ...langRec.unresolved.map((u) => ({ ...u, detail: `languages source: ${u.detail}` }))
    ]
    if (langRec.items.length === 0)
      unresolved.push({
        kind: 'languages-empty',
        detail: 'no interface language resolved',
        blocksComplete: true
      })
    for (const code of codes) {
      try {
        const file = readSource(root, `${LOCALES}/${code}.json`)
        read.push(file)
        const table = parseJson(file)
        // A locale file is a flat key -> string table; null, an array or a scalar is a broken source, not an
        // empty table (which would silently mark every key absent).
        if (!table || typeof table !== 'object' || Array.isArray(table))
          throw new SourceError(`${LOCALES}/${code}.json is not an object table`)
        if (Object.values(table).some((v) => typeof v !== 'string'))
          unresolved.push({
            kind: 'locale-entry-not-a-string',
            detail: `${code}: ${Object.entries(table)
              .filter(([, v]) => typeof v !== 'string')
              .map(([k]) => k)
              .slice(0, 5)
              .join(', ')}`,
            blocksComplete: true
          })
        locales.set(code, table)
      } catch (error) {
        unresolved.push({
          kind: 'locale-file-unreadable',
          detail: `${code}: ${error.message}`,
          blocksComplete: true
        })
      }
    }
    // `en` is a flat key -> string table: a non-string value keeps its key but blocks "complete".
    const badEn = Object.keys(en).filter((k) => typeof en[k] !== 'string')
    if (badEn.length)
      unresolved.push({
        kind: 'en-entry-not-a-string',
        detail: badEn.slice(0, 5).join(', '),
        blocksComplete: true
      })
    const keys = Object.keys(en).sort()
    const items = []
    for (const key of keys) {
      items.push({ id: `web-string:${key}@en`, kind: 'web-string', key, language: 'en', present: true })
      for (const code of codes) {
        const table = locales.get(code)
        items.push({
          id: `web-string:${key}@${code}`,
          kind: 'web-string',
          key,
          language: code,
          present: table ? typeof table[key] === 'string' : false
        })
      }
    }
    return record({
      sourcePath: SRC,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes: { keys: keys.length, languages: codes.length + 1 }
    })
  }
}
if (isMain(import.meta.url)) cli(def)
