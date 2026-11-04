// Rule recorders of the site copy check (ADR 0042). Same result shape as the site plan checker:
// { id, title, status: pass|fail|skip, cause, causes, failures: [{ where, detail, cause }], notes }.
export const RULE_TITLES = [
  ['w01', 'W01', 'The file matches the site-copy/1 shape'],
  ['w02', 'W02', 'Every kept slot exactly once, none hidden or unknown, labels equal the plan'],
  ['w03', 'W03', 'Text between 80% of the demo and the demo, within the slot limit and the paragraph count'],
  ['w04', 'W04', 'Numbers, times, prices, phones, emails and links come from the cited facts'],
  ['w05', 'W05', 'Quoted reviews are exact passages of a review in the brief'],
  ['w06', 'W06', 'No sentence repeats or nearly repeats another anywhere on the site'],
  ['w07', 'W07', 'No demo sentence and no demo proper name left'],
  ['w08', 'W08', 'No phrase from the avoid, forbidden or missing lists'],
  ['w09', 'W09', 'Alt, page title and page description present, within length, titles unique'],
  ['w10', 'W10', 'No sentence about the page or section itself'],
  ['w11', 'W11', 'No long dash'],
  ['w12', 'W12', 'Slots printed as one sentence read as one sentence when joined'],
  ['w13', 'W13', 'A created page title is its on-page heading, not a browser title'],
  ['w14', 'W14', 'A created privacy page is a complete policy, not a retelling of the plan'],
  ['w15', 'W15', 'A lead and points slot is a lead paragraph followed by short points']
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
    if (status === 'skip' && !notes.length) notes.push('nothing to check in this copy')
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
