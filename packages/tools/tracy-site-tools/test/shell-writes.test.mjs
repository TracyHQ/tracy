// A shell command with a consequence asks the customer first, as the doors do (`src/host/shell-writes.mjs`,
// ADR 0034, council 19/10/2026 B4): asked, not locked — the same command runs once after the yes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shellConsequence } from '../src/host/shell-writes.mjs'

const reasonOf = (command, name = 'bash') => shellConsequence(name, { command })?.reason ?? null

test('the writes a shell reaches beside the doors are found by their words', () => {
  const cases = [
    ['wp post delete 12 --force', 'deletes'],
    ['wp --path=/var/www/html --allow-root post delete 12', 'deletes'],
    ['cd .webroot && wp menu item delete 7', 'deletes'],
    ['wp term delete category 4', 'deletes'],
    ['wp site empty --yes', 'deletes'],
    ['wp post update 12 --post_status=draft', 'hides'],
    ["wp post update 12 --post_status='trash'", 'hides'],
    ["wp search-replace 'Shop' 'Store' --all-tables", 'many'],
    ['wp db import backup.sql', 'database'],
    ['wp db reset --yes', 'database'],
    ['wp db query "UPDATE wp_posts SET post_status=\'draft\' WHERE ID=5"', 'database'],
    ['mysql -u root site -e "SELECT 1; DELETE FROM wp_posts WHERE ID=5"', 'database'],
    ['mariadb site < /tmp/dump.sql', 'database'],
    ['sqlite3 data.db "update ec_content set status=\'draft\'"', 'database'],
    ['wp plugin install contact-form-7 --activate', 'code'],
    ['wp theme activate twentytwentyfive', 'code'],
    ['wp core update', 'code'],
    ['wp option update permalink_structure "/%postname%/"', 'site'],
    ['php .webroot/cli/joomla.php extension:remove 42', 'code'],
    ['php cli/joomla.php database:import --folder=/tmp/x', 'code']
  ]
  for (const [command, reason] of cases) assert.equal(reasonOf(command), reason, command)
  assert.equal(reasonOf('wp post delete 3', 'pwsh'), 'deletes')
  assert.equal(shellConsequence('terminal_send', { text: 'wp post delete 3\n' })?.reason, 'deletes')
})

test('reads, dry runs and words that only look alike run as they are', () => {
  for (const command of [
    'wp post list --post_type=page',
    'wp post get 12 --field=post_status',
    'wp post update 12 --post_title="Hello"',
    "wp search-replace 'Shop' 'Store' --dry-run",
    'wp db query "SELECT ID, post_title FROM wp_posts"',
    'wp db export /tmp/before.sql',
    'mysqldump site > /tmp/before.sql',
    'mysql site -e "SELECT option_value FROM wp_options"',
    'echo "update done" && wp plugin list',
    'wp option get blogname',
    'php .webroot/cli/joomla.php config:get sitename',
    'grep -rn "DELETE FROM" .webroot/wp-includes'
  ])
    assert.equal(reasonOf(command), null, command)
  assert.equal(
    shellConsequence('edit', { command: 'wp post delete 3' }),
    null,
    'a file tool is the path fence’s'
  )
  assert.equal(shellConsequence('bash', null), null)
  assert.equal(shellConsequence('bash', { command: 42 }), null)
})

// ── as the SHIPPED plugin wires it (`lib/index.js`) ─────────────────────────────────────────────────

test('🔒 the shipped plugin asks before a shell delete, and the very same command runs once after the yes', async () => {
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
  const results = /** @type {Function[]} */ (listeners.get('tools/result') ?? [])
  let passed = 0
  const next = async () => {
    passed += 1
    return { kind: 'allow' }
  }
  const agent = { session: { id: 'session-sh', header: { cwd: '/site/shop1' } } }
  const shell = (/** @type {string} */ command) => ({
    name: 'bash',
    arguments: { command },
    callId: 'call-sh',
    agent
  })
  const errors = console.error
  console.error = () => {}
  try {
    const denied = await pre(shell('wp post delete 12 --force'), next)
    assert.equal(denied.kind, 'deny')
    assert.match(denied.reason, /tracy_site content\.delete/)
    assert.equal(passed, 0, 'nothing ran before the question')
    const ask = JSON.parse(/ask_user_question (\{.*\}) — the id as given/.exec(denied.reason)?.[1] ?? 'null')
    const [q] = ask.questions
    assert.match(q.id, /^confirm-/)

    // The card itself passes the card check; the customer says yes.
    assert.deepEqual(await pre({ name: 'ask_user_question', arguments: ask, agent }, next), { kind: 'allow' })
    for (const fn of results)
      fn(
        { name: 'ask_user_question', arguments: ask, agent },
        { isError: false, value: { answers: [{ id: q.id, selected: [q.options[0].label] }] } }
      )

    assert.deepEqual(await pre(shell('wp post delete 12 --force'), next), { kind: 'allow' })
    assert.equal((await pre(shell('wp post delete 12 --force'), next)).kind, 'deny', 'the yes is spent')
    assert.equal(
      (await pre(shell('wp post delete 13 --force'), next)).kind,
      'deny',
      'another command asks anew'
    )
    assert.deepEqual(await pre(shell('wp post list'), next), { kind: 'allow' })
  } finally {
    console.error = errors
  }
})
