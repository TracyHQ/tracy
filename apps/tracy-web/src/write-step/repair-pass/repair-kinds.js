// What step 9b sends to the site agent (#448), in two tables. A fault is sent when its kind is in SENT_KINDS, each with the
// one plain sentence of what should change, the words a person would type in the preview's comment popover. A fault whose
// kind is in NEVER_SENT is a known gap of an earlier step, fixed there, or something the agent cannot do; it is logged with
// its reason and never sent. Any other kind is not customer visible (it harms neither the visitor nor search), and is
// logged as such. A kind joins by adding a row here, never a branch elsewhere.

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
  // Rows of NEVER_SENT, named here so the reason logged is theirs.
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
    "This picture's alt text does not describe it: write an alt text that says what the picture shows, for this business.",
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
    'This block lost a design trait the template demo shows (an accent button, a small label above the heading): bring it back.'
})

/** Kinds never sent, each with why (a known gap of an earlier step, or something the agent cannot write). */
export const NEVER_SENT = Object.freeze({
  'lost-emphasis':
    'missing accent emphasis is fixed at its source (the write step, PR #446); the site agent cannot write accent emphasis',
  'emphasis-codes':
    "emphasis codes printed raw come from the write step's emphasis stage and are fixed there; the site agent cannot write accent emphasis",
  'glued-words': 'words glued at a dropped line break are fixed at their source (the write step, PR #446)',
  'main-heading': 'a missing or repeated h1 is the template structure, not content the agent edits',
  'empty-frame': 'an empty picture frame needs a picture, which only the picture step chooses',
  'demo-picture': 'a demo picture is replaced by the picture step, which chooses every picture',
  'cms-error': "a CMS error comes from the site's code, not from content the agent edits",
  other: 'the finder named it outside its fault list, so it is logged and never sent'
})

/** Why a fault of this kind is not sent, or null when it is sent. */
export function notSentReason(kind) {
  if (NEVER_SENT[kind]) return NEVER_SENT[kind]
  if (SENT_KINDS[kind]) return null
  return 'not a customer-visible fault: it harms neither a visitor nor search, so it is not sent'
}

/** The kind of a site check failure, or its group's name when no row names one. */
export const kindOfFailure = (f) => CHECK_GROUP_KINDS[f.group] ?? f.group ?? 'unnamed'
