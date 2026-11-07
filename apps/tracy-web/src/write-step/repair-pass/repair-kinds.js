// What step 9b sends to the site agent (#448), in explicit tables. The rule is "the customer sees it, send it": a fault is
// sent when its kind is in SENT_KINDS, each with the one plain sentence of what should change, the words a person would
// type in the preview's comment popover. The one kind never sent is missing accent emphasis (NEVER_SENT, code
// `never-sent`): the site agent's text tool cannot write emphasis. A site check group in NOT_SENT_GROUPS is not a
// customer-visible fault the agent edits (`not-visible`).
// Every one is logged with its reason. A group or kind no table names is logged `unknown-kind`, never dropped silently,
// so a new check group is seen the first time it fails. A kind joins by adding a row here, never a branch elsewhere.

/** The fault kind of a site check group's failures (step 11, customer-visible groups only). */
export const CHECK_GROUP_KINDS = Object.freeze({
  'alt-matches-picture': 'wrong-alt',
  'words-over-picture': 'unreadable-text',
  'band-contrast': 'unreadable-text',
  'demo-words': 'demo-fact',
  'demo-links': 'bad-link',
  'dead-links': 'bad-link',
  'hidden-page-links': 'bad-link',
  'text-overflow': 'broken-layout',
  'empty-controls': 'empty-block',
  // The row of NEVER_SENT, named here so the reason logged is its own.
  'accent-emphasis': 'lost-emphasis',
  'emphasis-codes-left': 'emphasis-codes',
  'glued-words': 'glued-words',
  'main-heading': 'main-heading',
  'empty-frames': 'empty-frame',
  'demo-pictures': 'demo-picture',
  'cms-errors': 'cms-error'
})

/** Kinds sent to the agent: what the change is, as one sentence. `seen` is what was measured or seen there. */
export const SENT_KINDS = Object.freeze({
  'wrong-alt': () =>
    "This picture's alt text does not describe it: write an alt text that describes the picture shown, for this business.",
  'wrong-icon': () =>
    "This icon does not match its item: choose an icon from Tracy's icon library that matches the item, and put it in place of this one, keeping the item's words.",
  'unreadable-text': () =>
    'This text is hard to read over its background: make it readable, keeping its words and the template look.',
  'demo-fact': () =>
    "This still shows the template demo's words: put this business's own words in their place, or remove them when the site has none.",
  'bad-link': () =>
    "This link leads to a missing page or to the template demo: point it at this site's own page or contact, or remove it.",
  'broken-layout': () =>
    'This breaks the layout at phone or desktop width (wider than the page, overlapping or cut off): make it fit without changing its words.',
  'empty-block': () => 'This button or block is empty, left from the template demo: remove it.',
  'raw-markup': () => 'This shows code or markup printed as words: remove the code and keep the words.',
  'demo-contact-link': () =>
    "This phone or e-mail link still dials or mails the template demo: point it at this business's own number or address.",
  'demo-title-meta': () =>
    "This page's title or meta description is the template demo's or repeats another page's: write one for this page.",
  'lost-design': () =>
    'This block lost a design trait the template demo shows (an accent button, a small label above the heading): bring it back.',
  'emphasis-codes': () =>
    'This shows emphasis codes printed as words (double brackets): remove the codes and keep the words.',
  'glued-words': () =>
    'These words run into each other with no space where a line breaks: put the space back, keeping the words.',
  'main-heading': () =>
    'This page has more than one main heading, or none: keep exactly one main heading, without changing the words.',
  'empty-frame': () =>
    'This picture frame or box is empty: hide it, or fill it from what the site already has.',
  'demo-picture': () =>
    "This still shows a picture of the template demo: put one of this business's pictures from the site in its place, or hide it.",
  'cms-error': () =>
    'This shows a CMS error or a placeholder printed as words: remove it, keeping the words around it.',
  other: () =>
    'A visitor sees this as wrong: fix what the note describes, keeping the words and the template look.'
})

/** Kinds never sent, each with why: the site agent's text tool cannot write accent emphasis. */
export const NEVER_SENT = Object.freeze({
  'lost-emphasis':
    "missing accent emphasis is fixed at its source (the write step, PR #446); the site agent's text tool cannot write emphasis"
})

const OWN_STEP =
  'checks what an earlier step wrote or decided, which that step fixes; the agent is not sent it'
const NOT_SEEN = 'harms neither a visitor nor search, so it is not sent'

/** Site check groups never sent, each with why: what they measure is not a fault the agent edits on a page. */
export const NOT_SENT_GROUPS = Object.freeze({
  'read-back': `${OWN_STEP} (the write's read-back)`,
  'written-not-printed': `${OWN_STEP} (a written value the page does not print)`,
  'look-guard-findings': `${OWN_STEP} (the look guard's refusals)`,
  'unaddressable-items': `${OWN_STEP} (plan items with no slot)`,
  'unowned-slots': `${OWN_STEP} (slots step 3 owns)`,
  'kit-version': `the kit version is the contract's; it ${NOT_SEEN}`,
  'page-slug': `${OWN_STEP} (the route stage's page addresses)`,
  'plan-links': `${OWN_STEP} (the plan's kept links and end actions)`,
  'brand-accent': `${OWN_STEP} (the brand step's accent)`,
  'logo-readable': `${OWN_STEP} (the brand step's logo)`,
  'self-links': `${OWN_STEP} (links the route stage wrote)`,
  'created-controls': `${OWN_STEP} (controls the page stage created)`,
  'heading-separator': `${OWN_STEP} (the writer's heading marks)`,
  'broken-sentence': `${OWN_STEP} (the writer's sentences)`,
  'unfinished-heading': `${OWN_STEP} (the writer's headings)`,
  'tall-blocks': `${OWN_STEP} (the writer's lengths against the kit)`,
  'text-fill': `${OWN_STEP} (the writer's lengths against the kit)`,
  'stretched-pictures': `${OWN_STEP} (the picture step's fit)`,
  'orphan-row': `${OWN_STEP} (the plan's kept cards)`,
  'blank-footer-column': `${OWN_STEP} (the plan's hide decisions)`,
  'list-rows': `${OWN_STEP} (the plan's list rows)`,
  'map-location': `${OWN_STEP} (where the business is, from the brief)`,
  'phone-callable': `${OWN_STEP} (the write step's phone links)`,
  'empty-video-buttons': `${OWN_STEP} (the template's video buttons)`
})

const UNKNOWN = 'no table of repair-kinds.js names it, so it is logged and not sent until one does'

/** The kind of a finder fault: one it names `other` that is about an icon is a wrong icon, sent with its own sentence. */
export const finderKindOf = (f) =>
  f.kind === 'other' && /\bicons?\b/i.test(String(f.seen ?? '')) ? 'wrong-icon' : f.kind

/** The kind of a site check failure, or null when no table names its group. A demo link that dials or mails is a contact link. */
export function kindOfFailure(f) {
  const kind = CHECK_GROUP_KINDS[f.group] ?? null
  if (kind === 'bad-link' && f.group === 'demo-links' && /^(tel|mailto):/i.test(String(f.measured ?? '')))
    return 'demo-contact-link'
  return kind
}

/**
 * Why a fault is not sent, by code and reason, or null when it is sent.
 * @param {{ source: string, group: string | null, kind: string | null, page: string | null }} fault
 * @returns {{ code: 'never-sent' | 'not-visible' | 'unknown-kind' | 'no-page', reason: string } | null}
 */
export function notSentOf(fault) {
  if (fault.source === 'site-check' && NOT_SENT_GROUPS[fault.group])
    return { code: 'not-visible', reason: NOT_SENT_GROUPS[fault.group] }
  if (NEVER_SENT[fault.kind]) return { code: 'never-sent', reason: NEVER_SENT[fault.kind] }
  if (!SENT_KINDS[fault.kind]) return { code: 'unknown-kind', reason: UNKNOWN }
  if (!fault.page)
    return { code: 'no-page', reason: 'the fault names no page, so no comment can point at it' }
  return null
}
