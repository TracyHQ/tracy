// The mechanical suspicion rules of the verify viewer: four rules, nothing more.

/** The mechanical suspicion rules, nothing more. Each returns { level, reason } or null. */
const FACTY = [
  [/\d[\d.,]*\s*(k|m)\b\+?/i, 'a figure like 100k'],
  [/\d\s*\+/, 'a number with a plus sign'],
  [/\d\s*%/, 'a percentage'],
  [/\b(19|20)\d{2}\b/, 'a year'],
  [/([$\u20ac\u00a3\u00a5\u20ab]\s?\d)|(\d\s?(usd|eur|vnd)\b)/i, 'a price']
]
const stripTags = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>|\(\(\/?[a-z][^()]*\)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function suspicion(slot, located, isFactRole) {
  const out = []
  const role = String(slot.role ?? '')
  const kind = slot.fit?.kind
  // Faces that prove a number ("5k happy members" beside a strip of faces) have their own role (ADR 0040).
  const proofFaces = role === 'stat.proof_image' && ['avatar', 'avatar-group'].includes(kind)
  if (
    slot.type === 'image' &&
    ['avatar', 'avatar-group', 'signature'].includes(kind) &&
    !/^(person|quote)\./.test(role) &&
    !proofFaces
  )
    out.push({
      rule: 1,
      level: 'red',
      reason: `Picture of kind ${kind} (a face or a signature) but the role is not person.*, quote.* or, for faces, stat.proof_image`
    })
  if (slot.type === 'text' && role.startsWith('editorial.')) {
    const hit = FACTY.find(([re]) => re.test(stripTags(slot.sample)))
    if (hit)
      out.push({
        rule: 2,
        level: 'red',
        reason: `Text looks like a real figure (${hit[1]}) but the role is editorial`
      })
  }
  if (slot.fit?.replace === 'keep' && isFactRole(role))
    out.push({
      rule: 3,
      level: 'amber',
      reason: 'Fact role but fit says keep, so real data cannot replace it'
    })
  if (slot.fit && slot.fit.measured === false && located)
    out.push({
      rule: 4,
      level: 'amber',
      reason: 'fit says not measured (measured false) but this slot is shown on the page'
    })
  return out
}
