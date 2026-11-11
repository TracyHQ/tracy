// Rule recorders of the picture check (ADR 0043). Same result shape as the plan and copy checks:
// { id, title, status: pass|fail|skip, cause, causes, failures: [{ where, detail, cause }], notes }.
export const RULE_TITLES = [
  ['p01', 'P01', 'Every planned frame exactly once, and the file matches the site-pictures/1 shape'],
  ['p02', 'P02', 'Every frame id exists in the kit'],
  ['p03', 'P03', 'Every file exists, its hash and size match, its site path is named by its hash'],
  ['p04', 'P04', "Aspect matches the site's demo file within 0.02 and the size is not below the display box"],
  ['p05', 'P05', 'Enlarged at most 1.5 times, and the sharpness gate passed'],
  ['p06', 'P06', 'No photo twice on one page'],
  ['p07', 'P07', 'Nothing drawn or extended in a documentary frame'],
  ['p08', 'P08', 'Person frames hold only a confirmed portrait or initials, never drawn'],
  ['p09', 'P09', 'Owner photos carry no lettering and no other business'],
  ['p10', 'P10', 'Icons have light and dark files and names that exist in the library'],
  ['p11', 'P11', 'Twins equal their source'],
  ['p12', 'P12', 'Hidden only where the kit allows hiding, no demo picture left'],
  ['p13', 'P13', 'No picture in a frame the kit marks not writable, except through siteSettings']
]

function rule(list, id, title) {
  const r = { id, title, failures: [], notes: [], checked: 0, forceSkip: null }
  list.push(r)
  return {
    ok() {
      r.checked++
    },
    fail(where, detail, cause = null) {
      r.checked++
      r.failures.push({ where, detail, cause })
    },
    note(msg) {
      if (!r.notes.includes(msg)) r.notes.push(msg)
    },
    skip(msg) {
      r.forceSkip = msg
    }
  }
}

export function createRuleSet() {
  const list = []
  const R = {}
  for (const [key, id, title] of RULE_TITLES) R[key] = rule(list, id, title)
  return { R, list }
}

export function finishRules(list) {
  const rules = list.map((r) => {
    const status = r.failures.length ? 'fail' : r.checked > 0 && !r.forceSkip ? 'pass' : 'skip'
    const notes = [...r.notes]
    if (r.forceSkip) notes.unshift(r.forceSkip)
    if (status === 'skip' && !notes.length) notes.push('nothing to check in this manifest')
    const causes = {}
    for (const f of r.failures) causes[f.cause || 'unknown'] = (causes[f.cause || 'unknown'] || 0) + 1
    const keys = Object.keys(causes)
    const cause =
      !keys.length || keys.every((k) => k === 'unknown') ? null : keys.length === 1 ? keys[0] : 'mixed'
    return { id: r.id, title: r.title, status, cause, causes, failures: r.failures, notes }
  })
  const summary = { pass: 0, fail: 0, skip: 0 }
  for (const r of rules) summary[r.status]++
  return { summary, rules }
}
