// Site changes V2's Source classifier (`src/sites/activity-source.js`) and its description/effects
// (`src/sites/activity-describe.js`): the JS half on its own, then the SAME rows through the
// Postgres CASE — both halves must give every row the same Source (contract §1), the migrations
// 048/049 must apply to a database that already holds V1 rows, and the CMS log fixtures of
// tracy-host must classify as decided: WordPress cron under the hook's contract is automatic (D1),
// and a CMS row under an authenticated CMS identity is cms-admin (Brian 02/10).
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { mapCmsLog } from '../../tracy-host/src/cms-log.js'
import { migrate } from '../src/db/index.js'
import { readActivity } from '../src/sites/activity.js'
import {
  cmsGroup,
  describeCms,
  describeDeploy,
  tracyOwned,
  describeEffects,
  effectsOf,
  requestStateOf,
  singularType,
  writeGroup
} from '../src/sites/activity-describe.js'
import {
  hasCmsIdentity,
  classifyCmsChange,
  classifyGitRow,
  classifyOutside,
  classifyTurn,
  classifyWrites,
  restoreOf,
  SOURCES,
  V2_SOURCES_SQL,
  writeGroupSql,
  WP_CRON_PRODUCERS
} from '../src/sites/activity-source.js'
import { readActivityV2 } from '../src/sites/activity-v2.js'
import { pullCmsLog, readCmsLog } from '../src/sites/cms-log.js'
import { inferRequestState, openTurn, requestStateFor, titleWithin } from '../src/sites/turns.js'
import { fileDb, scratchPool } from './_db.mjs'

/** A Cowork self-update seal as dev recorded it (tracywalk-1792671498, 22/10/2026), trimmed. */
const COWORK_SEAL_JOOMLA = [
  'administrator/components/com_claudecowork/claudecowork.xml',
  'administrator/components/com_claudecowork/legacy/LegacyDoor.php',
  'administrator/language/en-GB/com_claudecowork.sys.ini',
  'administrator/manifests/packages/claudecowork/script.php',
  'administrator/manifests/packages/pkg_claudecowork.xml',
  'components/com_claudecowork/controllers/api.php',
  'media/plg_system_claudecoworkapi/js/door.js',
  'plugins/system/claudecoworkapi/claudecoworkapi.php',
  'plugins/system/claudecoworkapi/claudecoworkapi.xml'
]
const COWORK_SEAL_WORDPRESS = [
  'wp-content/plugins/claude-cowork/claude-cowork.php',
  'wp-content/plugins/claude-cowork/lib/Engine.php'
]

const skip = !process.env.TEST_DATABASE_URL
const HOST_FIXTURES = fileURLToPath(new URL('../../tracy-host/test/fixtures/cms-log/', import.meta.url))
const hostFixture = (name) => JSON.parse(readFileSync(path.join(HOST_FIXTURES, name), 'utf8'))
const sha = (c) => c.repeat(40)

// ── The shared fixture: one Git row per case, and what both halves must answer ─────────────────

/** Git-only rows (`webroot-history`): what the JS classifier sees, and the Source it must give. */
const GIT_CASES = [
  {
    name: 'deploy commit (outside@, script subject, valid tag)',
    row: { by: { kind: 'outside' }, kind: 'outside', title: 'deploy v2026.10.01 updated tracy-access.php' },
    source: 'deployment'
  },
  {
    name: 'deploy title with a tag the script would refuse',
    row: { by: { kind: 'outside' }, kind: 'outside', title: 'deploy bad/tag updated x.php' },
    source: 'unknown'
  },
  {
    name: 'housekeeping commit',
    row: {
      by: { kind: 'outside' },
      kind: 'outside',
      title: 'housekeeping, internal files taken out of the history'
    },
    source: 'automatic'
  },
  {
    name: 'outside seal',
    row: { by: { kind: 'outside' }, kind: 'outside', title: 'changes made to the site outside Tracy' },
    source: 'unknown'
  },
  {
    name: 'a customer commit whose subject imitates a deploy is not outside@',
    row: {
      by: { kind: 'person', name: 'x', email: 'x@y' },
      kind: 'moment',
      title: 'deploy v1 updated a.php'
    },
    source: 'unknown'
  },
  {
    name: 'restore undo proven by fleet@ + original subject (D2)',
    row: {
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'restore: undo 1234567 (agent: old)',
      subject: 'restore: undo 1234567 (agent: old)',
      author: 'fleet@tracy.ai'
    },
    source: 'site-changes'
  },
  {
    name: 'restore reset proven by fleet@ + original subject (D2)',
    row: {
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'restore: back to 89abcde',
      subject: 'restore: back to 89abcde',
      author: 'fleet@tracy.ai'
    },
    source: 'site-changes'
  },
  {
    name: 'spoof: an agent commit "agent: restore: undo …" (title_of strips the prefix)',
    row: {
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'restore: undo 1234567 (x)',
      subject: 'agent: restore: undo 1234567 (x)',
      author: 'agent@tracy.ai'
    },
    source: 'unknown'
  },
  {
    name: 'spoof: the right subject under the agent identity',
    row: {
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'restore: undo 1234567 (x)',
      subject: 'restore: undo 1234567 (x)',
      author: 'agent@tracy.ai'
    },
    source: 'unknown'
  },
  {
    name: 'an older host that sends only the title proves no restore',
    row: { by: { kind: 'agent' }, kind: 'moment', title: 'restore: undo 1234567 (x)' },
    source: 'unknown'
  },
  {
    name: 'agent moment with no turn record',
    row: { by: { kind: 'agent' }, kind: 'moment', title: 'old' },
    source: 'unknown'
  }
]

describe('the JS classifier', () => {
  for (const c of GIT_CASES) {
    test(`git: ${c.name} → ${c.source}`, () => {
      assert.equal(classifyGitRow(c.row).source, c.source)
    })
  }

  test('a restore names its mode and target only under D2', () => {
    assert.deepEqual(restoreOf(GIT_CASES[5].row), { mode: 'undo', target: '1234567' })
    assert.deepEqual(restoreOf(GIT_CASES[6].row), { mode: 'reset', target: '89abcde' })
    assert.equal(restoreOf(GIT_CASES[7].row), null)
  })

  test('turns: panel → chat; comment with its request → comment; comment without → unknown (conflicting)', () => {
    assert.deepEqual(classifyTurn({ source: 'panel' }, false), { source: 'chat', evidence: 'confirmed' })
    assert.deepEqual(classifyTurn({ source: 'comment' }, true), { source: 'comment', evidence: 'confirmed' })
    assert.deepEqual(classifyTurn({ source: 'comment' }, false), {
      source: 'unknown',
      evidence: 'conflicting'
    })
  })

  test('writes with no turn record: chat only when every write names a chat turn or session and an actor', () => {
    const w = (o) => ({ actor: 'a@b', turn_id: null, session_id: 's1', ...o })
    assert.equal(classifyWrites([w({}), w({ turn_id: 'gone:1' })]).source, 'chat')
    assert.equal(classifyWrites([w({ actor: null })]).source, 'unknown')
    assert.equal(classifyWrites([w({ session_id: null })]).source, 'unknown')
    assert.equal(classifyWrites([w({ session_id: 'key:abc' })]).source, 'unknown', 'an API key is not chat')
  })

  test('sweep 4: Tracy setup only from the provenance the door recorded (origin setup + run id + the person)', () => {
    const w = (o) => ({
      actor: 'a@b',
      turn_id: null,
      session_id: null,
      origin: 'setup',
      origin_ref: 'run1',
      ...o
    })
    assert.deepEqual(classifyWrites([w({}), w({})]), { source: 'setup', evidence: 'confirmed' })
    // A write with no session and no recorded provenance is NOT setup: no guess from the gap.
    assert.equal(classifyWrites([w({ origin: null, origin_ref: null })]).source, 'unknown')
    assert.equal(classifyWrites([w({ origin_ref: null })]).source, 'unknown', 'no run id, no claim')
    assert.equal(classifyWrites([w({ actor: null })]).source, 'unknown', 'no initiator, no claim')
    assert.equal(
      classifyWrites([w({}), w({ origin: null })]).source,
      'unknown',
      'a mixed group claims nothing'
    )
  })

  test('sweep 2: an API key write is API only when the door recorded it as the key’s', () => {
    const w = (o) => ({
      actor: 'a@b',
      turn_id: null,
      session_id: 'key:abc',
      origin: 'api',
      origin_ref: 'abc',
      ...o
    })
    assert.deepEqual(classifyWrites([w({}), w({})]), { source: 'api', evidence: 'confirmed' })
    // A chat header that only LOOKS like a key's session is not the key's write.
    assert.equal(classifyWrites([w({ origin: null, origin_ref: null })]).source, 'unknown')
    assert.equal(classifyWrites([w({ actor: null })]).source, 'unknown')
  })

  test('outside rows: deploy with a valid tag, housekeeping, seal', () => {
    assert.equal(classifyOutside({ cause: 'deploy', deploy_tag: 'app-1234' }).source, 'deployment')
    assert.equal(classifyOutside({ cause: 'deploy', deploy_tag: null }).source, 'unknown')
    assert.equal(classifyOutside({ cause: 'housekeeping', deploy_tag: null }).source, 'automatic')
    assert.equal(classifyOutside({ cause: 'seal', deploy_tag: null }).source, 'unknown')
  })

  // Walkthrough 22/10/2026: Tracy's Cowork package updating itself sealed as "source unknown".
  test('outside seal: Tracy’s Cowork package updating itself is a Tracy update; anything less stays unknown', () => {
    const seal = (paths) => classifyOutside({ cause: 'seal', deploy_tag: null, paths }).source
    assert.equal(seal(COWORK_SEAL_JOOMLA), 'deployment')
    assert.equal(seal(COWORK_SEAL_WORDPRESS), 'deployment')
    assert.equal(
      seal([...COWORK_SEAL_JOOMLA, 'templates/cassiopeia/index.php']),
      'unknown',
      'one foreign file'
    )
    assert.equal(seal(['administrator/components/com_claudecowork/lib/Engine.php']), 'unknown', 'no manifest')
    assert.equal(seal(['wp-content/plugins/claude-cowork-pro/claude-cowork.php']), 'unknown', 'look-alike')
    assert.equal(seal([]), 'unknown')
    assert.equal(seal(null), 'unknown')
    // Only a seal: a housekeeping commit of the same files is still housekeeping.
    assert.equal(
      classifyOutside({ cause: 'housekeeping', deploy_tag: null, paths: COWORK_SEAL_JOOMLA }).source,
      'automatic'
    )
  })

  // Brian 02/10: authenticated CMS identity suffices; channel is not recorded and not required.
  test('cms-admin: a row of the CMS’s own log under an authenticated CMS account, in all three CMSs', () => {
    for (const source of ['wordpress-tracy-log', 'joomla-action-log', 'emdash-audit-log']) {
      assert.deepEqual(
        classifyCmsChange({ source, cms_actor: { id: '3', name: 'minh' }, change_type: 'x' }),
        { source: 'cms-admin', evidence: 'confirmed' },
        source
      )
    }
    // No account, an account with no id, or user 0: nothing is claimed.
    assert.equal(classifyCmsChange({ source: 'emdash-audit-log', cms_actor: null }).source, 'unknown')
    assert.equal(
      classifyCmsChange({ source: 'joomla-action-log', cms_actor: { id: null, name: 'x' } }).source,
      'unknown'
    )
    assert.equal(
      classifyCmsChange({ source: 'joomla-action-log', cms_actor: { id: '0', name: 'x' } }).source,
      'unknown'
    )
    // EmDash publish state (04/10): the scheduler's own publish is automatic; any other publish or
    // unpublish carries no account and stays unknown.
    assert.deepEqual(
      classifyCmsChange({
        source: 'emdash-audit-log',
        cms_actor: null,
        change_type: 'entry-state:scheduled-publish'
      }),
      { source: 'automatic', evidence: 'confirmed', service: 'emdash-scheduler' }
    )
    for (const change_type of ['entry-state:publish', 'entry-state:unpublish'])
      assert.equal(
        classifyCmsChange({ source: 'emdash-audit-log', cms_actor: null, change_type }).source,
        'unknown'
      )
    // The scheduler's change type proves nothing in another CMS's log.
    assert.equal(
      classifyCmsChange({
        source: 'joomla-action-log',
        cms_actor: null,
        change_type: 'entry-state:scheduled-publish'
      }).source,
      'unknown'
    )
    assert.equal(hasCmsIdentity({ id: 7 }), true)
    assert.equal(hasCmsIdentity({ id: '  ' }), false)
    // WordPress with no user stays under the cron contract.
    assert.equal(classifyCmsChange({ source: 'wordpress-tracy-log', cms_actor: null }).source, 'automatic')
    assert.ok(WP_CRON_PRODUCERS.includes('0.3.0'))
    // The hook that ships now is under the contract too: bumping tracy-access.php without this list
    // would turn every automatic update it logs into Unknown.
    const hook = readFileSync(
      fileURLToPath(
        new URL(
          '../../../packages/fleet/tracy-fleet-operation/scripts/provision/access/wordpress/tracy-access.php',
          import.meta.url
        )
      ),
      'utf8'
    )
    const shipped = hook.match(/const TRACY_ADMIN_LOG_PRODUCER = '([^']+)';/)?.[1]
    assert.ok(shipped && WP_CRON_PRODUCERS.includes(shipped), `hook ${shipped} is in WP_CRON_PRODUCERS`)
  })
})

describe('effects and description', () => {
  const write = (o) => ({ action: 'content.update', via: 'apply', outcome: 'ok', target: null, ...o })

  test('D4: a look edit by a file tool and a read are technical — not content, not files, not other', () => {
    const { effects, technical } = effectsOf({
      writes: [
        write({ via: 'file-look', action: 'edit' }),
        write({ via: 'look-revert', action: 'look.revert' }),
        write({ action: 'content.read' })
      ],
      files: { sha: sha('a'), count: 2 }
    })
    assert.equal(technical.length, 3)
    assert.deepEqual(effects.content, { resources: [], operations: 0 })
    assert.equal(effects.other.operations, 0)
    assert.equal(effects.files.count, 2, 'the files the tool wrote are counted once, from Git')
  })

  test('resources count by type + id; operations without an id are counted apart; files apart', () => {
    const { effects } = effectsOf({
      writes: [
        write({ target: { kind: 'page', id: '12', fields: ['title'] } }),
        write({ target: { kind: 'page', id: '12', fields: ['body'] } }),
        write({ target: { kind: 'article', id: '551' }, action: 'content.publish' }),
        write({ action: 'content.update' }),
        write({ target: { kind: 'option', id: 'blogname' }, action: 'settings.update' }),
        write({ action: 'user.block' })
      ],
      files: { sha: sha('b'), count: 3 }
    })
    assert.deepEqual(
      effects.content.resources.map((r) => [r.type, r.id, r.ops]),
      [
        ['page', '12', ['update']],
        ['article', '551', ['publish']]
      ]
    )
    assert.equal(effects.content.operations, 1)
    assert.equal(effects.settings.resources.length, 1)
    assert.equal(effects.other.operations, 1)
    assert.equal(effects.files.count, 3)
    assert.deepEqual(describeEffects(effects), {
      key: 'effects.summary',
      params: {
        contentResources: 2,
        contentOperations: 1,
        settingsResources: 1,
        settingsOperations: 0,
        files: 3,
        otherOperations: 1
      },
      isRequestOnly: false
    })
  })

  test('one Tracy write names its resource by kind and id, never a title it did not store', () => {
    const { effects } = effectsOf({ writes: [write({ target: { kind: 'article', id: '551' } })] })
    assert.deepEqual(describeEffects(effects), {
      key: 'resource.op',
      params: { op: 'update', type: 'article', id: '551', title: null },
      isRequestOnly: false
    })
  })

  test('an EmDash write names its entry by the singular of its collection (QA-A10-em)', () => {
    const { effects } = effectsOf({
      writes: [
        write({ action: 'content_update', via: 'emdash-mcp', target: { kind: 'posts', id: '01M3Z' } })
      ],
      fileHistory: false
    })
    assert.deepEqual(describeEffects(effects), {
      key: 'resource.op',
      params: { op: 'update', type: 'post', id: '01M3Z', title: null },
      isRequestOnly: false
    })
    // A created entry (ACC-30.C4): "Created post <id>", from the id its receipt carried.
    const created = effectsOf({
      writes: [
        write({ action: 'content_create', via: 'emdash-mcp', target: { kind: 'posts', id: '01M3ZNEW' } })
      ],
      fileHistory: false
    }).effects
    assert.deepEqual(describeEffects(created).params, {
      op: 'create',
      type: 'post',
      id: '01M3ZNEW',
      title: null
    })
    // A create the Apply door recorded as `content.create` (#1259: its audit row says update)
    // still reads as a create under the new id.
    const applyCreate = effectsOf({
      writes: [write({ action: 'content.create', target: { kind: 'page', id: '77' } })],
      fileHistory: false
    }).effects
    assert.deepEqual(describeEffects(applyCreate).params, {
      op: 'create',
      type: 'page',
      id: '77',
      title: null
    })
    // A Tracy write by the Apply door keeps the type it was given.
    const apply = effectsOf({ writes: [write({ target: { kind: 'news', id: '7' } })] }).effects
    assert.equal(describeEffects(apply).params.type, 'news')
  })

  test('nothing confirmed: a turn says its request; operations without a resource say "recorded"', () => {
    const none = effectsOf({ writes: [] }).effects
    assert.deepEqual(describeEffects(none, { requestOnlyAllowed: true }), {
      key: 'request',
      params: {},
      isRequestOnly: true
    })
    const opOnly = effectsOf({ writes: [write({})] }).effects
    assert.equal(describeEffects(opOnly).key, 'change.recorded')
    const filesOnly = effectsOf({ files: { sha: sha('c'), count: 4 } }).effects
    assert.deepEqual(describeEffects(filesOnly), {
      key: 'files.changed',
      params: { files: 4 },
      isRequestOnly: false
    })
  })

  test('a CMS row is named by the title the CMS stored; content and settings by its resource type', () => {
    const cms = { resource_type: 'page', resource_id: '42', resource_title: 'About us', op: 'update' }
    assert.deepEqual(describeCms(cms).params, { op: 'update', type: 'page', id: '42', title: 'About us' })
    assert.equal(effectsOf({ cms, linked: false }).effects.content.resources[0].title, 'About us')
    const option = {
      resource_type: 'option',
      resource_id: 'blogname',
      resource_title: 'Site Title',
      op: 'update'
    }
    assert.equal(effectsOf({ cms: option, linked: false }).effects.settings.resources.length, 1)
    assert.equal(
      effectsOf({ cms, linked: false }).effects.files.state,
      'not-linked',
      'a CMS row is linked to no commit: no "0 files"'
    )
  })

  // B3 (local round r1, L3.2): Joomla logs a component's Options as `component_config`, which read
  // as Content. Every type the three collectors emit, each in its group: Joomla's list is the whole
  // `PLG_ACTIONLOG_JOOMLA_TYPE_*` set of Joomla 5's plg_actionlog_joomla.ini (scv2jo, 02/10).
  const GROUPS = {
    settings: [
      // Joomla
      'application_config',
      'component_config',
      'component',
      'file',
      'language',
      'library',
      'package',
      'plugin',
      'style',
      'task',
      'template',
      'link_redirect',
      // Joomla fallback (no TYPE_ in the message): the log's extension
      'com_config.component',
      'com_config.application',
      'com_installer',
      'com_plugins.plugin',
      'com_templates.style',
      // WordPress hook
      'option',
      'theme_mods',
      'theme',
      'core'
    ],
    other: ['access_level', 'user', 'user_group', 'user_note', 'com_users.user'],
    content: [
      // Joomla
      'article',
      'banner',
      'banner_client',
      'category',
      'contact',
      'field',
      'link',
      'media',
      'menu',
      'menu_item',
      'module',
      'newsfeed',
      'tag',
      'com_content.article',
      // WordPress hook
      'post',
      'page',
      'attachment',
      'nav_menu',
      'wp_template',
      'product',
      // EmDash collections
      'posts',
      'pages'
    ]
  }
  for (const [group, types] of Object.entries(GROUPS)) {
    for (const type of types) {
      test(`CMS type ${type} → ${group}`, () => {
        assert.equal(cmsGroup(type), group)
        const { effects } = effectsOf({
          cms: { source: 'joomla-action-log', resource_type: type, resource_id: '9', op: 'update' },
          linked: false
        })
        const counted = group === 'other' ? effects.other.operations : effects[group].resources.length
        assert.equal(counted, 1, `${type} counted under ${group}`)
      })
    }
  }

  test('B3: a Joomla component’s Options save is one setting, not content', () => {
    const cms = {
      source: 'joomla-action-log',
      resource_type: 'component_config',
      resource_id: '22',
      resource_title: 'com_content',
      op: 'update'
    }
    const { effects } = effectsOf({ cms, linked: false })
    assert.equal(effects.content.resources.length, 0)
    assert.deepEqual(effects.settings.resources, [
      { type: 'component_config', id: '22', title: 'com_content', ops: ['update'] }
    ])
  })

  // EM-3 (local round r1): EmDash logs the collection slug, plural ("Updated posts “Launch”").
  test('EM-3: an EmDash collection reads singular in the description and the effects; other CMSs keep their type', () => {
    const em = (type) => ({
      source: 'emdash-audit-log',
      resource_type: type,
      resource_id: '01X',
      resource_title: 'Launch',
      op: 'update'
    })
    assert.equal(describeCms(em('posts')).params.type, 'post')
    assert.equal(describeCms(em('pages')).params.type, 'page')
    assert.equal(effectsOf({ cms: em('pages'), linked: false }).effects.content.resources[0].type, 'page')
    for (const [plural, one] of [
      ['categories', 'category'],
      ['boxes', 'box'],
      ['news', 'news'],
      ['media', 'media'],
      ['faqs', 'faq'],
      ['status', 'status'],
      ['team', 'team']
    ])
      assert.equal(singularType('emdash-audit-log', plural), one, plural)
    assert.equal(singularType('wordpress-tracy-log', 'posts'), 'posts', 'only EmDash logs a collection slug')
    assert.equal(describeCms({ ...em('page'), source: 'wordpress-tracy-log' }).params.type, 'page')
    assert.equal(singularType('emdash-audit-log', null), null)
  })

  // F-L4-4 (round L4): settings operations with no id read "Content change recorded".
  test('F-L4-4: settings-only operations with no id say settings, content-only ones say content', () => {
    const settingsOnly = effectsOf({
      writes: [
        write({ action: 'settings.update' }),
        write({ action: 'site_settings_update', via: 'emdash-mcp' })
      ]
    }).effects
    assert.deepEqual(describeEffects(settingsOnly), {
      key: 'settings.recorded',
      params: { operations: 2 },
      isRequestOnly: false
    })
    const contentOnly = effectsOf({ writes: [write({})] }).effects
    assert.equal(describeEffects(contentOnly).key, 'change.recorded')
    // A CMS settings row with no id and no title (Joomla's global configuration).
    assert.deepEqual(
      describeCms({
        source: 'joomla-action-log',
        resource_type: 'application_config',
        resource_id: null,
        op: 'update'
      }),
      { key: 'settings.recorded', params: { op: 'update' }, isRequestOnly: false }
    )
    assert.equal(
      describeCms({ source: 'joomla-action-log', resource_type: 'article', resource_id: null, op: 'update' })
        .key,
      'change.recorded'
    )
  })

  test('other-only (accounts, access) with no id says other, not content', () => {
    for (const type of ['user', 'user_group', 'access_level', 'user_note', 'com_users.user'])
      assert.deepEqual(
        describeCms({ source: 'joomla-action-log', resource_type: type, resource_id: null, op: 'block' }),
        { key: 'other.recorded', params: { op: 'block' }, isRequestOnly: false },
        type
      )
    const otherOnly = effectsOf({
      writes: [write({ action: 'user.block' }), write({ target: { kind: 'user' }, action: 'user.update' })]
    }).effects
    assert.deepEqual(describeEffects(otherOnly), {
      key: 'other.recorded',
      params: { operations: 2 },
      isRequestOnly: false
    })
    // Other actions beside files or content are a summary, as before.
    const mixed = effectsOf({
      writes: [write({ action: 'user.block' })],
      files: { sha: 'a'.repeat(40), count: 1 }
    })
    assert.equal(describeEffects(mixed.effects).key, 'effects.summary')
  })

  // Brian 02/10 "Tracy update": Tracy's own components as the CMS logs name them (real rows).
  test('owner: Tracy’s plugin and package rows, as the real logs name them; nothing that merely looks alike', () => {
    // WordPress, from the schema-2 fixture's real-shaped row (resource id) — both titles seen.
    const wpFixture = mapCmsLog('wordpress', hostFixture('wordpress-producer-v2.json'), '').entries.find(
      (e) => String(e.resourceId).startsWith('claude-cowork/')
    )
    const asRow = (e, source) => ({
      source,
      resource_type: e.resourceType,
      resource_id: e.resourceId,
      resource_title: e.resourceTitle,
      op: e.op
    })
    assert.equal(tracyOwned(asRow(wpFixture, 'wordpress-tracy-log')), true)
    assert.equal(describeCms(asRow(wpFixture, 'wordpress-tracy-log')).params.owner, 'tracy')
    const wp = (id, title, type = 'plugin') => ({
      source: 'wordpress-tracy-log',
      resource_type: type,
      resource_id: id,
      resource_title: title,
      op: 'install'
    })
    assert.equal(
      tracyOwned(wp('claude-cowork/claude-cowork.php', 'Tracy Claude Cowork')),
      true,
      'stand scv2wp title'
    )
    assert.equal(tracyOwned(wp('hello.php', 'Hello Dolly')), false)
    assert.equal(tracyOwned(wp('claude-cowork-pro/x.php', 'Claude Cowork Pro')), false, 'a look-alike slug')
    assert.equal(tracyOwned(wp('claude-cowork', 'x', 'option')), false, 'not a plugin row')
    // Joomla: the names the action log writes (fixture e3sj0330 + stand scv2jo).
    const joomla = hostFixture('joomla-e3sj0330.json')
      .rows.map((r) => r.message?.name)
      .filter(Boolean)
    for (const name of new Set(joomla)) {
      const row = {
        source: 'joomla-action-log',
        resource_type: 'plugin',
        resource_id: '1',
        resource_title: name,
        op: 'install'
      }
      assert.equal(tracyOwned(row), true, name)
      assert.deepEqual(describeCms(row).params, {
        op: 'install',
        type: 'plugin',
        id: '1',
        title: name,
        owner: 'tracy'
      })
    }
    assert.equal(
      tracyOwned({ source: 'joomla-action-log', resource_title: 'plg_system_claudecoworkapix' }),
      false
    )
    assert.equal(tracyOwned({ source: 'emdash-audit-log', resource_title: 'Claude Cowork' }), false)
    // A Tracy component with no resource named still says whose it is.
    assert.deepEqual(
      describeCms({
        source: 'joomla-action-log',
        resource_type: 'component',
        resource_title: null,
        resource_id: null,
        op: 'update'
      }).params,
      { op: 'update' }
    )
  })

  test('deploy keys: tracy-access.php is the connector; any other or unknown file is deploy.files', () => {
    assert.deepEqual(describeDeploy({ tag: 'app-9', file: 'tracy-access.php', files: 1 }), {
      key: 'deploy.updated',
      params: { component: 'connector', files: 1, tag: 'app-9', owner: 'tracy' },
      isRequestOnly: false
    })
    assert.equal(
      describeDeploy({ tag: 'app-9', file: 'wp-content/mu-plugins/tracy-access.php', files: 1 }).key,
      'deploy.updated'
    )
    assert.deepEqual(describeDeploy({ tag: 'manual', file: 'other.php', files: 2 }), {
      key: 'deploy.files',
      params: { files: 2, tag: 'manual' },
      isRequestOnly: false
    })
    assert.equal(describeDeploy({ tag: null, file: null, files: null }).key, 'deploy.files')
  })

  test('EmDash keeps no file history: files are not-tracked, never 0', () => {
    const { effects } = effectsOf({ files: null, fileHistory: false })
    assert.equal(effects.files.count, null)
    assert.equal(effects.files.state, 'not-tracked')
  })

  test('write groups: settings by target kind or action, other for accounts', () => {
    assert.equal(writeGroup(write({ target: { kind: 'theme_mods' } })), 'settings')
    assert.equal(writeGroup(write({ action: 'site_settings_update' })), 'settings')
    assert.equal(writeGroup(write({ action: 'menu.update' })), 'content')
    assert.equal(writeGroup(write({ target: { kind: 'user' } })), 'other')
    assert.equal(writeGroup(write({ action: 'site.changed', via: 'emdash-mcp' })), 'other')
  })

  test('request state: written by the door; a legacy row (null) is unknown, never guessed from 200', () => {
    assert.equal(requestStateOf(null), 'unknown')
    assert.equal(requestStateOf(undefined), 'unknown')
    assert.equal(requestStateOf('full'), 'full')
    assert.equal(requestStateOf('truncated'), 'truncated')
    assert.equal(requestStateFor('a  b', 3), 'full', 'folded whitespace is not a cut')
    assert.equal(requestStateFor('x'.repeat(4001), 4000), 'truncated')
    assert.equal(inferRequestState({ title: titleWithin('x '.repeat(3000), 4000) }), null, 'a cut ends in …')
    assert.equal(inferRequestState({ title: 'Change the badge' }), 'full')
    assert.equal(inferRequestState({ title: 'Fix it +2', commentNs: [4, 5, 6] }), 'truncated')
  })
})

// ── Both halves on the same rows ───────────────────────────────────────────────────────────────

const SITE = { site_key: 'scwp1002.tracy.test', label: 'scwp1002', host: 'local', platform: 'wordpress' }

/** Every V2 row of a site with its SQL Source, by `kind:id`. */
async function sqlSources(pool, siteKey) {
  const { rows } = await pool.query(`select kind, id, source from (${V2_SOURCES_SQL}) s`, [
    siteKey,
    [],
    [],
    [...WP_CRON_PRODUCERS]
  ])
  return new Map(rows.map((r) => [`${r.kind}:${r.id}`, r.source]))
}

describe('Postgres and JS agree', { skip }, () => {
  const db = fileDb()
  before(db.open)
  beforeEach(db.reset)
  after(db.close)

  async function seed(pool, site = SITE) {
    await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
      site.site_key,
      site.label,
      site.host,
      site.platform
    ])
  }

  /** Pull `answer` (an adapter's JSON) through tracy-host's mapping and tracy-web's insert. */
  async function pullFixture(pool, site, platform, answer) {
    const mapped = mapCmsLog(platform, answer, '')
    const runJob = async () => ({ ok: true, output: JSON.stringify(mapped) })
    return pullCmsLog(pool, site, { runJob })
  }

  test('the WordPress schema-2 fixture: cron only with a vouching producer; signed-in users cms-admin', async () => {
    const { pool } = db
    await seed(pool)
    const result = await pullFixture(pool, SITE, 'wordpress', hostFixture('wordpress-producer-v2.json'))
    assert.equal(result.pulled, 9)
    const { rows } = await pool.query(
      `select source, cursor_key, cms_actor, change_type, producer from site_cms_change order by id`
    )
    const sql = await sqlSources(pool, SITE.site_key)
    const expected = {
      1: 'cms-admin', // schema 1, a signed-in user (Brian 02/10: identity suffices)
      2: 'automatic', // schema 1, user 0: the hook's history (every version had the cron gate)
      3: 'cms-admin', // schema 2, a signed-in user
      4: 'automatic', // schema 2, user 0, context cron, a known producer
      5: 'unknown', // user 0, cron, but a producer version nobody vouched for
      6: 'unknown', // user 0 with a producer that does NOT say cron: conflicting
      7: 'cms-admin', // a signed-in user inside cron is still that user
      8: 'cms-admin', // the Customizer
      9: 'cms-admin'
    }
    for (const r of rows) {
      const n = r.cursor_key.split('@')[0]
      const js = classifyCmsChange(r)
      assert.equal(sql.get(`cms-change:${r.source}:${r.cursor_key}`), expected[n], `row ${n} (SQL)`)
      assert.equal(js.source, expected[n], `row ${n} (JS)`)
    }
    assert.equal(rows[0].change_type, 'wp_after_insert_post')
    assert.equal(rows[0].producer, null, 'a legacy row keeps no producer')
    assert.equal(rows[3].producer.context, 'cron')
    assert.equal(classifyCmsChange(rows[1]).basis, 'hook-history')
    assert.equal(classifyCmsChange(rows[3]).basis, 'producer')
    assert.equal(classifyCmsChange(rows[5]).evidence, 'conflicting')
  })

  test('the real fixtures: scwp1002 (users cms-admin, WP-Cron automatic), e3sj0330 (Joomla user 0 never stored)', async () => {
    const { pool } = db
    await seed(pool)
    await pullFixture(pool, SITE, 'wordpress', hostFixture('wordpress-scwp1002.json'))
    const joomla = { ...SITE, site_key: 'e3sj0330.tracy.test', label: 'e3sj0330', platform: 'joomla' }
    await seed(pool, joomla)
    const pulled = await pullFixture(pool, joomla, 'joomla', hostFixture('joomla-e3sj0330.json'))
    assert.equal(pulled.pulled, 0, 'installs by user 0 (CLI/installer) are dropped by the collector')
    const sql = await sqlSources(pool, SITE.site_key)
    const { rows } = await pool.query(`select * from site_cms_change where site_key = $1 order by id`, [
      SITE.site_key
    ])
    for (const r of rows) {
      const key = `cms-change:${r.source}:${r.cursor_key}`
      assert.equal(sql.get(key), classifyCmsChange(r).source, key)
      assert.equal(sql.get(key), r.cms_actor ? 'cms-admin' : 'automatic', key)
    }
  })

  test('cms-admin in both halves: one signed-in row per CMS; no account, no id or user 0 stays unknown', async () => {
    const { pool } = db
    await seed(pool)
    await pool.query(
      `insert into site_cms_change (site_key, source, cms_actor, resource_type, op, occurred_at, cursor_key, change_type)
       values ($1, 'wordpress-tracy-log', '{"id":"8","name":"owner"}', 'page', 'update', now(), 'wp', 'wp_after_insert_post'),
              ($1, 'joomla-action-log', '{"id":"546","name":"minh"}', 'article', 'update', now(), 'jo', 'PLG_X_UPDATED'),
              ($1, 'emdash-audit-log', '{"id":"8391752f","name":"Minh"}', 'pages', 'update', now(), 'em', 'update'),
              ($1, 'emdash-audit-log', null, 'pages', 'delete', now(), 'em-null', 'delete'),
              ($1, 'joomla-action-log', '{"id":null,"name":"x"}', 'article', 'update', now(), 'jo-noid', 'x'),
              ($1, 'joomla-action-log', '{"id":"0","name":"x"}', 'article', 'update', now(), 'jo-zero', 'x'),
              ($1, 'wordpress-tracy-log', null, 'plugin', 'install', now(), 'wp-cron', 'upgrader_process_complete')`,
      [SITE.site_key]
    )
    const sql = await sqlSources(pool, SITE.site_key)
    const { rows } = await pool.query(`select * from site_cms_change where site_key = $1`, [SITE.site_key])
    const expected = {
      wp: 'cms-admin',
      jo: 'cms-admin',
      em: 'cms-admin',
      'em-null': 'unknown',
      'jo-noid': 'unknown',
      'jo-zero': 'unknown',
      'wp-cron': 'automatic'
    }
    for (const r of rows) {
      const key = `cms-change:${r.source}:${r.cursor_key}`
      assert.equal(sql.get(key), expected[r.cursor_key], `${r.cursor_key} (SQL)`)
      assert.equal(classifyCmsChange(r).source, expected[r.cursor_key], `${r.cursor_key} (JS)`)
    }
  })

  test("C1: an EmDash delete with no account that one of Tracy's own successful deletes names by id is Tracy's: no row of its own; ambiguous stays unknown", async () => {
    const { pool } = db
    const em = { site_key: 'emc1.tracy.test', label: 'emc1', host: 'local', platform: 'emdash' }
    await seed(pool, em)
    const other = { site_key: 'emc2.tracy.test', label: 'emc2', host: 'local', platform: 'emdash' }
    await seed(pool, other)
    // The CMS log as the collector stores it: EmDash deletes never carry a user (core 1.0.1).
    const cms = (cursor, type, id, op = 'delete', actor = null) =>
      pool.query(
        `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, op, occurred_at, cursor_key, change_type)
         values ($1, 'emdash-audit-log', $2, $3, $4, $5, now(), $6, $5)`,
        [em.site_key, actor, type, id, op, cursor]
      )
    // Tracy's own write, as `POST /changed` stores it for a `tracy_emdash` call.
    const wrote = (site, action, target, outcome = 'ok') =>
      pool.query(
        `insert into site_write (site_key, turn_id, session_id, actor, action, outcome, target, via)
         values ($1, 'session-c1:1', 'session-c1', 'mai@example.test', $2, $3, $4, 'emdash-mcp')`,
        [site, action, outcome, target === null ? null : JSON.stringify(target)]
      )
    await cms('one', 'posts', '01AAAAAAAAAAAAAAAAAAAAAAAA')
    await wrote(em.site_key, 'content_delete', { kind: 'posts', id: '01AAAAAAAAAAAAAAAAAAAAAAAA' })
    // A whole-entry delete: one call, one write naming every row it removed.
    await cms('en', 'posts', '01BBBBBBBBBBBBBBBBBBBBBBEN')
    await cms('ru', 'posts', '01BBBBBBBBBBBBBBBBBBBBBBRU')
    await wrote(em.site_key, 'content_delete', {
      kind: 'posts',
      id: '01BBBBBBBBBBBBBBBBBBBBBBEN',
      ids: ['01BBBBBBBBBBBBBBBBBBBBBBEN', '01BBBBBBBBBBBBBBBBBBBBBBRU']
    })
    // Trash, then permanent: two CMS rows, two writes.
    await cms('trash', 'pages', '01CCCCCCCCCCCCCCCCCCCCCCCC')
    await cms('purge', 'pages', '01CCCCCCCCCCCCCCCCCCCCCCCC')
    await wrote(em.site_key, 'content_delete', { kind: 'pages', id: '01CCCCCCCCCCCCCCCCCCCCCCCC' })
    await wrote(em.site_key, 'content_permanent_delete', { kind: 'pages', id: '01CCCCCCCCCCCCCCCCCCCCCCCC' })
    // Ambiguous: two deletes of one entry and only one of them Tracy's — which one is not known.
    await cms('amb1', 'posts', '01DDDDDDDDDDDDDDDDDDDDDDDD')
    await cms('amb2', 'posts', '01DDDDDDDDDDDDDDDDDDDDDDDD')
    await wrote(em.site_key, 'content_delete', { kind: 'posts', id: '01DDDDDDDDDDDDDDDDDDDDDDDD' })
    // Not proof: a refused write, another collection, another site, an update, no write at all.
    await cms('refused', 'posts', '01EEEEEEEEEEEEEEEEEEEEEEEE')
    await wrote(em.site_key, 'content_delete', { kind: 'posts', id: '01EEEEEEEEEEEEEEEEEEEEEEEE' }, 'refused')
    await cms('kind', 'posts', '01FFFFFFFFFFFFFFFFFFFFFFFF')
    await wrote(em.site_key, 'content_delete', { kind: 'pages', id: '01FFFFFFFFFFFFFFFFFFFFFFFF' })
    await cms('site', 'posts', '01GGGGGGGGGGGGGGGGGGGGGGGG')
    await wrote(other.site_key, 'content_delete', { kind: 'posts', id: '01GGGGGGGGGGGGGGGGGGGGGGGG' })
    await cms('update', 'posts', '01HHHHHHHHHHHHHHHHHHHHHHHH', 'update')
    await wrote(em.site_key, 'content_update', { kind: 'posts', id: '01HHHHHHHHHHHHHHHHHHHHHHHH' })
    await cms('admin', 'posts', '01JJJJJJJJJJJJJJJJJJJJJJJJ')
    // A delete that names a person stays theirs, whatever Tracy did.
    await cms('person', 'posts', '01KKKKKKKKKKKKKKKKKKKKKKKK', 'delete', '{"id":"u1","name":"Minh"}')
    await wrote(em.site_key, 'content_delete', { kind: 'posts', id: '01KKKKKKKKKKKKKKKKKKKKKKKK' })

    const expected = {
      one: undefined,
      en: undefined,
      ru: undefined,
      trash: undefined,
      purge: undefined,
      amb1: 'unknown',
      amb2: 'unknown',
      refused: 'unknown',
      kind: 'unknown',
      site: 'unknown',
      update: 'unknown',
      admin: 'unknown',
      person: 'cms-admin'
    }
    const v2 = await sqlSources(pool, em.site_key)
    for (const [cursor, source] of Object.entries(expected))
      assert.equal(v2.get(`cms-change:emdash-audit-log:${cursor}`), source, `${cursor} (V2)`)

    // The same rows are gone from the V1 list and the CMS log door: one rule, every read.
    const v1 = await readActivity(pool, em, {
      filter: 'outside',
      limit: 50,
      runJob: async () => ({ ok: false, reason: 'no-git' })
    })
    const v1Ids = new Set(v1.items.filter((i) => i.kind === 'outside-cms').map((i) => i.id))
    const door = await readCmsLog(pool, em, { limit: 50 })
    const doorIds = new Set(door.items.map((i) => i.id))
    for (const [cursor, source] of Object.entries(expected)) {
      const id = `emdash-audit-log:${cursor}`
      assert.equal(v1Ids.has(id), source !== undefined, `${cursor} (V1)`)
      assert.equal(doorIds.has(id), source !== undefined, `${cursor} (door)`)
    }
  })

  test("C1 media: an EmDash media upload (or delete) with no account that Tracy's own successful media write names by id is Tracy's; by id only, ambiguous stays unknown", async () => {
    const { pool } = db
    const em = { site_key: 'emm1.tracy.test', label: 'emm1', host: 'local', platform: 'emdash' }
    await seed(pool, em)
    const other = { site_key: 'emm2.tracy.test', label: 'emm2', host: 'local', platform: 'emdash' }
    await seed(pool, other)
    // The collector stores an audit-log `media:upload` entry as op 'upload', resource_type 'media', no user.
    const cms = (cursor, id, op = 'upload', actor = null, type = 'media') =>
      pool.query(
        `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, op, occurred_at, cursor_key, change_type)
         values ($1, 'emdash-audit-log', $2, $3, $4, $5, now(), $6, $7)`,
        [em.site_key, actor, type, id, op, cursor, op === 'upload' ? 'media:upload' : op]
      )
    const wrote = (site, action, target, outcome = 'ok') =>
      pool.query(
        `insert into site_write (site_key, turn_id, session_id, actor, action, outcome, target, via)
         values ($1, 'session-m1:1', 'session-m1', 'mai@example.test', $2, $3, $4, 'emdash-mcp')`,
        [site, action, outcome, target === null ? null : JSON.stringify(target)]
      )
    await cms('up', '01MAAAAAAAAAAAAAAAAAAAAAAA')
    await wrote(em.site_key, 'media_upload', { kind: 'media', id: '01MAAAAAAAAAAAAAAAAAAAAAAA' })
    // A media delete row (no EmDash release logs one today; a later audit-log may): same rule.
    await cms('del', '01MBBBBBBBBBBBBBBBBBBBBBBB', 'delete')
    await wrote(em.site_key, 'media_delete', { kind: 'media', id: '01MBBBBBBBBBBBBBBBBBBBBBBB' })
    // Ambiguous: two upload rows of one id, one Tracy upload.
    await cms('amb1', '01MCCCCCCCCCCCCCCCCCCCCCCC')
    await cms('amb2', '01MCCCCCCCCCCCCCCCCCCCCCCC')
    await wrote(em.site_key, 'media_upload', { kind: 'media', id: '01MCCCCCCCCCCCCCCCCCCCCCCC' })
    // Not proof: a refused upload, another site, an upload named by a delete (or the reverse), no
    // write at all, a row naming a person, and a content row of the same id.
    await cms('refused', '01MDDDDDDDDDDDDDDDDDDDDDDD')
    await wrote(em.site_key, 'media_upload', { kind: 'media', id: '01MDDDDDDDDDDDDDDDDDDDDDDD' }, 'refused')
    await cms('site', '01MEEEEEEEEEEEEEEEEEEEEEEE')
    await wrote(other.site_key, 'media_upload', { kind: 'media', id: '01MEEEEEEEEEEEEEEEEEEEEEEE' })
    await cms('crossop', '01MFFFFFFFFFFFFFFFFFFFFFFF')
    await wrote(em.site_key, 'media_delete', { kind: 'media', id: '01MFFFFFFFFFFFFFFFFFFFFFFF' })
    await cms('crossdel', '01MGGGGGGGGGGGGGGGGGGGGGGG', 'delete')
    await wrote(em.site_key, 'media_upload', { kind: 'media', id: '01MGGGGGGGGGGGGGGGGGGGGGGG' })
    await cms('admin', '01MHHHHHHHHHHHHHHHHHHHHHHH')
    await cms('person', '01MJJJJJJJJJJJJJJJJJJJJJJJ', 'upload', '{"id":"u1","name":"Minh"}')
    await wrote(em.site_key, 'media_upload', { kind: 'media', id: '01MJJJJJJJJJJJJJJJJJJJJJJJ' })
    await cms('content', '01MKKKKKKKKKKKKKKKKKKKKKKK', 'delete', null, 'posts')
    await wrote(em.site_key, 'media_delete', { kind: 'media', id: '01MKKKKKKKKKKKKKKKKKKKKKKK' })

    const expected = {
      up: undefined,
      del: undefined,
      amb1: 'unknown',
      amb2: 'unknown',
      refused: 'unknown',
      site: 'unknown',
      crossop: 'unknown',
      crossdel: 'unknown',
      admin: 'unknown',
      person: 'cms-admin',
      content: 'unknown'
    }
    const v2 = await sqlSources(pool, em.site_key)
    for (const [cursor, source] of Object.entries(expected))
      assert.equal(v2.get(`cms-change:emdash-audit-log:${cursor}`), source, `${cursor} (V2)`)
    const v1 = await readActivity(pool, em, {
      filter: 'outside',
      limit: 50,
      runJob: async () => ({ ok: false, reason: 'no-git' })
    })
    const v1Ids = new Set(v1.items.filter((i) => i.kind === 'outside-cms').map((i) => i.id))
    const door = await readCmsLog(pool, em, { limit: 50 })
    const doorIds = new Set(door.items.map((i) => i.id))
    for (const [cursor, source] of Object.entries(expected)) {
      const id = `emdash-audit-log:${cursor}`
      assert.equal(v1Ids.has(id), source !== undefined, `${cursor} (V1)`)
      assert.equal(doorIds.has(id), source !== undefined, `${cursor} (door)`)
    }
  })

  test("C1 publish: an EmDash publish/unpublish with no account that Tracy's own content_publish/unpublish names by id is Tracy's; the scheduler's is automatic, never Tracy's", async () => {
    const { pool } = db
    const em = { site_key: 'emp1.tracy.test', label: 'emp1', host: 'local', platform: 'emdash' }
    await seed(pool, em)
    // The collector stores a publish-state change as op publish/unpublish, the collection as type, no user.
    const cms = (cursor, id, op, change = `entry-state:${op}`, actor = null) =>
      pool.query(
        `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, op, occurred_at, cursor_key, change_type)
         values ($1, 'emdash-audit-log', $2, 'posts', $3, $4, now(), $5, $6)`,
        [em.site_key, actor, id, op, cursor, change]
      )
    const wrote = (action, id, outcome = 'ok', kind = 'posts') =>
      pool.query(
        `insert into site_write (site_key, turn_id, session_id, actor, action, outcome, target, via)
         values ($1, 'session-p1:1', 'session-p1', 'mai@example.test', $2, $3, $4, 'emdash-mcp')`,
        [em.site_key, action, outcome, JSON.stringify({ kind, id })]
      )
    await cms('unpub', '01PAAAAAAAAAAAAAAAAAAAAAAA', 'unpublish')
    await wrote('content_unpublish', '01PAAAAAAAAAAAAAAAAAAAAAAA')
    await cms('pub', '01PAAAAAAAAAAAAAAAAAAAAAAA', 'publish')
    await wrote('content_publish', '01PAAAAAAAAAAAAAAAAAAAAAAA')
    // A person's publish in the admin: nothing of Tracy's names it.
    await cms('admin', '01PBBBBBBBBBBBBBBBBBBBBBBB', 'publish')
    // Tracy's unpublish never covers a publish, nor an update a publish.
    await cms('crossop', '01PCCCCCCCCCCCCCCCCCCCCCCC', 'publish')
    await wrote('content_unpublish', '01PCCCCCCCCCCCCCCCCCCCCCCC')
    await cms('update', '01PDDDDDDDDDDDDDDDDDDDDDDD', 'publish')
    await wrote('content_update', '01PDDDDDDDDDDDDDDDDDDDDDDD')
    // Tracy published once, a person published the same entry again: both stay unknown.
    await cms('amb1', '01PEEEEEEEEEEEEEEEEEEEEEEE', 'publish')
    await cms('amb2', '01PEEEEEEEEEEEEEEEEEEEEEEE', 'publish')
    await wrote('content_publish', '01PEEEEEEEEEEEEEEEEEEEEEEE')
    // The scheduler fired on an entry Tracy once published: automatic, and it does not take the
    // place of Tracy's own publish row of that id.
    await cms('tpub', '01PFFFFFFFFFFFFFFFFFFFFFFF', 'publish')
    await wrote('content_publish', '01PFFFFFFFFFFFFFFFFFFFFFFF')
    await cms('sched', '01PFFFFFFFFFFFFFFFFFFFFFFF', 'publish', 'entry-state:scheduled-publish')
    // A refused Tracy publish proves nothing.
    await cms('refused', '01PGGGGGGGGGGGGGGGGGGGGGGG', 'publish')
    await wrote('content_publish', '01PGGGGGGGGGGGGGGGGGGGGGGG', 'refused')

    const expected = {
      unpub: undefined,
      pub: undefined,
      admin: 'unknown',
      crossop: 'unknown',
      update: 'unknown',
      amb1: 'unknown',
      amb2: 'unknown',
      tpub: undefined,
      sched: 'automatic',
      refused: 'unknown'
    }
    const v2 = await sqlSources(pool, em.site_key)
    for (const [cursor, source] of Object.entries(expected))
      assert.equal(v2.get(`cms-change:emdash-audit-log:${cursor}`), source, `${cursor} (V2)`)
    const door = await readCmsLog(pool, em, { limit: 50 })
    const doorIds = new Set(door.items.map((i) => i.id))
    for (const [cursor, source] of Object.entries(expected))
      assert.equal(doorIds.has(`emdash-audit-log:${cursor}`), source !== undefined, `${cursor} (door)`)
  })

  test("E5.e5: Tracy's content_update whose report says it moved the live state is Tracy's publish/unpublish; by id, never a person's", async () => {
    const { pool } = db
    const em = { site_key: 'emp2.tracy.test', label: 'emp2', host: 'local', platform: 'emdash' }
    await seed(pool, em)
    const cms = (cursor, id, op, change = `entry-state:${op}`) =>
      pool.query(
        `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_title, resource_id, op, occurred_at, cursor_key, change_type)
         values ($1, 'emdash-audit-log', null, 'home', 'Home', $2, $3, now(), $4, $5)`,
        [em.site_key, id, op, cursor, change]
      )
    const wrote = (action, target, outcome = 'ok') =>
      pool.query(
        `insert into site_write (site_key, turn_id, session_id, actor, action, outcome, target, via)
         values ($1, 'session-p2:1', 'session-p2', 'mai@example.test', $2, $3, $4, 'emdash-mcp')`,
        [em.site_key, action, outcome, JSON.stringify({ kind: 'home', ...target })]
      )
    // Dev e2e 04/10 (E5.e5): Tracy's content_update {status: "published"} put the home entry live.
    await cms('upd-pub', '01P2AAAAAAAAAAAAAAAAAAAAAA', 'publish')
    await wrote('content_update', { id: '01P2AAAAAAAAAAAAAAAAAAAAAA', title: 'Home', state: 'published' })
    // ...and one that took an entry offline.
    await cms('upd-unpub', '01P2BBBBBBBBBBBBBBBBBBBBBB', 'unpublish')
    await wrote('content_update', { id: '01P2BBBBBBBBBBBBBBBBBBBBBB', state: 'draft' })
    // An update whose report says nothing moved: a person's publish of that entry stays theirs.
    await cms('upd-none', '01P2CCCCCCCCCCCCCCCCCCCCCC', 'publish')
    await wrote('content_update', { id: '01P2CCCCCCCCCCCCCCCCCCCCCC', title: 'Home' })
    // A "published" report never covers an unpublish, nor a "draft" one a publish.
    await cms('cross1', '01P2DDDDDDDDDDDDDDDDDDDDDD', 'unpublish')
    await wrote('content_update', { id: '01P2DDDDDDDDDDDDDDDDDDDDDD', state: 'published' })
    await cms('cross2', '01P2EEEEEEEEEEEEEEEEEEEEEE', 'publish')
    await wrote('content_update', { id: '01P2EEEEEEEEEEEEEEEEEEEEEE', state: 'draft' })
    // Tracy's update published once, a person published again: neither is claimed.
    await cms('amb1', '01P2FFFFFFFFFFFFFFFFFFFFFF', 'publish')
    await cms('amb2', '01P2FFFFFFFFFFFFFFFFFFFFFF', 'publish')
    await wrote('content_update', { id: '01P2FFFFFFFFFFFFFFFFFFFFFF', state: 'published' })
    // A refused update proves nothing.
    await cms('refused', '01P2GGGGGGGGGGGGGGGGGGGGGG', 'publish')
    await wrote('content_update', { id: '01P2GGGGGGGGGGGGGGGGGGGGGG', state: 'published' }, 'refused')

    const expected = {
      'upd-pub': undefined,
      'upd-unpub': undefined,
      'upd-none': 'unknown',
      cross1: 'unknown',
      cross2: 'unknown',
      amb1: 'unknown',
      amb2: 'unknown',
      refused: 'unknown'
    }
    const v2 = await sqlSources(pool, em.site_key)
    for (const [cursor, source] of Object.entries(expected))
      assert.equal(v2.get(`cms-change:emdash-audit-log:${cursor}`), source, `${cursor} (V2)`)
    const door = await readCmsLog(pool, em, { limit: 50 })
    const doorIds = new Set(door.items.map((i) => i.id))
    for (const [cursor, source] of Object.entries(expected))
      assert.equal(doorIds.has(`emdash-audit-log:${cursor}`), source !== undefined, `${cursor} (door)`)
  })

  test('every other table: turns, writes, outside rows and operations classify the same in SQL and JS', async () => {
    const { pool } = db
    await seed(pool)
    await pool.query(`insert into account (email, display_name) values ('mai@example.test', 'Mai')`)
    const { rows: acct } = await pool.query(`select id from account`)
    const turn = (id, source, over = {}) =>
      pool.query(
        `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, state, files, head_sha, comment_ns)
         values ($1, $2, $3, 1, 'mai@example.test', $4, $5, 'closed', 1, $6, $7)`,
        [id, SITE.site_key, id.split(':')[0], over.title ?? 'words', source, sha(id[1]), over.ns ?? null]
      )
    await turn('a1:1', 'panel')
    await turn('b2:1', 'comment', { ns: [7] })
    await turn('c3:1', 'comment', { ns: [99] })
    await pool.query(
      `insert into site_request (site_key, n, account_id, session_id, request_id, url, text)
       values ($1, 7, $2, 'b2', 'r7', 'http://x/', 'words')`,
      [SITE.site_key, acct[0].id]
    )
    const write = (over) =>
      pool.query(
        `insert into site_write (site_key, turn_id, session_id, actor, action, outcome, via, origin, origin_ref)
         values ($1, $2, $3, $4, $5, 'ok', 'apply', $6, $7)`,
        [
          SITE.site_key,
          over.turn ?? null,
          over.session ?? null,
          over.actor ?? null,
          over.action ?? 'content.update',
          over.origin ?? null,
          over.ref ?? null
        ]
      )
    await write({ turn: 'gone:4', actor: 'mai@example.test' })
    await write({ session: 'key:k1', actor: 'mai@example.test' })
    await write({})
    // Sweep #4: one Tracy setup run's writes are ONE row; a session-less write with no record stays unknown.
    await write({ actor: 'mai@example.test', origin: 'setup', ref: 'run-1' })
    await write({ actor: 'mai@example.test', origin: 'setup', ref: 'run-1' })
    // Sweep #2: a key's writes are API; its revert is a row of its own.
    await write({ session: 'key:k2', actor: 'mai@example.test', origin: 'api', ref: 'k2' })
    await write({
      session: 'key:k2',
      actor: 'mai@example.test',
      origin: 'api',
      ref: 'k2',
      action: 'apply.revert'
    })
    const outside = (c, cause, tag = null, paths = null) =>
      pool.query(
        `insert into site_outside (sha, site_key, files, cause, deploy_tag, paths) values ($1, $2, 1, $3, $4, $5)`,
        [sha(c), SITE.site_key, cause, tag, paths]
      )
    await outside('d', 'deploy', 'app-1')
    await outside('e', 'housekeeping')
    await outside('f', 'seal')
    await outside('9', 'deploy', 'bad tag')
    // Seals with their paths: the Cowork package updating itself (Joomla, WordPress) and three that are not.
    await outside('8', 'seal', null, COWORK_SEAL_JOOMLA)
    await outside('6', 'seal', null, COWORK_SEAL_WORDPRESS)
    await outside('5', 'seal', null, [...COWORK_SEAL_JOOMLA, 'configuration.php'])
    await outside('4', 'seal', null, ['administrator/components/com_claudecowork/lib/Engine.php'])
    await outside('3', 'housekeeping', null, COWORK_SEAL_WORDPRESS)
    const op = (status, resulting) =>
      pool.query(
        `insert into site_operation (site_key, action, target_sha, actor_email, status, resulting_sha)
         values ($1, 'undo', $2, 'mai@example.test', $3, $4)`,
        [SITE.site_key, sha('a'), status, resulting]
      )
    await op('succeeded', sha('7'))
    await op('pending', null)
    await op('succeeded_noop', null)
    await op('failed', null)
    await op('unknown', null)

    const sql = await sqlSources(pool, SITE.site_key)
    const bySource = (kind) => [...sql].filter(([k]) => k.startsWith(`${kind}:`)).map(([k, s]) => [k, s])
    assert.deepEqual(
      new Map(bySource('turn')),
      new Map([
        ['turn:a1:1', classifyTurn({ source: 'panel' }, false).source],
        ['turn:b2:1', classifyTurn({ source: 'comment' }, true).source],
        ['turn:c3:1', classifyTurn({ source: 'comment' }, false).source]
      ])
    )
    assert.deepEqual(
      new Map(bySource('turn')),
      new Map([
        ['turn:a1:1', 'chat'],
        ['turn:b2:1', 'comment'],
        ['turn:c3:1', 'unknown']
      ])
    )
    const { rows: writes } = await pool.query(
      `select ${writeGroupSql('site_write')} as g, actor, turn_id, session_id, origin, origin_ref, action
         from site_write`
    )
    for (const w of writes) assert.equal(sql.get(`writes:${w.g}`), classifyWrites([w]).source, w.g)
    assert.equal(sql.get('writes:turn:gone:4'), 'chat')
    assert.equal(sql.get('writes:session:key:k1'), 'unknown', 'a key session the door did not record as API')
    assert.equal(sql.get('writes:setup:run-1'), 'setup')
    assert.equal(sql.get('writes:session:key:k2'), 'api')
    const revert = writes.find((w) => w.action === 'apply.revert')
    assert.match(revert.g, /^write:\d+$/, 'a key’s revert is its own row')
    assert.equal(sql.get(`writes:${revert.g}`), 'api')
    assert.equal(
      [...sql.keys()].filter((k) => k.startsWith('writes:write:')).length,
      2,
      'the session-less write with no record and the revert — not one row per setup write'
    )
    const { rows: outs } = await pool.query(`select * from site_outside`)
    for (const o of outs) assert.equal(sql.get(`outside-files:${o.sha}`), classifyOutside(o).source, o.cause)
    // The deploy / seal / housekeeping Source is the same whether Postgres or Git holds the commit.
    assert.equal(sql.get(`outside-files:${sha('d')}`), classifyGitRow(GIT_CASES[0].row).source)
    assert.equal(sql.get(`outside-files:${sha('e')}`), classifyGitRow(GIT_CASES[2].row).source)
    assert.equal(sql.get(`outside-files:${sha('f')}`), classifyGitRow(GIT_CASES[3].row).source)
    assert.equal(sql.get(`outside-files:${sha('8')}`), 'deployment', 'Cowork self-update, Joomla')
    assert.equal(sql.get(`outside-files:${sha('6')}`), 'deployment', 'Cowork self-update, WordPress')
    assert.equal(sql.get(`outside-files:${sha('5')}`), 'unknown', 'a foreign file in the seal')
    assert.equal(sql.get(`outside-files:${sha('4')}`), 'unknown', 'no manifest moved')
    const ops = bySource('operation')
    assert.equal(
      ops.length,
      1,
      'only a succeeded operation is an event (pending/noop/failed/unknown are not)'
    )
    assert.equal(ops[0][1], 'site-changes')
    for (const s of sql.values()) assert.ok(SOURCES.includes(s), s)
  })
})

// ── Migrations 048 + 049 on a database that already holds V1 rows ───────────────────────────────

describe('migrations 048 and 049', { skip }, () => {
  test('apply cleanly over V1-shaped data; V1 rows read as before; V2 reads them as legacy', async () => {
    const MIGRATIONS = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
    const dir = mkdtempSync(path.join(tmpdir(), 'scv2-migrations-'))
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
    for (const f of all) if (f < '048') copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
    const scratch = await scratchPool()
    const { pool } = scratch
    try {
      await migrate(pool, dir, { lockId: 48_049 })
      await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
        SITE.site_key,
        SITE.label,
        SITE.host,
        SITE.platform
      ])
      await pool.query(`insert into account (email, display_name) values ('mai@example.test', 'Mai')`)
      await pool.query(
        `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, state, files, head_sha, opened_at)
         values ('s1:1', $1, 's1', 1, 'mai@example.test', $2, 'panel', 'closed', 1, $3, '2026-09-20T10:00:00Z')`,
        [SITE.site_key, 'x'.repeat(200), sha('a')]
      )
      await pool.query(
        `insert into site_cms_change (site_key, source, cms_actor, resource_type, op, occurred_at, cursor_key)
         values ($1, 'wordpress-tracy-log', null, 'plugin', 'install', '2026-09-20T09:00:00Z', '1@x')`,
        [SITE.site_key]
      )
      const runJob = async () => ({ ok: true, output: JSON.stringify({ ok: true, rows: [] }) })
      const before = await readActivity(pool, SITE, { runJob })

      for (const f of all) if (f >= '048') copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
      const { applied } = await migrate(pool, dir, { lockId: 48_049 })
      // 048 and 049 first, then whatever later migration exists (050 turn reply, …).
      assert.deepEqual(applied.slice(0, 2), ['048-activity-evidence.sql', '049-site-operation.sql'])

      const { rows } = await pool.query(`select request_state from site_turn`)
      assert.equal(rows[0].request_state, null, 'no backfill: legacy stays null')
      const { rows: cms } = await pool.query(`select producer, change_type from site_cms_change`)
      assert.deepEqual(cms[0], { producer: null, change_type: null })

      const after = await readActivity(pool, SITE, { runJob })
      assert.deepEqual(after, before, 'V1 reads the same rows the same way after the migrations')

      const v2 = await readActivityV2(pool, SITE, { runJob })
      const turnItem = v2.items.find((i) => i.kind === 'turn')
      assert.equal(turnItem.request.state, 'unknown', 'a 200-character legacy title is not called truncated')
      const cmsItem = v2.items.find((i) => i.kind === 'cms-change')
      assert.equal(cmsItem.origin.source, 'automatic')
      assert.equal(cmsItem.origin.basis, 'hook-history')

      // The turn door now writes the state.
      await openTurn(pool, {
        turnId: 's2:1',
        siteKey: SITE.site_key,
        actor: 'mai@example.test',
        title: 'Change the badge',
        source: 'panel'
      })
      await openTurn(pool, {
        turnId: 's3:1',
        siteKey: SITE.site_key,
        actor: 'mai@example.test',
        title: titleWithin('word '.repeat(1000), 4000),
        source: 'panel',
        requestState: requestStateFor('word '.repeat(1000), 4000)
      })
      const { rows: states } = await pool.query(
        `select turn_id, request_state from site_turn where turn_id in ('s2:1', 's3:1') order by turn_id`
      )
      assert.deepEqual(
        states.map((r) => r.request_state),
        ['full', 'truncated']
      )
    } finally {
      await scratch.close()
    }
  })
})
