/**
 * The site context block and the brakes around it. The block is product (the agent reads it every
 * step), so its tests hold invariants: the right door per platform and seal, the names that must not
 * appear, the order that matters, the byte budget. Whole sentences are not pinned; a key phrase is.
 * Brakes (`stepBudget`, `turnLength`, `refusalStreak`) are tables of logs → verdicts.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { EMDASH_LANGUAGE_RULE, EMDASH_WORDS_ROAD } from '../src/host/emdash.mjs'
import { LEGACY_STRUCTURE_CODE } from '../src/host/legacy-refusal.mjs'
import {
  CONTRACT_LANGUAGE_RULE,
  LOCAL_ACTIONS,
  RELAY_ACTIONS,
  WORDPRESS_CONTRACT_LANGUAGE_RULE
} from '../src/host/site.mjs'
import {
  ACTION_CLASSES,
  actionRunsInParallel,
  addressLine,
  ANSWER_ORDER,
  answersLine,
  buildLine,
  callVerb,
  changesSite,
  contractDoorOf,
  derivedContractOf,
  contractOperationWrites,
  GUIDE_RULE,
  BUILD_RULES_RULE,
  TAKE_AWAY_LINE,
  hasPlan,
  isNoticeFrom,
  lastSiteContext,
  lastSiteState,
  lastToday,
  lookLine,
  loopNotices,
  buildSizeOf,
  noticeSource,
  REFUSAL_STREAK_PLUGIN,
  REPLACE_PLATFORMS,
  refusalStreak,
  refusalStreakNotice,
  refusalStreakSummary,
  replaceKey,
  resultOutcomeUnknown,
  resultWentThrough,
  SITE_CONTEXT_PLUGIN,
  SITE_NOTICE_KIND,
  SITE_STATE_PLUGIN,
  STEP_BUDGET_PLUGIN,
  sessionPreset,
  siteContext,
  sitePlatform,
  siteStateNotice,
  stepBudget,
  buildsSite,
  buildChecks,
  changedSinceCheck,
  PLAN_FROZEN_NEXT,
  planIssuesNext,
  checkAnswerForAgent,
  checkAgainNext,
  checkAgainStep,
  contextRoom,
  BUILD_CHECKS,
  stepBudgetNotice,
  TODAY_PLUGIN,
  TURN_LENGTH_PLUGIN,
  measuredFacts,
  quickstartReleaseOf,
  todayNotice,
  toolReach,
  turnLength,
  turnLengthNotice,
  WHERE_MAP_RELEASES
} from '../src/host/site-context.mjs'
import { WP_SEO_META, WP_SEO_PLUGINS } from '../src/host/wp-seo.mjs'
import { SURFACE_ACTIONS, surfaceOf } from '../src/host/surface.mjs'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

const here = path.dirname(fileURLToPath(import.meta.url))

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

const neverAsked = async () => {
  throw new Error('platform detection should not run')
}

function siteFolder(label) {
  const folder = path.join(mkdtempSync(path.join(tmpdir(), 'site-context-')), label)
  mkdirSync(folder, { recursive: true })
  return folder
}

/**
 * A site folder with a webroot, a platform record, and optionally a contract marker, measured facts and an
 * EmDash template handoff (`template/artifact.json`).
 */
function sealedSite(label, platform, { marker, facts, artifact } = {}) {
  const folder = siteFolder(label)
  mkdirSync(path.join(folder, '.tracy'))
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform })
  )
  mkdirSync(path.join(folder, '.webroot'))
  writeFileSync(path.join(folder, '.webroot', 'AGENTS.md'), '# the template documents itself\n')
  writeFileSync(path.join(folder, 'AGENTS.md'), '# how to work on this site\n')
  if (marker !== undefined) {
    mkdirSync(path.join(path.dirname(folder), '.content-contracts'), { recursive: true })
    writeFileSync(
      path.join(path.dirname(folder), '.content-contracts', `${label}.json`),
      JSON.stringify(marker)
    )
  }
  if (artifact !== undefined) {
    mkdirSync(path.join(folder, 'template'))
    writeFileSync(path.join(folder, 'template', 'artifact.json'), JSON.stringify(artifact))
  }
  if (facts !== undefined) {
    mkdirSync(path.join(path.dirname(folder), '.site-facts'), { recursive: true })
    writeFileSync(
      path.join(path.dirname(folder), '.site-facts', `${label}.json`),
      JSON.stringify({ format: 1, facts })
    )
  }
  return folder
}

/** The context text of a site of `platform` with the given seal/facts. */
async function textOf(label, platform, options = {}, preset, opts) {
  const { text } = await siteContext(sealedSite(label, platform, options), label, neverAsked, preset, opts)
  return text
}

/** A webroot-only folder whose platform comes from the detector, as a fresh site has. */
async function bareText(label, platform, preset, opts) {
  const folder = siteFolder(label)
  mkdirSync(path.join(folder, '.webroot'))
  const context = await siteContext(folder, label, async () => platform, preset, opts)
  return context?.text ?? ''
}

const line = (text, start) => text.split('\n').find((one) => one.startsWith(start)) ?? ''
const rowOf = (text) => line(text, '- Where visible text lives:')

const JOOMLA_FACTS = {
  template: 'tracy_business',
  templateStyleId: 120,
  breadcrumbsModuleId: 426,
  languages: ['en-GB', 'ru-RU']
}
const WP_FACTS = {
  theme: 'wp-tracy-business',
  themeKind: 'block',
  permalinks: '/%postname%/',
  activePlugins: 3
}
const WP_BOUND = {
  contract: 'tracy-business/wp7/1.2.0',
  platform: 'wordpress',
  quickstart: 'tracy-business/wp7',
  coworkMinVersion: '0.12.1',
  coworkContractVersion: '0.13.2',
  policy: 1
}

/** The template handoff a Tracy Business EmDash site carries (`template/artifact.json`). */
const TRACY_BUSINESS_EMDASH = {
  templateId: 'tracy-business',
  version: '1.7.0',
  cms: { name: 'emdash', version: '0.38.0' }
}

/** Assert every regex in `has` matches and every one in `hasNot` does not, naming the case. */
function assertText(text, { has = [], hasNot = [] }, label) {
  for (const re of has) assert.match(text, re, `${label}: ${String(re)}`)
  for (const re of hasNot) assert.doesNotMatch(text, re, `${label}: ${String(re)}`)
}

// ── the header block ─────────────────────────────────────────────────────────────────────────────────

{
  const recorded = siteFolder('demo9090')
  mkdirSync(path.join(recorded, '.tracy'))
  writeFileSync(
    path.join(recorded, '.tracy', 'site.json'),
    '{"siteKey":"demo9090.tracy.test","platform":"joomla"}'
  )
  mkdirSync(path.join(recorded, '.webroot'))
  const cases = [
    {
      label: 'installed, recorded',
      folder: recorded,
      key: 'demo9090',
      has: [
        /This workspace is the site demo9090\.tracy\.test\./,
        /- Site: demo9090\.tracy\.test \(joomla\)/,
        /`\.webroot\/` is the live site/
      ],
      hasNot: [/Started from|Brand extracted|Build:/],
      summary: 'demo9090.tracy.test · joomla'
    },
    {
      label: 'no webroot yet',
      folder: siteFolder('adeeeeee'),
      key: 'adeeeeee',
      has: [/- Site: adeeeeee \(unknown\)/, /the site is not installed/],
      hasNot: [],
      summary: 'adeeeeee · unknown · not installed'
    }
  ]
  for (const { label, folder, key, has, hasNot, summary } of cases)
    test(`header: the site is named from its record, the webroot is live, a site not installed says so: ${label}`, async () => {
      const context = await siteContext(folder, key, neverAsked)

      assertText(context.text, { has, hasNot }, label)
      assert.equal(context.summary, summary, label)
    })
}

test('header: a fork, its brand and the build make the context; the build moves as its own notice', async () => {
  const folder = siteFolder('forked')
  mkdirSync(path.join(folder, '.webroot'))
  mkdirSync(path.join(folder, 'docs', 'agents', 'build', 'sites'), { recursive: true })
  writeFileSync(
    path.join(folder, 'docs', 'agents', 'start-from.json'),
    '{"url":"https://example.com/","id":"brand:example.com"}'
  )
  mkdirSync(path.join(folder, 'Brand', 'example.com'), { recursive: true })
  writeJob(folder, 'forked', {
    status: 'running',
    stages: [
      { name: 'check', status: 'done' },
      { name: 'seed', status: 'running' }
    ]
  })

  const context = await siteContext(folder, 'forked', async () => 'wordpress')

  assertText(
    context.text,
    {
      has: [
        /- Site: forked \(wordpress\)/,
        /- Started from: https:\/\/example\.com\/ \(design brand:example\.com\)/,
        /never copy its sentences or logo/,
        /- Brand extracted: Brand\/example\.com/
      ],
      hasNot: [/- Build:/]
    },
    'fork'
  )
  assert.deepEqual(context.state, { build: 'running "seed" (2 of 2)' })
  assert.match(siteStateNotice(context.state)?.text ?? '', /- Build: running "seed" \(2 of 2\)/)
})

test('header: the site the build dressed is named when it is not this workspace, and the fence stays whole', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ctx-'))
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  mkdirSync(path.join(dir, '.webroot'), { recursive: true })
  writeFileSync(
    path.join(dir, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'site-4x82yk.tracy.test', platform: 'emdash' })
  )
  mkdirSync(path.join(dir, 'docs', 'agents', 'build', 'sites'), { recursive: true })
  writeFileSync(
    path.join(dir, 'docs', 'agents', 'build', 'sites', 'ban-xe-noi-that.tracy.test.json'),
    JSON.stringify({
      job: 'build-one',
      status: 'done',
      targetSiteKey: 'ban-xe-noi-that.tracy.test',
      stages: [{ name: 'check', status: 'done' }]
    })
  )

  const { text } = await siteContext(dir, 'site-4x82yk', async () => 'emdash', 'designer-emdash')

  assertText(
    text,
    {
      has: [/ban-xe-noi-that\.tracy\.test/, /open that workspace/, /SITE_OUTSIDE_CONVERSATION/],
      hasNot: [/pass `siteKey/]
    },
    'other site'
  )
})

test('header: a mode written for another platform is named and this site wins; a matching mode or none says nothing', async () => {
  const folder = siteFolder('wpmode')
  mkdirSync(path.join(folder, '.webroot'))
  const detect = async () => 'wordpress'

  const mismatch = await siteContext(folder, 'wpmode', detect, 'designer-joomla')

  assert.match(mismatch.text, /- Your mode was written for joomla; this site runs wordpress\./)
  assert.equal(mismatch.summary, 'wpmode · wordpress')
  for (const preset of ['designer-wordpress', 'standard', null, undefined]) {
    const context = await siteContext(folder, 'wpmode', detect, preset)
    assert.doesNotMatch(context.text, /Your mode was written for/, String(preset))
  }
  const unknown = await siteContext(siteFolder('blank'), 'blank', neverAsked, 'writer-emdash')
  assert.doesNotMatch(
    unknown.text,
    /Your mode was written for/,
    'no platform known: nothing to disagree with'
  )
})

{
  const agent = (events, header = {}) => ({
    session: { seq: events.length, eventAt: (seq) => events[seq], header }
  })
  const selected = (agentPreset) => ({ type: 'agent-preset/selected', data: { agentPreset } })
  const rows = [
    [agent([], { agentPreset: 'writer-joomla' }), 'writer-joomla'],
    [
      agent(
        [
          selected('designer-joomla'),
          selected('designer-wordpress'),
          { type: 'turn/start', data: { turn: 1 } }
        ],
        { agentPreset: 'writer-joomla' }
      ),
      'designer-wordpress'
    ],
    [agent([]), null],
    [undefined, null]
  ]
  for (const [input, expected] of rows)
    test(`sessionPreset: the last selection before the first turn, else the header: ${rowName(input)}`, () => {
      assert.equal(sessionPreset(input), expected)
    })
}

const emdashHandoff = () => {
  const folder = siteFolder('platform-handoff')
  mkdirSync(path.join(folder, 'template'))
  writeFileSync(
    path.join(folder, 'template', 'artifact.json'),
    JSON.stringify({ templateId: 'tracy-business', cms: { name: 'emdash', version: '0.38.0' } })
  )
  mkdirSync(path.join(folder, '.webroot'))
  return folder
}
const webrootOnly = () => {
  const folder = siteFolder('platform-files')
  mkdirSync(path.join(folder, '.webroot'))
  return folder
}
const PLATFORM_ROWS = [
  {
    label: 'the record',
    folder: () => sealedSite('platform-record', 'wordpress'),
    detect: neverAsked,
    expected: 'wordpress'
  },
  {
    label: 'the EmDash handoff (no CMS marker in .webroot)',
    folder: emdashHandoff,
    detect: neverAsked,
    expected: 'emdash'
  },
  {
    label: 'detected from the webroot',
    folder: webrootOnly,
    detect: async () => 'joomla',
    expected: 'joomla'
  },
  {
    label: 'nothing to read',
    folder: () => siteFolder('platform-none'),
    detect: neverAsked,
    expected: 'unknown'
  }
]
for (const { label, folder, detect, expected } of PLATFORM_ROWS)
  test(`sitePlatform: the record, then the EmDash handoff, then the webroot: ${label}`, async () => {
    assert.equal(await sitePlatform(folder(), detect), expected)
  })

test('sitePlatform: the context names the platform the EmDash handoff gives', async () => {
  const handoff = emdashHandoff()

  const { text } = await siteContext(handoff, 'platform-handoff', neverAsked)

  assert.match(text, /- Site: platform-handoff \(emdash\)/)
})

// ── the rules every platform carries ─────────────────────────────────────────────────────────────────

const EVERY_PLATFORM = ['joomla', 'wordpress', 'emdash']

{
  const shared = {
    has: [
      /SPLIT THE MESSAGE INTO REQUESTS, SIZE EACH ON ITS OWN, before the first tool call/,
      /before the first tool call, and say plainly what you will do\. Two unrelated asks/,
      /Two unrelated asks are two requests/,
      /ONE JOB: make the smallest change that does it, then say what changed, plainly\. The preview beside the chat reloads by itself when the turn ends: do not ask the customer to reload the page to see it\./,
      /SEVERAL JOBS:/,
      /DECIDE THE LAYER BEFORE THE FIRST CALL\./,
      /the WORDS somebody wrote · the SETTINGS .* · the PHRASES .* · the PRESENTATION, layout and styling · WHAT IS INSTALLED/,
      /A request may SPAN layers/,
      /ASK THEM ALL IN ONE STEP/,
      /A QUESTION about what the site shows is ONE `page\.text` read/,
      /A change that needs a FACT only the customer knows/,
      /So is one they say they gave before, unless a Site notes notice holds it: ask, it is in no file\./,
      /Words you are asked to write or improve are yours to write/,
      /A vague ask over several pages/,
      /A request already true is said, not asked — after a read of this turn, never from memory\./,
      /A section's title is its heading, not the small label line above it\./,
      /Do not read a page, a record or a receipt after a write unless the customer asks/,
      /Never save a copy before writing/,
      /one plain overview against your list/,
      /an item with no writes was not done, and a write under no item was not asked for/,
      /the order is not preference/,
      /a record has to EXIST before anything can point at it/,
      /a language has to be INSTALLED before anything can be written in it/,
      /a delete goes LAST among items touching the same record/,
      /Items with no such tie are in no particular order/,
      /`NOT_SIGNED_IN` and `NO_VIEWER` are this session, not this site/
    ],
    hasNot: [
      /Cassiopeia|CASSIOPEIA/,
      /Do not photograph a page to confirm/,
      /-web-1/,
      /AGENTS\.md was written for every site/,
      /reaches every language copy/,
      /an override apiece/
    ]
  }
  for (const platform of EVERY_PLATFORM)
    test(`rules: every platform sizes the job before the first call, names the layer, asks its reads in one step and questions before jobs: ${rowName(platform)}`, async () => {
      const text = await textOf(`rules-${platform}`, platform)

      assertText(text, shared, platform)
      assert.equal(
        text.split('say plainly what you will do').length - 1,
        1,
        `${platform}: the plan sentence is said once`
      )
      assert.ok(
        text.indexOf('DECIDE THE LAYER BEFORE THE FIRST CALL') < text.indexOf('ASK THEM ALL IN ONE STEP'),
        `${platform}: batching stays attached to the layer rule`
      )
      assert.ok(
        text.indexOf('A QUESTION about') < text.indexOf('ONE JOB: make'),
        `${platform}: questions are sized before the job rules`
      )
    })
}

for (const platform of EVERY_PLATFORM)
  test(`rules: the context names no container address: ${platform}`, async () => {
    const text = await bareText(`port-${platform}`, platform)

    assertText(text, { hasNot: [/-web-1/] }, platform)
  })

test('rules: the Seeing line is byte-identical on all three platforms and names page.text before page.look', async () => {
  const lines = await Promise.all(
    EVERY_PLATFORM.map(async (platform) =>
      line(await bareText(`seeing-${platform}`, platform), '- Seeing a page')
    )
  )

  assert.equal(new Set(lines).size, 1)
  assertText(lines[0], {
    has: [
      /page\.text/,
      /`page\.look` only for how a page LOOKS/,
      /`web_fetch` cannot open this site's public address/
    ],
    hasNot: [/no screenshot|no browser/]
  })
})

test('rules: delete and install answer CONFIRM_FIRST with the door’s own question, never one of the agent’s first', async () => {
  const emdash = await textOf('confirm-ed', 'emdash')
  assert.doesNotMatch(emdash, /Before `content\.delete`/, 'EmDash’s door says it in its own description')
})

{
  for (const platform of ['joomla', 'wordpress'])
    test(`rules: delete and install answer CONFIRM_FIRST with the door’s own question, never one of the agent’s first: ${rowName(platform)}`, async () => {
      const text = await bareText(`confirm-${platform}`, platform)

      assertText(
        text,
        {
          has: [
            /CONFIRM_FIRST with the question to ask: when the target is clear, make the call, then ask exactly that question — never one of your own before it, or the customer answers twice/
          ],
          hasNot: [/confirm with `ask_user_question`|unless the customer asked for exactly that/]
        },
        platform
      )
    })
}

test('rules: a language request reaches a pack first, and the words rule is EmDash’s own on EmDash', async () => {
  const joomla = await textOf('lang-j', 'joomla')
  const wordpress = await textOf('lang-wp', 'wordpress')
  const emdash = await textOf('lang-ed', 'emdash')

  assertText(
    joomla,
    {
      has: [
        /A TRANSLATION YOU CAN INSTALL BEATS ONE YOU WRITE/,
        /a language missing from it is an answer, not a reason to search the web/,
        /`extension\.install \{url\}`/,
        /words change on the page meant, in the site's default language/
      ]
    },
    'joomla'
  )
  assertText(
    wordpress,
    {
      has: [
        /`language\.install \{locale\}`/,
        /words change on the page meant, in the site's default language/
      ]
    },
    'wordpress'
  )
  assertText(
    emdash,
    { has: [], hasNot: [/words change on the page meant, in the site's default language/] },
    'emdash'
  )
  assert.ok(emdash.includes(EMDASH_LANGUAGE_RULE))
})

test('rules: the site context names no reply language — the turn does (bug 30/09)', async () => {
  // A Russian company's site, edited by a Vietnamese team member writing English: "Reply in the
  // customer's language" named three candidates, and the model answered two English turns in
  // Chinese. The reply's language is each turn's fact (`replyLanguageRule`), never the site's.
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const text = await textOf(`reply-${platform}`, platform)
    assert.doesNotMatch(text, /customer's language|Reply in /, platform)
  }
})

const ONE_JOB_CASES = [
  {
    label: 'open joomla',
    build: () => textOf('plan-j', 'joomla'),
    has: [
      /give each its own `apply_id` so `apply\.revert` undoes that item and nothing else/,
      /Say it from the write's own answer/
    ],
    hasNot: [/Count door calls, not slots/, /read every one of those ids back/]
  },
  {
    label: 'sealed joomla',
    build: () => textOf('plan-js', 'joomla', { marker: { contract: 'tracy-business/j6/1.2.0' } }),
    has: [/Count door calls, not slots: one contract apply is one write/, /Every item goes into ONE apply/],
    hasNot: [/give each its own `apply_id`/, /`apply\.list`/]
  },
  {
    label: 'emdash',
    build: () => textOf('plan-ed', 'emdash'),
    has: [
      /At the end put the answers of your writes in one plain overview against your list/,
      /the old value you read, or the write's receipt, is the undo/
    ],
    hasNot: [/give each its own `apply_id`/, /docs\/agents\/db-changes/]
  },
  {
    label: 'wordpress',
    build: () => textOf('plan-wp', 'wordpress'),
    has: [/`apply\.revert \{apply_id\}` puts the old bytes back/],
    hasNot: [/read every one of those ids back/]
  }
]
for (const { label, build, has, hasNot } of ONE_JOB_CASES)
  test(`rules: ONE JOB reports from the writes’ own answers, the plan is one apply on a contract door and an id per item elsewhere: ${label}`, async () => {
    assertText(await build(), { has, hasNot }, label)
  })

test('rules: the WordPress read-back flag adds the one exception to ONE JOB, and moves no other platform', async () => {
  const oneJob = (text) => line(text, 'ONE JOB:')
  const flagged = await textOf('fallback-wp', 'wordpress', {}, null, { wordpressReadBack: true })

  assert.match(
    oneJob(flagged),
    /except after a post or templatePart write: `content\.get` that record once to check the body is whole/
  )
})

{
  const oneJob = (text) => line(text, 'ONE JOB:')
  for (const platform of ['joomla', 'emdash'])
    test(`rules: the WordPress read-back flag adds the one exception to ONE JOB, and moves no other platform: ${rowName(platform)}`, async () => {
      const plain = await textOf(`flag-${platform}`, platform)
      const withFlag = await textOf(`flag-${platform}`, platform, {}, null, { wordpressReadBack: true })
      assert.equal(oneJob(withFlag), oneJob(plain), platform)
      assert.doesNotMatch(oneJob(plain), /except after/, platform)
    })
}

// ── the door per platform and seal ───────────────────────────────────────────────────────────────────

const SEALS = {
  joomla: {
    marker: { contract: 'tracy-business/j6/1.1.0', design: 'tracy-business/j6/1.1.0' },
    facts: JOOMLA_FACTS
  },
  wordpressRecord: {
    marker: { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress' },
    facts: { theme: 'wp-tracy-business', themeKind: 'block' }
  },
  wordpressBound: { marker: WP_BOUND, facts: { theme: 'wp-tracy-business', themeKind: 'block' } }
}
const LAYERS = ['WORDS', 'SETTINGS', 'PHRASES', 'PRESENTATION', 'INSTALLED']

const DOOR_VARIANTS = [
  {
    label: 'open joomla',
    build: () => textOf('door-j', 'joomla', { facts: JOOMLA_FACTS }),
    has: [
      /WORDS — articles, menu items, module text: `content\.update`/,
      /INSTALLED — `extension\.list`/,
      /`content\.list` kind `language`/,
      /the default template style's `siteTitle`/,
      /the template falls back to the logo IT ships/,
      /A write through the door clears Joomla's cache itself; only a FILE edit/,
      /cache:clean/,
      /- This site, measured:/,
      /THIS SITE DOCUMENTS ITSELF/,
      /- Webroot: `\.webroot\/` is the live site; an edit there is live/
    ],
    hasNot: [/Count door calls/, /After any change, clear the cache/]
  },
  {
    label: 'sealed joomla',
    build: () => textOf('door-js', 'joomla', SEALS.joomla),
    has: [
      /- Content contract \(tracy-business\/j6\/1\.1\.0\): this quickstart maps its/,
      /`content\.read`/,
      /ONE apply carrying every change/,
      /`content\.contract \{operation:"inspect"/,
      /A heading on two lines is two slots/,
      /changes as on any Joomla site: `tracy_site` `content\.update`/,
      /never SQL/,
      /- Webroot: `\.webroot\/` is the live site; an edit there is live the moment it is saved/
    ],
    hasNot: [
      /WORDS — articles, menu items, module text: `content\.update`/,
      /- This site, measured:/,
      /THIS SITE DOCUMENTS ITSELF/,
      /docs\/agents\/db-changes/,
      /Before `content\.delete`/,
      /A TRANSLATION YOU CAN INSTALL/,
      /ASK THE DOOR, NOT THE FOLDER/,
      /never with a file tool/
    ]
  },
  {
    label: 'open wordpress',
    build: () => textOf('door-wp', 'wordpress', { facts: WP_FACTS }),
    has: [
      /a page or post is kind `post`, its fields `post_title`\/`post_content`\/`post_excerpt`/,
      /always with `id`/,
      /kind `templatePart`/,
      /`wp_navigation` posts/,
      /categories and tags are kind `term`/,
      /`blogname` and `blogdescription`/,
      /`language\.install \{locale\}`/,
      /a translation file of your own or a `gettext` filter/,
      /`content\.delete`, `media\.delete`, and installing or activating a plugin or theme, answer CONFIRM_FIRST with the question to ask/,
      /If a page cache plugin is active, flush after a change/,
      /a block theme — that decides which edit works/,
      /write the note before the change: a file under `docs\/agents\/db-changes\/` in this folder naming the table and the row, the value before, the value after, and how to put the old value back\. Then make the change, and tell the customer you kept a note\./
    ],
    hasNot: [
      /db\.snapshot|db\.rollback|core\.upgrade/,
      /`category`, `tag`/,
      /plugins? active/,
      /content\.contract/
    ]
  },
  {
    label: 'sealed wordpress (record road)',
    build: () => textOf('door-wps', 'wordpress', SEALS.wordpressRecord),
    has: [
      /- Quickstart site: words and structure change through `tracy_site`, record by record/,
      /a page or post is kind `post`/,
      /a block theme — that decides which edit works/,
      /then write an override only for what it does not cover/
    ],
    hasNot: [
      /- Content contract/,
      /content\.contract/,
      /docs\/agents\/db-changes/,
      /closed here|say so\./,
      /db\.snapshot|db\.rollback|core\.upgrade/
    ]
  },
  {
    label: 'wordpress bound to its contract',
    build: () => textOf('door-wpb', 'wordpress', SEALS.wordpressBound),
    has: [
      /- Content contract \(tracy-business\/wp7\/1\.2\.0\): this quickstart maps its words, links and pictures to named slots/,
      /keyed `<page>\.<block>`/,
      /`content\.read` shows them/,
      /A picture slot takes the path media\.draw/,
      /changes as on any WordPress site: `tracy_site` `content\.update`/,
      /Count door calls, not slots/,
      /Every item goes into ONE apply/
    ],
    hasNot: [
      /- Quickstart site: .*record by record/,
      /language\.add|tracy_site_build_joomla/,
      /slots:"text"|\[Tracy\] Site identity|title-accent|module-/,
      /- This site, measured:/,
      /A TRANSLATION YOU CAN INSTALL|Before `content\.delete`|ASK THE DOOR, NOT THE FOLDER/,
      /docs\/agents\/db-changes|THIS SITE DOCUMENTS ITSELF/
    ]
  },
  {
    label: 'emdash',
    build: () => textOf('door-ed', 'emdash'),
    has: [
      /words, pictures, menus and settings go through `tracy_emdash`/,
      /Find the words in content first/,
      /its `tagline` is printed nowhere/,
      /SETTINGS — `settings_update`/,
      /Fields ending `_a` and `_b` are ONE heading on two lines/,
      /`bash` in the site's container edits it/,
      /`tracy_site_build_emdash request site\.rebuild`/,
      /No PHP and no CLI/
    ],
    hasNot: [
      /\{list: ?true\}/,
      /locale:"en"/,
      /`content\.get`|`content\.update`|`apply\.\*`/,
      /a language among them/,
      /There is NO `\.webroot\/`|for LOOKING only/,
      /docs\/agents\/db-changes/,
      /an edit there needs a rebuild/,
      /every layer goes through/,
      /never in `\/app` or/
    ]
  }
]
const doorVariant = (label) => DOOR_VARIANTS.find((v) => v.label === label)
const NO_LAYER_ROWS = ['sealed joomla', 'wordpress bound to its contract', 'emdash']

for (const { label, build, has, hasNot } of DOOR_VARIANTS)
  test(`door: each platform and seal is told the door that works for it, and none the seal refuses: ${label}`, async () => {
    const text = await build()

    assertText(text, { has, hasNot }, label)
    if (!NO_LAYER_ROWS.includes(label))
      for (const layer of LAYERS) assert.match(text, new RegExp(`${layer} —`), `${label}: ${layer}`)
  })

test('door: the EmDash row answers every layer and quotes the words road, then the language rule, verbatim', async () => {
  const text = await doorVariant('emdash').build()
  const row = rowOf(text)

  for (const layer of LAYERS) assert.match(row + text, new RegExp(layer), layer)
  assert.ok(row.includes(EMDASH_WORDS_ROAD), 'the words road is quoted verbatim')
  assert.ok(
    row.includes(`${EMDASH_WORDS_ROAD} ${EMDASH_LANGUAGE_RULE}`),
    'the language rule follows the road'
  )
})

for (const label of ['open joomla', 'open wordpress'])
  test(`door: only EmDash names EmDash's language rule: ${label}`, async () => {
    const text = await doorVariant(label).build()

    assert.ok(!rowOf(text).includes(EMDASH_LANGUAGE_RULE))
  })

test('door: a sealed Joomla row carries the shared language rule verbatim and none of the apply’s own rules', async () => {
  const row = rowOf(await doorVariant('sealed joomla').build())

  assert.ok(row.includes(CONTRACT_LANGUAGE_RULE))
  assert.doesNotMatch(
    row,
    /expected_revision|apply_id|request_id|requiresEvidence|evidence:|cannot be emptied/
  )
})

test('door: a WordPress bound to its contract carries its own language rule verbatim, never Joomla’s', async () => {
  const text = await doorVariant('wordpress bound to its contract').build()

  assert.ok(rowOf(text).includes(WORDPRESS_CONTRACT_LANGUAGE_RULE))
  assert.ok(!text.includes(CONTRACT_LANGUAGE_RULE))
})

test('door: a sealed site of unknown platform gets the contract line and no Joomla row; a 1.2.0 Joomla names its identity slot the same on every version', async () => {
  const folder = siteFolder('sealedblank')
  mkdirSync(path.join(folder, '.webroot'))
  mkdirSync(path.join(path.dirname(folder), '.content-contracts'))
  writeFileSync(path.join(path.dirname(folder), '.content-contracts', 'sealedblank.json'), '{}')
  const unknown = await siteContext(folder, 'sealedblank', async () => 'unknown')
  const rows = []
  for (const version of ['1.1.0', '1.2.0']) {
    const text = await textOf(`identity-${version.replaceAll('.', '')}`, 'joomla', {
      marker: { contract: `tracy-business/j6/${version}` }
    })
    rows.push(rowOf(text))
  }

  assertText(
    unknown.text,
    {
      has: [/- Content contract: this quickstart maps its/],
      hasNot: [/- Where visible text lives:/, /content contract's slots/]
    },
    'unknown'
  )
  assertText(
    rows[0],
    {
      has: [/If the inspect lists `\[Tracy\] Site identity`/],
      hasNot: [/logo[^.]*cannot change|logo's name and tagline/i]
    },
    'identity'
  )
  assert.equal(rows[0], rows[1], 'one row for every contract version')
})

{
  const marker = (label, body) => {
    const folder = siteFolder(label)
    mkdirSync(path.join(folder, '.webroot'))
    mkdirSync(path.join(path.dirname(folder), '.content-contracts'), { recursive: true })
    if (body !== undefined)
      writeFileSync(path.join(path.dirname(folder), '.content-contracts', `${label}.json`), body)
    return folder
  }
  const unreadable = siteFolder('unreadable')
  mkdirSync(path.join(unreadable, '.webroot'))
  writeFileSync(path.join(path.dirname(unreadable), '.content-contracts'), 'not a directory') // every stat under it fails ENOTDIR
  const cases = [
    {
      label: 'contract and design differ',
      folder: marker(
        'voyara',
        '{"contract":"ja-voyara/j6/1.0.1","design":"voyara","requested":"voyara","policy":1}'
      ),
      has: [/- Content contract \(ja-voyara\/j6\/1\.0\.1, voyara\):/]
    },
    {
      label: 'design equal to the contract is not said twice',
      folder: marker('same', '{"contract":"tracy-base","design":"tracy-base","policy":1}'),
      has: [/- Content contract \(tracy-base\):/]
    },
    {
      label: 'not JSON: the seal is the file’s existence',
      folder: marker('garbled', 'not json'),
      has: [/- Content contract: this quickstart maps its/]
    },
    {
      label: 'a marker the fence cannot stat',
      folder: unreadable,
      has: [
        /- Content contract: this quickstart maps its/,
        /- Webroot: `\.webroot\/` is the live site; an edit there is live the moment it is saved/
      ],
      hasNot: [/never with a file tool/]
    }
  ]
  for (const { label, folder, has, hasNot } of cases)
    test(`door: the contract marker names its template once, and a marker that cannot be read still seals: ${label}`, async () => {
      const context = await siteContext(folder, path.basename(folder), async () => 'joomla')

      assertText(context.text, { has, hasNot }, label)
    })
}

test('door: a contract line and an imported site each say what they forbid; another site’s marker is not this site’s', async () => {
  const folder = siteFolder('quick')
  mkdirSync(path.join(folder, '.webroot'))
  const plain = await siteContext(folder, 'quick', async () => 'joomla')
  mkdirSync(path.join(path.dirname(folder), '.content-contracts'))
  writeFileSync(path.join(path.dirname(folder), '.content-contracts', 'quick.json'), '{}')
  mkdirSync(path.join(folder, '.tracy'))
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    '{"siteKey":"quick.tracy.test","platform":"joomla","origin":"imported"}'
  )
  mkdirSync(path.join(path.dirname(folder), 'other'))

  const imported = await siteContext(folder, 'quick', neverAsked)
  const other = await siteContext(path.join(path.dirname(folder), 'other'), 'other', neverAsked)

  assertText(plain.text, { hasNot: [/Content contract|imported site/] }, 'plain')
  assertText(
    imported.text,
    {
      has: [
        /- Content contract: this quickstart maps its words and pictures to named slots/,
        /`content\.update`/,
        /never SQL/,
        /- Webroot: `\.webroot\/` is Tracy's copy of an imported site/,
        /Never change or check against the live address/,
        // beta week 16–23/10/2026: the copy's offline page, and the way to the real website
        /maintenance, offline or coming-soon page .* turn it off on the copy/,
        /tracy_guide \(imported to live\) — never that it cannot be done/
      ],
      hasNot: [/is the live site; an edit there is live/]
    },
    'imported'
  )
  assert.equal(imported.summary, 'quick.tracy.test · joomla')
  assertText(other.text, { hasNot: [/Content contract|imported site/] }, 'other')
})

/**
 * An IMPORTED copy's folder (`.tracy/site.json` origin "imported", as provision's import road writes it),
 * with the host-owned record of the contract its own plugin derived (`collect-import-contract.mjs`,
 * `<sitesRoot>/.import-contracts/<label>/manifest.json`) when `manifest` is given.
 */
function importedSite(label, platform, { manifest, marker } = {}) {
  const folder = siteFolder(label)
  mkdirSync(path.join(folder, '.tracy'))
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.example`, platform, origin: 'imported' })
  )
  mkdirSync(path.join(folder, '.webroot'))
  writeFileSync(path.join(folder, 'AGENTS.md'), '# how to work on this site\n')
  if (manifest !== undefined) {
    const dir = path.join(path.dirname(folder), '.import-contracts', label)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, 'manifest.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
    )
  }
  if (marker !== undefined) {
    mkdirSync(path.join(path.dirname(folder), '.content-contracts'), { recursive: true })
    writeFileSync(
      path.join(path.dirname(folder), '.content-contracts', `${label}.json`),
      JSON.stringify(marker)
    )
  }
  return folder
}

/** The record `collect-import-contract.mjs` writes for a bound derived contract. */
const derivedManifest = (label, platform) => ({
  schemaVersion: 'tracy-import-contract/v1',
  mode: 'derived',
  platform,
  siteKey: `${label}.example`,
  id: `derived/${label}`,
  revision: 'r1',
  authority: 'Claude Cowork binding; documents do not grant write permissions'
})

// 🔒 01/10/2026, narrowed 02/10/2026: an imported copy's derived contract is known only from the host's own
// record (`derivedContractOf`) and picks the tool surface; the per-step context adds NO line for it — the road
// is said once, by `tracy_site`'s description and the copy's AGENTS.md paragraph, and a third statement cost
// ~100 prompt tokens in every step. So the context of a derived copy is the context of an open one.
for (const [name, platform, options, derived] of /** @type {const} */ ([
  ['the WordPress record names this copy', 'wordpress', { manifest: 'self' }, true],
  ['the Joomla record names this copy', 'joomla', { manifest: 'self' }, true],
  ['no record (an older import, a failed derive)', 'wordpress', {}, false],
  ['a record of another copy', 'joomla', { manifest: { other: true } }, false],
  ['a record of the other CMS', 'wordpress', { manifest: { platform: 'joomla' } }, false],
  ['a record that does not parse', 'joomla', { manifest: '{not json' }, false],
  [
    'a record of a quickstart schema',
    'wordpress',
    { manifest: { schemaVersion: 'tracy-quickstart-contract/v1' } },
    false
  ]
])) {
  test(`door: an imported copy's context is the open site's, whatever record lies beside it, and the record alone says derived — ${name}`, async () => {
    const label = `imp-${platform}`
    /** @type {any} */
    let manifest
    if (options.manifest === 'self') manifest = derivedManifest(label, platform)
    else if (typeof options.manifest === 'string') manifest = options.manifest
    else if (options.manifest?.other) manifest = derivedManifest('another-copy', platform)
    else if (options.manifest !== undefined)
      manifest = { ...derivedManifest(label, platform), ...options.manifest }
    const folder = importedSite(label, platform, manifest === undefined ? {} : { manifest })
    const { text } = await siteContext(folder, label, neverAsked)
    assertText(
      text,
      {
        has: [/- Webroot: `\.webroot\/` is Tracy's copy of an imported site/],
        hasNot: [/- Content map:|- Content contract|Derived contract|this quickstart maps/]
      },
      name
    )
    // the same copy with no record at all prints the same context, line for line
    const bare = importedSite(`${label}-bare`, platform, {})
    const { text: openText } = await siteContext(bare, `${label}-bare`, neverAsked)
    // the temporary folder differs by construction; every other byte is the same
    const plain = (/** @type {string} */ t, /** @type {string} */ l) =>
      t.replace(/- Folder: .*\n/, '- Folder: <folder>\n').replaceAll(l, '<label>')
    assert.equal(
      plain(text, label),
      plain(openText, `${label}-bare`),
      `${name}: a derived copy's context equals the open copy's`
    )
    assert.equal(
      derivedContractOf(path.dirname(folder), label, platform)?.id ?? null,
      derived ? `derived/${label}` : null,
      name
    )
  })
}

test("door: a sealed site keeps its quickstart's contract line, whatever import record lies beside it", async () => {
  const folder = importedSite('imp-sealed', 'joomla', {
    manifest: derivedManifest('imp-sealed', 'joomla'),
    marker: { contract: 'tracy-business/j6/1.2.0' }
  })
  const { text } = await siteContext(folder, 'imp-sealed', neverAsked)
  assertText(
    text,
    { has: [/- Content contract \(tracy-business\/j6\/1\.2\.0\)/], hasNot: [/- Content map:/] },
    'sealed'
  )
})

test('door: a copy that was not imported never reads an import record, and EmDash is never derived', async () => {
  const folder = sealedSite('not-imported', 'wordpress')
  const dir = path.join(path.dirname(folder), '.import-contracts', 'not-imported')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(derivedManifest('not-imported', 'wordpress')))
  const { text } = await siteContext(folder, 'not-imported', neverAsked)
  assertText(text, { hasNot: [/- Content map:/] }, 'origin not imported')
  assert.equal(derivedContractOf(path.dirname(folder), 'not-imported', 'emdash'), null)
  assert.equal(derivedContractOf(path.dirname(folder), 'not-imported', 'unknown'), null)
})

test('door: contractDoorOf reads the seal — sealed Joomla always, sealed WordPress only when provision bound it, never EmDash', () => {
  const root = path.dirname(sealedSite('cd-wp', 'wordpress', { marker: { coworkContractVersion: '0.13.2' } }))
  const seal = (label, body) =>
    writeFileSync(path.join(root, '.content-contracts', `${label}.json`), JSON.stringify(body))
  seal('cd-nopin', { coworkContractVersion: ' ' })
  seal('cd-old', { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress', receiverVersion: '0.13.2' }) // vocabulary-allow: pre-rename key in published data
  seal('cd-oldnone', { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress', receiverVersion: '' }) // vocabulary-allow: pre-rename key in published data
  writeFileSync(path.join(root, '.content-contracts', 'cd-garbled.json'), '{not json')
  const rows = [
    ['cd-wp', 'wordpress', true, true],
    ['cd-nopin', 'wordpress', true, false],
    ['cd-missing', 'wordpress', true, null],
    ['cd-garbled', 'wordpress', true, null],
    ['cd-old', 'wordpress', true, true],
    ['cd-oldnone', 'wordpress', true, false],
    ['cd-missing', 'joomla', true, true],
    ['cd-missing', 'unknown', true, true],
    ['cd-wp', 'emdash', true, false],
    ['cd-wp', 'wordpress', false, false],
    ['cd-wp', 'wordpress', null, null]
  ]
  for (const [label, platform, sealed, expected] of rows)
    assert.equal(contractDoorOf(root, label, platform, sealed), expected, `${label} ${platform} ${sealed}`)
})

{
  const markers = [
    ['wpnopin', { contract: 'tracy-base/wp7/1.0.0', platform: 'wordpress', coworkContractVersion: '' }],
    ['wpold', { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress' }]
  ]
  for (const [label, marker] of markers)
    test(`door: every wordpress marker that names no plugin, or is unreadable, keeps the record road: ${label}`, async () => {
      const text = await textOf(label, 'wordpress', { marker })

      assertText(text, { has: [/record by record/], hasNot: [/content\.contract|- Content contract/] }, label)
    })
}

test('door: the PHRASES layer of every variant that carries the translation rule names a door its own surface lists', async () => {
  const variants = [
    ['t-joomla', 'joomla', {}],
    ['t-jsealed', 'joomla', { marker: { contract: 'x/j6/1.0.0' } }],
    ['t-wp', 'wordpress', {}],
    ['t-wpsealed', 'wordpress', { marker: { contract: 'x/wp7/1.0.0', platform: 'wordpress' } }],
    [
      't-wpbound',
      'wordpress',
      { marker: { contract: 'x/wp7/1.2.0', platform: 'wordpress', coworkContractVersion: '0.13.2' } }
    ],
    ['t-emdash', 'emdash', {}],
    ['t-unknown', 'unknown', {}],
    ['t-usealed', 'unknown', { marker: {} }]
  ]
  const emitted = []
  for (const [label, platform, options] of variants) {
    const text = await textOf(label, platform, options)
    if (!text.includes('A TRANSLATION YOU CAN INSTALL')) continue
    emitted.push(label)
    const phrases = /PHRASES\b(.*?)(?= PRESENTATION —| INSTALLED —|$)/.exec(rowOf(text))?.[1] ?? ''
    const doors = [...phrases.matchAll(/`([a-z]+\.[a-z]+)(?: [^`]*)?`/g)].map(([, name]) => name)
    const surface = surfaceOf({
      platform,
      sealed: options.marker !== undefined,
      contractDoor: options.marker?.coworkContractVersion !== undefined
    })

    assert.ok(doors.length > 0, `${label}: its PHRASES layer names no door: ${phrases}`)
    for (const door of doors)
      assert.ok(SURFACE_ACTIONS[surface].includes(door), `${label}: \`${door}\` is not on ${surface}`)
  }
  assert.deepEqual(
    emitted,
    ['t-joomla', 't-wp', 't-wpsealed'],
    'the rule reaches exactly the sites whose row has such a door'
  )
})

test('door: every tracy_site action any variant names is one the door has; content.replace only where it ships', async () => {
  const bound = await textOf('v-wpbound2', 'wordpress', { marker: WP_BOUND })
  for (const [, name] of bound.matchAll(/`([a-z]+\.[a-z]+)[` ]/g))
    if ([...LOCAL_ACTIONS, ...RELAY_ACTIONS].includes(name))
      assert.ok(SURFACE_ACTIONS['wordpress-contract'].includes(name), name)
})

{
  const doors = new Set([...LOCAL_ACTIONS, ...RELAY_ACTIONS])
  const families = new Set([...doors].map((one) => one.split('.')[0]))
  // A bound WordPress contract's site-wide SLOT keys, which its WHERE row quotes as keys of an apply's
  // changes (`SEALED_WORDPRESS_CONTRACT_WHERE`): not actions, though `site.identity` (14/10/2026) made
  // `site` a family of actions too.
  const slotKeys = new Set(['site.name', 'site.tagline'])
  const variants = [
    ['v-joomla', 'joomla', {}],
    ['v-jsealed', 'joomla', { marker: { contract: 'x/j6/1.0.0' } }],
    ['v-wp', 'wordpress', {}],
    ['v-wpsealed', 'wordpress', { marker: { contract: 'x/wp7/1.0.0', platform: 'wordpress' } }],
    [
      'v-wpbound',
      'wordpress',
      { marker: { contract: 'x/wp7/1.2.0', platform: 'wordpress', coworkContractVersion: '0.13.2' } }
    ],
    ['v-emdash', 'emdash', {}]
  ]
  for (const [label, platform, options] of variants)
    test(`door: every tracy_site action any variant names is one the door has; content.replace only where it ships: ${label}`, async () => {
      const text = await textOf(label, platform, options)
      const named = [...text.matchAll(/`([a-z]+\.[a-z*]+)[` ]/g)]
        .map(([, name]) => name)
        .filter((name) => families.has(name.split('.')[0]) && !slotKeys.has(name))
      for (const name of named)
        assert.ok(
          name.endsWith('.*') ? [...doors].some((one) => one.startsWith(name.slice(0, -1))) : doors.has(name),
          `${label} names \`${name}\`, which no door has`
        )
      const contract =
        options.marker !== undefined &&
        (platform !== 'wordpress' || options.marker.coworkContractVersion !== undefined)
      if (!REPLACE_PLATFORMS.has(replaceKey(platform, contract)))
        assert.doesNotMatch(text, /content\.replace/, label)
    })
}

test('door: the EmDash row names only tools EmDash 0.38 publishes', async () => {
  const tools = JSON.parse(readFileSync(path.join(here, 'fixtures', 'emdash', 'tools-0.38.json'), 'utf8'))
  const names = new Set(tools.map((tool) => tool.name))
  const families = new Set([...names].map((name) => name.split('_')[0]))
  const text = await textOf('ed-tools', 'emdash')

  const named = [...rowOf(text).matchAll(/`([a-z]+_[a-z_]+)[` ]/g)]
    .map(([, name]) => name)
    .filter((name) => families.has(name.split('_')[0]))

  assert.ok(named.length >= 5, named.join(', '))
  for (const name of named)
    assert.ok(names.has(name), `the EmDash row names ${name}, which EmDash 0.38 does not publish`)
})

// ── what sits beside the rules ───────────────────────────────────────────────────────────────────────

test('folder notes: the site’s own AGENTS.md and README are named ahead of the platform line, only what exists', async () => {
  const site = (label, files, webroot = true) => {
    const folder = siteFolder(label)
    mkdirSync(path.join(folder, '.tracy'))
    writeFileSync(
      path.join(folder, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `${label}.tracy.test`, platform: 'joomla' })
    )
    if (webroot) mkdirSync(path.join(folder, '.webroot'))
    for (const file of files)
      writeFileSync(path.join(folder, '.webroot', file), '# start at templates/tracy_business\n')
    return folder
  }
  // Which notes are named for which folder is the loop below; here, where they stand in the text.
  const both = (await siteContext(site('northgate', ['AGENTS.md', 'README.md']), 'northgate', neverAsked))
    .text
  const notes = both.indexOf('.webroot/AGENTS.md`')
  assert.ok(notes >= 0, 'the site’s own notes are named')
  assert.ok(notes < both.indexOf('- Where visible text lives:'), 'ahead of the general advice')
})

{
  const site = (label, files, webroot = true) => {
    const folder = siteFolder(label)
    mkdirSync(path.join(folder, '.tracy'))
    writeFileSync(
      path.join(folder, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `${label}.tracy.test`, platform: 'joomla' })
    )
    if (webroot) mkdirSync(path.join(folder, '.webroot'))
    for (const file of files)
      writeFileSync(path.join(folder, '.webroot', file), '# start at templates/tracy_business\n')
    return folder
  }
  const cases = [
    {
      label: 'both',
      folder: site('northgate', ['AGENTS.md', 'README.md']),
      has: [
        /THIS SITE DOCUMENTS ITSELF: `\.webroot\/AGENTS\.md` and `\.webroot\/README\.md`/,
        /OUTRANKS the general platform advice/
      ]
    },
    {
      label: 'README only',
      folder: site('onlyreadme', ['README.md']),
      has: [
        /THIS SITE DOCUMENTS ITSELF: `\.webroot\/README\.md` was written/,
        /Read it before your first change/
      ],
      hasNot: [/AGENTS\.md` and/]
    },
    {
      label: 'neither',
      folder: site('plainsite', []),
      has: [/- Where visible text lives:/],
      hasNot: [/THIS SITE DOCUMENTS ITSELF/]
    },
    { label: 'not installed', folder: site('notyet', [], false), hasNot: [/THIS SITE DOCUMENTS ITSELF/] }
  ]
  for (const { label, folder, has, hasNot } of cases)
    test(`folder notes: the site’s own AGENTS.md and README are named ahead of the platform line, only what exists: ${label}`, async () => {
      const { text } = await siteContext(folder, path.basename(folder), neverAsked)

      assertText(text, { has, hasNot }, label)
    })
}

test('design: a site wearing a design system is told its token names and the check; one wearing none keeps to the theme; no record says nothing', async () => {
  const withDesign = (label, design, platform) => {
    const folder = siteFolder(label)
    mkdirSync(path.join(folder, '.webroot'))
    if (design !== null) {
      mkdirSync(path.join(folder, 'docs', 'agents'), { recursive: true })
      writeFileSync(path.join(folder, 'docs', 'agents', 'design.json'), JSON.stringify(design))
    }
    return siteContext(folder, label, async () => platform)
  }
  const dressed = await withDesign(
    'dressed',
    {
      schemaVersion: 'tracy-site-design/v1',
      id: 'apple',
      source: 'catalog',
      name: 'Apple',
      bound: true,
      platform: 'wordpress',
      tokens: {
        '--bg': '#fff',
        '--fg': '#000',
        '--accent': '#0071e3',
        '--font-body': 'x',
        '--space-4': '16px',
        '--radius-md': '8px'
      }
    },
    'wordpress'
  )
  const bare = await withDesign(
    'bare',
    {
      schemaVersion: 'tracy-site-design/v1',
      id: null,
      source: 'template',
      bound: false,
      platform: 'joomla',
      tokens: null
    },
    'joomla'
  )
  const none = await withDesign('none', null, 'joomla')
  // A Tracy Business site wears the quickstart's own look (29/09/2026): before, it was told "none bound".
  const business = await withDesign(
    'business',
    {
      schemaVersion: 'tracy-site-design/v1',
      id: 'tracy-business',
      source: 'quickstart',
      name: 'Tracy Business',
      bound: true,
      platform: 'joomla',
      tokens: { '--bg': '#F5F3EE', '--accent': '#14483A', '--font-body': 'x' }
    },
    'joomla'
  )

  assertText(
    dressed.text,
    {
      has: [
        /- Design system: Apple \(`apple`, catalog; docs\/agents\/design\.json\)\. This site is BOUND to it/,
        /--bg --fg --accent/,
        /--font-body/,
        /--space-4 --radius-md/,
        /--wp--preset--color--<name>/,
        /tracy_design_check/,
        // ADR 0023, 30/09: a look write through tracy_site measures itself; edits outside it do not.
        /Every look change is measured for you/,
        /a stylesheet edited with bash or a file tool, site\.rebuild/,
        /only when that measure was skipped/
      ],
      hasNot: [/#0071e3|16px/]
    },
    'dressed'
  )
  assertText(
    bare.text,
    {
      has: [
        /- Design system: none bound \(docs\/agents\/design\.json\)/,
        /keep to the theme's own variables/,
        /NO_DESIGN_BOUND/
      ]
    },
    'bare'
  )
  assertText(none.text, { hasNot: [/Design system:/] }, 'none')
  assertText(
    business.text,
    {
      has: [
        /- Design system: Tracy Business \(`tracy-business`, quickstart; docs\/agents\/design\.json\)\. This site is BOUND to it/
      ],
      hasNot: [/none bound/, /#14483A/]
    },
    'business'
  )
})

test('build: the customer’s answers reach the agent, in the order the questions ask, byte-stable across key orders', async () => {
  const answers = {
    tone: 'plain',
    name: 'Northgate Industrial',
    sells_to: ['refineries', 'shipyards'],
    languages: ['en', 'vi'],
    about: 'Valves and fittings',
    pages: ['home', 'contact'],
    audience: 'engineers'
  }
  const folder = sealedSite('answers-order', 'joomla')
  writeJob(folder, 'answers-order.tracy.test', {
    status: 'done',
    stages: [{ name: 'seed', status: 'done' }],
    answers
  })
  const first = await siteContext(folder, 'answers-order', neverAsked)
  writeJob(folder, 'answers-order.tracy.test', {
    status: 'done',
    stages: [{ name: 'seed', status: 'done' }],
    answers: Object.fromEntries(Object.entries(answers).reverse())
  })

  const second = await siteContext(folder, 'answers-order', neverAsked)

  assert.equal(first.text, second.text)
  assert.match(
    first.text,
    /The customer answered, when this site was built: name: Northgate Industrial · about: Valves and fittings · pages: home, contact · languages: en, vi · tone: plain · audience: engineers · sells_to: refineries, shipyards\./
  )
  assert.match(first.text, /do not invent a fact this list could have told you/)
})

test('answersLine: a long value or a huge questionnaire is capped and says so; nothing answered is no line', () => {
  const long = answersLine({ answers: { about: 'x'.repeat(5000) } })
  const many = answersLine({
    answers: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${String(i)}`, 'y'.repeat(100)]))
  })

  assert.ok(long.length < 300 && many.length < 1200)
  assert.match(long, /…$/)
  assert.match(many, /…$/)
})

{
  for (const empty of [
    null,
    {},
    { answers: {} },
    { answers: { blank: '   ' } },
    { answers: { nested: { a: 1 } } }
  ])
    test(`answersLine: a long value or a huge questionnaire is capped and says so; nothing answered is no line: ${rowName(empty)}`, () => {
      assert.equal(answersLine(empty), null, JSON.stringify(empty))
    })
}

test('ANSWER_ORDER is the order the question sets ask in', () => {
  for (const platform of ['joomla', 'wordpress', 'emdash']) {
    const file = path.join(here, '..', '..', '..', 'site', `tracy-site-build-${platform}`, 'questions.json')
    const ids = JSON.parse(readFileSync(file, 'utf8')).questions.map((q) => q.id)
    const asked = ids.filter((id) => ANSWER_ORDER.includes(id))

    assert.deepEqual(
      asked,
      ANSWER_ORDER.filter((id) => asked.includes(id)),
      platform
    )
    if (platform !== 'emdash') assert.deepEqual(asked, [...ANSWER_ORDER], platform)
  }
})

/** Write a build job for `folder`'s site, as the build pipeline files it. */
function writeJob(folder, siteKey, job) {
  mkdirSync(path.join(folder, 'docs', 'agents', 'build', 'sites'), { recursive: true })
  writeFileSync(
    path.join(folder, 'docs', 'agents', 'build', 'sites', `${siteKey}.json`),
    JSON.stringify({ job: 'build-one', ...job })
  )
}

test('build: a stage moving or a pause changes only the site-state notice, never the rules block', async () => {
  const folder = sealedSite('building', 'wordpress')
  const stages = (running) =>
    ['check', 'install', 'seed', 'copy', 'images', 'publish'].map((name, at) => ({
      name,
      status: at < running ? 'done' : at === running ? 'running' : 'pending'
    }))
  const contexts = []
  for (const job of [
    { status: 'running', stages: stages(2) },
    { status: 'running', stages: stages(3) },
    {
      status: 'paused',
      paused: 'host-updating',
      stages: stages(4).map((s) => (s.status === 'running' ? { ...s, status: 'pending' } : s))
    }
  ]) {
    writeJob(folder, 'building.tracy.test', job)
    contexts.push(await siteContext(folder, 'building', neverAsked))
  }

  const notices = contexts.map((one) => siteStateNotice(one.state))

  assert.equal(contexts[0].text, contexts[1].text)
  assert.equal(contexts[1].text, contexts[2].text)
  // The create recipe spells midnight as a fixed template ("YYYY-MM-DD 00:00:00"): not a clock reading.
  assert.doesNotMatch(
    contexts[0].text.replaceAll('00:00:00', ''),
    /Build:|3 of 6|\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\b/
  )
  assert.deepEqual(
    notices.map((one) => one?.text.split('\n')[1]),
    [
      '- Build: running "seed" (3 of 6)',
      '- Build: running "copy" (4 of 6)',
      '- Build: paused before "images" (5 of 6) while the host updates; it resumes by itself'
    ]
  )
})

test('build: buildInBlock puts the Build line back as the last site line and changes nothing else', async () => {
  const folder = sealedSite('inblock', 'wordpress')
  writeJob(folder, 'inblock.tracy.test', {
    status: 'running',
    stages: [
      { name: 'check', status: 'done' },
      { name: 'seed', status: 'running' },
      { name: 'copy', status: 'pending' }
    ]
  })
  const off = await siteContext(folder, 'inblock', neverAsked)
  const on = await siteContext(folder, 'inblock', neverAsked, null, { buildInBlock: true })
  const idle = sealedSite('inblock-idle', 'wordpress')

  const idleOn = await siteContext(idle, 'inblock-idle', neverAsked, null, { buildInBlock: true })
  const idleOff = await siteContext(idle, 'inblock-idle', neverAsked)

  const onLines = on.text.split('\n')
  const at = onLines.indexOf('- Build: running "seed" (2 of 3)')
  assert.ok(at > 0, on.text)
  assert.deepEqual([...onLines.slice(0, at), ...onLines.slice(at + 1)], off.text.split('\n'))
  assert.match(onLines[at + 1], /^SPLIT THE MESSAGE INTO REQUESTS/)
  assert.ok(
    onLines.slice(at + 1).every((one) => !one.startsWith('- ')),
    'no site line below it'
  )
  assert.deepEqual(on.state, off.state)
  assert.equal(on.summary, `${off.summary} · build running "seed" (2 of 3)`)
  assert.equal(idleOn.text, idleOff.text)
})

test('siteStateNotice: at most 300 characters whatever the build says, and nothing with no build', () => {
  const long = siteStateNotice({ build: `failed at "copy" (4 of 6): ${'model timed out; '.repeat(40)}` })

  assert.ok(long.text.length <= 300 && long.summary.length <= 120)
  assert.match(long.text, /^<system-reminder>\n- Build: failed at "copy" \(4 of 6\): model timed out/)
  assert.match(long.text, /…\n<\/system-reminder>$/, 'a cut says it was cut')
})

{
  for (const none of [{ build: null }, null, undefined])
    test(`siteStateNotice: at most 300 characters whatever the build says, and nothing with no build: ${rowName(none)}`, () => {
      assert.equal(siteStateNotice(none), null)
    })
}

// The host's clock said as a notice of its own, never part of the cached context block: "Post it dated
// 15 Sep" made 5 of 12 add-a-post runs hunt for the day with `bash date` or file-tool globs that timed out.
test('todayNotice: one small system-reminder with the weekday and the UTC day, the same bytes all day', () => {
  const wednesday = todayNotice(new Date('2026-09-30T12:00:00Z'))

  assert.equal(wednesday?.text, '<system-reminder>\n- Today: Wednesday 2026-09-30 (UTC).\n</system-reminder>')
  assert.equal(wednesday?.summary, 'today 2026-09-30')
  assert.ok((wednesday?.text.length ?? 999) <= 80, String(wednesday?.text.length))
  assert.equal(
    todayNotice(new Date('2026-09-30T00:00:00Z'))?.text,
    todayNotice(new Date('2026-09-30T23:59:59Z'))?.text
  )
})

{
  // The day is UTC's whatever the machine's own zone: the last and the first second of two days, a leap day.
  const rows = [
    ['2026-09-30T23:59:59Z', /Wednesday 2026-09-30 \(UTC\)/],
    ['2026-10-01T00:00:00Z', /Thursday 2026-10-01 \(UTC\)/],
    ['2028-02-29T06:30:00Z', /Tuesday 2028-02-29 \(UTC\)/]
  ]
  for (const [at, expected] of rows)
    test(`todayNotice: the day is UTC's: ${at}`, () => {
      assert.match(todayNotice(new Date(at))?.text ?? '', expected)
    })
}

{
  // A clock that answers nothing must not throw into a turn.
  for (const dead of [new Date(Number.NaN), '2026-09-30', undefined])
    test(`todayNotice: a dead clock says nothing: ${rowName(dead)}`, () => {
      assert.equal(todayNotice(/** @type {any} */ (dead)), null)
    })
}

{
  const stages = [
    { name: 'check', status: 'done' },
    { name: 'copy', status: 'failed', detail: 'model timed out' }
  ]
  const rows = [
    [null, null],
    [{ status: 'done', stages }, 'done'],
    [{ status: 'failed', stages }, 'failed at "copy" (2 of 2): model timed out'],
    [
      { status: 'waiting', stages: [{ name: 'brief', status: 'waiting', detail: 'form:brief' }] },
      'waiting at "brief" (1 of 1): form:brief'
    ],
    [
      {
        status: 'paused',
        stages: [
          { name: 'check', status: 'done' },
          { name: 'seed', status: 'pending' }
        ]
      },
      'paused before "seed" (2 of 2) while the host updates; it resumes by itself'
    ]
  ]
  for (const [job, expected] of rows)
    test(`buildLine reads each job status: ${rowName(job)}`, () => {
      assert.equal(buildLine(job), expected)
    })
}

test('lastSiteContext and lastSiteState find the latest visible notice, tell the two apart, and forget one compacted away', () => {
  const message = (seq, source, text) => ({
    seq,
    type: 'user/message',
    data: { source, content: [{ type: 'text', text }] }
  })
  const events = [
    message(0, { kind: 'user' }, 'hi'),
    message(1, noticeSource(SITE_CONTEXT_PLUGIN, ''), 'ctx'),
    message(2, noticeSource(SITE_STATE_PLUGIN, ''), 'state')
  ]
  const agent = (nodes) => ({
    session: { seq: events.length, eventAt: (seq) => events[seq], surface: { nodes } }
  })

  assert.equal(lastSiteContext(agent([0, 1, 2])), 'ctx')
  assert.equal(lastSiteState(agent([0, 1, 2])), 'state')
  assert.equal(lastSiteContext(agent([0])), null)
  assert.equal(lastSiteState(agent([0])), null)
  assert.equal(lastSiteContext(undefined), null)
  assert.equal(lastSiteState(undefined), null)
})

// ── the address line ─────────────────────────────────────────────────────────────────────────────────

{
  const multilingual = {
    languages: ['en-GB', 'ko-KR (unpublished)', 'pt-BR', 'pt-PT', 'ru-RU'],
    siteLanguage: 'en-GB',
    languagePrefixes: { 'en-GB': 'en', 'pt-BR': 'pt', 'pt-PT': 'pt-pt', 'ru-RU': 'ru' }
  }
  const cases = [
    {
      label: 'joomla ids',
      facts: {
        template: 'cassiopeia',
        templateStyleId: 11,
        breadcrumbsModuleId: 17,
        homeMenuItemId: 101,
        languages: ['en-GB']
      },
      platform: 'joomla',
      has: [
        /template style is `11` \(cassiopeia\)/,
        /breadcrumbs module is `17`/,
        /front page is menu item `101`/,
        /the only language installed is en-GB/
      ],
      hasNot: [
        /asOf|stale|measured at|as of|may be|fresh/,
        /\d{4}-\d{2}-\d{2}/,
        /siteTitle|homeText|blogname/
      ]
    },
    {
      label: 'multilingual, default keeps its prefix',
      facts: { ...multilingual, defaultPrefixRemoved: false },
      platform: 'joomla',
      has: [
        /installed are en-GB `\/en\/`, ko-KR \(unpublished\), pt-BR `\/pt\/`, pt-PT `\/pt-pt\/`, ru-RU `\/ru\/`/,
        /`\/` opens `\/en\/`, the en-GB edition \(the default\)/
      ]
    },
    {
      label: 'multilingual, default without prefix',
      facts: { ...multilingual, defaultPrefixRemoved: true },
      platform: 'joomla',
      has: [/installed are en-GB `\/`, ko-KR/, /`\/` is the en-GB edition \(the default\)/]
    },
    {
      label: 'no language filter on',
      facts: { languages: ['en-GB', 'ru-RU'], siteLanguage: 'en-GB' },
      platform: 'joomla',
      has: [/installed are en-GB, ru-RU\./],
      hasNot: [/`\/`/]
    },
    {
      label: 'a key not measured is omitted',
      facts: { breadcrumbsModuleId: 17 },
      platform: 'joomla',
      has: [/breadcrumbs module is `17`/],
      hasNot: [/template style/, /front page/]
    },
    {
      label: 'wordpress theme kind',
      facts: { theme: 'twentytwentyfive', themeKind: 'block', permalinks: '/%postname%/', activePlugins: 1 },
      platform: 'wordpress',
      has: [/`twentytwentyfive`, a block theme — that decides which edit works/],
      hasNot: [/plugins? active/]
    }
  ]
  for (const { label, facts, platform, has = [], hasNot = [] } of cases)
    test(`addressLine: the ids and kinds a site otherwise costs calls to find, and nothing that goes stale: ${label}`, () => {
      assertText(addressLine(facts, platform), { has, hasNot }, label)
    })
}

{
  const nothing = [
    [{}, 'joomla'],
    [null, 'joomla'],
    [undefined, 'wordpress'],
    [{ anything: 1 }, 'emdash'],
    [{ anything: 1 }, 'unknown']
  ]
  for (const [facts, platform] of nothing)
    test(`addressLine: the ids and kinds a site otherwise costs calls to find, and nothing that goes stale: ${rowName(facts)}`, () => {
      assert.equal(addressLine(facts, platform), null, `${JSON.stringify(facts)} ${platform}`)
    })
}

test('addressLine: rendered above the prose that explains it, not instead of it', async () => {
  const folder = siteFolder('demoaddr')
  mkdirSync(path.join(folder, '.webroot'))
  mkdirSync(path.join(path.dirname(folder), '.site-facts'), { recursive: true })
  writeFileSync(
    path.join(path.dirname(folder), '.site-facts', 'demoaddr.json'),
    JSON.stringify({ format: 1, facts: { templateStyleId: 11, breadcrumbsModuleId: 17 } })
  )

  const lines = (await siteContext(folder, 'demoaddr', async () => 'joomla')).text.split('\n')

  const addr = lines.findIndex((one) => one.startsWith('- This site, measured:'))
  const prose = lines.findIndex((one) => one.startsWith('- Where visible text lives:'))
  assert.ok(addr >= 0 && prose >= 0 && addr < prose)
})

// ── modes: which tools the agent has ─────────────────────────────────────────────────────────────────

const WITH_SHELL = [
  'ask_user_question',
  'bash',
  'edit',
  'exit_plan_mode',
  'glob',
  'grep',
  'job_kill',
  'job_list',
  'job_output',
  'read',
  'read_image',
  'skill',
  'todo_write',
  'tracy_site',
  'web_fetch',
  'web_search',
  'write'
]
const NO_SHELL = WITH_SHELL.filter(
  (tool) => !['bash', 'exit_plan_mode', 'job_kill', 'job_list', 'job_output', 'todo_write'].includes(tool)
)
const SHELL_WORDS = /\bbash\b|todo_write|grep -rn|wp-cli|php cli|job_(?:list|output|kill)|exit_plan_mode/

{
  const rows = [
    [undefined, { shell: true, todo: true }],
    [null, { shell: true, todo: true }],
    [[], { shell: true, todo: true }],
    [WITH_SHELL, { shell: true, todo: true }],
    [NO_SHELL, { shell: false, todo: false }],
    [['bash', 'read'], { shell: true, todo: false }]
  ]
  for (const [tools, expected] of rows)
    test(`toolReach: unknown or empty is everything; otherwise bash and todo_write as the agent has them: ${rowName(tools)}`, () => {
      assert.deepEqual(toolReach(tools), expected, JSON.stringify(tools))
    })
}

{
  const shapes = [
    ['joomla', null],
    ['wordpress', null],
    ['emdash', null],
    ['joomla', { contract: 'tracy-business/j6/1.2.0' }],
    ['wordpress', { contract: 'tracy-business/wp7/1.2.0', coworkContractVersion: '0.14.3' }],
    ['wordpress', { contract: 'tracy-base/wp7/1.0.0', coworkContractVersion: '' }]
  ]
  for (const [platform, marker] of shapes)
    test(`modes: a mode without a shell or a plan is never told to use one, on any platform or seal; unknown tools read as before: ${rowName(platform)}`, async () => {
      const label =
        `reach-${platform}-${marker === null ? 'open' : 'seal'}${marker?.coworkContractVersion ?? ''}`.replace(
          /[^a-z0-9-]/g,
          ''
        )
      const folder = sealedSite(label, platform, marker === null ? {} : { marker })
      const contextFor = async (preset, opts) =>
        (await siteContext(folder, label, neverAsked, preset, opts)).text
      const none = await contextFor(`writer-${platform}`, { tools: NO_SHELL })
      const all = await contextFor(`designer-${platform}`, { tools: WITH_SHELL })
      const unknown = await contextFor(`designer-${platform}`)

      assertText(
        none,
        {
          has: [
            /SEVERAL JOBS: write the plan FIRST, in your reply, one line per change/,
            /that list is how the customer sees what is coming and stops you between items\./
          ],
          hasNot: [SHELL_WORDS, /docs\/agents\/db-changes/]
        },
        label
      )
      assert.match(all, /SEVERAL JOBS: call `todo_write` FIRST/, label)
      assert.equal(all, unknown, `${label}: a mode with both reads what it read before`)
    })
}

test('modes: per platform, a mode with a shell gets the shell roads; one without gets the road it has; an unknown mode gets none', async () => {
  const matrix = JSON.parse(
    readFileSync(path.join(here, '..', '..', '..', '..', 'config', 'mode-matrix.json'), 'utf8')
  )
  const bashRow = matrix.tools.find((row) => row.id === 'tool-bash')
  const withShellModes = matrix.roles
    .filter((role) => bashRow.roles[role.id] === true)
    .map((role) => role.label)
  assert.ok(withShellModes.length > 0)
  assert.equal(lookLine('wordpress', null, true), null)
  assert.equal(lookLine('drupal', 'designer', true), null)
})

{
  const matrix = JSON.parse(
    readFileSync(path.join(here, '..', '..', '..', '..', 'config', 'mode-matrix.json'), 'utf8')
  )
  const bashRow = matrix.tools.find((row) => row.id === 'tool-bash')
  const withShellModes = matrix.roles
    .filter((role) => bashRow.roles[role.id] === true)
    .map((role) => role.label)
  const lead = /^- LOOK \(colour, size, spacing, font, showing on phones\): first `tracy_site page\.look /m
  const noLook = /^- LOOK \(colour, size, spacing, font\): this mode does not change how a site looks/m
  const cases = [
    {
      platform: 'joomla',
      shell: [
        /`grep -rn` all the English words you can see/,
        /needs `php cli\/joomla\.php cache:clean` after it\./,
        /css\/styles\/\*\.css/,
        /never delete or edit `media\/t4\/`/,
        /php tools\/t4-scss\.php/,
        /`page\.look \{path, style:\{selector\}\}` says if the page loads it; CSS it does not load is not done/,
        // PR #926: the one-call write first, the file road after it
        // nth counts from 0: "the first" asked as nth:1 changed the second button (dskeepjo, 10/10/2026)
        /Then ONE `tracy_site look\.set \{path, target:\{text\|selector, nth\?:0 = the first\}, props:\{"background-color":"#1d4ed8"\}, scope, viewport\?:"mobile"\}` writes it, keeps an undo/,
        /look\.set[^\n]*The road below only when it refuses: Joomla \(T4\)/
      ],
      none: [
        /Find the keys in ONE step — one `content\.find \{text\}` per phrase/,
        /which takes a shell this mode does not have: tell the customer it may show a little later\./
      ]
    },
    {
      platform: 'wordpress',
      shell: [
        /look\.set writes the site's Additional CSS/,
        /palette `warn`/,
        /Never CSS in the global-styles record/,
        // #1710: Additional CSS only where the page prints it; a file the customer names is that file
        /unless the page does not print Additional CSS \(look\.set answers LOOK_SET_NOT_PRINTED\) or the customer names the file/,
        /CSS it does not load is not done/,
        /"site" the token on every page; hide on phones = props \{display:"none"\}, viewport "mobile"\. The road below only when it refuses: WordPress:/
      ],
      none: []
    },
    {
      platform: 'emdash',
      shell: [
        /`bash` in the site's container edits it/,
        /`\/app\/src`/,
        /ONE `tracy_site_build_emdash request site\.rebuild`/,
        // EmDash: look.set writes tokens only; its sections stay on the file road
        /A token for the whole site: ONE `tracy_site look\.set \{path, target:\{text\|selector\}, props:\{…\}, scope:"site"\}` changes it in `styles\/tokens\.css`/
      ],
      none: [
        new RegExp(
          `only a mode with a shell edits \\(${withShellModes.join(', ').replaceAll(/[()]/g, '\\$&')}\\): say so`
        )
      ]
    }
  ]
  for (const { platform, shell, none } of cases)
    test(`modes: per platform, a mode with a shell gets the shell roads; one without gets the road it has; an unknown mode gets none: ${rowName(platform)}`, async () => {
      const label = `look-${platform}`
      const folder = siteFolder(label)
      mkdirSync(path.join(folder, '.webroot'))
      const contextFor = async (preset, opts) =>
        (await siteContext(folder, label, async () => platform, preset, opts))?.text ?? ''
      const withShell = await contextFor(`designer-${platform}`, { tools: WITH_SHELL })
      const noShell = await contextFor(`writer-${platform}`, { tools: NO_SHELL })
      const unknown = await contextFor()

      assertText(
        withShell,
        { has: [lead, /Use exactly the value the customer named/, ...shell] },
        `${platform} shell`
      )
      assertText(noShell, { has: [noLook, ...none], hasNot: [lead, /look\.set/] }, `${platform} no shell`)
      assertText(unknown, { hasNot: [/^- LOOK /m] }, `${platform} unknown`)
      assert.equal(
        await contextFor(`designer-${platform}`, { tools: WITH_SHELL }),
        withShell,
        `${platform}: byte-stable per (site, mode)`
      )
    })
}

test('modes: the SEO/GEO mode, and only it, reads where the site keeps its head; the Writer, and only it, is sent to the content door', async () => {
  const seoRows = {}
  for (const platform of EVERY_PLATFORM)
    seoRows[platform] = line(
      await bareText(`seo-${platform}`, platform, `seo-geo-${platform}`, { tools: NO_SHELL }),
      '- Search (SEO/GEO)'
    )
  assertText(
    seoRows.wordpress,
    {
      has: [
        /With no SEO plugin, Claude Cowork 0\.18\.0\+ \(`tracy_site info` answers `info\.component`\)/,
        /post meta `_claude_cowork_seo_title` and `_claude_cowork_seo_description`/,
        /not the page title, breadcrumb or heading/,
        /An older plugin has neither: the page title is the title, and renaming the page renames its breadcrumb and heading too — say so/,
        /keep its ' – <site name>' end unless the customer asked for a different full title/,
        /Tracy writes Yoast's or Rank Math's own key instead where one runs/
      ],
      hasNot: [/already holds that post's values/, /say so rather than write one/]
    },
    'wp seo'
  )
  assertText(
    seoRows.joomla,
    {
      has: [
        /its article's `metadesc`, else its menu item's `menu-meta_description` param, else the language's `metadesc`/,
        /the contact record's `metadesc`/,
        /a menu item's `params` are written whole/
      ]
    },
    'joomla seo'
  )
  const crossed = line(
    await bareText('seo-crossed', 'joomla', 'seo-geo-wordpress', { tools: NO_SHELL }),
    '- Search (SEO/GEO)'
  )
  assert.equal(crossed, seoRows.joomla, 'a mode written for another platform reads this site’s row')
})

{
  const cases = [
    {
      role: 'seo-geo',
      start: '- Search (SEO/GEO)',
      others: ['designer', 'developer', 'writer'],
      has: [/`tracy_site page\.text \{path, head:true\}` reads a page's head as served/],
      // A bare webroot names no quickstart release, so no where-map: the head read and the platform notes
      // stay, the `where.seo` sentence does not (the head-pointer test below holds it on a mapped site).
      hasNot: [/`where\.seo`/, /a place it does not list is not a field to invent/]
    },
    {
      role: 'writer',
      start: '- Writer:',
      others: ['designer', 'developer', 'seo-geo'],
      has: [
        /AGENTS\.md or CLAUDE\.md tells how the site was BUILT/,
        /smallest change through the content doors/,
        /`page\.create`/
      ],
      hasNot: [/\b(never|must not|do not|forbidden)\b/i]
    }
  ]
  for (const platform of EVERY_PLATFORM)
    test(`modes: the SEO/GEO mode, and only it, reads where the site keeps its head; the Writer, and only it, is sent to the content door: ${rowName(platform)}`, async () => {
      for (const { role, start, others, has, hasNot = [] } of cases) {
        const label = `${role}-${platform}`
        const text = await bareText(`role-${platform}`, platform, `${role}-${platform}`, { tools: NO_SHELL })
        const lines = text.split('\n').filter((one) => one.startsWith(start))

        assert.equal(lines.length, 1, label)
        assertText(lines[0], { has, hasNot }, label)
        assert.ok(lines[0].length <= 260 || role === 'seo-geo', label)
        for (const other of others)
          assert.doesNotMatch(
            await bareText(`role-${platform}`, platform, `${other}-${platform}`),
            new RegExp(`^${start.replaceAll(/[()/]/g, '\\$&')}`, 'm'),
            `${other}-${platform}`
          )
        const notInstalled = await siteContext(
          siteFolder(`role-none-${role}`),
          'x',
          neverAsked,
          `${role}-joomla`
        )
        assert.doesNotMatch(
          notInstalled.text,
          new RegExp(`^${start.replaceAll(/[()/]/g, '\\$&')}`, 'm'),
          'no webroot, nothing to read'
        )
      }
    })
}

// Flow D of the Apply audit (05/10/2026): asked "change the Google title of the Contact page", a Joomla agent in
// the default (Writer) mode read Joomla's source for 22 steps — 374 s, 1.1M prompt tokens — before it found the
// menu item's `page_title`, the field the quickstart's describe already names in `where.seo`. Only the SEO/GEO
// mode was ever pointed there; a page's title or description is asked of every mode. A session with no Tracy mode
// (none on a Tracy surface: dsh's own presets stand down) carries no mode row, as the size budgets below measure.
{
  const QUICKSTART = {
    joomla: { marker: { contract: 'tracy-business/j6/1.2.0' }, facts: JOOMLA_FACTS },
    wordpress: { marker: { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress' }, facts: WP_FACTS },
    emdash: { artifact: TRACY_BUSINESS_EMDASH }
  }
  for (const platform of EVERY_PLATFORM)
    test(`head pointer: every mode of a quickstart site is sent to \`where.seo\` for a page's title and description, on one line: ${platform}`, async () => {
      const others = []
      for (const role of ['writer', 'designer', 'developer', 'seo-geo']) {
        const label = `${role}-${platform}`
        const text = await textOf(`head-${label}`, platform, QUICKSTART[platform], label, { tools: NO_SHELL })
        const lines = text.split('\n').filter((one) => one.includes('`where.seo`'))

        assert.equal(lines.length, 1, label)
        assert.match(lines[0], /`content\.read \{describe:true\}`, its `where\.seo`/, label)
        if (role !== 'seo-geo') {
          assert.match(lines[0], /title/, label)
          assert.match(lines[0], /meta description/, label)
          assert.ok(lines[0].length <= 160, `${label}: ${lines[0].length} characters`)
          others.push(lines[0])
        }
      }
      assert.equal(new Set(others).size, 1, 'the same bytes for every mode but SEO/GEO')
      assert.doesNotMatch(
        await textOf(`head-no-mode-${platform}`, platform, QUICKSTART[platform]),
        /`where\.seo`/,
        'no mode, no mode row'
      )
      const notInstalled = await siteContext(
        siteFolder(`head-none-${platform}`),
        'x',
        neverAsked,
        `writer-${platform}`
      )
      assert.doesNotMatch(notInstalled.text, /`where\.seo`/, 'no webroot, nothing to read')
    })
}

{
  // THE WHERE-MAP POINTER, FOR EVERY MODE ON EVERY PLATFORM ROW (bench flow D, 05/10/2026): 6 of 55 runs
  // read `content.read {describe:true}`, and "turn the contact form off, then back on" read Contact Form
  // 7's PHP, the EmDash Forms plugin or com_contact core for 8–23 steps before its one write, on all
  // three platforms. The row that names each layer's door also names where a quickstart's places are.
  //
  // ONLY WHERE A MAP EXISTS (09/10/2026): maps were read off the three Tracy Business releases alone
  // (`apps/tracy-web/src/sites/where/`), and the relay answers no `where` for any other site — an open
  // site, an imported copy, Tracy Base, a JoomlArt quickstart. Sent there, the pointer cost a describe read
  // that could only come back without the block it promised.
  const variants = [
    ['wm-jsealed', 'joomla', { marker: { contract: 'tracy-business/j6/1.2.0' } }, true],
    ['wm-wprecord', 'wordpress', SEALS.wordpressRecord, true],
    ['wm-wpbound', 'wordpress', SEALS.wordpressBound, true],
    ['wm-emdash', 'emdash', { artifact: TRACY_BUSINESS_EMDASH }, true],
    ['wm-joomla', 'joomla', {}, false],
    ['wm-jbase', 'joomla', { marker: { contract: 'tracy-base/j6/1.0.1' } }, false],
    ['wm-jderived', 'joomla', { marker: { contract: 'derived/northwind-import' } }, false],
    ['wm-wp', 'wordpress', {}, false],
    [
      'wm-wpbase',
      'wordpress',
      { marker: { ...WP_BOUND, contract: 'tracy-base/wp7/1.0.0', quickstart: 'tracy-base/wp7' } },
      false
    ],
    ['wm-emdash-open', 'emdash', {}, false],
    ['wm-emdash-base', 'emdash', { artifact: { ...TRACY_BUSINESS_EMDASH, templateId: 'tracy-base' } }, false]
  ]
  const roles = [
    ['designer', WITH_SHELL],
    ['developer', WITH_SHELL],
    ['writer', NO_SHELL],
    ['seo-geo', NO_SHELL]
  ]
  const pointer = [
    /`content\.read \{describe:true\}`/,
    /`where\.<topic>`/,
    /\bforms?\b.*\bpages?\b.*\bmenus?\b.*\bdesign\b.*\bSEO\b/,
    /turns? it off and back on/,
    /before (?:reading )?any CMS, plugin or template source/
  ]
  for (const [label, platform, options, mapped] of variants)
    test(`where-map: every mode is pointed at the quickstart's where-map, only on a site whose release has one: ${label}`, async () => {
      const folder = sealedSite(label, platform, options)
      for (const [role, tools] of roles) {
        const text = (await siteContext(folder, label, neverAsked, `${role}-${platform}`, { tools })).text
        const row = rowOf(text)
        assert.ok(row !== '', `${label} ${role}: the row itself is there`)
        if (mapped) assertText(row, { has: pointer }, `${label} ${role}`)
        else
          assertText(
            text,
            { hasNot: [/`where\.<topic>`/, /`where\.seo`/, /describe:true\}`'s `where/] },
            `${label} ${role}`
          )
      }
    })

  test('where-map: the releases the context knows a map for are exactly the ones apps/tracy-web carries', () => {
    const dir = path.join(here, '..', '..', '..', '..', 'apps', 'tracy-web', 'src', 'sites', 'where')
    /** @type {Record<string, string[]>} */
    const carried = {}
    for (const name of readdirSync(dir)
      .filter((one) => one.endsWith('.json'))
      .sort()) {
      const map = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
      ;(carried[map.platform] ??= []).push(map.quickstart)
    }
    assert.deepEqual(
      Object.fromEntries(Object.entries(WHERE_MAP_RELEASES).map(([k, v]) => [k, [...v].sort()])),
      Object.fromEntries(Object.entries(carried).map(([k, v]) => [k, v.sort()]))
    )
  })

  const releases = [
    ['joomla', { contract: 'tracy-business/j6/1.2.0' }, null, 'tracy-business/j6'],
    ['wordpress', WP_BOUND, null, 'tracy-business/wp7'],
    [
      'wordpress',
      { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress' },
      null,
      'tracy-business/wp7'
    ],
    ['joomla', { contract: 'derived/northwind-import' }, null, 'derived/northwind-import'],
    ['joomla', null, null, null],
    ['joomla', { contract: 42 }, null, null],
    ['emdash', null, TRACY_BUSINESS_EMDASH, 'tracy-business'],
    ['emdash', null, { cms: { name: 'emdash' } }, null],
    ['emdash', { contract: 'tracy-business/j6/1.2.0' }, null, null]
  ]
  for (const [platform, marker, artifact, expected] of releases)
    test(`where-map: the release a folder names — the EmDash handoff, else the contract marker: ${rowName([platform, marker, artifact])}`, () => {
      assert.equal(quickstartReleaseOf(platform, marker, artifact), expected)
    })
}

{
  // ONE STORY PER PLATFORM IN THE PERSONA, THE ROWS AND THE SKILL (09/10/2026). WordPress: the persona and the
  // PRESENTATION row said "a child theme or the block editor" while the LOOK row wrote the theme the page runs.
  // Both now name the theme the page runs (its child theme's files first) for templates; a LOOK change itself
  // goes into the site's Additional CSS, where `look.set` writes it, because a theme update replaces the
  // theme's own files (`look-set.mjs`). EmDash: the WORDS row said EVERY layer goes
  // through `tracy_emdash` and the skill said the template's words were "Not writable here" and "never in
  // /app", while the PRESENTATION line (and `site.rebuild`, `tracy-site-build-emdash`) edit them in `/app`.
  const matrix = JSON.parse(
    readFileSync(path.join(here, '..', '..', '..', '..', 'config', 'mode-matrix.json'), 'utf8')
  )
  const skill = readFileSync(
    path.join(here, '..', '..', '..', 'design', 'tracy-design-skill', 'skills', 'emdash-site', 'SKILL.md'),
    'utf8'
  )
  const theme = /the theme this site runs \(its child theme's first, when one runs\)/

  test('agreement: WordPress — the persona and the PRESENTATION row name the theme the page runs; the LOOK row names Additional CSS, where look.set writes', async () => {
    const persona = matrix.overlays.wordpress.persona
    assertText(persona, { has: [theme], hasNot: [/use a child theme/] }, 'persona')
    for (const [label, options] of [
      ['ag-wp', { facts: WP_FACTS }],
      ['ag-wprecord', SEALS.wordpressRecord]
    ])
      for (const [role, tools] of [
        ['designer', WITH_SHELL],
        ['writer', NO_SHELL]
      ]) {
        const row = rowOf(
          await textOf(`${label}-${role}`, 'wordpress', options, `${role}-wordpress`, { tools })
        )
        assertText(
          row,
          {
            has: [new RegExp(`PRESENTATION — [^—]*${theme.source}`)],
            hasNot: [/child theme or the block editor/]
          },
          `${label} ${role}`
        )
      }
    const bound = await textOf('ag-wpbound', 'wordpress', SEALS.wordpressBound, 'designer-wordpress', {
      tools: WITH_SHELL
    })
    assertText(rowOf(bound), { has: [theme], hasNot: [/else a child theme/] }, 'bound')
    assertText(
      lookLine('wordpress', 'designer', true) ?? '',
      {
        has: [/look\.set writes the site's Additional CSS/, /wp_update_custom_css_post/],
        hasNot: [/is `settings\.custom\.<a>\.<b>` in the `theme\.json`/, /assets\/css\/sections\.css/]
      },
      'LOOK row'
    )
  })

  test('agreement: EmDash — the WORDS row, the persona and the skill say the template code is edited in /app, by a mode with bash, then rebuilt', async () => {
    const shell = rowOf(await textOf('ag-ed-shell', 'emdash', {}, 'designer-emdash', { tools: WITH_SHELL }))
    const none = rowOf(await textOf('ag-ed-none', 'emdash', {}, 'writer-emdash', { tools: NO_SHELL }))
    for (const row of [shell, none])
      assertText(
        row,
        {
          has: [/words, pictures, menus and settings go through `tracy_emdash`/],
          hasNot: [/every layer goes through/]
        },
        'row'
      )
    assert.match(shell, /`bash` in the site's container edits it/)
    assert.match(none, /only a mode with a shell edits/)

    const persona = matrix.overlays.emdash.persona
    assertText(
      persona,
      {
        has: [
          /words written into the template's code/,
          /edited there with bash in the site's container/,
          /site\.rebuild/
        ],
        hasNot: [/the code under \/app does not hold them either/]
      },
      'persona'
    )

    // 26/10/2026: labels have their own tools, as the persona says (local round 26: "not writable here" kept a
    // build off the term and form doors it has).
    const labels = /- \*\*Labels change through their own tools\.\*\*[\s\S]*?(?=\n- )/.exec(skill)?.[0] ?? ''
    assert.ok(labels !== '', 'the skill says where labels change')
    assertText(
      labels,
      { has: [/taxonomy_update_term/, /form_words/, /form_list/], hasNot: [/\/app/, /not writable/i] },
      'labels'
    )
    assert.doesNotMatch(skill, /Not writable here/)
    assertText(
      skill,
      {
        has: [/words written into the template's code/, /site\.rebuild/, /a mode without bash/],
        hasNot: [/Words a visitor reads are\s+never in `\/app`/]
      },
      'skill'
    )
  })
}

{
  // Every character is re-read on every step. Budgets are the last measured size plus headroom;
  // a rule added to one platform buys its bytes there, not everywhere.
  const SITE_LINES =
    /^- (Folder|The customer answered|Build|Started from|Brand extracted|This site, measured):/
  // Each row's WHY is its create recipe (the `ADD_RECORD` row): what add-a-post chats needed to name a
  // field without reading siblings first. A further row must find its characters in the rows already here.
  //
  // The where-map pointer (`WHERE_MAP_POINTER`, 05/10/2026) is the one sentence every row bought outright:
  // 217 characters on every platform and seal, against "turn the contact form off, then back on"
  // reading source for 28 (WordPress), 34 (EmDash) and 42 (Joomla) calls before its one write. No rule
  // already here said where a quickstart's places are, so nothing could give the bytes back.
  const POINTER = 217
  // The earlier-wish clause (09/10/2026) is bought outright too, 97 characters on every platform and seal:
  // "So is one they say they gave before, unless a Site notes notice holds it: ask, it is in no file." Bench hb's
  // negative control ("the colour I gave you the other day", nothing kept) searched the folder, the theme's CSS,
  // `.tracy/`, apply.list and the webroot for it — 4–15 calls on every CMS, 227k prompt tokens once — before
  // asking. Where the host keeps what earlier conversations said is a fact no row here gave.
  const EARLIER = 97
  // 09/10/2026 (PR #1026): the language rule says a whole post or page is deleted in every language
  // unless one is named, as the delete doors of all three CMS now do. Without it the rule pointed the
  // agent at one delete per translation: one WordPress turn made 82 refused deletes and 1.3M prompt tokens.
  const DELETE_SCOPE = 50
  // 15/10/2026 (the design-system agent ladder on a Vietnamese JA Mood site): a new item like its siblings fills
  // every line they show (DL04: a card went out with its title alone); a block hidden or removed is looked at once
  // and the gap it left closed or said (DL09: a blank half row, reported done); the reading a visitor sees first is
  // the go-ahead, and a question about one item holds no other (DL12, DL14: a question card held three jobs)
  const LADDER = 358
  // 20/10/2026, bought outright on every platform and seal: the SCOPE line (337 with its newline) and 8 for
  // "only when asked" on the replace road's `all:true`. Staff editing real customer sites: "when Tracy fixes one
  // place it often breaks another place". The rules said how SMALL a change is, never how FAR it reaches, and no
  // line here said it in other words, so nothing could give the bytes back.
  const SCOPE = 345
  // 20/10/2026 (live run, Voice, council D3): "…khỏi trang web giúp mình" ("…off the website for me") with its verb misheard was read as a
  // delete; the door asked "This deletes something" for a request that had meant to hide one post. One line on
  // every platform: hide or delete is the person's to say, and asked when they did not.
  const HIDE_OR_DELETE = 139
  // 21/10/2026 (a customer could not connect their domain and asked the agent, which knew nothing of
  // Tracy): one rule on every platform, sent at every step — "Tracy questions go to tracy_guide first".
  // `GUIDE_RULE` itself, so the budget moves with the sentence and not past it.
  const GUIDE = GUIDE_RULE.length + 1
  // 30/10/2026 (#189): a page the agent changes keeps the site build rules, checked with tracy_build_check. One line
  // on every platform; `BUILD_RULES_RULE` itself, so the budget moves with the sentence.
  const BUILD_RULES = BUILD_RULES_RULE.length + 1
  // 23/10/2026 (beta week): the agent put a customer's template zip in the public webroot for them to fetch.
  // One line on every installed site: such a file stays outside `.webroot/` and goes by the side panel.
  const TAKE_AWAY = TAKE_AWAY_LINE.length + 1
  const cases = [
    // A sealed Joomla site stayed at least 15 % under the 9,653 it was on develop (8,194 measured), until
    // the pointer (8,388 measured).
    [
      'size-j',
      'joomla',
      { marker: { contract: 'tracy-business/j6/1.1.0' }, facts: JOOMLA_FACTS },
      Math.floor(9_653 * 0.85) +
        POINTER +
        EARLIER +
        DELETE_SCOPE +
        LADDER +
        SCOPE +
        HIDE_OR_DELETE +
        GUIDE +
        BUILD_RULES +
        TAKE_AWAY
    ],
    // The recipe fit the headroom this row already had (and so did the review's category and time-of-day
    // clauses: 8,865 measured).
    [
      'size-wp',
      'wordpress',
      { marker: { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress' }, facts: WP_FACTS },
      8_922 +
        POINTER +
        EARLIER +
        DELETE_SCOPE +
        LADDER +
        SCOPE +
        HIDE_OR_DELETE +
        GUIDE +
        BUILD_RULES +
        TAKE_AWAY
    ],
    // No headroom on EmDash, WordPress or open Joomla: the recipe bought its bytes there. The review's
    // PP-1/PP-3 wording added 8 (EmDash: the midnight ISO example) and 39 (WordPress: the category and
    // date clauses, net of the two sentences it gave up). Naming the first call (30/09/2026) gave 6 back on
    // WordPress and 2 on Joomla, and the budgets went down with them: the next sentence is paid for again.
    [
      'size-ed',
      'emdash',
      {},
      9_413 +
        POINTER +
        EARLIER +
        DELETE_SCOPE +
        LADDER +
        SCOPE +
        HIDE_OR_DELETE +
        GUIDE +
        BUILD_RULES +
        TAKE_AWAY
    ],
    [
      'open-j',
      'joomla',
      { facts: JOOMLA_FACTS },
      10_125 +
        POINTER +
        EARLIER +
        DELETE_SCOPE +
        LADDER +
        SCOPE +
        HIDE_OR_DELETE +
        GUIDE +
        BUILD_RULES +
        TAKE_AWAY
    ],
    [
      'open-wp',
      'wordpress',
      { facts: { theme: 'x', themeKind: 'block' } },
      9_467 +
        POINTER +
        EARLIER +
        DELETE_SCOPE +
        LADDER +
        SCOPE +
        HIDE_OR_DELETE +
        GUIDE +
        BUILD_RULES +
        TAKE_AWAY
    ]
  ]
  for (const [label, platform, options, budget] of cases)
    test(`size: the rules a site carries stay within the budget of their platform and seal: ${label}`, async () => {
      const text = await textOf(label, platform, options)

      const rules = text
        .split('\n')
        .filter((one) => !SITE_LINES.test(one))
        .join('\n').length

      assert.ok(rules <= budget, `${label}: ${rules} characters of rules, budget ${budget}`)
    })
}

// The create recipe (`ADD_RECORD`) is sent on every step, so it costs nothing where it cannot help: before
// the site is installed there is nothing to add to, and a platform with no row gets neither it nor the WORDS
// row it belongs to.
for (const platform of ['wordpress', 'joomla', 'emdash'])
  test(`create recipe: none before the site is installed, one row right after the WORDS row otherwise: ${platform}`, async () => {
    const notInstalled = await siteContext(
      siteFolder(`add-bare-${platform}`),
      `add-bare-${platform}`,
      async () => platform,
      `writer-${platform}`
    )
    assert.doesNotMatch(notInstalled?.text ?? '', /^- Adding a record:/m, `${platform}: nothing installed`)

    const live = await siteContext(
      sealedSite(`add-live-${platform}`, platform),
      `add-live-${platform}`,
      neverAsked,
      `writer-${platform}`
    )
    const lines = (live?.text ?? '').split('\n')

    assert.equal(lines.filter((one) => one.startsWith('- Adding a record:')).length, 1, platform)
    assert.ok(
      lines.findIndex((one) => one.startsWith('- Where visible text lives:')) <
        lines.findIndex((one) => one.startsWith('- Adding a record:')),
      platform
    )
  })

test('create recipe: none for a platform with no row', async () => {
  const other = await siteContext(
    sealedSite('add-other', 'drupal'),
    'add-other',
    neverAsked,
    'writer-wordpress'
  )

  assert.doesNotMatch(other?.text ?? '', /^- Adding a record:/m)
})

// Review of round 7, PP-1. The Today notice is a UTC DATE and nothing on the host says what o'clock it is for
// the site, so the recipe spells midnight: any other time is invented, and one later than now hides the item
// (WordPress turns `publish` into `future`, Joomla keeps a state-1 article pending until `publish_up`).
{
  const rows = [
    ['wordpress', /post_date:"YYYY-MM-DD 00:00:00"/],
    ['joomla', /publish_up:"YYYY-MM-DD 00:00:00"/],
    ['emdash', /date:"YYYY-MM-DDT00:00:00Z"/]
  ]
  for (const [platform, midnight] of rows)
    test(`create recipe: the time of day is midnight, not a time for the model to invent: ${platform}`, async () => {
      const row = line(await textOf(`add-time-${platform}`, platform), '- Adding a record:')

      assert.match(row, midnight)
      assert.doesNotMatch(row, /HH:MM:SS|<ISO datetime>/)
    })
}

// PP-1, WordPress: `post_date` is the SITE's time, which can still be yesterday where the UTC day has just
// turned, so a create with no named day carries none and the door dates the post now.
test('create recipe: a WordPress create names no date unless the customer named a day', async () => {
  const row = line(await textOf('add-date-wp', 'wordpress'), '- Adding a record:')
  const [, fields = ''] = /fields:\{([^}]*)\}/.exec(row) ?? []

  assert.doesNotMatch(fields, /post_date/)
  assert.match(row, /`post_date:"YYYY-MM-DD 00:00:00"` for a day they named \(not today\)/)
})

// PP-3, now the door's to say. A listing page can filter its post query by category (`taxQuery.category`), and a
// post without that category never shows there — so the row cannot forbid a category outright. Since the first
// call was named (30/09/2026) the row does not spell the category either: `content.read {view:"pages", url}`
// answers `lists.create`, the call with the category the page lists already in it (`page-lists.mjs`).
for (const platform of ['wordpress', 'joomla'])
  test(`create recipe: the category of the page the customer named comes from the page, and the row forbids none: ${platform}`, async () => {
    const row = line(await textOf(`add-category-${platform}`, platform), '- Adding a record:')

    assert.doesNotMatch(row, /\bno (?:extra )?category\b/i)
    assert.match(row, /answers `lists\.create`, the call to fill/)
    if (platform === 'wordpress') assert.doesNotMatch(row, /post_category|taxQuery/)
    else assert.match(row, /`catid` is `id=` in its `native` menuItem's `link`/)
  })

// First call of an add (30/09/2026): 14 of 16 WordPress and Joomla add-by-chat runs never named it, and the Joomla
// row sent the model to `content.list {kind:"category"}`, a door that cannot say which category a page lists (8 of 8
// runs listed categories and then needed the menu item anyway). The two rows NAME the read, as the EmDash row does,
// and are SHORTER than the rows they replace — this text is sent on every step of every conversation.
{
  const BEFORE = { wordpress: 418, joomla: 476 }
  for (const platform of /** @type {const} */ (['wordpress', 'joomla']))
    test(`create recipe: the first call is named and the row is shorter than the one it replaced: ${platform}`, async () => {
      const row = line(await textOf(`add-first-${platform}`, platform), '- Adding a record:')

      assert.match(
        row,
        /^- Adding a record: `content\.read \{view:"pages", url:<the page>\}` answers `lists\.create`/
      )
      assert.ok(
        row.length < BEFORE[platform],
        `${platform}: ${row.length} characters, the old row had ${BEFORE[platform]}`
      )
      // The Joomla row no longer points at a door that cannot answer its question.
      assert.doesNotMatch(row, /content\.list/)
      // One row, the same bytes for every mode of a site (the recipe is for all four).
      for (const role of ['designer', 'developer', 'writer', 'seo-geo'])
        assert.equal(
          line(
            await bareText(`add-first-${platform}`, platform, `${role}-${platform}`),
            '- Adding a record:'
          ),
          row,
          role
        )
    })
}

// What a site was measured to be (`.site-facts/<label>.json`) is read again, once, when an address with no language
// prefix found no page and `runSiteCall` must know which language the site serves under one.
test('measuredFacts: the facts a site was measured with, or null — never a throw, never a shape that is not an object', async () => {
  const folder = sealedSite('measured-a', 'joomla', {
    facts: { siteLanguage: 'en-GB', languagePrefixes: { 'en-GB': 'en' } }
  })
  const root = path.dirname(folder)
  assert.deepEqual(await measuredFacts(root, 'measured-a'), {
    siteLanguage: 'en-GB',
    languagePrefixes: { 'en-GB': 'en' }
  })
  // No file for the label, JSON that does not parse, `facts` missing or not an object: null.
  assert.equal(await measuredFacts(root, 'measured-none'), null)
  mkdirSync(path.join(root, '.site-facts'), { recursive: true })
  for (const [name, text] of [
    ['broken', '{not json'],
    ['no-facts', '{"format":1}'],
    ['list', '{"format":1,"facts":[1,2]}'],
    ['text', '{"format":1,"facts":"x"}'],
    ['null', '{"format":1,"facts":null}']
  ])
    writeFileSync(path.join(root, '.site-facts', `${name}.json`), text)
  for (const name of ['broken', 'no-facts', 'list', 'text', 'null'])
    assert.equal(await measuredFacts(root, name), null, name)
  assert.equal(await measuredFacts('/nonexistent/sites/root', 'x'), null)
})

// The day is a notice of its own: a date in the block would change the cached prefix once every 24 hours.
for (const platform of ['wordpress', 'joomla', 'emdash'])
  test(`the day is not in the context block: ${platform}`, async () => {
    const context = await siteContext(
      sealedSite(`day-${platform}`, platform),
      `day-${platform}`,
      neverAsked,
      `writer-${platform}`
    )

    assert.doesNotMatch(context?.text ?? '', /Today:|\b20\d\d-\d\d-\d\d\b/, platform)
  })

// ── brakes: session logs in dsh's shapes ─────────────────────────────────────────────────────────────

/**
 * A tool result as dsh 0.1.7 hands it to a plugin: a first-class tool-role message, its answer's blocks
 * directly in `content`, its error flag on the MESSAGE (session format V4).
 * @param {string} callId @param {string} text @param {boolean} [isError]
 */
const toolMessage = (callId, text, isError = false) => ({
  id: `tool-result-${callId}`,
  role: 'tool',
  source: { kind: 'tool', callId },
  toolCallId: callId,
  content: [{ type: 'text', text }],
  isError
})
/** A notice's source as index.ts writes it now. */
const notice4 = (producer, summary = '') => ({ kind: 'tracy-site', producer, form: 'notice', summary })
/** A 0.1.6 notice as the V3→V4 migration hands it back: `{kind:'plugin:X'}`, `plugin` dropped. */
const migratedNotice = (producer, summary) => ({
  kind: `plugin:${producer}`,
  form: 'notice',
  ...(summary === undefined ? {} : { summary })
})
/** Session format V4's source admission (dsh `message-sources.ts:9`). */
const v4AdmitsSource = (source) =>
  source !== null &&
  typeof source === 'object' &&
  !Array.isArray(source) &&
  typeof source.kind === 'string' &&
  source.kind.length > 0 &&
  source.kind !== 'plugin'

/**
 * A session log for `stepBudget`: turns of steps of calls, each call with a paired `tool/result`.
 * `{refused: true}` answers `{"ok":false}`; `{plugin}` logs a notice.
 */
function turnLog(...turns) {
  const events = []
  let nextId = 0
  for (const steps of turns) {
    events.push({ type: 'turn/start', data: { turn: events.length } })
    for (const calls of steps) {
      events.push({ type: 'step/start', data: {} })
      for (const call of calls) {
        if (call.plugin) {
          events.push({ type: 'user/message', data: { source: notice4(call.plugin) } })
          continue
        }
        const callId = `call-${nextId++}`
        events.push({
          type: 'tool/call',
          data: { name: call.name, callId, arguments: JSON.stringify(call.args ?? {}) }
        })
        events.push({
          type: 'tool/result',
          data: {
            message: toolMessage(
              callId,
              call.refused ? '{"ok":false,"code":"UNKNOWN_ACTION"}' : '{"ok":true}'
            )
          }
        })
      }
      events.push({ type: 'step/end', data: {} })
    }
  }
  return { session: { seq: events.length, eventAt: (seq) => events[seq] } }
}

/** A timed log: one step per entry, `{name, args, answer?, error?, ms?}` per call, `{notice, summary}` for a notice. */
function timedLog(steps) {
  const events = [{ type: 'turn/start', time: 0, data: { turn: 1 } }]
  let t = 0
  let id = 0
  for (const calls of steps) {
    events.push({ type: 'step/start', time: t, data: {} })
    let end = t
    for (const call of calls) {
      if (call.notice) {
        events.push({ type: 'user/message', time: t, data: { source: notice4(call.notice, call.summary) } })
        continue
      }
      const callId = `c${id++}`
      events.push({
        type: 'tool/call',
        time: t,
        data: { name: call.name, callId, arguments: JSON.stringify(call.args ?? {}) }
      })
      end = Math.max(end, t + (call.ms ?? 1_000))
    }
    let n = id - calls.filter((c) => !c.notice).length
    for (const call of calls) {
      if (call.notice) continue
      const text = call.text ?? call.error ?? JSON.stringify(call.answer ?? { ok: true })
      events.push({
        type: 'tool/result',
        time: t + (call.ms ?? 1_000),
        data: {
          message: toolMessage(`c${n++}`, text, call.error !== undefined),
          ...(call.error !== undefined
            ? { error: { name: 'Error', code: 'TOOL_FAILED', reason: call.error } }
            : {})
        }
      })
    }
    events.push({ type: 'step/end', time: end, data: {} })
    t = end + 500
  }
  return { session: { seq: events.length, eventAt: (seq) => events[seq] } }
}

/** A log as dsh recorded r2: `arguments` as the model's JSON text, a refusal with `isError:false`. */
function r2Turn(steps) {
  const events = [{ type: 'turn/start', data: { turn: 1 } }]
  let id = 0
  steps.forEach((calls, step) => {
    events.push({ type: 'step/start', data: { turn: 1, step: step + 1 } })
    for (const call of calls) {
      const callId = `call_00_r2shape${id++}`
      events.push({
        type: 'tool/call',
        data: { turn: 1, step: step + 1, callId, name: call.name, arguments: call.arguments }
      })
      events.push({
        type: 'tool/result',
        data: { turn: 1, step: step + 1, message: toolMessage(callId, call.answer) }
      })
    }
    events.push({ type: 'step/end', data: { turn: 1, step: step + 1 } })
  })
  return { session: { seq: events.length, eventAt: (seq) => events[seq] } }
}

const site = (action, params = {}) => ({ name: 'tracy_site', args: { action, params } })
const look = site('content.list', { kind: 'article' })
const bash = { name: 'bash', args: { command: 'grep -r Cassiopeia .' } }
const exploring = (n) => Array.from({ length: n }, (_, i) => [i % 2 ? look : bash])
const noticeStep = { plugin: STEP_BUDGET_PLUGIN }
const refuse = (call) => ({ ...call, refused: true })
const emdashTool = (tool) => ({ name: 'tracy_emdash', args: { tool, arguments: {} } })
/** One Joomla inspect that runs `ms` (j C04: 44 inspects, 535.6 s, in 10 steps). */
const inspectFor = (ms) => ({
  ...site('content.contract', { operation: 'inspect', entity: 'module-441' }),
  answer: { ok: true, revision: 'r1', slots: [] },
  ms
})
const applyFor = { ...site('content.contract', { operation: 'apply', changes: {} }), answer: { ok: true } }

{
  const write = site('content.update')
  const READS = [
    'info',
    'media.scan',
    'page.look',
    'core.manifest',
    'apply.list',
    'db.dump',
    'db.snapshot',
    'content.contract',
    undefined
  ]
  const rows = [
    // the window
    ['9 steps', turnLog(exploring(9)), null],
    ['10 steps', turnLog(exploring(10)), { steps: 10, sent: 0 }],
    ['14 steps', turnLog(exploring(14)), { steps: 14, sent: 0 }],
    ['an earlier turn does not count', turnLog(exploring(8), exploring(4)), null],
    ['no session', undefined, null],
    // a settled change resets it
    ['a write restarts the count', turnLog([...exploring(9), [write], ...exploring(5)]), null],
    [
      'ten steps after a write are due again',
      turnLog([...exploring(9), [write], ...exploring(10)]),
      { steps: 10, sent: 0 }
    ],
    ...['edit', 'write'].map((name) => [
      `a ${name} file tool call resets`,
      turnLog([...exploring(9), [{ name, args: { file_path: '.webroot/a.css' } }], ...exploring(5)]),
      null
    ]),
    [
      'a contract apply resets',
      turnLog([...exploring(9), [site('content.contract', { operation: 'apply' })], ...exploring(5)]),
      null
    ],
    [
      'an EmDash write resets',
      turnLog([...exploring(9), [emdashTool('content_update')], ...exploring(5)]),
      null
    ],
    // what is not a change
    [
      'a refused write is a looking step',
      turnLog([...exploring(9), [refuse(write)], ...exploring(1)]),
      { steps: 11, sent: 0 }
    ],
    [
      'a refused contract apply is still not a change',
      turnLog([...exploring(9), [refuse(site('content.contract', { operation: 'apply' }))]]),
      { steps: 10, sent: 0 }
    ],
    [
      'a refused EmDash write is still not a change',
      turnLog([...exploring(9), [refuse(emdashTool('content_update'))]]),
      { steps: 10, sent: 0 }
    ],
    ...READS.map((action) => [
      `${String(action)} is not a change`,
      turnLog([...exploring(9), [{ name: 'tracy_site', args: action === undefined ? {} : { action } }]]),
      { steps: 10, sent: 0 }
    ]),
    ...[
      emdashTool('content_get'),
      { name: 'tracy_emdash', args: { list: true } },
      emdashTool('schema_list_collections')
    ].map((read) => [
      `EmDash ${JSON.stringify(read.args)} is a read`,
      turnLog([...exploring(9), [read]]),
      { steps: 10, sent: 0 }
    ]),
    // a notice raises the bar
    ['before the raised bar', turnLog([...exploring(10), [noticeStep, bash], ...exploring(4)]), null],
    [
      'twenty more steps earn the second notice',
      turnLog([...exploring(10), [noticeStep, bash], ...exploring(20)]),
      { steps: 31, sent: 1 }
    ],
    ['the turn is ending (last step had no tool)', turnLog([...exploring(10), []]), null]
  ]
  for (const [label, log, expected] of rows)
    test(`stepBudget: ten steps of looking is due; a settled change resets the count; a refusal, a read or preparation does not: ${label}`, () => {
      assert.deepEqual(stepBudget(log), expected, label)
    })
}

test('stepBudget: every relay action is classified exactly once, so the door cannot outgrow the list', () => {
  for (const action of [...LOCAL_ACTIONS, ...RELAY_ACTIONS])
    assert.ok(
      ['read', 'prepare', 'write'].includes(ACTION_CLASSES[action]),
      `${action} has no class — add it to ACTION_CLASS beside the door's own list`
    )
})

{
  const read = {
    name: 'tracy_site',
    arguments: '{"action": "content.list", "params": {"kind": "post"}}',
    answer: '{"ok":true,"items":[]}'
  }
  const exploringR2 = (n) => Array.from({ length: n }, () => [read])
  const emdashWrite = {
    name: 'tracy_emdash',
    arguments:
      '{"arguments": {"collection": "site", "id": "01M36TA5254KTX8AKZQMK4BZD0", "data": {"hotline": "0909 123 456"}}, "tool": "content_update"}',
    answer:
      '{"ok":true,"site":"ed-ivj9ni","tool":"content_update","result":{"content":[{"type":"text","text":"{}"}]}}'
  }
  const contractApply = {
    name: 'tracy_site',
    arguments:
      '{"action": "content.contract", "params": {"operation": "apply", "apply_id": "contract-home-hero-title", "changes": {"module-441.1": "Built for the way you work"}, "evidence": {}}}',
    answer: '{"ok":true,"ids":[441],"revision":"e0e3"}'
  }
  const refusedWrite = {
    name: 'tracy_site',
    arguments:
      '{"action": "content.update", "params": {"kind": "post", "id": 42, "fields": {"__probe__": ""}, "apply_id": "probe-schema"}}',
    answer:
      '{"ok":false,"error":"write_failed","message":"no writable field for kind post","next":"This site answered no, and that is an answer."}'
  }
  const acceptedWithOkInside = {
    ...contractApply,
    answer: '{"ok":true,"ids":[441],"result":{"ok":false,"note":"x"}}'
  }
  const rows = [
    ['emdash write, 5 looks after', r2Turn([...exploringR2(9), [emdashWrite], ...exploringR2(5)]), null],
    [
      'emdash write, 10 looks after',
      r2Turn([...exploringR2(9), [emdashWrite], ...exploringR2(10)]),
      { steps: 10, sent: 0 }
    ],
    ['contract apply, 5 looks after', r2Turn([...exploringR2(9), [contractApply], ...exploringR2(5)]), null],
    [
      'contract apply, 10 looks after',
      r2Turn([...exploringR2(9), [contractApply], ...exploringR2(10)]),
      { steps: 10, sent: 0 }
    ],
    [
      'a refused write (isError false) resets nothing',
      r2Turn([...exploringR2(9), [refusedWrite], ...exploringR2(1)]),
      { steps: 11, sent: 0 }
    ],
    [
      '"ok":false inside an accepted answer is not a refusal',
      r2Turn([...exploringR2(9), [acceptedWithOkInside], ...exploringR2(5)]),
      null
    ]
  ]
  for (const [label, log, expected] of rows)
    test(`stepBudget: r2 as logged — an accepted EmDash write and contract apply reset the budget, a refused write does not: ${label}`, () => {
      assert.deepEqual(stepBudget(log), expected, label)
    })
}

test('stepBudget: 120 s of tool time is due however few the steps; overlapping reads are one span; a change and a notice reset it', () => {
  const noticeOf = { notice: STEP_BUDGET_PLUGIN, summary: 'step budget 1' }
  assert.equal(
    stepBudget(timedLog([[inspectFor(130_000)], [noticeOf, inspectFor(130_000)], [inspectFor(120_000)]]))
      ?.sent,
    1,
    'due again past the raised bar'
  )
})

{
  const wide = Array.from({ length: 4 }, () => inspectFor(40_000))
  const noticeOf = { notice: STEP_BUDGET_PLUGIN, summary: 'step budget 1' }
  const slow = () => [inspectFor(54_000)]
  const rows = [
    ['108 s in 2 steps', timedLog([slow(), slow()]), null],
    ['162 s in 3 steps', timedLog([slow(), slow(), slow()]), { steps: 3, sent: 0, seconds: 162 }],
    ['four 40 s reads in one step are 40 s, so two such steps are 80 s', timedLog([wide, wide]), null],
    ['three such steps are 120 s', timedLog([wide, wide, wide]), { steps: 3, sent: 0, seconds: 120 }],
    [
      'a settled change resets the clock',
      timedLog([[inspectFor(100_000)], [applyFor], [inspectFor(30_000)]]),
      null
    ],
    [
      'after a notice the bar is 240 s more',
      timedLog([[inspectFor(130_000)], [noticeOf, inspectFor(130_000)]]),
      null
    ]
  ]
  for (const [label, log, expected] of rows)
    test(`stepBudget: 120 s of tool time is due however few the steps; overlapping reads are one span; a change and a notice reset it: ${label}`, () => {
      assert.deepEqual(stepBudget(log), expected, label)
    })
}

test('stepBudget: a notice sent by dsh 0.1.6 and migrated still raises the bar', () => {
  const withOld = turnLog([...exploring(10), [noticeStep], ...exploring(2)])
  const rewrite = (event) =>
    event.type === 'user/message'
      ? { ...event, data: { source: migratedNotice(STEP_BUDGET_PLUGIN, 'step budget 1') } }
      : event
  const unreadable = (event) =>
    event.type === 'user/message' ? { ...event, data: { source: { kind: 'user' } } } : event
  const from = (map) => ({
    session: { seq: withOld.session.seq, eventAt: (seq) => map(withOld.session.eventAt(seq)) }
  })

  assert.deepEqual(stepBudget(from(rewrite)), stepBudget(withOld))
  assert.notDeepEqual(
    stepBudget(from(unreadable)),
    stepBudget(from(rewrite)),
    'without the notice read as one, the run would be due again at once'
  )
})

test('stepBudgetNotice: the planned branch asks for the write, level 1 names each platform’s read, level 2 stops, seconds and no-todo are said', () => {
  assert.equal(stepBudgetNotice(10), stepBudgetNotice(10, false, 0), 'unplanned and level 0 are the defaults')
  assert.equal(
    stepBudgetNotice(10),
    stepBudgetNotice(10, false, 0, undefined),
    'without seconds the text is unchanged'
  )
  assert.equal(stepBudgetNotice(10, false, 0, undefined, { todo: true }), stepBudgetNotice(10))
})

{
  const rows = [
    {
      label: 'planned, level 0',
      args: [10, true, 0],
      has: [
        /name the write the item in progress needs — which record, which field/,
        /An item that names no record is not an item/
      ],
      hasNot: [/carry out the item that is in progress/]
    },
    {
      label: 'alone, level 0',
      args: [10, false, 0],
      has: [
        /make the smallest change that does what the customer asked/,
        /call `todo_write` with the plan, one item per change/,
        /if the change needs a fact only they know, ask for it/
      ]
    },
    {
      label: 'level 1 names each platform’s read',
      args: [30, true, 1],
      has: [
        /You were already asked to stop exploring and did not\./,
        /`tracy_site` `content\.get`/,
        /`content\.contract` inspect/,
        /`tracy_emdash` `content_get`/
      ]
    },
    {
      label: 'level 2 stops',
      args: [50, false, 2],
      has: [
        /Stop\. Do not open another file, page or address\./,
        /the one thing you need from the customer to finish it/
      ]
    },
    {
      label: 'time named',
      args: [3, false, 0, 162],
      has: [/You have taken 3 steps and 162 s of tool time without changing the site\./]
    },
    {
      label: 'no todo_write',
      args: [10, false, 0, undefined, { todo: false }],
      has: [/write the plan in your reply, one line per change, and start its first item\./],
      hasNot: [/todo_write/]
    }
  ]
  for (const { label, args, has, hasNot } of rows)
    test(`stepBudgetNotice: the planned branch asks for the write, level 1 names each platform’s read, level 2 stops, seconds and no-todo are said: ${label}`, () => {
      assertText(stepBudgetNotice(...args), { has, hasNot }, label)
    })
}

{
  const log = (...writes) => {
    const events = writes.map((todos) => ({ type: 'todo/write', data: { todos } }))
    return { session: { seq: events.length, eventAt: (seq) => events[seq] } }
  }
  const open = [{ content: 'Install the theme', status: 'in_progress' }]
  const pending = [{ content: 'Write the words', status: 'pending' }]
  const done = [{ content: 'Install the theme', status: 'completed' }]
  const rows = [
    [log(open), true],
    [log(pending), true],
    [log(done), false],
    [log(open, done), false],
    [log(done, open), true],
    [log(), false],
    [log(null), false],
    [log([]), false],
    [undefined, false],
    [{ session: {} }, false]
  ]
  for (const [input, expected] of rows)
    test(`hasPlan: the latest list decides, and only an unfinished item is a plan still open: ${rowName(input)}`, () => {
      assert.equal(hasPlan(input), expected)
    })
}

// ── the second brake: the turn as a whole ────────────────────────────────────────────────────────────

const editStep = [{ name: 'edit', args: { file_path: '/site/x/.webroot/wp-content/mu-plugins/vi.php' } }]
/** The measured shape: a write every third step, so the looking window never reaches ten. */
const repairing = (n) => Array.from({ length: n }, (_, i) => (i % 3 === 2 ? editStep : [bash]))

test('turnLength: 40 steps are due even when writes keep resetting stepBudget; only this turn counts; one ignored nudge doubles the bar', () => {
  const sentOne = [{ plugin: TURN_LENGTH_PLUGIN }]
  const after = (steps) => turnLog([...repairing(40), sentOne, ...repairing(steps)])
  assert.equal(stepBudget(turnLog(repairing(60))), null, 'the defect: stepBudget is blind to this shape')
  assert.notEqual(stepBudget(turnLog(exploring(45))), null, 'both brakes can be due at once on pure looking')
  assert.notEqual(turnLength(turnLog(exploring(45))), null)
  const due = turnLength(after(45))
  assert.equal(due.sent, 1)
  assert.ok(due.steps >= 80, `the bar should double: ${JSON.stringify(due)}`)
})

// A one-press build with a saved plan pages through its research and records and waits on its provision:
// both bars are five times for it (pilot 23/10/2026, notices at steps 10, 31 and 40 of a 72-step build).
// 24/10/2026 on EmDash: seventeen minutes of provision.wait read as looking, the agent told to stop before its site existed.
test('stepBudget: a demo build waiting on its provision is not looking; reading after it is', () => {
  const wait = { name: 'tracy_demo', args: { operation: 'provision.wait', waitSeconds: 30 } }
  const waiting = Array.from({ length: 40 }, () => [wait])
  assert.equal(stepBudget(turnLog(waiting)), null)
  assert.notEqual(stepBudget(turnLog([...waiting, ...exploring(12)])), null)
  assert.equal(stepBudget(turnLog([...exploring(12), [wait]])), null)
})

// 24/10/2026, a WordPress bakery: thirty photo imports read as fifty steps of looking; told to "make the smallest
// change", the agent ran one more check and ended the build with three of five left.
test('stepBudget: a build importing photos, saving its plan or running a check is working; a refused one is not', () => {
  const demo = (operation) => ({ name: 'tracy_demo', args: { operation, assetId: 'a' } })
  for (const op of ['media.import', 'plan.save', 'check']) {
    assert.equal(buildsSite({ name: 'tracy_demo', arguments: JSON.stringify({ operation: op }) }), true, op)
    assert.equal(stepBudget(turnLog([...exploring(12), [demo(op)]])), null, op)
  }
  assert.equal(buildsSite({ name: 'tracy_demo', arguments: { operation: 'structure.read' } }), false)
  assert.notEqual(stepBudget(turnLog([...exploring(12), [refuse(demo('media.import'))]])), null)
})

test('loopNotices: a build is told to write its plan and keep checking, never to make the smallest change or stop', () => {
  const texts = (log) =>
    loopNotices(log, { build: true })
      .map((n) => n.text)
      .join('\n')
  const looking = texts(turnLog(exploring(55)))
  assert.match(looking, /next row of your saved plan[\s\S]*until a check passes or the fifth has run/)
  assert.doesNotMatch(looking, /smallest change|Stop exploring|Stop\./)
  const long = texts(turnLog(repairing(205)))
  assert.match(long, /A whole site takes many steps/)
  assert.doesNotMatch(long, /smallest version|Stop now and report/)
})

// 24/10/2026 on a local stand: a Joomla bar and a WordPress bakery each ended their build after two failed checks of five.
test('buildChecks: verdicts counted, the latest kept; a running or refused check is none; checkAgainNext says what is left', () => {
  const check = (answer) => ({ name: 'tracy_demo', args: { operation: 'check' }, answer })
  const log = (...answers) => timedLog(answers.map((a) => [check(a)])).session
  const events = (l) => Array.from({ length: l.seq }, (_, i) => l.eventAt(i))
  assert.deepEqual(buildChecks(events(log({ ok: true, pass: false }, { ok: true, pass: false }))), {
    checks: 2,
    lastPass: false,
    exhausted: false
  })
  assert.deepEqual(
    buildChecks(
      events(log({ ok: true, pass: false }, { ok: false, code: 'DEMO_CHECK_RUNNING', running: true }))
    ),
    { checks: 1, lastPass: false, exhausted: false }
  )
  assert.equal(buildChecks(events(log({ ok: true, pass: false }, { ok: true, pass: true }))).lastPass, true)
  assert.equal(buildChecks(events(log({ ok: false, code: 'DEMO_CHECK_BUDGET_EXHAUSTED' }))).exhausted, true)
  assert.match(
    checkAgainNext({ checks: 2 }),
    new RegExp(
      `${BUILD_CHECKS - 2} of ${BUILD_CHECKS} checks remain[\\s\\S]*Do not reply to the customer yet[\\s\\S]*tracy_demo \\{operation:"check"\\}`
    )
  )
  assert.match(checkAgainNext({ checks: 2 }), /its length is no reason to stop/)
  assert.match(PLAN_FROZEN_NEXT, /only grows[\s\S]*appended/)
  assert.equal(checkAgainNext({ checks: BUILD_CHECKS }), null)
})

// Local round 30, 25/10/2026: a WordPress build ended "at the edge of my context" at 464K of 1,000K tokens.
test('contextRoom reads the last prompt against the window, and the check-again answer says the number', () => {
  const events = [
    { type: 'request/context', data: { model: 'deepseek-flash', contextWindow: 1_000_000 } },
    {
      type: 'assistant/message',
      data: { usage: { inputTokens: 1200, cacheReadTokens: 300000, cacheWriteTokens: 0 } }
    },
    {
      type: 'assistant/message',
      data: { usage: { inputTokens: 1736, cacheReadTokens: 462232, cacheWriteTokens: 0 } }
    }
  ]
  assert.deepEqual(contextRoom(events), { used: 463968, window: 1_000_000 })
  assert.equal(contextRoom([{ type: 'assistant/message', data: { usage: { inputTokens: 5 } } }]), null)
  assert.match(
    checkAgainNext({ checks: 2 }, BUILD_CHECKS, contextRoom(events)),
    /This conversation holds 464K of its 1000K tokens: room for every repair\./
  )
  assert.doesNotMatch(checkAgainNext({ checks: 2 }), /This conversation holds/)
})

// The Living Room local, build 13 (25/10/2026): each check answered past dsh's inline bound (spill-policy
// `maxInlineTokens` 12500), so the session kept its head, a gap, its tail and a notice. None parsed as JSON: every
// check counted as none, the third still said "4 of 5 checks remain", and the build was never steered on.
test('buildChecks: a check answer the tool cut still counts by the verdict at its head', () => {
  const answer = {
    next: 'This check failed and 4 of 5 checks remain, so this build is not finished. Say \\"pass\\":true never.',
    ok: true,
    checkId: '0c83e72b',
    pass: false,
    needsReview: false,
    checks: [{ id: 'no-demo-words', pass: false, detail: 'x'.repeat(200) }]
  }
  const spilled = (a) =>
    `${JSON.stringify(a).slice(0, 170)}\n\n[...]\n\n${'y'.repeat(40)}\n\n(Output was 163000 bytes; the full text is saved at /tmp/s/tracy_demo.txt. Use read with offset/limit, or grep this path to search within it.)`
  const check = (a) => ({ name: 'tracy_demo', args: { operation: 'check' }, text: spilled(a) })
  const events = (...answers) => {
    const l = timedLog(answers.map((a) => [check(a)])).session
    return Array.from({ length: l.seq }, (_, i) => l.eventAt(i))
  }
  assert.ok(!spilled(answer).includes('"needsReview"'), 'the cut falls inside the answer')
  assert.deepEqual(buildChecks(events(answer, answer)), { checks: 2, lastPass: false, exhausted: false })
  assert.deepEqual(buildChecks(events(answer, answer, { ...answer, pass: true })), {
    checks: 3,
    lastPass: true,
    exhausted: false
  })
  assert.match(
    checkAgainStep(events(answer, answer)) ?? '',
    new RegExp(`${BUILD_CHECKS - 2} of ${BUILD_CHECKS} checks remain`)
  )
  // A Retry is a new build with five checks again: only the latest turn's checks count.
  const retry = [...events(answer, answer), { type: 'turn/start', data: { turn: 2 } }, ...events(answer)]
  assert.deepEqual(buildChecks(retry), { checks: 1, lastPass: false, exhausted: false })
  assert.match(
    checkAgainStep(retry) ?? '',
    new RegExp(`${BUILD_CHECKS - 1} of ${BUILD_CHECKS} checks remain`)
  )
  // A head with no verdict before its first nested value is none: a `pass` inside the checks is not the answer's.
  const nested = timedLog([
    [{ name: 'tracy_demo', args: { operation: 'check' }, text: '{"checks":[{"id":"a","pass":false}],"pass' }]
  ]).session
  assert.equal(buildChecks(Array.from({ length: nested.seq }, (_, i) => nested.eventAt(i))).checks, 0)
})

// 24/10/2026 on a local stand: told to check again, a WordPress build ran three checks with nothing written between.
test('changedSinceCheck: a write or a photo after the latest verdict counts; another check or a refused write does not', () => {
  const check = { name: 'tracy_demo', args: { operation: 'check' }, answer: { ok: true, pass: false } }
  const write = { name: 'tracy_site', args: { action: 'content.update', params: { kind: 'post', id: 1 } } }
  const photo = { name: 'tracy_demo', args: { operation: 'media.import', assetId: 'a' } }
  const events = (...steps) => {
    const l = timedLog(steps.map((c) => [c])).session
    return Array.from({ length: l.seq }, (_, i) => l.eventAt(i))
  }
  assert.equal(changedSinceCheck(events(write)), true, 'no check yet')
  assert.equal(changedSinceCheck(events(write, check)), false)
  assert.equal(changedSinceCheck(events(check, write)), true)
  assert.equal(changedSinceCheck(events(check, photo)), true)
  assert.equal(changedSinceCheck(events(check, check)), false)
  assert.equal(
    changedSinceCheck(events(check, { ...write, answer: { ok: false, code: 'BAD_PARAMS' } })),
    false
  )
  // Local round 35 (26/10/2026): an EmDash build edited its views in the shell and restarted; "nothing changed", twice.
  const restart = {
    name: 'tracy_site_build_emdash',
    args: { action: 'request', operation: 'site.restart', input: {} }
  }
  const shell = {
    name: 'bash',
    args: { command: "sed -i 's/Production/Viennoiserie/' /app/src/views/Home.astro" }
  }
  const read = { name: 'bash', args: { command: 'grep -rn sector /app/src/views' } }
  assert.equal(changedSinceCheck(events(check, restart)), true)
  assert.equal(changedSinceCheck(events(check, shell)), true)
  assert.equal(changedSinceCheck(events(check, read)), false)
})

// 24/10/2026 on a local stand (round 15): with "4 of 5 checks remain" in its check's answer, a WordPress build still
// replied to the customer after one check. 25/10/2026 (round 18): one replied with no check at all.
test('checkAgainStep: a build ending before any check, or on a failed check with checks left, is steered on; a pass or a spent budget is not', () => {
  const check = (answer) => ({ name: 'tracy_demo', args: { operation: 'check' }, answer })
  const events = (...answers) => {
    const l = timedLog(answers.map((a) => [check(a)])).session
    return Array.from({ length: l.seq }, (_, i) => l.eventAt(i))
  }
  assert.match(
    checkAgainStep(events({ ok: true, pass: false })) ?? '',
    new RegExp(`^<system-reminder>\\n[\\s\\S]*${BUILD_CHECKS - 1} of ${BUILD_CHECKS} checks remain`)
  )
  assert.match(checkAgainStep(events({ ok: true, pass: false })) ?? '', /no time, token or step budget/i)
  assert.equal(checkAgainStep(events({ ok: true, pass: false }, { ok: true, pass: true })), null)
  const five = Array.from({ length: BUILD_CHECKS }, () => ({ ok: true, pass: false }))
  assert.equal(checkAgainStep(events(...five)), null)
  assert.equal(checkAgainStep(events({ ok: false, code: 'DEMO_CHECK_BUDGET_EXHAUSTED' })), null)
  assert.match(
    checkAgainStep([]) ?? '',
    new RegExp(
      `^<system-reminder>\\nNo check has run[\\s\\S]*operation:"check"[\\s\\S]*${BUILD_CHECKS} checks remain`
    )
  )
})

// The Living Room local, build 15 turn 1 (25/10/2026): the site was held by another writer, every write and the plan
// were refused, the agent ended the turn with no check, and the build failed AGENT_DEMO_ENDED_UNCHECKED unsteered.
test('checkAgainStep: a build turn about to end with no check run is steered on', () => {
  const demo = (args, answer) => ({ name: 'tracy_demo', args, answer })
  const turn1 = [
    demo({ operation: 'read', part: 'catalogue' }, { version: 'agent-demo/1' }),
    demo({ operation: 'provision.start' }, { ok: true, state: 'provisioning' }),
    demo(
      { operation: 'provision.wait', waitSeconds: 30 },
      { ok: true, ready: false, code: 'AGENT_DEMO_OTHER_WRITER', detail: { code: 'AGENT_DEMO_OTHER_WRITER' } }
    ),
    demo(
      { operation: 'structure.read', limit: 50 },
      { ok: false, httpStatus: 409, code: 'AGENT_DEMO_INVENTORY_REQUIRED' }
    ),
    {
      name: 'tracy_site',
      args: { action: 'content.contract', params: { operation: 'apply' } },
      answer: { ok: false, code: 'AGENT_DEMO_NOT_READY' }
    },
    demo({ operation: 'check' }, { ok: false, httpStatus: 409, code: 'AGENT_DEMO_PLAN_REQUIRED' }),
    demo({ operation: 'plan.save', plan: {} }, { ok: false, httpStatus: 409, code: 'AGENT_DEMO_NOT_READY' })
  ]
  const l = timedLog(turn1.map((c) => [c])).session
  const events = Array.from({ length: l.seq }, (_, i) => l.eventAt(i))
  const text = checkAgainStep(events) ?? ''
  assert.match(text, /^<system-reminder>\n[\s\S]*No check has run/)
  assert.match(text, /tracy_demo \{operation:"check"\}/)
})

test('loopNotices: a planned build has five times the room of a single change, then the same notices', () => {
  const plugins = (log, build) => loopNotices(log, { build }).map((n) => n.plugin)
  assert.ok(plugins(turnLog(exploring(45)), false).includes(TURN_LENGTH_PLUGIN))
  assert.ok(plugins(turnLog(exploring(45)), false).includes(STEP_BUDGET_PLUGIN))
  assert.deepEqual(plugins(turnLog(exploring(45)), true), [])
  assert.deepEqual(plugins(turnLog(repairing(150)), true), [])
  assert.ok(plugins(turnLog(repairing(205)), true).includes(TURN_LENGTH_PLUGIN))
  assert.ok(plugins(turnLog(exploring(55)), true).includes(STEP_BUDGET_PLUGIN))
})

// 24/10/2026, ja-fresco on WordPress (7 pages): ~40 steps reading the structure left no room for the final check's
// repairs. A build's room grows with what it must read (inventory records) and write (plan rows), up to a cap.
test('loopNotices: a build has more room the bigger its template, up to a cap', () => {
  const plugins = (log, build) => loopNotices(log, { build }).map((n) => n.plugin)
  const small = { records: 40, rows: 10 },
    fresco = { records: 300, rows: 60 },
    huge = { records: 7800, rows: 400 }
  assert.ok(
    plugins(turnLog(exploring(55)), small).includes(STEP_BUDGET_PLUGIN),
    'a small template keeps five times'
  )
  assert.deepEqual(plugins(turnLog(exploring(55)), fresco), [])
  assert.deepEqual(plugins(turnLog(repairing(250)), fresco), [])
  assert.ok(plugins(turnLog(exploring(75)), fresco).includes(STEP_BUDGET_PLUGIN))
  assert.deepEqual(plugins(turnLog(exploring(115)), huge), [])
  assert.ok(plugins(turnLog(exploring(125)), huge).includes(STEP_BUDGET_PLUGIN), 'capped')
  assert.ok(plugins(turnLog(repairing(485)), huge).includes(TURN_LENGTH_PLUGIN), 'capped')
})

test('buildSizeOf: the records and plan rows a tracy_demo answer names, null when it names neither', () => {
  assert.deepEqual(buildSizeOf({ structureHash: 'h', total: 320, offset: 0, items: [] }), { records: 320 })
  assert.deepEqual(
    buildSizeOf({ structure: { inventory: { recordsTotal: 320 } }, plan: { rows: [{}, {}, {}] } }),
    { records: 320, rows: 3 }
  )
  assert.deepEqual(buildSizeOf({ structure: { inventory: { recordsTotal: 320 } }, plan: null }), {
    records: 320
  })
  assert.deepEqual(buildSizeOf({ ok: true, planHash: 'p', researchHash: 'r', rows: 61 }), { rows: 61 })
  assert.equal(buildSizeOf({ ok: false, code: 'AGENT_DEMO_INVENTORY_REQUIRED' }), null)
  assert.equal(
    buildSizeOf({ hash: 'h', part: 'catalogue', total: 9 }),
    null,
    'a research page is not the template'
  )
  assert.equal(buildSizeOf(null), null)
})

{
  const sentOne = [{ plugin: TURN_LENGTH_PLUGIN }]
  const after = (steps) => turnLog([...repairing(40), sentOne, ...repairing(steps)])
  const rows = [
    ['39 steps', turnLength(turnLog(repairing(39))), null],
    ['40 steps', turnLength(turnLog(repairing(40))), { steps: 40, sent: 0 }],
    ['60 steps', turnLength(turnLog(repairing(60))), { steps: 60, sent: 0 }],
    ['an earlier turn does not count', turnLength(turnLog(repairing(40), repairing(5))), null],
    ['a second notice must not fire straight after the first', turnLength(after(20)), null]
  ]
  for (const [label, got, expected] of rows)
    test(`turnLength: 40 steps are due even when writes keep resetting stepBudget; only this turn counts; one ignored nudge doubles the bar: ${label}`, () => {
      assert.deepEqual(got, expected, label)
    })
}

test('turnLengthNotice: names the repair loop and never reads as "stop exploring"; escalation ends in a report', () => {
  const first = turnLengthNotice(40)

  assertText(
    first,
    {
      has: [/This turn has taken 40 steps/, /fixing something you yourself wrote|reconsider the approach/],
      hasNot: [/without changing the site/]
    },
    'level 0'
  )
  assert.match(turnLengthNotice(80, 1), /Do not start another attempt/)
  assert.match(turnLengthNotice(120, 2), /Stop now and report/)
})

// ── parallel scheduling ──────────────────────────────────────────────────────────────────────────────

{
  const reads = [
    'info',
    'content.list',
    'content.get',
    'extension.list',
    'plugin.list',
    'theme.list',
    'db.tables',
    'core.manifest',
    'apply.list',
    'content.find',
    'media.scan'
  ]
  const contended = ['page.text', 'page.look', 'db.dump'] // two browsers in one site container, an artifact written
  const unknown = [
    { action: 'content.drop' },
    { action: '' },
    { action: '   ' },
    { action: 42 },
    {},
    null,
    undefined,
    'content.list'
  ]
  const contract = [
    { action: 'content.contract' },
    { action: 'content.contract', params: { operation: 'inspect', page: 'home', slots: 'text' } },
    { action: 'content.contract', operation: 'inspect' },
    { action: 'contract.inspect' },
    { action: 'content.contract.inspect' },
    { action: 'content_contract', params: { operation: 'inspect' } },
    '{"action":"content.contract","params":{"operation":"inspect"}}',
    { action: 'content.contract', params: { operation: 'multilingual.plan' } }
  ]
  const rows = [
    ...reads.map((action) => [{ action }, true]),
    [{ action: '  content.list  ' }, true],
    ...contended.map((action) => [{ action }, false]),
    ...unknown.map((args) => [args, false]),
    ...contract.map((args) => [args, false])
  ]
  for (const [args, expected] of rows)
    test(`actionRunsInParallel: only door reads with no local contention overlap; anything unknown or contract-shaped is exclusive: ${rowName(args)}`, () => {
      assert.equal(actionRunsInParallel(args), expected, JSON.stringify(args))
    })
}

test('actionRunsInParallel: no write and no preparation is ever scheduled in parallel', () => {
  const notReads = Object.entries(ACTION_CLASSES).filter(([, kind]) => kind !== 'read')

  assert.ok(notReads.length > 0)
  for (const [action, kind] of notReads)
    assert.equal(actionRunsInParallel({ action }), false, `${action} (${kind})`)
})

// ── what counts as a change ──────────────────────────────────────────────────────────────────────────

test('changesSite reads the call as the relay sends it: aliases, hoisted keys, contract operations, EmDash shape repairs', () => {
  assert.equal(contractOperationWrites(' apply'), true)
})

{
  const s = (args) => ({ name: 'tracy_site', arguments: JSON.stringify(args) })
  const e = (args) => ({
    name: 'tracy_emdash',
    arguments: typeof args === 'string' ? args : JSON.stringify(args)
  })
  const contract = (operation) => s({ action: 'content.contract', params: { operation } })
  const entry = { collection: 'site', id: '01M36TA5254KTX8AKZQMK4BZD0', data: { hotline: '0909 123 456' } }
  const rows = [
    // tracy_site: writes in every spelling, and reads
    [s({ action: 'contract.apply', params: { changes: { a: 'b' } } }), true],
    [s({ action: 'content_contract', operation: 'apply' }), true],
    [s({ action: 'content.replace', params: { find: 'a', replace: 'b' } }), true],
    [s({ action: 'content.update', params: {} }), true],
    [s({ action: 'constructor' }), true],
    [s({ action: 'content.contract', params: { changes: { a: 'b' } } }), false],
    [s({ action: 'contract.inspect' }), false],
    [s({ action: 'content.replace', params: { dryRun: true } }), false],
    [s({ action: 'content.replace', dryRun: true }), false],
    [{ name: 'tracy_site', arguments: 'not json' }, false],
    // the contract door's own operations, as the component runs them
    ...[
      'inspect',
      'multilingual.plan',
      'multilingual.verify',
      'demoTrim.plan',
      'siteLanguage.plan',
      'sourceLanguage.plan',
      ' inspect ',
      'demoTrim.plan '
    ].map((op) => [contract(op), false]),
    ...[
      'apply',
      'bind',
      'multilingual.package',
      'multilingual.apply',
      'multilingual.revert',
      'demoTrim.apply',
      'demoTrim.revert',
      'siteLanguage.set',
      'siteLanguage.revert',
      'sourceLanguage.set',
      'sourceLanguage.revert'
    ].map((op) => [contract(op), true]),
    [s({ action: 'content.contract', params: {} }), false],
    [
      { name: 'tracy_site', arguments: { action: 'content.contract', operation: 'siteLanguage.plan' } },
      false
    ],
    // EmDash: judged by the tool, through the door's own shape repair
    [{ name: 'tracy_emdash', arguments: { tool: 'content_update' } }, true],
    [{ name: 'tracy_emdash', arguments: { tool: 'content_get' } }, false],
    [{ name: 'tracy_emdash', arguments: { list: true, tool: 'content_update' } }, false],
    [e({ arguments: { tool: 'content_update', arguments: entry } }), true],
    [e({ tool: 'content.get', arguments: { collection: 'site', id: 'x' } }), false],
    [e({ tool: 'content-get', arguments: { collection: 'site', id: 'x' } }), false],
    [e({ tool: 'content.update', arguments: entry }), true],
    [e({ tool: 'content_update', args: entry }), true],
    [e({ tool: 'content_update', ...entry }), true],
    [e({ tool: 'menu_get', name: 'main' }), false],
    [e({ tool: 'page.text', arguments: { path: '/' } }), false],
    [e({ tool: 'page_text', arguments: { path: '/' } }), false],
    [e({ tool: 'apply.list' }), false],
    [e({ arguments: entry }), false],
    [e('not json'), false]
  ]
  for (const [call, expected] of rows)
    test(`changesSite reads the call as the relay sends it: aliases, hoisted keys, contract operations, EmDash shape repairs: ${rowName(call)}`, () => {
      assert.equal(changesSite(call), expected, JSON.stringify(call))
    })
}

{
  const result = (text, isError = false, extra = {}) => ({
    turn: 1,
    step: 1,
    message: toolMessage('call_00_x', text, isError),
    ...extra
  })
  const rows = [
    [
      result(
        '{"ok":false,"error":"write_failed","message":"no writable field for kind post","next":"This site answered no."}'
      ),
      false
    ],
    [result('{"ok":true,"ids":[441]}'), true],
    [result('{"ok":true,"ids":[441],"result":{"ok":false}}'), true],
    [result('{"ok":false,"error":"bad_params","message":"… (cut here'), false],
    [result('{"ok":true}', true), false],
    [result('tool threw', true, { error: { name: 'Error', code: 'TOOL_FAILED', reason: 'x' } }), false],
    [{ error: 'tool threw' }, false],
    [undefined, true],
    [{ message: { content: 'not an array' } }, true]
  ]
  for (const [input, expected] of rows)
    test(`resultWentThrough: the one reading of "did the call go through", on the V4 tool-role message: ${rowName(input)}`, () => {
      assert.equal(resultWentThrough(input), expected, JSON.stringify(input)?.slice(0, 80))
    })
}

test('V4: every notice source this plugin writes is admitted, old notices read back after migration, and none is another producer’s', () => {
  // test-quality: contract notices are kept in the conversation log under this kind; one renamed reads none of the old ones
  assert.equal(SITE_NOTICE_KIND, 'tracy-site')
  assert.equal(v4AdmitsSource({ kind: 'plugin', plugin: SITE_CONTEXT_PLUGIN }), false)
})

{
  for (const source of [{ kind: 'plugin', plugin: SITE_CONTEXT_PLUGIN }, { kind: 'user' }, undefined])
    test(`V4: every notice source this plugin writes is admitted, old notices read back after migration, and none is another producer’s: ${rowName(source)}`, () => {
      assert.equal(isNoticeFrom(source, SITE_CONTEXT_PLUGIN), false)
    })
}

{
  const producers = [
    SITE_CONTEXT_PLUGIN,
    SITE_STATE_PLUGIN,
    STEP_BUDGET_PLUGIN,
    TURN_LENGTH_PLUGIN,
    REFUSAL_STREAK_PLUGIN
  ]
  for (const producer of producers)
    test(`V4: every notice source this plugin writes is admitted, old notices read back after migration, and none is another producer’s: ${rowName(producer)}`, () => {
      const source = noticeSource(producer, 'one line')

      assert.deepEqual(source, { kind: SITE_NOTICE_KIND, producer, form: 'notice', summary: 'one line' })
      assert.equal(v4AdmitsSource(source), true, producer)
      assert.equal(isNoticeFrom(source, producer), true)
      assert.equal(isNoticeFrom(migratedNotice(producer, 'x'), producer), true)
      for (const other of producers.filter((p) => p !== producer)) {
        assert.equal(isNoticeFrom(source, other), false, `${producer} is not ${other}`)
        assert.equal(isNoticeFrom(migratedNotice(producer), other), false)
      }
    })
}

test('lastToday finds the latest visible today notice, tells it from the others, and forgets one compacted away', () => {
  const events = [
    {
      seq: 0,
      type: 'user/message',
      data: { source: notice4(SITE_STATE_PLUGIN), content: [{ type: 'text', text: 'state' }] }
    },
    {
      seq: 1,
      type: 'user/message',
      data: { source: notice4(TODAY_PLUGIN), content: [{ type: 'text', text: 'monday' }] }
    },
    {
      seq: 2,
      type: 'user/message',
      data: { source: notice4(TODAY_PLUGIN), content: [{ type: 'text', text: 'tuesday' }] }
    }
  ]
  const agent = (nodes) => ({
    session: { seq: events.length, eventAt: (seq) => events[seq], surface: { nodes } }
  })

  assert.equal(lastToday(agent([0, 1, 2])), 'tuesday', 'the latest one')
  assert.equal(lastSiteState(agent([0, 1, 2])), 'state', 'the build’s state is another notice')
  assert.equal(lastToday(agent([0, 1])), null, 'the latest is compacted out of sight: say it again')
  assert.equal(lastToday(undefined), null)
  assert.notEqual(TODAY_PLUGIN, SITE_STATE_PLUGIN)
  assert.ok(isNoticeFrom(notice4(TODAY_PLUGIN), TODAY_PLUGIN))
  assert.equal(v4AdmitsSource(noticeSource(TODAY_PLUGIN, 'today 2026-09-30')), true)
})

test('lastSiteContext reads a context injected under dsh 0.1.6 and migrated, so no second copy is sent after the upgrade', () => {
  const events = [
    {
      seq: 0,
      type: 'user/message',
      data: { source: migratedNotice(SITE_CONTEXT_PLUGIN), content: [{ type: 'text', text: 'old ctx' }] }
    }
  ]

  assert.equal(
    lastSiteContext({ session: { seq: 1, eventAt: (seq) => events[seq], surface: { nodes: [0] } } }),
    'old ctx'
  )
})

// ── refusal streak (E4.2) and the pre-step ───────────────────────────────────────────────────────────

/** wp C13 (r2): `content.get` of post ids 1…24, 19 in a row answered not_found. */
const probe = (id) => ({
  name: 'tracy_site',
  args: { action: 'content.get', params: { kind: 'post', id } },
  answer: {
    ok: false,
    error: 'not_found',
    message: `no post ${id}`,
    next: 'content.list {kind:"post", post_type:"page"} lists the pages with their real slugs and ids.'
  }
})
const goodRead = (id) => ({
  name: 'tracy_site',
  args: { action: 'content.get', params: { kind: 'post', id } }
})

test('refusalStreak: a streak of 19 not_found is told at 3 and at 6, then never again', () => {
  const steps = []
  const told = []
  for (let id = 1; id <= 19; id += 1) {
    steps.push([probe(id)])
    const streak = refusalStreak(timedLog(steps))
    if (streak === null) continue
    told.push(streak.count)
    steps.push([{ notice: REFUSAL_STREAK_PLUGIN, summary: refusalStreakSummary(streak) }])
  }

  assert.deepEqual(told, [3, 6])
})

test('refusalStreak: accepted calls, another verb or a success in between end the run; calls, not steps, are counted', () => {
  assert.equal(
    refusalStreak(timedLog([[probe(1), probe(2), probe(3)]]))?.count,
    3,
    'three refused calls in one step are a streak'
  )
})

{
  const otherVerb = {
    name: 'tracy_site',
    args: { action: 'content.list', params: { kind: 'x' } },
    answer: { ok: false, error: 'bad_params' }
  }
  const rows = [
    ['eight accepted reads are work', timedLog(Array.from({ length: 8 }, (_, i) => [goodRead(i + 1)])), null],
    ['a success in between', timedLog([[probe(1)], [probe(2)], [goodRead(3)], [probe(4)], [probe(5)]]), null],
    ['another verb starts its own count', timedLog([[probe(1)], [probe(2)], [otherVerb]]), null],
    ['no session', undefined, null]
  ]
  for (const [label, log, expected] of rows)
    test(`refusalStreak: accepted calls, another verb or a success in between end the run; calls, not steps, are counted: ${label}`, () => {
      assert.equal(refusalStreak(log), expected, label)
    })
}

{
  const miss = (kind) => ({
    name: 'tracy_site',
    args: { action: 'content.get', params: { ...(kind === undefined ? {} : { kind }), id: 7 } },
    answer: { ok: false, error: 'not_found', message: 'no such record' }
  })
  const callFor = (kind, preset) => {
    const log = timedLog([[miss(kind)], [miss(kind)], [miss(kind)]])
    return (
      refusalStreak({ session: { ...log.session, header: preset === null ? {} : { agentPreset: preset } } })
        ?.call ?? null
    )
  }
  const listed = (kind) => `content.list {kind:"${kind}"} lists the ids that exist.`
  const rows = [
    ['page', 'designer-wordpress', 'content.list {kind:"post", post_type:"page"} lists the ids that exist.'],
    ['page', null, 'content.list {kind:"post", post_type:"page"} lists the ids that exist.'],
    ['post', 'writer-wordpress', listed('post')],
    [undefined, 'designer-wordpress', listed('post')],
    ['article', 'designer-joomla', listed('article')],
    ['menuItem', null, listed('menuItem')],
    [undefined, 'designer-joomla', listed('article')],
    ['category', 'designer-joomla', listed('category')],
    // no listing answers these: no call rather than one the site refuses
    ['templatePart', 'designer-wordpress', null],
    ['option', 'designer-wordpress', null],
    ['category', 'designer-wordpress', null],
    ['category', null, null],
    [undefined, null, null],
    ['page', 'designer-joomla', null],
    ['article', 'designer-wordpress', null],
    ['post', 'designer-emdash', null]
  ]
  for (const [kind, preset, expected] of rows)
    test(`refusalStreak: the call it names is one the site takes — never the model’s kind copied into it: ${rowName(kind)}`, () => {
      assert.equal(callFor(kind, preset), expected, `${String(kind)} on ${preset}`)
    })
}

test('refusalStreak: it names the one call for each measured shape and reads dsh tools and tracy_emdash by their verb', () => {
  const kinds = {
    name: 'tracy_site',
    args: { action: 'content.list', params: { kind: 'page' } },
    answer: {
      ok: false,
      error: 'bad_params',
      message: 'kind must be one of: post, templatePart, option, postmeta, term'
    }
  }
  const apply = {
    name: 'tracy_site',
    args: { action: 'content.contract', params: { operation: 'apply', changes: {} } },
    answer: {
      ok: false,
      error: 'contract_failed',
      message: 'Unknown content slot or non-string value: module-442.16'
    }
  }
  const edit = {
    name: 'edit',
    args: { path: 'docs/agents/x.md' },
    error: 'old_string was not found in the file'
  }
  const three = (call) => refusalStreak(timedLog([[call], [call], [call]]))

  assert.match(String(three(kinds)?.call), /kind one of: post, templatePart, option, postmeta, term/)
  assert.match(String(three(apply)?.call), /operation:"inspect", match:/)
  assert.deepEqual([three(edit)?.verb, three(edit)?.code, three(edit)?.next], ['edit', 'TOOL_FAILED', null])
  assert.equal(
    callVerb({ name: 'tracy_emdash', arguments: JSON.stringify({ tool: 'content_get', arguments: {} }) }),
    'tracy_emdash content_get'
  )
  assert.equal(
    callVerb({ name: 'tracy_site', arguments: JSON.stringify({ action: 'contract.inspect' }) }),
    'tracy_site content.contract'
  )
})

test('refusalStreakNotice: names the verb and the last refusal, ends the code before the call, cuts the quoted next at 200, stops at level 1', () => {
  const first = refusalStreak(timedLog([[probe(1)], [probe(2)], [probe(3)]]))
  const bare = refusalStreak(timedLog([[getMiss('post')], [getMiss('post')], [getMiss('post')]]))
  const long = 'Word '.repeat(120).trim()
  const bound = {
    name: 'tracy_site',
    args: { action: 'content.update', params: { kind: 'article', id: 4, fields: { title: 'x' } } },
    answer: { ok: false, error: LEGACY_STRUCTURE_CODE, message: 'bound', next: long }
  }
  const streak = refusalStreak(timedLog([[bound], [bound], [bound]]))

  const text = refusalStreakNotice(first)
  const quoted =
    new RegExp(`the last one: ${LEGACY_STRUCTURE_CODE} — (.*?)(?: Do not probe| You were)`, 's').exec(
      refusalStreakNotice(streak)
    )?.[1] ?? ''

  assert.deepEqual(
    { verb: first.verb, count: first.count, sent: first.sent, code: first.code },
    { verb: 'tracy_site content.get', count: 3, sent: 0, code: 'not_found' }
  )
  assertText(
    text,
    {
      has: [
        /3 calls of tracy_site content\.get in a row were refused; the last one: not_found/,
        /content\.list \{kind:"post"\} lists the ids that exist\./,
        /Do not probe further/
      ]
    },
    'first notice'
  )
  assert.ok(text.length < 600)
  assert.match(refusalStreakNotice({ ...first, count: 6, sent: 1 }), /Stop calling tracy_site content\.get/)
  assert.equal(refusalStreakSummary(first), 'refusal streak 1: tracy_site content.get')
  assert.match(
    refusalStreakNotice(bare),
    /the last one: not_found\. content\.list/,
    'the code ends its sentence before the call'
  )
  assert.ok(quoted.length <= 201 && /…\.?$/.test(quoted), quoted.slice(-20))
})
/** A refused get with no `next`, for the notice's bare shape. */
function getMiss(kind) {
  return {
    name: 'tracy_site',
    args: { action: 'content.get', params: { kind, id: 7 } },
    answer: { ok: false, error: 'not_found', message: 'no such record' }
  }
}

test('loopNotices: a budget due on time alone reaches the notice with its seconds; the streak goes last; the agent’s tools shape the text', () => {
  const slow = timedLog([[inspectFor(54_000)], [inspectFor(54_000)], [inspectFor(54_000)]])
  const counted = timedLog(Array.from({ length: 10 }, () => [goodRead(1)]))
  const probing = timedLog([
    [inspectFor(54_000)],
    [inspectFor(54_000)],
    [inspectFor(54_000)],
    [probe(1)],
    [probe(2)],
    [probe(3)]
  ])

  const timeNotices = loopNotices(slow)

  assert.deepEqual(
    timeNotices.map((n) => [n.plugin, n.summary]),
    [[STEP_BUDGET_PLUGIN, 'step budget 1']]
  )
  assert.equal(timeNotices[0].text, stepBudgetNotice(3, false, 0, 162))
  assert.equal(
    loopNotices(counted)[0]?.text,
    stepBudgetNotice(10, false, 0),
    'due on steps says what it said before'
  )
  assert.deepEqual(
    loopNotices(probing).map((n) => n.plugin),
    [STEP_BUDGET_PLUGIN, REFUSAL_STREAK_PLUGIN]
  )
  assert.equal(loopNotices(probing).at(-1)?.summary, 'refusal streak 1: tracy_site content.get')
  assert.deepEqual(loopNotices(timedLog([[goodRead(1)]])), [])
  assert.deepEqual(loopNotices(undefined), [])
  assert.equal(
    loopNotices(counted, { tools: NO_SHELL })[0]?.text,
    stepBudgetNotice(10, false, 0, undefined, { todo: false })
  )
  assert.equal(loopNotices(counted, { tools: WITH_SHELL })[0]?.text, stepBudgetNotice(10, false, 0))
})

test('WP_SEO_META: the Claude Cowork plugin’s own search title and description keys, word for word (fixture from SeoFields.php)', () => {
  const fixture = JSON.parse(
    readFileSync(fileURLToPath(new URL('./fixtures/wp-seo-meta.json', import.meta.url)), 'utf8')
  )
  assert.deepEqual(
    { ...WP_SEO_META },
    { title: fixture.title, description: fixture.description, since: fixture.since }
  )
  // The SEO plugins SeoFields stands aside for, with the keys it writes for them (null: it writes none).
  assert.deepEqual(
    WP_SEO_PLUGINS.map((row) => ({ ...row, folders: [...row.folders] })),
    fixture.plugins
  )
})

// 20/10/2026, staff editing real customer sites: "when Tracy fixes one place it often breaks another place".
// The rules said how SMALL a change is, never how FAR it reaches; three lines pushed wide (`all:true` for the
// same words in many places, a builder's AGENTS.md outranking the platform advice, the token-first Designer).
for (const platform of EVERY_PLATFORM)
  test(`scope: every session hears "only what was asked, where it was asked", and all:true only when asked: ${rowName(platform)}`, async () => {
    const text = await textOf(`scope-${platform}`, platform, {})
    const scope = text.split('\n').filter((one) => one.startsWith('SCOPE: '))
    assert.equal(scope.length, 1, 'one SCOPE line')
    assertText(
      scope[0],
      {
        has: [
          /change only what was asked, where it was asked/,
          /header, footer, menu, a shared block, module or pattern, a token or shared class, a site setting/,
          /say where else/,
          /unless the customer asked for every place, change this place only/
        ]
      },
      'scope'
    )
    // Ahead of both sizes, so ONE JOB and SEVERAL JOBS are read under it.
    assert.ok(text.indexOf('SCOPE: ') < text.indexOf('ONE JOB: '))
    assert.doesNotMatch(text, /Same words in many places/)
    assert.match(text, /Words everywhere, only when asked \("the hotline everywhere"\)/)
  })

for (const platform of EVERY_PLATFORM)
  test(`scope: the Designer and the Developer hear that the builder's notes do not say how far a change reaches: ${rowName(platform)}`, async () => {
    for (const [role, start] of [
      ['designer', '- Designer:'],
      ['developer', '- Developer:'],
      ['writer', '- Writer:']
    ]) {
      const text = await bareText(`scope-role-${role}-${platform}`, platform, `${role}-${platform}`)
      const lines = text.split('\n').filter((one) => one.startsWith(start))
      assert.equal(lines.length, 1, `${role}-${platform}`)
      assert.match(lines[0], /tells how the site was BUILT, not what you were asked or how far it may reach/)
      assert.ok(lines[0].length <= 260, `${role}: ${lines[0].length}`)
    }
    for (const other of ['seo-geo'])
      assert.doesNotMatch(
        await bareText(`scope-role-${other}-${platform}`, platform, `${other}-${platform}`),
        /^- (Designer|Developer):/m
      )
  })

// ── Questions about Tracy itself go to the guide first (21/10/2026) ──────────────────────────────────────
// A customer who could not connect their domain asked the agent in the chat; it had no word of Tracy as a
// product and searched the web. The rule names the tool, says web_search is for what is not Tracy, and bans
// describing a Tracy screen from memory — on every platform, so the first question is never the unlucky one.
for (const [label, platform, options] of [
  ['joomla', 'joomla', { facts: { template: 'x' } }],
  ['wordpress', 'wordpress', { facts: { theme: 'x', themeKind: 'block' } }],
  ['emdash', 'emdash', {}]
])
  test(`guide: the site context sends Tracy questions to tracy_guide first: ${label}`, async () => {
    const text = await textOf(`guide-${label}`, platform, options)

    assert.ok(text.includes(GUIDE_RULE), 'the rule is in the context as written')
    for (const phrase of ['tracy_guide FIRST', 'web_search is only for what is not Tracy', 'from memory'])
      assert.ok(GUIDE_RULE.includes(phrase), phrase)
    assert.ok(
      text.indexOf(GUIDE_RULE) < text.indexOf('STAY INSIDE WHAT WAS ASKED'),
      'it sits before the closing rule'
    )
  })

// 30/10/2026 (#189): an owner's later edit keeps what the build made. The rule names the check tool and the skill, on
// every platform, before the closing rule.
for (const [label, platform, options] of [
  ['joomla', 'joomla', { facts: { template: 'x' } }],
  ['wordpress', 'wordpress', { facts: { theme: 'x', themeKind: 'block' } }],
  ['emdash', 'emdash', {}]
])
  test(`build rules: the site context sends a changed page to tracy_build_check: ${label}`, async () => {
    const text = await textOf(`build-rules-${label}`, platform, options)
    assert.ok(text.includes(BUILD_RULES_RULE), 'the rule is in the context as written')
    for (const phrase of ['tracy_build_check', 'site-build-rules skill', 'shape of its siblings'])
      assert.ok(BUILD_RULES_RULE.includes(phrase), phrase)
    assert.ok(
      text.indexOf(BUILD_RULES_RULE) < text.indexOf('STAY INSIDE WHAT WAS ASKED'),
      'it sits before the closing rule'
    )
  })

test('refusalStreak: a draft refused with a different list of issues each time is being corrected, not probed; the same list again is (The Living Room local, build 9, 25/10/2026)', () => {
  // Measured: plan.save refused six times in a row with 5, 6, 4, 3, 1 and 51 issues; the notices at 3 and 6 told the
  // agent to stop calling tracy_demo and it ended the build with no plan saved.
  const save = (...fields) => ({
    name: 'tracy_demo',
    args: { operation: 'plan.save', plan: { rows: fields } },
    answer: {
      ok: false,
      code: 'AGENT_DEMO_PLAN_INVALID',
      detail: {
        issues: fields.map((field) => ({ code: 'AGENT_DEMO_PLAN_FIELD_INVALID', field, reason: 'x' }))
      }
    }
  })
  const corrected = [
    [save('target', 'coverage.posts', 'coverage.leads')],
    [save('lead.text', 'coverage.posts')],
    [save('lead', 'coverage.posts')],
    [save('coverage.posts')],
    [save('post.claims[0].text', 'post.topic')],
    [save('post.claims[1].text')]
  ]
  assert.equal(refusalStreak(timedLog(corrected)), null)
  const same = [[save('coverage.posts')], [save('coverage.posts')], [save('coverage.posts')]]
  assert.equal(refusalStreak(timedLog(same))?.count, 3)
  assert.equal(refusalStreak(timedLog([...corrected, ...same]))?.count, 3)
})

test('planIssuesNext: a plan refused with its own issues is told to fix those rows and save again in this turn, never to ask (The Living Room local, build 10, 25/10/2026)', () => {
  // Measured: refused once with 8 issues of its review posts, the agent stopped to ask the customer "Want me to
  // carry on that way?"; nobody answers in a demo build, and the build failed AGENT_DEMO_ENDED_UNCHECKED.
  const refused = (code, extra = {}) => ({
    ok: false,
    code,
    detail: { issues: [{ path: 'rows[119].post.body', message: 'x' }] },
    ...extra
  })
  for (const code of ['AGENT_DEMO_PLAN_INVALID', 'AGENT_DEMO_TARGET_UNRESOLVED'])
    assert.match(
      planIssuesNext(refused(code)),
      /1 issue of this draft[\s\S]*fix[\s\S]*plan\.save again[\s\S]*Do not reply to the customer[\s\S]*nobody answers/
    )
  assert.match(
    planIssuesNext({ ...refused('AGENT_DEMO_PLAN_INVALID'), detail: { issues: [{}, {}] } }),
    /2 issues/
  )
  assert.equal(planIssuesNext(refused('AGENT_DEMO_PLAN_INVALID', { next: 'own' })), null)
  assert.equal(planIssuesNext({ ok: false, code: 'AGENT_DEMO_PLAN_INVALID', detail: { issues: [] } }), null)
  assert.equal(planIssuesNext({ ok: false, code: 'AGENT_DEMO_PLAN_FROZEN' }), null)
  assert.equal(planIssuesNext({ ok: true }), null)
})

test('checkAnswerForAgent: a failed check leads with its next and shows each list at most 12 long, the rest counted (The Living Room local, build 11, 25/10/2026)', () => {
  // Measured: a check over every route answered 163 KB; the tool cut it at 50 KB, its next came last, and the agent
  // ended the turn "extremely deep into this turn" with four checks left.
  const many = (n) => Array.from({ length: n }, (_, i) => ({ page: `/p${i}` }))
  const answer = {
    ok: true,
    checkId: 'c1',
    pass: false,
    checks: [
      { id: 'no-demo-words', pass: false, measured: '67 left', detail: many(67) },
      { id: 'no-demo-pictures', pass: false, detail: many(2), unresolved: many(15) },
      { id: 'posts-written', pass: true, unpictured: many(22), detail: [] }
    ],
    next: 'This check failed and 4 of 5 checks remain'
  }
  const shown = checkAnswerForAgent(answer)
  assert.equal(Object.keys(shown)[0], 'next')
  assert.equal(shown.next, answer.next)
  assert.equal(shown.pass, false)
  assert.equal(shown.checkId, 'c1')
  assert.equal(shown.checks[0].detail.length, 12)
  assert.equal(shown.checks[0].detailLeft, 55)
  assert.equal(shown.checks[0].measured, '67 left')
  assert.equal(shown.checks[1].detail.length, 2)
  assert.equal(shown.checks[1].detailLeft, undefined)
  assert.equal(shown.checks[1].unresolved.length, 12)
  assert.equal(shown.checks[1].unresolvedLeft, 3)
  assert.equal(shown.checks[2].unpictured.length, 12)
  assert.equal(answer.checks[0].detail.length, 67, 'the answer itself is left whole')
  assert.equal(checkAnswerForAgent({ ok: false, code: 'X' }).code, 'X')
  const passed = { ok: true, pass: true, checks: [{ id: 'a', pass: true, detail: many(30) }] }
  assert.equal(checkAnswerForAgent(passed), passed)
})

// Round 10 (25/10/2026): the same cut as the check's (dsh keeps a long answer's head, a gap, its tail and a notice)
// reaches every other reader of a tool result. Each reads the answer's own head, never a value nested below it.
test('a cut tool result is read by its head: went through, outcome unknown and the refusal code', () => {
  const cut = (a) =>
    `${JSON.stringify(a).slice(0, 160)}\n\n[...]\n\n${'y'.repeat(40)}\n\n(Output was 90000 bytes; the full text is saved at /tmp/s/tracy_site.txt.)`
  const message = (text) => ({ turn: 1, step: 1, message: toolMessage('call_00_x', text, false) })
  // A long accepted answer whose kept part shows a nested refusal (one place of a batch) went through.
  const accepted = {
    ok: true,
    code: 'DONE',
    results: [{ ok: false, why: 'x' }, ...Array(400).fill({ ok: true })]
  }
  assert.ok(cut(accepted).includes('"ok":false'), 'the nested refusal is in the kept head')
  assert.equal(resultWentThrough(message(cut(accepted))), true)
  // A long refusal that wrote some places may have changed the site.
  const partial = {
    ok: false,
    code: 'PARTIAL',
    partial: true,
    written: Array(400).fill('post 12 post_content')
  }
  assert.equal(resultOutcomeUnknown(message(cut(partial))), true)
  // A long refusal is still named by its own code and next.
  const refused = (id) => ({
    name: 'tracy_site',
    args: { action: 'content.get', params: { kind: 'post', id } },
    text: cut({
      ok: false,
      code: 'not_found',
      next: 'content.list {kind:"post"} lists them.',
      detail: { tried: Array(400).fill(id) }
    })
  })
  const streak = refusalStreak(timedLog([[refused(1)], [refused(2)], [refused(3)]]))
  assert.equal(streak?.code, 'not_found')
  assert.equal(streak?.next, 'content.list {kind:"post"} lists them.')
})
