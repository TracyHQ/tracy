// Shared helpers and the rule registry of the site plan checker (ADR 0041, decision 6).
// The checker is a port of the approved checker script; rule ids, titles and logic are kept as approved so a
// rule can be re-synced from the script by copying its block into the matching rules-*.js file.

export const arr = (x) => (Array.isArray(x) ? x : [])
export const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {})
export const str = (x) => (typeof x === 'string' ? x : '')
export const has = (x) => str(x).trim() !== ''
export const norm = (s) => str(s).toLowerCase().replace(/\s+/g, ' ').trim()

// Every rule, in the order the result lists them. Titles are declared up front so the result always lists every
// rule, even when inputs are missing.
export const RULE_TITLES = [
  ['r0', 'R00', 'Plan follows the Output shape of the spec (no extra fields)'],
  ['r1', 'R01', 'Every id the plan mentions exists in the kit, in the right parent'],
  [
    'r2',
    'R02',
    'Fact ids exist in the brief; brief-based items cite facts; no observed-only hard claims; nothing from brief.missing'
  ],
  ['r3', 'R03', 'No canHide:false frame hidden; no logo frame decided'],
  ['r4', 'R04', 'Menu points to kept pages, labels match page names; every kept page has a unique slug'],
  ['r5', 'R05', 'List rows within kit min/max and items match rows'],
  ['r6', 'R06', 'Text for a slot does not exceed the kit character limit'],
  [
    'r7',
    'R07',
    'Every demoOwned slot of a kept block is replaced or hidden; name slots (site.nameSlots) are left to the brand step'
  ],
  ['r8', 'R08', 'CMS notices with canHide:true are hidden'],
  ['r9', 'R09', 'Privacy page, not-found page and site.language present'],
  [
    'r10a',
    'R10a',
    'Plan is closed: every kit group, page and block on a kept page is decided once, with seen'
  ],
  ['r10b', 'R10b', 'Every list, frame and link of a kept block is decided; picture wishes are well formed'],
  ['r10c', 'R10c', 'Twin and fixed frames are untouched; cutouts are never hidden'],
  ['r10d', 'R10d', 'Links, primary action and not-found lead to kept pages or allowed targets'],
  ['r10e', 'R10e', 'Footer: each kept page except Home in exactly one column; column group ids exist'],
  ['r10f', 'R10f', 'Trade-based lines state no terms and come with an owner task'],
  ['r10g', 'R10g', 'Nothing decided twice'],
  ['r11', 'R11', 'Forms: each kit form on a kept page is decided once in site.forms, by its kit block id'],
  ['r12', 'R12', 'A block names a contact channel only when it links to it'],
  [
    'r13',
    'R13',
    'A link does not lead to the page it is shown on (hidden links and header/footer navigation excepted)'
  ],
  ['r14', 'R14', 'Every picture wish has a kind, equal to the kit frame kind'],
  ['r15', 'R15', 'A picture wish shows one subject (no "or" alternatives in shows)'],
  [
    'r17',
    'R17',
    'Person frames: every picture in a person row has match "person", and each "person" wish names a team fact of the brief'
  ],
  [
    'r18',
    'R18',
    'Same picture twice in one item: the first frame has the full wish, the second only sameAs pointing at it'
  ],
  [
    'r16',
    'R16',
    'A list row cites, outside its name line, only the facts its name line cites (a row has its own point)'
  ],
  [
    'r19',
    'R19',
    'A map button follows the brief address: kept and led to map:<address fact> when the brief has one, hidden otherwise'
  ],
  ['r20', 'R20', 'Every kept page has a written title: the slot the kit measured as its title, not hidden'],
  [
    'r21',
    'R21',
    'A kept block does not hide a trade section for want of facts (two or more slots), unless a brief fact shows the activity is absent'
  ],
  [
    'r22',
    'R22',
    'A list row printed in the same card as text slots (kit rows[].pairedSlots) is kept exactly when one of those slots is kept'
  ],
  [
    'r23',
    'R23',
    'A list row the plan keeps keeps all its printed fields (a kept card shows its title, text and picture together)'
  ],
  [
    'r24',
    'R24',
    'A control that stays on the page keeps its label; a label one slot shares across blocks is written, never hidden'
  ],
  ['r25', 'R25', 'Every article rests on one original owner post; surplus articles are dropped'],
  [
    'r26',
    'R26',
    'A kept social row links a profile its icon can draw (its own network, or one the template icon family has); otherwise it is hidden'
  ],
  ['r10h', 'R10h', 'Judgement items (needs reviewer): listed as skip']
]

// One recorder per rule: ok() counts a passed check, fail() records a failure, note() adds a note once,
// skip() marks the rule as not checkable.
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
    },
    raw: r
  }
}

export function createRuleSet() {
  const list = []
  const R = {}
  for (const [key, id, title] of RULE_TITLES) R[key] = rule(list, id, title)
  return { R, list }
}

// The per-rule result, in the shape the approved script writes, plus the pass/fail/skip summary.
export function finishRules(list) {
  const rules = list.map((r) => {
    const status = r.failures.length ? 'fail' : r.checked > 0 && !r.forceSkip ? 'pass' : 'skip'
    const notes = [...r.notes]
    if (r.forceSkip) notes.unshift(r.forceSkip)
    if (status === 'skip' && !notes.length) notes.push('cannot check: nothing to check in this plan')
    const causes = {}
    for (const f of r.failures) {
      const c = f.cause || 'unknown'
      causes[c] = (causes[c] || 0) + 1
    }
    const keys = Object.keys(causes)
    const cause = !keys.length
      ? null
      : keys.length === 1 && keys[0] !== 'unknown'
        ? keys[0]
        : keys.every((k) => k === 'unknown')
          ? null
          : 'mixed'
    return { id: r.id, title: r.title, status, cause, causes, failures: r.failures, notes }
  })
  const summary = { pass: 0, fail: 0, skip: 0 }
  for (const r of rules) summary[r.status]++
  return { summary, rules }
}
