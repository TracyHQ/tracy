/**
 * `recorded-door.mjs`: a shell write of what a recorded door writes is refused with that door's call
 * (ladder DL14/DL15 on dsl2jo, 14/10/2026). The first command is the one the agent ran, word for word.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recordedDoorRefusal } from '../src/host/recorded-door.mjs'

/** The DL14 command: the site renamed through Joomla's console, then read back. */
const DL14 =
  'cd /site/dsl2jo && php .webroot/cli/joomla.php config:set sitename="Street Bakery" --no-interaction 2>&1 | tail -5; php .webroot/cli/joomla.php config:get sitename'

test('🔒 DL14: renaming the site with config:set is refused, and the refusal names site.identity’s recorded set', () => {
  const reason = recordedDoorRefusal('bash', { command: DL14, description: 'Rename the site' })
  assert.ok(reason !== null)
  assert.match(reason, /no receipt records it, so the customer could not ask you to undo it/)
  assert.match(reason, /tracy_site site\.identity \{operation:"set", fields:\{sitename:"<the new value>"\}\}/)
  assert.match(reason, /apply\.revert undoes it/)
})

test('every option site.identity writes is guarded, in each spelling the console takes', () => {
  for (const [command, option] of [
    ['php cli/joomla.php config:set MetaDesc="Fresh bread daily"', 'MetaDesc'],
    ['php cli/joomla.php config:set sitename_pagetitles=2', 'sitename_pagetitles'],
    ["php cli/joomla.php config:set 'sitename=Street Bakery'", 'sitename'],
    ['php cli/joomla.php config:set --no-interaction caching=1 sitename="A"', 'sitename'],
    ['echo start\nphp cli/joomla.php config:set sitename=X', 'sitename']
  ]) {
    const reason = recordedDoorRefusal('bash', { command })
    assert.ok(reason !== null, command)
    assert.match(reason, new RegExp(`fields:\\{${option}:`), command)
  }
  // The other shells the comment fence knows carry the command under their own argument.
  assert.ok(recordedDoorRefusal('pwsh', { command: 'php cli/joomla.php config:set sitename=X' }) !== null)
  assert.ok(
    recordedDoorRefusal('terminal_send', { text: 'php cli/joomla.php config:set sitename=X\n' }) !== null
  )
})

test('WordPress: the site title and tagline through wp-cli are refused for content.update {kind:"option"}', () => {
  for (const [command, option] of [
    ['wp option update blogname "Street Bakery"', 'blogname'],
    ['wp --allow-root option update blogdescription "Fresh bread"', 'blogdescription'],
    ["cd .webroot && wp option set 'blogname' X", 'blogname']
  ]) {
    const reason = recordedDoorRefusal('bash', { command })
    assert.ok(reason !== null, command)
    assert.match(reason, new RegExp(`content\\.update \\{kind:"option", key:"${option}", fields:\\{value:`))
  }
})

test('nothing else is refused: reads, other options, other tools, other commands', () => {
  for (const command of [
    'php cli/joomla.php config:get sitename',
    'php cli/joomla.php config:set caching=1',
    'php cli/joomla.php config:set debug=0 && echo sitename=done',
    'wp option get blogname',
    'wp option update permalink_structure "/%postname%/"',
    'grep -rn sitename .webroot/templates',
    'echo "config:set is a Joomla command"'
  ])
    assert.equal(recordedDoorRefusal('bash', { command }), null, command)
  assert.equal(recordedDoorRefusal('edit', { command: DL14 }), null, 'a file tool is the path fence’s')
  assert.equal(recordedDoorRefusal('bash', null), null)
  assert.equal(recordedDoorRefusal('bash', { command: 42 }), null)
  assert.equal(recordedDoorRefusal(undefined, { command: DL14 }), null)
})

test('🔒 a site whose plugin lacks the door keeps the shell: no road is closed with none left', () => {
  assert.equal(recordedDoorRefusal('bash', { command: DL14 }, { missing: ['site.identity'] }), null)
  assert.ok(recordedDoorRefusal('bash', { command: DL14 }, { missing: ['template.siteSettings'] }) !== null)
  const wp = 'wp option update blogname X'
  assert.equal(recordedDoorRefusal('bash', { command: wp }, { missing: ['content.update'] }), null)
})

// ── as the SHIPPED plugin wires it (`lib/index.js`) ─────────────────────────────────────────────────

test('🔒 the shipped plugin denies DL14’s command before it runs; a plain shell command goes on to the chain', async () => {
  const { apply } = await import('../lib/index.js')
  /** @type {Map<string, Function[]>} */
  const listeners = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: () => () => {} },
      effect: (setup) => void setup(),
      on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      get: (name) => (name === 'sessions' ? { get: () => ({ snapshotEvents: () => [] }) } : undefined)
    },
    {}
  )
  const [pre] = /** @type {Function[]} */ (listeners.get('tools/pre-execute'))
  let passed = 0
  const next = async () => {
    passed += 1
    return { kind: 'allow' }
  }
  const shell = (/** @type {string} */ command) => ({
    name: 'bash',
    arguments: { command },
    callId: 'call-sh',
    agent: { session: { id: 'session-dl14', header: { cwd: '/site/dsl2jo' } } }
  })
  const errors = console.error
  console.error = () => {}
  try {
    const denied = await pre(shell(DL14), next)
    assert.equal(denied.kind, 'deny')
    assert.match(denied.reason, /tracy_site site\.identity/)
    assert.equal(passed, 0, 'a denied command reaches no later listener')
    assert.deepEqual(await pre(shell('php .webroot/cli/joomla.php config:get sitename'), next), {
      kind: 'allow'
    })
    assert.equal(passed, 1)
  } finally {
    console.error = errors
  }
})
