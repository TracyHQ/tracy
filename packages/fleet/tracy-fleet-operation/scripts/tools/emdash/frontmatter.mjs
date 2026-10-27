/**
 * The YAML front matter on a `SiteContent/` file — deliberately a tiny subset, hand-written.
 *
 * ## Why not the `yaml` package
 *
 * This runs on the fleet host, next to `data.db`, where there is a bare Node and no `node_modules`.
 * Pulling a dependency in would mean an install step on every host that ever holds an emdash site,
 * for a feature whose whole job is to be dull.
 *
 * ## Why a subset is safe here rather than a shortcut
 *
 * The front matter is not free-form: it is the row's identity — id, slug, status, locale, and the
 * timestamps emdash keeps. Flat scalars, every one of them. So the risk is not "YAML we cannot
 * write", it is "YAML we write WRONG and read back as something else": a slug of `yes` becoming a
 * boolean, a title with a colon splitting into two fields, a numeric-looking id losing a leading
 * zero.
 *
 * Every value is therefore written quoted, and every value is read back as a STRING unless it was
 * explicitly written as a number, a boolean, or null. Nothing is guessed from how it looks — the
 * guessing is exactly what corrupts data here.
 */

const DELIMITER = '---'

function quote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

function serializeValue(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  return quote(value)
}

/**
 * Flat object → YAML.
 *
 * Key order is the caller's, not alphabetical: it is the order a person reads, and keeping it fixed
 * is what makes the output byte-stable — a file that reorders itself churns the diff on every Sync
 * and buries the one line that actually changed.
 */
export function stringify(data) {
  return `${Object.entries(data)
    .map(([key, value]) => `${key}: ${serializeValue(value)}`)
    .join('\n')}\n`
}

function parseValue(raw) {
  const text = raw.trim()
  if (text === 'null' || text === '') return null
  if (text === 'true') return true
  if (text === 'false') return false
  if (text.startsWith('"')) {
    return text
      .slice(1, text.endsWith('"') ? -1 : undefined)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  // Unquoted and not a keyword: a number if it is exactly one, otherwise the literal text. Written
  // by hand, most likely — read it as what it says rather than improving it.
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text
}

export function parse(yaml) {
  const data = {}
  for (const line of yaml.split('\n')) {
    if (line.trim() === '') continue
    const at = line.indexOf(':')
    if (at === -1) continue
    data[line.slice(0, at).trim()] = parseValue(line.slice(at + 1))
  }
  return data
}

/** `---\n<yaml>---\n\n<body>` → the two halves. A file with no front matter is all body. */
export function splitFile(contents) {
  const text = contents.replace(/\r\n/g, '\n')
  if (!text.startsWith(`${DELIMITER}\n`)) return { data: {}, body: text }
  const end = text.indexOf(`\n${DELIMITER}\n`, DELIMITER.length)
  if (end === -1) return { data: {}, body: text }
  return {
    data: parse(text.slice(DELIMITER.length + 1, end + 1)),
    body: text.slice(end + DELIMITER.length + 2).replace(/^\n/, '')
  }
}

export function serializeFile(data, body) {
  return `${DELIMITER}\n${stringify(data)}${DELIMITER}\n\n${body.replace(/\n*$/, '')}\n`
}
