// The Joomla part of the secret scan (ticket #586): what is secret in a Joomla demo database and a Joomla site's
// files, wherever its shape. In a dump (`installation/sql/mysql/custom.sql`): any row of the tables that hold people
// or their sessions and keys; an account whose password is not a placeholder; every secret setting the blank site step
// knows (`findSecrets`: a secret-named key in a `params` JSON, a directory service login, a secret-named row of a
// settings table); and every cell of every row through the value-shape rules. In the files: a shipped
// `configuration.php`, and a non-empty `$secret`, `$password`, `$smtppass`, `$smtpuser` or `$proxy_pass` in any
// configuration file. A finding is `{file, at, rule, fingerprint}`; the value is hashed, never kept.
import { findSecrets } from '../../../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-secrets.mjs'
import {
  parseDump,
  records,
  updates
} from '../../../../packages/cms/tracy-joomla-quickstart/scripts/joomla-sql-dump.mjs'
import { fingerprintOf, matchRules } from '../secret-rules.mjs'

/** Tables whose every row is a person's data, a session or a key. */
export const PRIVATE_TABLES = Object.freeze(
  (
    'session user_keys user_profiles user_mfa user_notes webauthn_credentials action_logs action_logs_users messages ' +
    'privacy_requests privacy_consents acym_user acym_queue'
  ).split(' ')
)
/** A password that stands for no password: an account that cannot log in with one. */
const NO_PASSWORD = new Set(['', '*', '!', 'x', 'blocked'])
/** Configuration keys that hold a credential or the site secret. */
const CONFIG_KEYS = ['secret', 'password', 'smtppass', 'smtpuser', 'proxy_pass']

/**
 * How a finding names its row: the numeric `id` (or numeric first column), else its place in the table (`@3`). A
 * session's key is the session token itself, so a key that is no number never names a row.
 */
const idOf = (part, r, n) => {
  const key = r[part.columns.includes('id') ? 'id' : part.columns[0]]
  return /^\d+$/.test(String(key ?? '')) ? key : '@' + n
}

/** The values a `params` JSON text holds under a key, joined: what a setting finding is fingerprinted by. */
function paramsValue(json, key) {
  const found = []
  const walk = (v, k) => {
    if ((typeof v === 'string' || typeof v === 'number') && k === key) found.push(String(v))
    else if (v && typeof v === 'object')
      for (const [kk, vv] of Object.entries(v)) walk(vv, Array.isArray(v) ? k : kk)
  }
  try {
    walk(JSON.parse(json), '')
  } catch {
    return json
  }
  return found.join('\n')
}

/** The value a `findSecrets` entry names, read again from the dump, so the finding carries its fingerprint. */
function settingValue(dump, s) {
  for (const part of dump.parts) {
    if (part.kind !== 'insert' || part.table !== s.table) continue
    for (const r of records({ parts: [part] }, part.table)) {
      if (part.columns.includes(s.key) && Object.values(r).includes(s.row)) return r[s.key]
      if (String(r[part.columns[0]]) === s.row && r.params != null) return paramsValue(r.params, s.key)
    }
  }
  const u = updates(dump).find((x) => x.table === s.table && String(x.id ?? 'update') === s.row)
  return u ? u.text : s.table + '#' + s.row + '.' + s.key
}

/** The findings of a Joomla SQL dump. */
export function joomlaSqlFindings(file, sql, rules) {
  const dump = parseDump(sql)
  const out = []
  const add = (at, rule, value) => out.push({ file, at, rule, fingerprint: fingerprintOf(value) })
  const ordinal = new Map()
  for (const part of dump.parts) {
    if (part.kind === 'update') {
      for (const m of matchRules(part.text, rules))
        out.push({
          file,
          at: 'update:' + part.table + '#' + (part.id ?? '?'),
          rule: m.rule,
          fingerprint: m.fingerprint
        })
      continue
    }
    if (part.kind !== 'insert') continue
    for (const r of records({ parts: [part] }, part.table)) {
      ordinal.set(part.table, (ordinal.get(part.table) ?? 0) + 1)
      const id = idOf(part, r, ordinal.get(part.table))
      if (PRIVATE_TABLES.includes(part.table))
        add(part.table + '#' + id, 'joomla_private_row', JSON.stringify(r))
      if (part.table === 'users' && !NO_PASSWORD.has(String(r.password ?? '')))
        add('users#' + id + '.password', 'joomla_account_password', r.password)
      for (const column of part.columns)
        for (const m of matchRules(r[column], rules))
          out.push({
            file,
            at: part.table + '#' + id + '.' + column,
            rule: m.rule,
            fingerprint: m.fingerprint
          })
    }
  }
  for (const s of findSecrets(dump))
    add(s.table + '#' + s.row + '.' + s.key, 'joomla_setting_secret', settingValue(dump, s))
  return out
}

// The site's own configuration at the root of the webroot (or the installer's sample of it), not an extension's file of
// the same name (`com_acym/classes/configuration.php`).
const CONFIG_FILE = /^(?:installation\/)?configuration\.php(?:-dist)?$/
const configValue = (text, key) =>
  new RegExp('\\$' + key + '\\s*=\\s*(?:\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")').exec(text)

/** The findings of a Joomla file other than a dump: a shipped configuration and the credentials in it. */
export function joomlaFileFindings(file, text) {
  const name = file.split('!').at(-1)
  if (!CONFIG_FILE.test(name)) return []
  const out = []
  if (name === 'configuration.php')
    out.push({
      file,
      at: 'configuration.php',
      rule: 'joomla_configuration_shipped',
      fingerprint: fingerprintOf(text)
    })
  for (const key of CONFIG_KEYS) {
    const m = configValue(text, key)
    const value = m ? (m[1] ?? m[2]) : ''
    if (value)
      out.push({
        file,
        at: 'configuration.php:$' + key,
        rule: 'joomla_configuration_secret',
        fingerprint: fingerprintOf(value)
      })
  }
  return out
}

/** The adapter the scan takes: which files are dumps, and the findings of each kind of file. */
export const joomlaSecrets = Object.freeze({
  cms: 'joomla',
  // The demo data of an installer, or a dump given on its own; the installer's other SQL files are schema, read as text.
  isDump: (name) =>
    /(?:^|[/!])installation\/sql\/[^/]+\/custom\.sql$/.test(name) || /^[^!]*\.sql$/.test(name),
  sql: joomlaSqlFindings,
  file: joomlaFileFindings
})
