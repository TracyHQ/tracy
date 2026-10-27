import { createHash } from 'node:crypto'

const PERSONAL_FIELDS = ['first_name', 'plan', 'last_template', 'cms', 'company', 'website']
const OPTIONAL_FIELDS = new Set(['last_template', 'cms'])
const TEMPLATE_FIELDS = new Set([...PERSONAL_FIELDS, 'invitation_url'])
const SUBJECT_CONTROLS = /[\p{Cc}\u2028\u2029]/u
const SUBJECT_MAX_BYTES = 998
const BODY_MAX_BYTES = 100 * 1024
const MAX_PARAGRAPHS = 100

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
}

function requireString(value, name, nonempty = false) {
  if (typeof value !== 'string' || (nonempty && !value.trim())) {
    throw new TypeError(`${name} must be ${nonempty ? 'a nonempty' : 'a'} string`)
  }
}

function validateSubject(subject) {
  if (SUBJECT_CONTROLS.test(subject)) throw new Error('subject must not contain controls or line separators')
  if (Buffer.byteLength(subject, 'utf8') > SUBJECT_MAX_BYTES) throw new Error('subject exceeds 998 bytes')
}

function validateLink(value, name) {
  requireString(value, name, true)
  if (SUBJECT_CONTROLS.test(value) || value.trim() !== value || !/^https:\/\//i.test(value)) {
    throw new Error(`${name} must be an HTTPS URL without controls`)
  }
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an HTTPS URL`)
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error(`${name} must be an HTTPS URL without username or password`)
  }
}

function compileText(text, whenPresent) {
  const parts = []
  let cursor = 0
  for (const match of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const literal = text.slice(cursor, match.index)
    if (/[{}]/.test(literal)) throw new Error('Malformed placeholder braces')
    const field = match[1]
    if (field === 'unsubscribe_url') throw new Error('unsubscribe_url is reserved for the system footer')
    if (!TEMPLATE_FIELDS.has(field)) throw new Error('Unknown or unsupported placeholder token')
    if (OPTIONAL_FIELDS.has(field) && whenPresent !== field) {
      throw new Error(`${field} is only allowed in its matching whenPresent paragraph`)
    }
    parts.push(literal, { field })
    cursor = match.index + match[0].length
  }
  const tail = text.slice(cursor)
  if (/[{}]/.test(tail)) throw new Error('Malformed placeholder braces')
  parts.push(tail)
  return parts
}

/**
 * Produces intermediate plain text only. System URLs must be issued by the caller;
 * syntax validation and the content hash do not authorize an invitation or a send.
 */
export function renderTemplate({ template, personalization = {}, systemLinks } = {}) {
  requireObject(template, 'template')
  requireString(template.id, 'template.id', true)
  requireString(template.version, 'template.version', true)
  requireString(template.subject, 'subject')
  validateSubject(template.subject)
  if (!Array.isArray(template.paragraphs) || template.paragraphs.length > MAX_PARAGRAPHS) {
    throw new TypeError('template.paragraphs must be an array of at most 100 paragraphs')
  }
  requireObject(personalization, 'personalization')
  const values = Object.create(null)
  for (const field of PERSONAL_FIELDS) {
    if (!Object.hasOwn(personalization, field) || personalization[field] === undefined) continue
    requireString(personalization[field], field)
    values[field] = personalization[field]
  }
  requireObject(systemLinks, 'systemLinks')
  validateLink(systemLinks.invitationUrl, 'invitationUrl')
  validateLink(systemLinks.unsubscribeUrl, 'unsubscribeUrl')

  const subjectParts = compileText(template.subject)
  const paragraphs = Array.from(template.paragraphs, (paragraph) => {
    requireObject(paragraph, 'paragraph')
    requireString(paragraph.text, 'paragraph.text')
    if (paragraph.whenPresent !== undefined && !OPTIONAL_FIELDS.has(paragraph.whenPresent)) {
      throw new Error('whenPresent must be last_template or cms')
    }
    return { parts: compileText(paragraph.text, paragraph.whenPresent), whenPresent: paragraph.whenPresent }
  })
  // Conditions and omitted tokens remain dependencies, even when absent from rendered content.
  const dependencyFields = new Set(['unsubscribe_url'])
  for (const part of subjectParts) {
    if (typeof part !== 'string') dependencyFields.add(part.field)
  }
  for (const paragraph of paragraphs) {
    if (paragraph.whenPresent) dependencyFields.add(paragraph.whenPresent)
    for (const part of paragraph.parts) {
      if (typeof part !== 'string') dependencyFields.add(part.field)
    }
  }
  const usedFields = new Set(['unsubscribe_url'])
  const isPresent = (field) => typeof values[field] === 'string' && values[field].trim().length > 0
  const renderParts = (parts) =>
    parts
      .map((part) => {
        if (typeof part === 'string') return part
        const { field } = part
        usedFields.add(field)
        if (field === 'invitation_url') return systemLinks.invitationUrl
        if (field === 'first_name' && !isPresent(field)) return 'there'
        if (!isPresent(field)) throw new Error(`Missing personalization field: ${field}`)
        return values[field]
      })
      .join('')

  const subject = renderParts(subjectParts)
  validateSubject(subject)
  const renderedParagraphs = paragraphs
    .filter((paragraph) => !paragraph.whenPresent || isPresent(paragraph.whenPresent))
    .map((paragraph) => renderParts(paragraph.parts))
  const bodyText = [...renderedParagraphs, `Unsubscribe: ${systemLinks.unsubscribeUrl}`].join('\n\n')
  if (Buffer.byteLength(bodyText, 'utf8') > BODY_MAX_BYTES) throw new Error('body exceeds 100 KiB')

  // Fixed, sorted keys make this serialization independent of input object key order.
  const canonicalContent = JSON.stringify({
    bodyText,
    subject,
    systemLinks: { invitationUrl: systemLinks.invitationUrl, unsubscribeUrl: systemLinks.unsubscribeUrl },
    templateId: template.id,
    templateVersion: template.version
  })
  return {
    subject,
    bodyText,
    usedFields: [...usedFields].sort(),
    dependencyFields: [...dependencyFields].sort(),
    templateId: template.id,
    templateVersion: template.version,
    contentHash: createHash('sha256').update(canonicalContent, 'utf8').digest('hex')
  }
}
