// The finisher's style block (ADR 0044, decision 30), shared by the finisher's style order, the look guard and anyone who
// reads a head injection block (the Tracy site agent through content.get). A "style one block" repair is one rule, keyed by
// the kit block it styles, between its own markers in the kit's head injection block. Each rule sits on its own line behind a
// comment naming its block, so one rule is read, replaced or taken off alone, and a person reading the module sees what added
// it. The rule is scoped to the block's own element by its module id, never to the words it holds, so a later edit of the
// block's content leaves it in place. What a rule may say is the allow list's to decide (finisher-style-allow-list.js).
import { blockScopes, styleRule } from './finisher-style-allow-list.js'

export {
  ALLOWED_PROPERTIES,
  blockScopes,
  declarationRefusal,
  styleRule
} from './finisher-style-allow-list.js'

export const FINISHER_STYLE_START = '<!-- tracy-finisher-style:start -->'
export const FINISHER_STYLE_END = '<!-- tracy-finisher-style:end -->'

const RULE_LINE = /^\/\* tracy-finisher (block-\d+): [^*]* \*\/ (.+)$/

/** The finisher's rules a module's content holds, by block, in the order they stand. */
export function finisherRulesIn(content) {
  const text = String(content ?? '')
  const from = text.indexOf(FINISHER_STYLE_START)
  const to = text.indexOf(FINISHER_STYLE_END)
  const rules = new Map()
  if (from === -1 || to < from) return rules
  const inside = text
    .slice(from + FINISHER_STYLE_START.length, to)
    .replace(/^\s*<style>/, '')
    .replace(/<\/style>\s*$/, '')
  for (const line of inside.split('\n')) {
    const m = RULE_LINE.exec(line.trim())
    if (m) rules.set(m[1], line.trim())
  }
  return rules
}

/** The marked block a module's content holds, or null. */
export function finisherBlockIn(content) {
  const text = String(content ?? '')
  const from = text.indexOf(FINISHER_STYLE_START)
  const to = text.indexOf(FINISHER_STYLE_END)
  return from !== -1 && to > from ? text.slice(from, to + FINISHER_STYLE_END.length) : null
}

/** The marked block for these rules, or null when there is none. */
export const finisherBlockFor = (rules) =>
  rules.size
    ? `${FINISHER_STYLE_START}<style>\n${[...rules.values()].join('\n')}\n</style>${FINISHER_STYLE_END}`
    : null

/** `content` with the marked block put in place of an earlier one, added at the end, or taken off when `block` is null. */
export function withFinisherBlock(content, block) {
  const text = String(content ?? '')
  const held = finisherBlockIn(text)
  if (held) {
    const at = text.indexOf(held)
    const before = text.slice(0, at)
    const after = text.slice(at + held.length)
    if (block) return before + block + after
    return (before.replace(/\n$/, '') + after.replace(/^\n/, '')).replace(/^\n+|\n+$/g, '')
  }
  if (!block) return text
  return text === '' ? block : `${text}\n${block}`
}

/** `content` with one block's rule set to `line`, or taken off when `line` is null; every other rule stays as it was. */
export function withFinisherRule(content, block, line) {
  const rules = finisherRulesIn(content)
  if (line) rules.set(block, line)
  else rules.delete(block)
  return withFinisherBlock(content, finisherBlockFor(rules))
}

/**
 * Whether a marked block holds only finisher rules, each one the allow list would write for its block (the look guard's
 * `finisher-style`): its selector is the block's own scopes, and every declaration passes.
 */
export function isFinisherStyleBlock(block) {
  const rules = finisherRulesIn(block)
  if (finisherBlockFor(rules) !== block) return false
  for (const [id, line] of rules) {
    const css = RULE_LINE.exec(line)?.[2] ?? ''
    const m = /^([^{}]+)\{([^{}]*)\}$/.exec(css)
    if (!m) return false
    const scopes = blockScopes(id)
    const first = m[1].split(',')[0]
    const target = first.startsWith(scopes[0]) ? first.slice(scopes[0].length).trim() : null
    const styles = Object.fromEntries(
      m[2].split(';').map((d) => {
        const at = d.indexOf(':')
        return [d.slice(0, at), d.slice(at + 1).replace(/!important$/, '')]
      })
    )
    const again = styleRule({ block: id, target: target || null, styles })
    if (!again.ok || again.line !== line) return false
  }
  return true
}
