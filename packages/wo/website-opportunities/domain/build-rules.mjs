// The site build rules (spec TracyHQ/tracy#189, COO decision 30/10/2026): ONE registry for every brief build, every trade,
// template and CMS. Each rule says what it guarantees the business owner, which final checks judge it on the served pages
// (`apps/tracy-web/src/opportunities-build/build-rule-checks.js`), whether a finding of it stops the build (`blocks`, read
// by `build-blockers.mjs`), the words the build's writers and the repair turn take from it, and what a template must
// declare for it to work (read by the packing check, `scripts/slot-roles/check.mjs`).
//
// 🔒 A RULE WITHOUT A CHECK IS NOT A RULE: every entry names at least one final check, and a test fails when a named check
// does not exist. 🔒 ONE WORDING: a prompt that states a rule takes its text from here (`rulesFor`), never hand-copied.
// 🔒 THE ORDER IS THE BLOCKER ORDER: the gate gives a finding to the first rule that blocks it, so the ids and the order of
// the blocker rules are what the person reads under "Needs fixes". Pure: no network, no clock. No template, module id or
// business is named here.
import { LEFTOVER_KINDS } from './demo-leftovers.mjs'

export const BUILD_RULES_VERSION = 'build-rules/1'

/** The writers that take rule text: the build's LLM steps and the repair turn. */
export const RULE_WRITERS = Object.freeze([
  'page-copy',
  'offering',
  'sibling',
  'record-page',
  'cta-band',
  'menu',
  'footer',
  'picture',
  'drawing',
  'repair'
])

/** The six site build rules of the COO (30/10/2026), by number; each is carried by one or more registry rules. */
export const SITE_BUILD_RULES = Object.freeze({
  1: 'Copy keeps the template layout: the demo length and line count, one shape for siblings',
  2: 'Copy first, then pictures: each frame shows its own record, a drawing is never reused on another record',
  3: 'The template structure is kept: a missing part is written in the shape of its siblings, hidden only when the grid survives',
  4: 'Icons are chosen by item meaning, one neutral icon for a whole row when nothing matches',
  5: 'The footer keeps the template footer shape, the Contact page carries every channel',
  6: 'Demo and showcase pages and menus are removed, menu titles take only page or record names'
})

const EMPTY_HREF = /^a\[href="#"\]/
const kindIn = (/** @type {string[]} */ kinds) => (/** @type {any} */ f) => kinds.includes(f?.kind)
const OWN_RULE_KINDS = new Set(['C11', 'C18', 'C19', 'C21', 'C22'])

/** The words the repair turn puts in place of each demo leftover kind (#197), by the one replacement order. */
export const DEMO_CONTENT_REPAIRS = Object.freeze({
  C01: "the owner's own picture of this record or page if the site holds one, otherwise a picture drawn from this record and the copy beside it; hide the picture block only when the layout survives without it",
  C02: 'take the demo post off the page and out of the menu and lists',
  C03: "the owner's own offering if the brief has one, written in the shape of its sibling cards; hide the card and its page only when the row survives without it",
  C04: "an icon chosen for the item's meaning, or one plain neutral icon for the whole row",
  C05: "the owner's own picture, otherwise hide the cut-out figure",
  C06: "the owner's own pictures, one per card and each of its own record, otherwise a picture drawn for each card; never one picture for several cards",
  C07: "the owner's own person if the brief names one (name as text, initials in place of a photo), otherwise hide the whole person block",
  C08: "the owner's own video link if the brief has one, otherwise hide the video block",
  C09: "a plain button label in the business's own words that says where it leads; a menu item takes only the name of the page it opens; or hide the decorative text",
  C10: 'a plain neutral background colour in place of the demo picture',
  C11: 'hide the page and remove its menu entry',
  C12: "a plain address in the business's own words, with the old address redirecting to it",
  C13: "the owner's logo if the site holds one, otherwise the business name as text",
  C14: 'remove the template credit line',
  C15: 'hide the avatars or the signature',
  C16: "the owner's name and a plain sentence with no numbers, or hide the demo parts",
  C17: "the owner's own value from the owner data below if it is there, otherwise hide the line",
  C18: "the owner's own link or map if the owner data has it, otherwise hide the icon or the map",
  C19: 'point the link to a page that exists, or remove the link',
  C20: "the owner's words inside the template's own inline tags (the accent span, the line break) at the same place",
  C21: 'hide the whole form block (heading, text, field and button): a form stays only with a real destination',
  C22: 'keep one line of each channel kind the demo footer shows (the main phone first) and put every other channel on the Contact page; show the address with commas'
})

/**
 * The registry, in blocker order. `checks`: the final checks that judge it; `owns`: the findings it covers; `blocks`: the
 * ones that stop the build (blocker rules only); `prompt`: the writers that take its text; `repair`: what the repair turn
 * puts instead; `declares`: what a template must declare (a content-map key and the domain function that judges it, or a
 * packing lint rule id); `cms`: whether the writer and the check exist per CMS.
 * @type {ReadonlyArray<any>}
 */
export const BUILD_RULES = Object.freeze(
  [
    {
      id: 'demo-content',
      siteRules: [3],
      severity: 'blocker',
      guarantee:
        'No word, picture, person or fact of the template demo is left on a slot the build did not fill',
      checks: ['demo-leftovers', 'people-cards', 'statistics', 'offering-summaries'],
      owns: (f) => /^C\d{2}$/.test(String(f?.kind)) && !OWN_RULE_KINDS.has(f.kind),
      blocks: (f) => LEFTOVER_KINDS[f?.kind]?.severity === 'blocker',
      prompt: {
        writers: ['page-copy', 'offering', 'sibling', 'record-page', 'cta-band', 'repair'],
        text: "Never keep the demo's words, people, prices, numbers or facts: write the business's own, and state a hard fact (a price, a phone number, an address, hours, a name, a year, a guarantee) only when the brief holds it."
      },
      repair:
        "the owner's own data, otherwise a neutral substitute, otherwise hide it only where the layout survives",
      declares: [{ base: 'slot-roles', what: 'a known role on every text and picture slot' }],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: true, check: true }
      }
    },
    {
      // 🔒 A KEPT BLOCK SHOWS NO EMPTIED LINE AND NO DEMO LINE (R12 group A, `settleKeptSlots` of the tidy step): every visible
      // slot of a kept block is written for the business or its item or block is taken off. A line still unwritten after the
      // repair loop stops the site at "Needs fixes" instead of serving the template's words or an empty card.
      id: 'copy-lines-kept',
      siteRules: [1, 3],
      severity: 'blocker',
      guarantee:
        'Every visible line of a kept block is written for the business, or its whole item or block is taken off: never an emptied line, never a demo line',
      checks: ['copy-lines'],
      owns: kindIn(['unwritten', 'blanked']),
      blocks: kindIn(['unwritten', 'blanked']),
      prompt: {
        writers: ['repair'],
        text: 'Write every line you are given for this business: explanatory lines (steps, items to bring, benefits) may come from knowledge of the trade as long as they state no price, name or number the brief does not give. Never leave a line empty or in the demo words.'
      },
      repair:
        "write the line for this business in its demo line's length and shape; if it cannot be written, hide its whole item or block only where the grid survives without it",
      declares: [
        { base: 'slot-roles', what: 'an item group with a kind on every repeated card, step and item' }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'form-without-recipient',
      severity: 'blocker',
      guarantee: "A form a visitor can fill in always sends to the owner's own email",
      checks: ['contact-forms'],
      owns: kindIn(['contact-form', 'C21']),
      blocks: kindIn(['contact-form', 'C21']),
      repair: DEMO_CONTENT_REPAIRS.C21,
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'record-not-from-brief',
      severity: 'blocker',
      guarantee:
        "A review, its author, a person's name and a figure are shown exactly as the brief gives them, never invented",
      checks: ['record-slots', 'review-quotes'],
      owns: kindIn(['record-not-shown', 'review-integrity']),
      blocks: (f) =>
        f?.kind === 'record-not-shown' ||
        (f?.kind === 'review-integrity' && f.reason === 'missing-review-author'),
      prompt: {
        writers: ['page-copy', 'record-page', 'repair'],
        text: "A review's words, author and source, a person's name, a statistic and a contact line are records: write only the record a place is given, never the business name in its place; a record place given none is hidden."
      },
      repair: 'write exactly the record the brief gives this place, otherwise hide the block',
      declares: [{ lint: 'social-in-person-card' }],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'missing-head-block',
      severity: 'blocker',
      guarantee: 'Every page carries the brand colours and the layout fixes the build owes it',
      checks: ['head-blocks'],
      owns: kindIn(['head-block', 'centred-row']),
      blocks: kindIn(['head-block', 'centred-row']),
      repair: 'restore the head block the build wrote for this page',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'link-without-job',
      severity: 'blocker',
      guarantee: 'Every button and link leads somewhere real, never to its own page or to an empty frame',
      checks: ['demo-leftovers', 'self-links', 'buttons-videos'],
      owns: (f) => ['C18', 'C19', 'self-link', 'empty-video', 'channel-target'].includes(f?.kind),
      blocks: (f) => ['C18', 'C19'].includes(f?.kind) && EMPTY_HREF.test(String(f.place ?? '')),
      repair: DEMO_CONTENT_REPAIRS.C19,
      declares: [
        {
          key: 'slots[].action',
          problems: 'buttonActionProblems',
          field: 'buttons',
          what: 'an action on every button slot outside a `demoOnly` entity'
        },
        { lint: 'hero-button-no-link' },
        { lint: 'link-target-wrong-role' },
        { lint: 'video-slot-names-no-video' }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: true, check: true }
      }
    },
    {
      id: 'sibling-copy-shape',
      siteRules: [1],
      severity: 'blocker',
      guarantee:
        'The cards of one list share one text shape: the demo length and line count, no sparse card beside a full one',
      checks: ['sibling-copy'],
      owns: kindIn(['sibling-copy-shape', 'spelling-variant']),
      // A mixed spelling across the site (criterion 1.6) stops the build like a broken shape.
      blocks: kindIn(['sibling-copy-shape', 'spelling-variant']),
      prompt: {
        writers: ['page-copy', 'offering', 'sibling', 'record-page', 'repair'],
        text: "Write each slot to its demo text's length (between three quarters and one and a quarter of it) and its rendered line count. Siblings of one design level (cards in a row, items, outline sections, one record shown on several pages) get the same line count and shape: never a sparse slot beside a full one, never an empty body beside a filled one, never a page-level sentence in one item's slot. No exclamation marks; one spelling per site."
      },
      repair:
        'rewrite this card to the length and line count of its siblings, from the trade and the brief, with no new hard fact',
      declares: [
        { lint: 'repeated-item-ungrouped' },
        { lint: 'outline-item-unroled' },
        { lint: 'card-title-link-undeclared' }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'sibling-record-pages',
      siteRules: [1, 2, 3],
      severity: 'blocker',
      guarantee:
        'Sibling record pages each show their own pictures and words, no empty card and no blog pager',
      checks: ['record-pages'],
      owns: kindIn(['sibling-record-picture', 'sibling-record-copy', 'record-page-pager', 'empty-card']),
      blocks: kindIn(['sibling-record-picture', 'sibling-record-copy', 'record-page-pager', 'empty-card']),
      prompt: {
        writers: ['record-page'],
        text: 'A record page speaks only of its own record: its own words in every section, never a sibling page with the name swapped, and no empty card.'
      },
      repair:
        'write this section for its own record in the shape of the same section on its siblings; give an empty card its title and body',
      declares: [
        {
          key: 'recordPages',
          problems: 'recordPageProblems',
          field: 'recordPages',
          what: 'the layout of every family of record pages'
        }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'footer-shape',
      siteRules: [5],
      severity: 'blocker',
      guarantee: 'The footer keeps the template footer shape: one line of each channel kind its demo shows',
      checks: ['demo-leftovers', 'footer-navigation'],
      owns: (f) => f?.kind === 'C22' || f?.kind === 'footer-navigation',
      blocks: kindIn(['C22']),
      prompt: {
        writers: ['footer', 'repair'],
        text: 'The footer keeps the template footer shape: one primary line of each channel kind the demo footer shows; every other channel goes on the Contact page.'
      },
      repair: DEMO_CONTENT_REPAIRS.C22,
      declares: [
        {
          key: 'contactBlocks',
          problems: 'contactBlockProblems',
          field: 'contactBlocks',
          what: 'every footer contact block and its demo entries'
        },
        {
          key: 'navigationGroups',
          problems: 'navigationGroupProblems',
          field: 'navigation',
          what: 'every footer link column'
        }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'contact-page',
      siteRules: [5],
      severity: 'blocker',
      guarantee:
        'The Contact page lists every channel the brief holds, each one a link, and never invites a walk-in to a business by appointment',
      checks: ['contact-page'],
      owns: (f) =>
        f?.kind === 'walk-in-copy' || (String(f?.kind).startsWith('contact-') && f.kind !== 'contact-form'),
      blocks: (f) =>
        f?.kind === 'walk-in-copy' || (String(f?.kind).startsWith('contact-') && f.kind !== 'contact-form'),
      prompt: {
        writers: ['page-copy', 'repair'],
        text: 'The Contact page carries every channel of the brief, each a link (a phone number a tel: link); a business that works by appointment says so and is never written as a walk-in place.'
      },
      repair:
        'list this channel on the Contact page as a link, from the brief; say "By appointment" where the brief says so',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'pictures-fit-record',
      siteRules: [2],
      severity: 'blocker',
      guarantee:
        "Each picture shows its own record and page: a photo or a drawing never stands on another record's page",
      checks: ['record-pictures'],
      owns: kindIn(['record-picture-shared']),
      blocks: kindIn(['record-picture-shared']),
      prompt: {
        writers: ['picture', 'drawing'],
        text: "Copy first, then pictures: each frame is chosen from the brief's photos by the record or page it belongs to, the copy next to it and the slot role; with no fitting photo, draw one from that record, its copy and its place. A drawing is never reused on another record's page."
      },
      repair: "a picture of this record from the brief's photos, otherwise one drawn for this record",
      declares: [{ lint: 'gallery-group-is-a-card' }],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: true, check: true }
      }
    },
    {
      id: 'kept-page-missing',
      severity: 'blocker',
      guarantee: 'Every page the site keeps opens',
      checks: ['pages-served'],
      owns: () => false,
      blocks: () => false,
      broken: true,
      repair: 'find why the page fails and restore it before anything else',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: true, check: true }
      }
    },
    {
      id: 'structure-kept',
      siteRules: [3],
      severity: 'note',
      guarantee:
        'The template structure is kept: no empty frame, every kept band with its message, each page intro in its place, no demo line left empty or unwritten',
      checks: ['empty-frames', 'page-intros', 'cta-bands'],
      owns: kindIn(['empty-frame', 'page-intro-role', 'cta-band']),
      prompt: {
        writers: ['page-copy', 'cta-band', 'repair'],
        text: "Keep the template's structure: write a missing section in the shape of its siblings, never leave it empty; hide a part only when the grid survives without it."
      },
      repair:
        'write the missing part in the shape of its siblings; hide it only when the grid survives without it',
      declares: [
        {
          key: 'ctaBands',
          problems: 'ctaBandProblems',
          field: 'bands',
          what: 'every call-to-action band and its message slots'
        },
        { lint: 'section-body-undeclared' }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'layout-bands',
      siteRules: [3],
      severity: 'note',
      guarantee: 'A decoration never stays alone once the working parts beside it come off',
      checks: ['empty-frames'],
      owns: kindIn(['lone-decoration-band']),
      repair: 'take the decoration off with the parts it stood beside',
      declares: [
        {
          key: 'layoutBands',
          problems: 'layoutBandProblems',
          field: 'layoutBands',
          what: 'every band of working and decoration parts'
        }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'icons-per-meaning',
      siteRules: [4],
      severity: 'note',
      guarantee:
        "Each item's icon says what the item is; a row with no fitting icons shows one neutral icon on every item",
      checks: ['icon-rows'],
      owns: kindIn(['icon-row-mixed']),
      prompt: {
        writers: ['page-copy', 'repair'],
        text: "Choose each item's icon by the item's meaning; when nothing matches, one neutral icon for the whole row."
      },
      repair: DEMO_CONTENT_REPAIRS.C04,
      declares: [{ lint: 'item-icon-ground-undeclared' }],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'showcase-removed',
      siteRules: [6],
      severity: 'note',
      guarantee: 'Demo and showcase pages of the template, and their menu entries, are gone',
      checks: ['demo-leftovers'],
      owns: kindIn(['C11']),
      repair: DEMO_CONTENT_REPAIRS.C11,
      declares: [
        {
          file: 'showcase-nav-map.json',
          what: "the template's showcase menus (checked with the contract pins)"
        }
      ],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'menu-label-is-page-name',
      siteRules: [6],
      severity: 'note',
      guarantee:
        'A menu or footer link is named by the page or record it opens, one name per page across the site',
      checks: ['main-menu', 'buttons-videos'],
      owns: (f) => f?.kind === 'main-menu' || f?.kind === 'page-names',
      prompt: {
        writers: ['menu', 'footer', 'repair'],
        text: "A menu or footer link label is the name of the page or record it opens, in the business's own words; with nothing better given, that page's title. Never a button's words or a generic action such as Learn more, Read more or Details. Contact names only a contact page."
      },
      repair: 'name the menu item by the title of the page it opens',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: true, check: true }
      }
    },
    {
      id: 'offering-rows',
      siteRules: [1],
      severity: 'note',
      guarantee:
        "No line under an offering's name only repeats it, and one list's cards share one set of row labels",
      checks: ['offering-rows'],
      owns: kindIn(['offering-name-only', 'offering-row-labels']),
      prompt: {
        writers: ['offering'],
        text: "The line under an offering's name says what the offering is and what a visitor does in it; it never repeats or only restates the name and never names another offering."
      },
      repair: "write what this offering is in the shape of its sibling cards' lines",
      declares: [{ lint: 'offering-rows-short' }],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'seo',
      severity: 'note',
      guarantee:
        'Every kept page says its planned title and description, and the not-found page speaks for the business',
      checks: ['page-seo'],
      owns: kindIn(['page-seo', 'post']),
      repair: "set the page's planned title and description",
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'copy-voice',
      severity: 'note',
      guarantee:
        'The site speaks in one formal voice: no slang, no advertising tone, one spelling of each word',
      checks: ['sibling-copy'],
      owns: () => false,
      prompt: {
        writers: ['page-copy', 'offering', 'sibling', 'record-page', 'cta-band', 'repair'],
        text: 'Write formally and plainly: no slang, no advertising tone, no exclamation marks.'
      },
      repair: 'rewrite this line formally and plainly',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'repeated-copy',
      severity: 'note',
      guarantee: 'No sentence is said twice, on one page or on two',
      checks: ['repeated-copy'],
      owns: kindIn(['repeated-copy']),
      prompt: {
        writers: ['page-copy', 'sibling', 'record-page', 'repair'],
        text: 'Never say the same sentence twice on the site, reworded or not.'
      },
      repair: 'rewrite one of the two sentences so each says its own thing',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'repeated-blocks',
      severity: 'note',
      guarantee: 'A showcase block the site keeps on one page is on one page only',
      checks: ['repeated-blocks'],
      owns: kindIn(['repeated-block']),
      repair: 'keep the block on the one page the plan gives it',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'booking-buttons',
      // A booking button that leads elsewhere sends the visitor away from the one thing they came for (criterion 5.2).
      severity: 'blocker',
      guarantee:
        'A button whose words name booking or contact leads to the Contact page or to a channel of the business',
      checks: ['booking-buttons'],
      owns: kindIn(['booking-button-target']),
      blocks: kindIn(['booking-button-target']),
      repair: 'point this button to the Contact page, or to the business channel when the site keeps none',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'demo-name-addresses',
      severity: 'note',
      guarantee: 'No page address still carries the name of a demo person the page no longer shows',
      checks: ['demo-name-addresses'],
      owns: kindIn(['demo-name-address']),
      repair: 'move the page to an address made from the name it now shows',
      declares: [{ base: 'slot-roles', what: 'person.name and quote.author_name roles on the demo names' }],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: false, check: true },
        emdash: { writer: false, check: true }
      }
    },
    {
      id: 'first-screen-and-facts',
      severity: 'note',
      guarantee:
        "The home page's first screen says what, where and how to contact, and every contact fact of the brief is on the site",
      checks: ['contact-facts', 'hero-first-screen'],
      owns: () => false,
      repair: 'show the missing fact from the brief',
      declares: [],
      cms: {
        joomla: { writer: true, check: true },
        wordpress: { writer: true, check: true },
        emdash: { writer: true, check: true }
      }
    }
  ].map((rule) => Object.freeze({ prompt: null, siteRules: [], ...rule }))
)

/** The rule a finding of the final report belongs to: the first that blocks it, else the first that owns it; null for none. */
export function ruleOfFinding(finding) {
  const f = finding ?? {}
  return BUILD_RULES.find((r) => r.blocks?.(f)) ?? BUILD_RULES.find((r) => r.owns(f)) ?? null
}

/** The rules that stop a build, in the order the person reads them. */
export function blockerRules() {
  return BUILD_RULES.filter((r) => r.severity === 'blocker')
}

/** The rule text one writer takes, joined in registry order; empty for a writer no rule speaks to. */
export function rulesFor({ writer } = /** @type {{writer?: string}} */ ({})) {
  return BUILD_RULES.filter((r) => r.prompt?.writers.includes(writer))
    .map((r) => r.prompt.text)
    .join(' ')
}

/** The one text of one rule's prompt (a writer that states a single rule), or ''. */
export function ruleText(id) {
  return BUILD_RULES.find((r) => r.id === id)?.prompt?.text ?? ''
}

/** What the repair turn puts in place of one finding: a demo kind's own words, else its rule's; null for none. */
export function repairOf(finding) {
  const kind = String(finding?.kind ?? '')
  return DEMO_CONTENT_REPAIRS[kind] ?? ruleOfFinding(finding)?.repair ?? null
}

/** Every declaration a template must make, with the rule that needs it. */
export function declarationsOf() {
  return BUILD_RULES.flatMap((r) => r.declares.map((d) => ({ rule: r.id, ...d })))
}

/** Every final check id the registry names, in registry order. */
export function checkIdsOf() {
  return [...new Set(BUILD_RULES.flatMap((r) => r.checks))]
}

/**
 * What is wrong with one rule record; empty when it is whole. A rule needs an id, a guarantee, a severity, at least one
 * final check, the findings it owns, `blocks` when it is a blocker, known writers, and a writer and a check flag per CMS.
 * @param {any} rule
 * @returns {string[]}
 */
export function ruleProblems(rule) {
  const out = []
  const id = typeof rule?.id === 'string' && /^[a-z0-9-]+$/.test(rule.id) ? rule.id : null
  if (!id) out.push('the rule has no id')
  const name = id ?? '?'
  if (typeof rule?.guarantee !== 'string' || rule.guarantee.trim() === '') out.push(`${name}: no guarantee`)
  if (!['blocker', 'note'].includes(rule?.severity)) out.push(`${name}: severity is not blocker or note`)
  if (
    !Array.isArray(rule?.checks) ||
    rule.checks.length === 0 ||
    rule.checks.some((c) => typeof c !== 'string' || !c)
  )
    out.push(`${name}: no final check`)
  if (typeof rule?.owns !== 'function') out.push(`${name}: no findings it owns`)
  if (rule?.severity === 'blocker' && typeof rule.blocks !== 'function')
    out.push(`${name}: a blocker rule with no blocks`)
  if (rule?.prompt && (!rule.prompt.text || !rule.prompt.writers?.every((w) => RULE_WRITERS.includes(w))))
    out.push(`${name}: a prompt with no text or an unknown writer`)
  if (!Array.isArray(rule?.declares)) out.push(`${name}: no declarations list`)
  for (const cms of ['joomla', 'wordpress', 'emdash'])
    if (typeof rule?.cms?.[cms]?.writer !== 'boolean' || typeof rule?.cms?.[cms]?.check !== 'boolean')
      out.push(`${name}: no writer and check flags for ${cms}`)
  return out
}
