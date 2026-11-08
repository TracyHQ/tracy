/**
 * The fix registry of the template readiness verdict (spec #429, ticket #432): for every code the verdict can return,
 * the short fix text and, where one exists, the command or the skill section that does the fixing. This file is the
 * ONLY place fix text lives. A check puts `fixOf(code, params).text` in its params; the readiness command line prints
 * it under each piece that is not green; `test/template-readiness-fixes.test.mjs` fails when a code a module produces
 * has no entry here, and when an entry names a code nothing produces.
 *
 * An entry is `{ text, command?, skill? }`, or `{ green: true }` for a code that needs no fix (the piece is done, or
 * done with nothing to act on). `text` may hold `{name}` placeholders, filled from the params of the piece (a list
 * is joined with commas; a param the piece lacks reads as `<name>`).
 *
 * Not here yet: the codes of the Road to live steps after the verdict's (demo, listing, publish, polish). They join
 * when their steps reach the verdict.
 */
const SKILL = '.agents/skills/quickstart-contract/SKILL.md'
const CONTRACT_SKILL = (section) => `${SKILL} section ${section}`
const TDSR = '.agents/skills/tdsr/SKILL.md'
const KIT_TOOL = 'node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs'
const COVERAGE_TOOL = 'node packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs'
const MEASURE =
  `${COVERAGE_TOOL} --site <local site url> --contract <contract folder> --db-dump <database file> ` +
  '--webroot <unpacked webroot> --out <empty folder outside the repo> --write'
const TAG = "'<quickstart tag>'"
const CUSTOMIZE_CHECK = `node scripts/template-customization-question-readiness.mjs <empty folder> --tag ${TAG}`
const DS_CHECK = `node scripts/template-design-system-readiness.mjs <empty folder> --tag ${TAG} --fetch`

/** The two step 0 commands of the demo baseline (#419): measure it on the untouched site, then record it beside the contract. */
const BASELINE_MEASURE =
  'WRITE_BENCH_BASELINE_DIR=<dir> node apps/tracy-web/scripts/site-check-baseline.mjs --base <untouched demo address> --version {contract} --pages-file <json> (or --site <site key> where tracy-web runs)'
const BASELINE_RECORD = `${KIT_TOOL} baseline --from <dir>/<contract id with / as _>.json --contract <contract folder>`

/** A red demo baseline: measure it on the untouched site, record it beside the contract, commit it. */
const BASELINE_FIX = (what) => ({
  text: `${what} Measure it on a fresh, untouched quickstart site of this version (nobody has written to it), then record it beside the contract and commit demo-baseline.json: ${BASELINE_RECORD}`,
  command: BASELINE_MEASURE
})

const GREEN = Object.freeze({ green: true })
const WAITING = (what) => ({
  text: `Nothing to fix here yet: it waits for ${what}. Fix that first, then this piece is judged.`
})

/** The kit gaps the flow reads (flow-reads.js): the server words each one in the reason; this says where to fix it. */
const KIT_FLOW_GAP = (text, command) => ({ text, command, skill: CONTRACT_SKILL('7') })

/** The command that measures the untouched demo (`demo-measures-check.js` re-exports it). */
export const DEMO_MEASURES_COMMAND =
  'node apps/tracy-web/scripts/demo-measures.mjs --contract <contract folder> (--base <demo address> | --site <site key>) [--pages-file <json>]'

const DEMO_FAULT = {
  text: 'The untouched demo shows a layout fault, so every site built from it starts with it. Fix it in the template (or the demo content the quickstart ships), cut a new template release and quickstart release, then measure that version again with the demo measurements command.',
  command: DEMO_MEASURES_COMMAND
}

/** @type {Readonly<Record<string, { green?: true, text?: string, command?: string, skill?: string }>>} */
export const FIXES = Object.freeze({
  // quickstart-release
  'release-published': GREEN,
  'release-draft': {
    text: 'Publish the GitHub release of the quickstart: a draft cannot be installed by anything.',
    skill: CONTRACT_SKILL('9')
  },
  'no-install-file': {
    text: 'Attach tracy_setting.json to the release: write it with the tracy-setting tool, upload it, then check it.',
    command: `node scripts/tracy-setting.mjs write ${TAG} --label '<label>' --cms '<CMS version>' --template '<template folder>'`
  },
  'install-file-invalid': {
    text: 'tracy_setting.json cannot be read as an install file ({reason}). Write it again with the tracy-setting tool and upload it.',
    command: `node scripts/tracy-setting.mjs check ${TAG}`
  },
  'no-template': {
    text: 'tracy_setting.json names no template. Write it again with --template set to the template folder name and upload it.',
    command: `node scripts/tracy-setting.mjs write ${TAG} --label '<label>' --cms '<CMS version>' --template '<template folder>'`
  },
  'template-not-an-id': {
    text: 'The template "{template}" in tracy_setting.json is not a template folder id. Write it again with the folder name (like ja_restaurant) and upload it.',
    command: `node scripts/tracy-setting.mjs check ${TAG}`
  },
  'asset-missing': {
    text: 'The install file names files the release does not carry ({files}). Attach them to the release, or write the install file again.',
    command: `node scripts/tracy-setting.mjs check ${TAG}`
  },
  'install-file-sha-mismatch': {
    text: 'GitHub states another sha256 than the install file pins for {files}. Write the sha256 of the attached files into tracy_setting.json again, or attach the right files, then upload it.',
    command: `node scripts/tracy-setting.mjs check ${TAG}`
  },
  'install-file-ready': GREEN,

  // contract
  'contract-not-needed': GREEN,
  'contract-exact': GREEN,
  'contract-lower': {
    text: 'The release is on a newer version than its contract ({profile}). Seal a contract for the version it carries before the next release.',
    skill: CONTRACT_SKILL('8')
  },
  'no-contract': {
    text: 'No content contract seals this version of {slug}. Capture one, place it beside the others, and ship it, following the quickstart-contract skill.',
    command: `node packages/cms/tracy-quickstart-tools/batch-contracts.mjs capture --only {slug} --platform {platform} --project-prefix qc-batch --cowork-source <claude-cowork checkout> --artifacts <empty folder outside the repo>`,
    skill: CONTRACT_SKILL('7')
  },
  'sibling-no-contract': {
    text: 'Another release of the same template ({tags}) has no content contract. Capture a contract for it too, following the quickstart-contract skill.',
    skill: CONTRACT_SKILL('7')
  },

  // content coverage
  'coverage-not-needed': GREEN,
  'coverage-ready': GREEN,
  'coverage-waiting': WAITING('the steps before Content coverage'),
  'coverage-not-measured': {
    text: 'Content coverage is not measured for this contract. Measure it on a local site built from the release and commit content-coverage.json beside the contract.',
    command: MEASURE,
    skill: CONTRACT_SKILL('7')
  },
  'coverage-invalid': {
    text: 'content-coverage.json cannot be read ({reason}). Measure again and commit the new file.',
    command: MEASURE,
    skill: CONTRACT_SKILL('7')
  },
  'coverage-stale': {
    text: 'content-coverage.json was measured on another contract ({reason}). Measure again on this one.',
    command: MEASURE,
    skill: CONTRACT_SKILL('7')
  },
  'coverage-holes': {
    text: 'Demo content is not declared, or a page shows a problem customers must never see. Fix every hole in ONE round: the capture rules or the template, then measure again until the command exits 0.',
    command: MEASURE,
    skill: CONTRACT_SKILL('7b')
  },
  'coverage-live-holes': {
    text: 'The published release leaves demo content undeclared or shows page problems. Fix them in the next contract version, then measure again until the command exits 0.',
    command: MEASURE,
    skill: CONTRACT_SKILL('7b')
  },
  'coverage-roles': {
    text: 'Slot roles are missing or invalid in content-map.json. Review every text and image slot, give it a role, then run the slot roles check until it exits 0 and measure again.',
    command: 'node scripts/slot-roles/check.mjs <contract folder>',
    skill: CONTRACT_SKILL('7')
  },
  'coverage-live-roles': {
    text: 'The published release has slots without a valid role. Fix them in the next contract version: review every slot, then run the slot roles check until it exits 0.',
    command: 'node scripts/slot-roles/check.mjs <contract folder>',
    skill: CONTRACT_SKILL('7')
  },
  'coverage-fit': {
    text: 'Slot fit is not measured in content-map.json. Measure it with --fit, which writes it; a released content map never changes, so it goes into the next contract version.',
    command: `${MEASURE} --fit`,
    skill: CONTRACT_SKILL('7')
  },
  'coverage-live-fit': {
    text: 'The published release has no valid slot fit. Measure it with --fit into the next contract version.',
    command: `${MEASURE} --fit`,
    skill: CONTRACT_SKILL('7')
  },
  'coverage-labels': {
    text: 'Label rules (R2 to R9) fail in content-map.json. Fix the capture rules or the content map, run the slot roles check, measure again, and read labelRules in content-coverage.json: every blocking rule must show 0.',
    command: 'node scripts/slot-roles/check.mjs <contract folder>',
    skill: CONTRACT_SKILL('7b')
  },
  'coverage-live-labels': {
    text: 'The published release breaks label rules. Fix them in the next contract version, then measure again until every blocking rule shows 0.',
    command: 'node scripts/slot-roles/check.mjs <contract folder>',
    skill: CONTRACT_SKILL('7b')
  },
  'coverage-judge': {
    text: 'The label judge found slots in the wrong group. Measure again, look at each crop it asks about, write your verdicts and record them, until no slot stays in the wrong group.',
    command: 'node packages/cms/tracy-quickstart-tools/content-coverage/record-judge.mjs',
    skill: CONTRACT_SKILL('7b')
  },
  'coverage-judge-warn': {
    text: 'The label judge has not judged every slot, or found a mismatch, on a published release. Measure again and record the verdicts.',
    command: 'node packages/cms/tracy-quickstart-tools/content-coverage/record-judge.mjs',
    skill: CONTRACT_SKILL('7b')
  },

  // template-kit
  'kit-not-needed': GREEN,
  'kit-approved': GREEN,
  'kit-waiting': WAITING('the steps before the Template kit'),
  'kit-missing': {
    text: 'There is no template-kit.json beside the contract. Capture the kit once per quickstart version and commit it.',
    command: `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`,
    skill: CONTRACT_SKILL('7')
  },
  'kit-invalid': {
    text: 'template-kit.json cannot be read ({reason}). Capture the kit again.',
    command: `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`,
    skill: CONTRACT_SKILL('7')
  },
  'kit-stale': {
    text: 'The kit is out of date: {reason}. Capture it again for this version and contract.',
    command: `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`,
    skill: CONTRACT_SKILL('7')
  },
  'kit-incomplete': {
    text: 'The kit lacks pictures, or shots lack a look text: {reason}. Missing pictures need a new capture; missing looks need text, not a capture.',
    command: `${KIT_TOOL} looks --kit <template-kit.json> --images <dir> --list --to <worklist.json>`,
    skill: '.agents/skills/quickstart-contract/references/image-looks.md'
  },
  'kit-gaps': {
    text: 'The kit found template gaps: defects every site built from the template would carry. Fix each in the template source or the quickstart, build the next quickstart version and capture the kit again. Only a gap that is truly not a defect gets an accepted reason on its entry in templateGaps.',
    command: `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`,
    skill: CONTRACT_SKILL('7')
  },
  'kit-not-approved': {
    text: 'The kit is captured but nobody approved it. A person looks at its pictures on the review sheet and approves them; an agent never does.',
    command: `${KIT_TOOL} sheet --out <dir> --review`,
    skill: CONTRACT_SKILL('7')
  },
  'kit-approval-stale': {
    text: 'The approval covers a different set of pictures than the kit now lists. A person looks at the current pictures and approves again.',
    command: `${KIT_TOOL} sheet --out <dir> --review`,
    skill: CONTRACT_SKILL('7')
  },
  'kit-logo-unsettable': KIT_FLOW_GAP(
    'Give each logo spot the template setting or the content map frame that writes it, then settle the kit again.',
    `${KIT_TOOL} setting-slots --out <dir> --contract <contract folder> --db-command '<client prefix>'`
  ),
  'kit-brand-colour-from-link': KIT_FLOW_GAP(
    'Read the accent from the template colour setting or its primary stylesheet token, not from the link colour, then capture the kit again.',
    `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`
  ),
  'kit-navigation-missing': KIT_FLOW_GAP(
    'List a navigation group for every menu block of the content map, then capture the kit again.',
    `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`
  ),
  'kit-map-mismatch': KIT_FLOW_GAP(
    'Capture the kit on the content map of this contract (it was built on another one).',
    `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`
  ),
  'kit-front-page-group': KIT_FLOW_GAP(
    'Give the front page its own group and shot in the kit, then capture it again.',
    `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`
  ),
  'kit-brand-unreadable': KIT_FLOW_GAP(
    'Complete the site part of the kit that the brand step reads, then capture the kit again.',
    `${KIT_TOOL} build --site <local site url> --contract <contract folder> --out <empty folder> --full`
  ),
  'kit-zip-missing': KIT_FLOW_GAP(
    'Pack the kit images and attach the zip to the release.',
    `${KIT_TOOL} pack --out <dir>`
  ),
  'kit-demo-baseline-missing': KIT_FLOW_GAP(
    'Measure the demo baseline of this version on a fresh untouched quickstart site, record it beside the contract and commit it ({reason}). Then record it with: ' +
      BASELINE_RECORD,
    BASELINE_MEASURE
  ),
  'kit-setting-slot-missing': KIT_FLOW_GAP(
    'Give the map button or the frame painted behind its setting slot that slot, then settle the kit again.',
    `${KIT_TOOL} setting-slots --out <dir> --contract <contract folder> --db-command '<client prefix>'`
  ),
  'kit-hidden-fields-declared': GREEN,
  'kit-hidden-field-missing': {
    text: 'A hidden kit field names nothing and says no reason: {fields}. Read the template layouts and declare what the template prints, or say none with a reason.',
    command: `${KIT_TOOL} <video-buttons|self-link-buttons|hidden-page-links|created-page-hide|legal-layout> --kit <template-kit.json> --none --why '<what was read>'`,
    skill: CONTRACT_SKILL('7')
  },
  'kit-tool-outdated': {
    text: 'Settle the template kit again with the template kit tool {required} or later: copy template-kit.json from beside the contract into a folder, run samples there (it stamps the tool and moves no image, so the approval stays), and commit it back beside the contract.',
    command: `${KIT_TOOL} samples --out <dir> --contract <contract folder>`
  },
  'pin-behind-contract': {
    text: 'Release {latest} of the template if it is not out, then move its pin in the quickstart list from {pinned} to {latest}.',
    skill: CONTRACT_SKILL('8')
  },
  'content-map-missing-lists': {
    text: 'The content map lacks {missing}. Cut the next quickstart version, capture its contract with the current quickstart tools, then run the coverage audit with --fit --write on a site restored from that version: the audit writes the lists into the content map. On WordPress capture with --posts, which makes every published post an entity of the map.',
    command: `${MEASURE} --fit`,
    skill: CONTRACT_SKILL('7')
  },
  'demo-measures-clean': GREEN,
  'demo-measure-missing': {
    text: 'The untouched demo has not been measured. Measure it and commit the file beside the contract.',
    command: DEMO_FAULT.command
  },
  'demo-measure-invalid': {
    text: 'The demo measurements file cannot be read ({reason}). Measure the demo again.',
    command: DEMO_FAULT.command
  },
  'demo-measure-stale': {
    text: 'The demo was measured for {measured}, not {version}. Measure the demo of this version again.',
    command: DEMO_FAULT.command
  },
  'demo-measure-incomplete': {
    text: 'These measures could not tell on the demo: {groups}. Measure again on a host that can read them.',
    command: DEMO_FAULT.command
  },
  // one per fault family of the demo measures (`FAULT_FAMILIES`; the test checks this list against it)
  'demo-main-heading': DEMO_FAULT,
  'demo-empty-block': DEMO_FAULT,
  'demo-overflow': DEMO_FAULT,
  'demo-orphan-row': DEMO_FAULT,
  'demo-blank-footer-column': DEMO_FAULT,

  // cowork-pin
  'cowork-pin-doors-ready': GREEN,
  'cowork-pin-doors-unread': {
    text: 'The Claude Cowork plugin a new site gets could not be read for the write doors ({reason}). Read its doors into the manifest, then check again.',
    skill: CONTRACT_SKILL('8')
  },
  'cowork-pin-missing-doors': {
    text: 'The pinned Claude Cowork plugin {plugin} lacks write doors ({missing}). Move the Cowork pin to {fixVersion} or newer in the quickstart list.',
    skill: CONTRACT_SKILL('8')
  },
  'write-doors-not-judged': {
    text: 'Not judged until the WordPress write step exists. This is not a pass, and there is nothing to fix here; the plugin write doors are judged like Joomla once that step is built.'
  },
  'cowork-release-needed': {
    text: 'No Claude Cowork release has the write doors {doors}. A new plugin release is needed first, then move the Cowork pin to it.'
  },

  // customize
  'customize-ready': GREEN,
  'customize-waiting': WAITING('the release, install file and contract'),
  'customize-not-checked': {
    text: 'Nothing has checked Customize your site for this version. Run the check on this machine, or ask for a check on /ops.',
    command: CUSTOMIZE_CHECK
  },
  'customize-checking': { text: 'The check is running. Wait for it, then read the result.' },
  'customize-error': {
    text: 'The Customize your site check could not run ({reason}). Run it on this machine and read the error.',
    command: CUSTOMIZE_CHECK
  },
  'customize-must-fix': {
    text: 'Customize your site rules fail and hold a new release. Run the check, fix each failing rule in the template or the contract, release, then check again.',
    command: CUSTOMIZE_CHECK
  },
  'customize-live-failing': {
    text: 'The published release fails Customize your site rules. Fix them in the next release; the card stays up meanwhile.',
    command: CUSTOMIZE_CHECK
  },
  'customize-unchecked': {
    text: 'A rule could not read the evidence it needs (the Cowork plugin a new site gets, or what it was read for, changed). Run the check again and fix what it cannot read.',
    command: CUSTOMIZE_CHECK
  },
  'customize-live-unchecked': {
    text: 'A rule of the published release could not read its evidence. Run the check again and fix what it cannot read.',
    command: CUSTOMIZE_CHECK
  },
  'customize-worth-fixing': {
    text: 'Only worth-fixing rules remain. They do not hold a release; fix them when the template is next touched.',
    command: CUSTOMIZE_CHECK
  },

  // design-system
  'ds-ready': GREEN,
  'ds-waiting': WAITING('the release and install file'),
  'ds-not-checked': {
    text: 'Nothing has checked the Design system for this version. Run the check on this machine, or ask for a check on /ops.',
    command: DS_CHECK,
    skill: TDSR
  },
  'ds-checking': { text: 'The check is running. Wait for it, then read the result.' },
  'ds-error': {
    text: 'The Design system check could not run ({reason}). Run it on this machine and read the error.',
    command: DS_CHECK,
    skill: TDSR
  },
  'ds-not-at-probe': {
    text: 'The Design system has no measurement at the current preview probe, so it was not judged. Measure the released version again.',
    skill: `${TDSR} section 3`
  },
  'ds-must-fix': {
    text: 'Design system rules fail and hold a new release. Fix each failing rule in the template, release again, then check.',
    command: DS_CHECK,
    skill: `${TDSR} section 2`
  },
  'ds-live-failing': {
    text: 'The published release fails Design system rules. Fix them in the next release; the card stays up meanwhile.',
    command: DS_CHECK,
    skill: `${TDSR} section 4`
  },
  'ds-not-measured': {
    text: 'A rule on the built site has no measurement yet (it holds a new release only when the rule file says so). Measure the built site and commit the measurement file.',
    skill: `${TDSR} section 3`
  },
  'ds-worth-fixing': {
    text: 'Only worth-fixing Design system rules remain. They do not hold a release; fix them when the template is next touched.',
    command: DS_CHECK,
    skill: `${TDSR} section 2`
  },

  // demo-baseline (demo-baseline-check.js)
  'demo-baseline-recorded': GREEN,
  'demo-baseline-waiting': WAITING('a contract that seals this version'),
  'demo-baseline-missing': BASELINE_FIX('There is no demo baseline of {contract} beside the contract.'),
  'demo-baseline-invalid': BASELINE_FIX('The demo baseline of {contract} cannot be used ({reason}).'),
  'demo-baseline-stale': BASELINE_FIX('The demo baseline beside {contract} is of another version ({reason}).')
})

/** A `{name}` placeholder filled from the params: a list joined with commas, a missing param shown as `<name>`. */
function fill(text, params) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    const v = params?.[name]
    if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : `<${name}>`
    return v === undefined || v === null || v === '' ? `<${name}>` : String(v)
  })
}

/**
 * The fix of one verdict code, placeholders filled from `params`; null for a code that needs none (green) or that has
 * no entry.
 * @param {string} code
 * @param {Record<string, unknown>} [params]
 * @returns {{ text: string, command?: string, skill?: string } | null}
 */
export function fixOf(code, params = {}) {
  const entry = FIXES[code]
  if (!entry || entry.green === true || typeof entry.text !== 'string') return null
  const out = { text: fill(entry.text, params) }
  if (entry.command) out.command = fill(entry.command, params)
  if (entry.skill) out.skill = entry.skill
  return out
}

/**
 * The states of a road step that carry the registry's text: to do now, done with something worth fixing, or not judged
 * (the text says why, and that there is nothing to fix: the WordPress write doors, #454).
 */
const NEEDS_FIX = new Set(['todo', 'warn', 'not-judged'])

/**
 * A road with the registry's fix on each step that asks for one (`todo`, `warn`, or `not-judged`), as `fix`, so Road to live shows
 * the fix text under a red step from this registry alone. A step whose code has no entry (the steps after the
 * verdict's) gets none. The road handed in is not changed.
 * @template {{ state: string, code: string, params?: Record<string, unknown> }} S
 * @param {S[] | null} road
 * @returns {(S & { fix?: { text: string, command?: string, skill?: string } })[] | null}
 */
export function withFixes(road) {
  if (!Array.isArray(road)) return road
  return road.map((s) => {
    if (!NEEDS_FIX.has(s.state)) return s
    const fix = fixOf(s.code, s.params ?? {})
    return fix ? { ...s, fix } : s
  })
}
