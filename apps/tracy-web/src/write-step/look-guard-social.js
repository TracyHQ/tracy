// The look guard's one exception on words (ADR 0044, decision 10, card AB). A person card's cell that holds only social icon links
// on the demo, for a person the brief gives no social account, takes that person's words instead (their role, say), and the icons
// go. The product owner accepted it: there is no account to link, and a row of dead icons is worse than a role. Only the classes the
// icons lose are let through; any other finding on the cell, or a cell whose person has an account, stays a finding. Pure.

export const SOCIAL_ICONS_RULE = 'social-icons-without-accounts'
export const SOCIAL_ICONS_REASON =
  'the demo cell holds only social icon links and the brief has no social account for its person, so words take its place'

const SOCIAL_CLASS =
  /(?:^|[\s"'-])(?:social|fa-(?:facebook|twitter|x-twitter|instagram|linkedin|youtube|tiktok|pinterest|whatsapp|telegram|comment))/i
const SOCIAL_HOST =
  /(?:facebook|fb|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|threads|wa)\.(?:com|me)\b/i
const SOCIAL_KEY = /social|facebook|instagram|twitter|linkedin|youtube|tiktok|pinterest|threads|whatsapp/i
const TAKEN_OFF = /^it takes off the template's class /

/** Whether a demo sample is social icon links and nothing a visitor reads. */
export function onlySocialIcons(sample) {
  const text = String(sample ?? '')
  const visible = text
    .replace(/\(\([^()]*(?:\([^()]*\)[^()]*)*\)\)/g, ' ')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return visible === '' && (SOCIAL_CLASS.test(text) || SOCIAL_HOST.test(text))
}

/** Whether a fact names a social account: a key that says so, or an address on a social host, anywhere in its value. */
function hasAccount(value) {
  if (typeof value === 'string') return SOCIAL_HOST.test(value)
  if (Array.isArray(value)) return value.some(hasAccount)
  if (value && typeof value === 'object')
    return Object.entries(value).some(
      ([k, v]) => (SOCIAL_KEY.test(k) && v != null && v !== '') || hasAccount(v)
    )
  return false
}

/**
 * Splits a cell's findings into what stays and what the rule lets through.
 * @param {{ sample: string, said: string[], facts: object[] | null }} input `facts`: the brief facts the copy cites for this cell
 *   (its subject); none known means the rule does not apply
 * @returns {{ kept: string[], allowed: string[] }}
 */
export function socialIconsAllowed({ sample, said, facts }) {
  if (!facts?.length || !onlySocialIcons(sample) || facts.some((f) => hasAccount(f?.value)))
    return { kept: said, allowed: [] }
  return { kept: said.filter((s) => !TAKEN_OFF.test(s)), allowed: said.filter((s) => TAKEN_OFF.test(s)) }
}
