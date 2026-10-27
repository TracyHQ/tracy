#!/usr/bin/env node
/**
 * Regenerate TRANSLATION.md from the bundled dictionaries.
 *
 * Reads every `src/client/dictionaries/*.ts` (one `{ ns: { key: text } }`
 * per language) and writes a per-namespace translation table to
 * TRANSLATION.md at the plugin root. Run after editing any dictionary:
 *
 *   node scripts/generate-translation-md.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DICT_DIR = join(ROOT, 'src', 'client', 'dictionaries')
const OUT_FILE = join(ROOT, 'TRANSLATION.md')

const LANG_ORDER = [
  'ar', 'de', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl',
  'pl', 'pt', 'ru', 'sv', 'th', 'tr', 'vi', 'zh-HK', 'zh-MO', 'zh-TW',
]

const NS_RE = /^ {0,3}(?:'([^']+)'|([A-Za-z_][\w.-]*)): \{/
const ENTRY_RE = /^ {1,8}(?:'([^']*)'|([A-Za-z_][\w.-]*)): '((?:[^'\\]|\\.)*)',?$/
const CLOSE_RE = /^\s*},?\s*$/

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function parseDicts(text) {
  const dicts = {}
  let ns = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.startsWith('/') || line.trim().startsWith('*')) continue
    const nsMatch = line.match(NS_RE)
    if (nsMatch) { ns = nsMatch[1] ?? nsMatch[2]; if (!dicts[ns]) dicts[ns] = {}; continue }
    if (ns && CLOSE_RE.test(line)) { ns = null; continue }
    if (!ns) continue
    const entry = line.match(ENTRY_RE)
    if (entry) dicts[ns][entry[1] ?? entry[2]] = entry[3]
  }
  return dicts
}

function looksLikeEntry(line) {
  return /^ {1,8}(?:'[^']*'|[A-Za-z_][\w.-]*): '/.test(line)
}

const langs = {}
const warnings = []
for (const file of readdirSync(DICT_DIR)) {
  if (!file.endsWith('.ts')) continue
  const lang = basename(file, '.ts')
  const text = readText(join(DICT_DIR, file))
  const parsed = parseDicts(text)
  const parsedCount = Object.values(parsed).reduce((n, d) => n + Object.keys(d).length, 0)
  const entryLike = text.split(/\r?\n/).filter((l) => looksLikeEntry(l)).length
  if (entryLike !== parsedCount) {
    warnings.push(`${file}: ${entryLike} entry-like lines parsed to ${parsedCount}`)
  }
  langs[lang] = parsed
}
const langIds = LANG_ORDER.filter((l) => langs[l])

const nsSet = new Set()
for (const d of Object.values(langs)) for (const ns of Object.keys(d)) nsSet.add(ns)
const namespaces = [...nsSet].sort()

function cell(text) {
  if (text === undefined) return '—'
  return String(text).replace(/\\n/g, '<br>').replace(/\|/g, '\\|')
}

function unionKeys(ns) {
  const keys = new Set()
  for (const lang of langIds) {
    const d = langs[lang][ns]
    if (d) for (const k of Object.keys(d)) keys.add(k)
  }
  return [...keys].sort()
}

function coverageTable() {
  let total = 0
  for (const ns of namespaces) total += unionKeys(ns).length
  const rows = langIds.map((lang) => {
    let present = 0
    for (const ns of namespaces) {
      const d = langs[lang][ns]
      if (d) present += Object.keys(d).length
    }
    const pct = total ? ((present / total) * 100).toFixed(1) : '0.0'
    return `| ${lang} | ${present} | ${total - present} | ${pct}% |`
  })
  return { total, rows }
}

function nsTable(ns) {
  const keys = unionKeys(ns)
  const head = ['Key', ...langIds]
  const sep = head.map((h) => '-'.repeat(Math.max(3, h.length)))
  const lines = [
    `### ${ns}（${keys.length} 条）`,
    '',
    `| ${head.join(' | ')} |`,
    `|${sep.join('|')}|`,
  ]
  for (const key of keys) {
    const vals = langIds.map((lang) => cell(langs[lang][ns]?.[key]))
    lines.push(`| ${cell(key)} | ${vals.join(' | ')} |`)
  }
  return lines.join('\n')
}

const { total, rows } = coverageTable()

const out = []
out.push('# TRANSLATION.md — 翻译对照表', '')
out.push(
  '> 自动生成，勿手改。修改 `src/client/dictionaries/*.ts` 后，',
  '> 执行 `node scripts/generate-translation-md.mjs` 重新生成。',
  `> 覆盖 ${langIds.length} 种第三方语言的 DSH 内置命名空间（DSH 原生 zh/en 词典不在本表内）。`,
  ''
)
out.push('## 覆盖统计', '')
out.push('| 语言 | 条目数 | 缺失 | 覆盖率 |', '|---|---:|---:|---:|', ...rows)
out.push('')
out.push(`合计：**${namespaces.length} 个命名空间 / ${total} 条 key**（跨 ${langIds.length} 语言）。`, '')
out.push('## 命名空间', '')
for (const ns of namespaces) out.push(nsTable(ns), '')

writeFileSync(OUT_FILE, out.join('\n'), 'utf8')
console.log(`Wrote ${OUT_FILE} (${namespaces.length} namespaces, ${total} keys × ${langIds.length} langs)`)
for (const w of warnings) console.warn(`WARN: ${w}`)
process.exitCode = warnings.length ? 1 : 0