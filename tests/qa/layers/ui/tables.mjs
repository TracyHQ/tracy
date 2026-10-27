// Data tables of the ui layer: dimensions, edge tags, oracle pins and assertion families.
// generate.mjs turns these plus the code into denominator.json and cases/*.json; run.mjs reads the
// same tables to know which assertion to run for which case. Nothing here is a verdict.

export const LAYER = 'ui'

/** Viewports of plan §4 `ui`: desktop and phone. `height` is the Storybook default frame. */
export const VIEWPORTS = Object.freeze([
  { id: '1440', width: 1440, height: 900 },
  { id: '390', width: 390, height: 844 }
])

export const THEMES = Object.freeze(['light', 'dark'])

/** What this run can actually execute (everything else stays an open obligation in coverage). */
export const EXECUTABLE = Object.freeze({ languages: ['en'], themes: ['light'], viewports: ['1440', '390'] })

/** Plan §3: tags every item carries, then the UI/UX tags. */
export const COMMON_TAGS = Object.freeze([
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup'
])

export const UI_TAGS = Object.freeze([
  'loading',
  'empty',
  'success',
  'error',
  'offline',
  'disabled',
  'permission',
  'keyboard',
  'focus',
  'dialog-recovery',
  'overflow',
  'console-network',
  'language-theme-viewport'
])

/** Tags that a story/screen item is required to carry. A tag may repeat between the two lists. */
export const STORY_REQUIRED_TAGS = Object.freeze([...new Set([...COMMON_TAGS, ...UI_TAGS])])

/** Required tags of a switch item: the common set plus the ones that make sense for a binding. */
export const SWITCH_REQUIRED_TAGS = Object.freeze([
  ...new Set([...COMMON_TAGS, 'permission', 'disabled', 'console-network'])
])

export const CLIENT_REQUIRED_TAGS = Object.freeze([
  ...new Set([...COMMON_TAGS, 'language-theme-viewport', 'permission'])
])

/**
 * Oracle pins. Each names a document in the repo, a literal anchor that must still be in it, and the
 * invariant the ui layer derived from that anchor. generate.mjs stores sha256 of each file in
 * tests/qa/oracles/ui/pins.json; run.mjs refuses to PASS a case whose oracle file changed under it.
 */
export const ORACLES = Object.freeze({
  'design-focus-stroke': {
    file: 'DESIGN.md',
    anchor: 'focus (mouse click or Tab) is **a border colour change, one 1px stroke**',
    owner: 'DESIGN.md focus rule (29/09 and 05/10/2026)',
    invariant:
      'Focus is one 1px stroke that changes colour: no ring larger than 1px, no translucent box-shadow halo, no thick outline.'
  },
  'design-icon-aria': {
    file: 'DESIGN.md',
    anchor: 'Put an `aria-label` on icon-only controls',
    owner: 'DESIGN.md §5',
    invariant:
      'Every interactive control has a non-empty accessible name; an icon-only control carries an aria-label.'
  },
  'design-no-dead-button': {
    file: 'DESIGN.md',
    anchor: '**do not draw dead buttons**',
    owner: 'DESIGN.md §5',
    invariant:
      'A control is either wired, hidden, or disabled; a visible enabled control is reachable and named.'
  },
  'vocabulary-banned': {
    file: 'docs/references/vocabulary.md',
    anchor: 'These five words are **enforced by machine**',
    owner: 'docs/references/vocabulary.md §4',
    invariant: 'No banned phrase of vocabulary.md §4 appears in on-screen text.'
  },
  'i18n-placeholders': {
    file: 'docs/references/i18n.md',
    anchor: '**A mismatched `{placeholder}`**',
    owner: 'docs/references/i18n.md §3',
    invariant:
      'A raw key, an unfilled {placeholder} or an interpolation artefact must never reach the screen.'
  },
  'i18n-no-english-literal': {
    file: 'CLAUDE.md',
    anchor: 'Every language in Settings › Language must be complete',
    owner: 'CLAUDE.md §9 (spec #730)',
    invariant: 'On a non-English interface language the screen carries no untranslated English string.'
  },
  'ui-switch-catalogue': {
    file: 'packages/core/tracy-core/src/ui-switches/catalogue.json',
    anchor: '"switches"',
    owner: 'UI switch catalogue (28/09/2026)',
    invariant:
      'The catalogue is the only list of switches and decides each default; a locked switch ignores the door.'
  },
  'ui-switch-contract': {
    file: 'packages/core/tracy-core/src/ui-switches/index.mjs',
    anchor: 'the ids that are off ride on `<html data-tracy-hide="id id …">`',
    owner: 'tasks/plan-ui-switches.md; module header',
    invariant:
      'An id answered as hidden by /api/ui rides on <html data-tracy-hide>; a door failure keeps the defaults.'
  },
  'claude-ui-switch-rule': {
    file: 'CLAUDE.md',
    anchor:
      'Show/hide of a customer-page piece that `/ops` › User Interface can switch goes through the switch',
    owner: 'CLAUDE.md §8 (29/09/2026)',
    invariant:
      'A piece with a switch is hidden only through the switch: some product code reads that switch id.'
  },
  'qa-brief-ui': {
    file: 'tests/qa/oracles/ui/requirements.md',
    anchor: 'no horizontal overflow at 390',
    owner: 'QA suite plan §4 `ui` and the W5 brief (quoted in the file)',
    invariant:
      'No horizontal overflow at 390 px; no console errors or failed requests; every control reachable.'
  }
})

/**
 * Assertion families. `key` appears in case ids; `variants` are the executed dimension points;
 * `kinds` says which story kinds get the family. `assertionId` is what results/RED proofs name.
 */
export const FAMILIES = Object.freeze([
  {
    key: 'console-network',
    assertionId: 'ui.console-network.clean',
    tags: ['console-network'],
    variants: ['1440', '390'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'qa-brief-ui',
    requirement: 'The story loads with no console error, no uncaught exception and no failed network request.'
  },
  {
    key: 'overflow',
    assertionId: 'ui.overflow.none-at-390',
    tags: ['overflow'],
    variants: ['390'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'qa-brief-ui',
    requirement: 'At 390 px the page has no horizontal overflow.'
  },
  {
    key: 'accessible-name',
    assertionId: 'ui.a11y.every-control-named',
    tags: ['keyboard'],
    variants: ['1440'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'design-icon-aria',
    requirement: 'Every interactive control has a non-empty accessible name.'
  },
  {
    key: 'tab-reach',
    assertionId: 'ui.keyboard.every-control-reachable',
    tags: ['keyboard'],
    variants: ['1440'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'design-no-dead-button',
    requirement:
      'Every enabled visible control is reachable with Tab, or is a child of a roving-focus composite widget that is.'
  },
  {
    key: 'focus-stroke',
    assertionId: 'ui.focus.one-px-stroke-no-halo',
    tags: ['focus'],
    variants: ['1440'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'design-focus-stroke',
    requirement:
      'Keyboard focus changes the stroke colour by 1px at most: no halo, no ring over 1px, no thick outline.'
  },
  {
    key: 'dialog-recovery',
    assertionId: 'ui.dialog.escape-closes-and-restores-focus',
    tags: ['dialog-recovery'],
    variants: ['1440'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'design-no-dead-button',
    requirement:
      'An open dialog is named, keeps Tab inside, closes on Escape and returns focus to its trigger.',
    // Only stories whose own source mentions one of these get the family: a static hint, not a verdict.
    onlyWhenSourceMatches: /dialog|sheet|drawer|popover|modal|picker|menu|popup/i
  },
  {
    key: 'raw-keys',
    assertionId: 'ui.i18n.no-raw-key-or-placeholder',
    tags: ['language-theme-viewport'],
    variants: ['1440'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'i18n-placeholders',
    requirement: 'No raw translation key, unfilled {placeholder} or interpolation artefact is visible.'
  },
  {
    key: 'vocabulary',
    assertionId: 'ui.vocabulary.no-banned-phrase',
    tags: ['language-theme-viewport'],
    variants: ['1440'],
    kinds: ['real-screen', 'building-block'],
    oracle: 'vocabulary-banned',
    requirement: 'No banned vocabulary phrase is visible on screen.'
  }
])

export const SWITCH_FAMILIES = Object.freeze([
  {
    key: 'binding',
    assertionId: 'ui.switch.off-rides-on-html',
    tags: ['happy'],
    oracle: 'ui-switch-contract',
    requirement:
      'When /api/ui lists the switch as hidden, <html data-tracy-hide> carries it and isShown() is false (a locked switch keeps its default).'
  },
  {
    key: 'door-down',
    assertionId: 'ui.switch.door-failure-keeps-default',
    tags: ['dependency-failure'],
    oracle: 'ui-switch-contract',
    requirement: 'When /api/ui fails, the switch keeps its catalogue default.'
  },
  {
    key: 'consumer',
    assertionId: 'ui.switch.has-a-product-consumer',
    tags: ['disabled'],
    oracle: 'claude-ui-switch-rule',
    requirement:
      'An unlocked switch is read by product code (a CSS selector on data-tracy-hide, isShown/keepShown or a tab policy), so pressing it can do something.'
  },
  {
    key: 'tab-policy',
    assertionId: 'ui.switch.tab-policy-follows',
    tags: ['permission'],
    oracle: 'ui-switch-contract',
    requirement:
      'A tab-*/launch-* switch that is off makes tabPolicy().isAllowed / isListed false for each tab it governs.',
    onlyWhen: 'tabs'
  }
])

/** Where the legacy map may live once W1 lands it. */
export const LEGACY_MAP_PATH = 'tests/qa/inventory/legacy-map.json'
export const LEGACY_FINDINGS_PATH = 'tests/qa/inventory/legacy/audit-findings.json'

/** Packages scanned for switch consumers: product code only. */
export const CONSUMER_ROOTS = Object.freeze(['packages', 'apps'])
