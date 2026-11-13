/**
 * The files the blank site step `empty-declared-fields` writes into the installer (ticket #584): the template's local
 * Site settings and global settings, and the site language overrides. Pure: the places to empty and an archive
 * reader in, `[name, Buffer]` pairs out, in a fixed order, so the same input gives the same bytes.
 *
 * T4 reads `templates/<tpl>/local/etc/<file>` instead of the shipped `etc/<file>` when it exists, without merging, so
 * each local file is the whole shipped file with the places emptied and the setting overrides applied. That is also
 * where the Claude Cowork plugin writes a Site setting (`siteSetting` entities). A language override file holds the
 * key of every template string a field fills, empty, then every language override with a value; Joomla reads
 * `language/overrides/<tag>.override.ini` over the shipped strings.
 */

/** JSON the way PHP's json_encode writes it (the form T4 and Joomla write): escaped slashes, ASCII only. */
export function phpJson(value) {
  return JSON.stringify(value)
    .replace(/\//g, '\\/')
    .replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

const iniValue = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

function readJson(readFile, name) {
  const buf = readFile(name)
  if (!buf) throw new Error(`${name} is not in the installer: the local file cannot be written`)
  return JSON.parse(buf.toString('utf8'))
}

/** Set `value` at `path` of `doc`, the parent objects existing. */
function setAt(doc, path, value) {
  let holder = doc
  for (const s of path.slice(0, -1)) holder = holder[s] ??= {}
  holder[path.at(-1)] = value
}

/** The local Site settings files: per template and profile, the shipped file with its places and overrides set. */
function siteSettingFiles({ mapping, places, readFile }) {
  const byFile = new Map()
  const put = (entity, value) => {
    const { template, profile, key } = entity.identity
    const name = `templates/${template}/etc/site/${profile}.json`
    byFile.set(name, [...(byFile.get(name) ?? []), [key, value]])
  }
  for (const loc of places) {
    const e = mapping.entities?.[loc.entity]
    if (e?.kind === 'siteSetting') put(e, '')
  }
  for (const o of mapping.overrides?.settings ?? []) {
    const e = mapping.entities?.[o.location?.entity]
    if (e?.kind === 'siteSetting') put(e, o.value)
  }
  return [...byFile].sort().map(([name, sets]) => {
    const doc = readJson(readFile, name)
    for (const [key, value] of sets) doc[key] = value
    return [name.replace('/etc/site/', '/local/etc/site/'), Buffer.from(phpJson(doc), 'utf8')]
  })
}

/** The local global settings files: the shipped etc/global.json with the setting overrides applied. */
function templateGlobalFiles({ mapping, readFile }) {
  const byFile = new Map()
  for (const o of mapping.overrides?.settings ?? []) {
    const e = mapping.entities?.[o.location?.entity]
    if (e?.kind !== 'templateGlobal') continue
    const name = `templates/${e.identity.template}/etc/global.json`
    byFile.set(name, [...(byFile.get(name) ?? []), o])
  }
  return [...byFile].sort().map(([name, overrides]) => {
    const doc = readJson(readFile, name)
    for (const o of overrides) setAt(doc, o.location.jsonPath ?? [o.location.column], o.value)
    return [name.replace('/etc/global.json', '/local/etc/global.json'), Buffer.from(phpJson(doc), 'utf8')]
  })
}

/** The site language override files: emptied template strings, then the overrides with a value. */
function languageFiles({ mapping, places }) {
  const byTag = new Map()
  const put = (tag, key, value) => {
    const lines = byTag.get(tag) ?? new Map()
    lines.set(key, value)
    byTag.set(tag, lines)
  }
  for (const loc of places) {
    const e = mapping.entities?.[loc.entity]
    if (e?.kind !== 'languageString') continue
    if (loc.xpath && loc.xpath !== '/html/body/div')
      throw new Error(`${loc.slot}: a template string is emptied whole; its xpath names a piece`)
    put(e.identity.language, e.identity.key, '')
  }
  for (const o of mapping.overrides?.language ?? [])
    if (typeof o.value === 'string') put(o.language ?? 'en-GB', o.key, o.value)
  return [...byTag]
    .sort()
    .map(([tag, lines]) => [
      `language/overrides/${tag}.override.ini`,
      Buffer.from(`${[...lines].map(([k, v]) => `${k}=${iniValue(v)}`).join('\n')}\n`, 'utf8')
    ])
}

/** Every file the step writes, `[name, Buffer]`, in name order. */
export function emptiedFiles(input) {
  return [...siteSettingFiles(input), ...templateGlobalFiles(input), ...languageFiles(input)].sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
  )
}
