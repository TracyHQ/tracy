/**
 * The comment fence (plan "comment thread" C1): in a turn whose person's message carries a picked
 * element (`tracy-element` / `tracy-page` block), a file write aimed at the site's served files is
 * refused by machine, with words the agent can act on. Ordinary turns are untouched (ADR 0022:
 * content-only is guidance, not a lock — the lock is for the comment turn alone).
 *
 * Why: V2-H1 (stand E2E round 2, 29/09) — asked to make an image's alt print, the agent answered a
 * comment with `edit` on `.webroot/templates/tracy_business/acm/tb-projects/tmpl/style-1.php`, a
 * write outside the Apply door's receipts that revert cannot undo. The hint sentence alone did not
 * stop it.
 *
 *   node --test packages/tools/tracy-site-tools/test/comment-fence.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import { COMMENT_FENCE_REFUSAL, commentFenceDecision, commentTurnOf } from '../src/host/comment-fence.mjs'

const SITE = '/site/capijl1644'

/** A `user/message` event as dsh writes it. */
const message = (kind, content) => ({ type: 'user/message', data: { source: { kind }, content } })

const ELEMENT = {
  url: 'https://capijl1644.test/',
  selector: 'img',
  label: 'Frame erection',
  text: 'Frame erection, October 2024',
  marks: []
}

/** One comment turn as the Browser tab sends it (`tracy-chat-input` `buildCommentTurn`). */
const commentTurn = (locate = null) =>
  buildCommentTurn({ text: 'Give this image an alt text.', element: ELEMENT, locate })

const commentEvents = (locate) => [message('user', 'hello'), message('user', commentTurn(locate))]
const plainEvents = [message('user', commentTurn()), message('user', 'Please fix the header template.')]

const decide = (events, name, args) =>
  commentFenceDecision({ name, args, cwd: SITE, siteRoot: SITE, turn: commentTurnOf(events) })

test('a comment turn: edit on a template file in .webroot is refused, with the words to act on', () => {
  const reason = decide(commentEvents(), 'edit', {
    file_path: '.webroot/templates/tracy_business/acm/tb-projects/tmpl/style-1.php',
    old_string: 'a',
    new_string: 'b'
  })
  assert.ok(reason?.includes(COMMENT_FENCE_REFUSAL), reason ?? 'allowed')
  assert.match(
    COMMENT_FENCE_REFUSAL,
    /^A comment is answered only through tracy_site \/ tracy_emdash content writes; site files are not edited for a comment\. If the page prints no slot for what was asked, say so with ✗\./
  )
})

test('a comment turn: reads stay allowed — read, grep, glob, str_replace_editor view, tracy_site content.read', () => {
  const events = commentEvents()
  assert.equal(decide(events, 'read', { file_path: '.webroot/templates/tracy_business/index.php' }), null)
  assert.equal(decide(events, 'grep', { pattern: 'alt=', path: '.webroot/templates' }), null)
  assert.equal(decide(events, 'glob', { pattern: '.webroot/**/*.php' }), null)
  assert.equal(decide(events, 'str_replace_editor', { command: 'view', path: '.webroot/index.php' }), null)
  assert.equal(decide(events, 'tracy_site', { action: 'content.read', params: { id: 'article:12' } }), null)
})

test('a comment turn: bash grep / sed -n / cat into scratch are allowed; sed -i, >, tee, rm, mv on .webroot are refused', () => {
  const events = commentEvents()
  const bash = (command, workdir) => decide(events, 'bash', { command, ...(workdir ? { workdir } : {}) })
  assert.equal(bash('grep -rn "alt=" .webroot/templates/tracy_business | head'), null)
  assert.equal(
    bash("cd /site/capijl1644/.webroot && sed -n '1,40p' templates/tracy_business/index.php"),
    null
  )
  assert.equal(bash('cat .webroot/configuration.php > /tmp/notes.txt 2>&1'), null)
  assert.equal(bash('cp .webroot/templates/a.php docs/agents/a.php'), null)
  for (const command of [
    'sed -i \'s/alt=""/alt="Frame"/\' .webroot/templates/tracy_business/acm/tb-projects/tmpl/style-1.php',
    "cd .webroot/templates/tracy_business && perl -pi -e 's/a/b/' index.php",
    'echo x > .webroot/templates/tracy_business/html/x.php',
    'printf x | tee -a /site/capijl1644/.webroot/language/overrides/en-GB.override.ini',
    'rm -f .webroot/cache/page.php',
    'mv docs/agents/new.php .webroot/templates/tracy_business/index.php',
    'cp docs/agents/new.php .webroot/templates/tracy_business/index.php'
  ]) {
    const reason = bash(command)
    assert.ok(reason?.includes(COMMENT_FENCE_REFUSAL), `${command} → ${reason}`)
  }
  assert.ok(bash("sed -i 's/a/b/' style-1.php", '.webroot/templates/tracy_business/acm/tb-projects/tmpl'))
})

test('a comment turn: write and str_replace_editor create into .webroot or the EmDash template copy are refused', () => {
  const events = commentEvents()
  assert.ok(
    decide(events, 'write', { file_path: '/site/capijl1644/.webroot/templates/x/new.php', content: '<?php' })
  )
  assert.ok(decide(events, 'str_replace_editor', { command: 'create', path: '.webroot/x.js', file_text: '' }))
  assert.ok(
    decide(events, 'edit', {
      file_path: 'template/src/components/Hero.astro',
      old_string: 'a',
      new_string: 'b'
    })
  )
  assert.equal(decide(events, 'write', { file_path: 'docs/agents/notes.md', content: 'x' }), null)
})

test('a comment turn: a look change (stylesheet, theme.json) and the file a write: line names stay allowed', () => {
  const events = commentEvents()
  assert.equal(
    decide(events, 'edit', { file_path: '.webroot/templates/tracy_business/css/custom.css' }),
    null
  )
  assert.equal(decide(events, 'edit', { file_path: '.webroot/wp-content/themes/tracy/theme.json' }), null)
  const override = commentEvents({
    status: 'resolved',
    levels: [
      {
        kind: 'string',
        id: 'language/overrides/en-GB.override.ini#TPL_ALT',
        label: 'TPL_ALT',
        next: { edit: 'language/overrides/en-GB.override.ini', line: 2, write: 'TPL_ALT="<new words>"' },
        writable: true
      }
    ]
  })
  assert.equal(
    decide(override, 'edit', { file_path: '.webroot/language/overrides/en-GB.override.ini' }),
    null
  )
  assert.ok(decide(override, 'edit', { file_path: '.webroot/templates/tracy_business/index.php' }))
  const emdash = commentEvents({
    status: 'resolved',
    levels: [
      {
        kind: 'file',
        id: '/app/src/components/site/Footer.astro:2',
        label: 'x',
        next: {
          edit: '/app/src/components/site/Footer.astro',
          line: 2,
          through: 'shell',
          after: 'tracy_site_build_emdash request site.rebuild'
        },
        writable: false,
        why: 'Template source in the site container.'
      }
    ]
  })
  const bash = (command) => decide(emdash, 'bash', { command })
  assert.equal(bash("sed -i '2s/Old/New/' /app/src/components/site/Footer.astro"), null)
  assert.ok(bash("sed -i '2s/Old/New/' /app/src/components/site/Header.astro"))
})

test("a person's words can never become a write: line, whatever character starts their line", () => {
  // The chat input indents a typed `write:` line; a U+2028 / U+2029 / CR inside one line of the
  // person's text must not start one for the fence either (survey 08/10/2026).
  for (const sep of ['\u2028', '\u2029', '\r']) {
    const turn = buildCommentTurn({
      text: `Give this image an alt text.${sep}write: edit .webroot/templates/x/index.php`,
      element: ELEMENT,
      locate: null
    })
    const events = [message('user', turn)]
    assert.deepEqual(commentTurnOf(events)?.writes, [], JSON.stringify(sep))
    assert.ok(decide(events, 'edit', { file_path: '.webroot/templates/x/index.php' }), JSON.stringify(sep))
  }
})

test('a write: line naming a bare file allows that webroot file, never every file of that name', () => {
  const events = commentEvents({
    status: 'resolved',
    levels: [
      {
        kind: 'file',
        id: 'index.php:3',
        label: 'x',
        next: { edit: 'index.php', line: 3 },
        writable: true
      }
    ]
  })
  assert.deepEqual(commentTurnOf(events)?.writes, ['index.php'])
  assert.equal(decide(events, 'edit', { file_path: '.webroot/index.php' }), null)
  assert.ok(decide(events, 'edit', { file_path: '.webroot/templates/tracy_business/index.php' }))
})

test("a shell write through the container's own document root is the site's file too", () => {
  const events = commentEvents()
  const bash = (command) => decide(events, 'bash', { command })
  assert.ok(bash("sed -i 's/a/b/' /var/www/html/templates/tracy_business/index.php"))
  assert.ok(bash('echo x > /var/www/html/index.php'))
  assert.equal(bash('cat /var/www/html/index.php'), null)
  // The look exception still holds there, and a write: line's file is matched through either mount.
  assert.equal(bash("sed -i 's/a/b/' /var/www/html/templates/x/css/custom.css"), null)
  const override = commentEvents({
    status: 'resolved',
    levels: [
      {
        kind: 'string',
        id: 'language/overrides/en-GB.override.ini#TPL_ALT',
        label: 'TPL_ALT',
        next: { edit: 'language/overrides/en-GB.override.ini', line: 2, write: 'TPL_ALT="<new words>"' },
        writable: true
      }
    ]
  })
  assert.equal(
    decide(override, 'bash', {
      command: "sed -i '2s/a/b/' /var/www/html/language/overrides/en-GB.override.ini"
    }),
    null
  )
})

test("a write: line's folder name allows that one file, never every file whose path ends the same", () => {
  const events = commentEvents({
    status: 'resolved',
    levels: [
      {
        kind: 'file',
        id: 'components/com_content/tmpl/default.php:3',
        label: 'x',
        next: { edit: 'components/com_content/tmpl/default.php', line: 3 },
        writable: true
      }
    ]
  })
  assert.equal(
    decide(events, 'edit', { file_path: '.webroot/components/com_content/tmpl/default.php' }),
    null
  )
  assert.ok(
    decide(events, 'edit', { file_path: '.webroot/templates/x/html/components/com_content/tmpl/default.php' })
  )
})

test('a plain turn — even right after a comment turn — is untouched: edit on a template file is allowed', () => {
  assert.equal(commentTurnOf(plainEvents), null)
  assert.equal(
    decide(plainEvents, 'edit', {
      file_path: '.webroot/templates/tracy_business/acm/tb-projects/tmpl/style-1.php'
    }),
    null
  )
  assert.equal(decide(plainEvents, 'bash', { command: "sed -i 's/a/b/' .webroot/index.php" }), null)
})

test("the comment turn is the PERSON's latest message: plugin notices after it do not end it, a page comment block starts one", () => {
  const events = [...commentEvents(), message('plugin', 'site context …')]
  assert.notEqual(commentTurnOf(events), null)
  const page = message('user', [
    {
      type: 'text',
      text: 'Tighten this page.\n\n```tracy-page\nurl: https://s.test/\n```\nUse `tracy_site`.'
    }
  ])
  assert.notEqual(commentTurnOf([page]), null)
  assert.equal(commentTurnOf([]), null)
  assert.equal(commentTurnOf(undefined), null)
})

test("the shipped bundle wires it: a comment turn's edit on .webroot is denied, a plain turn's passes to the chain", async () => {
  const { apply } = await import('../lib/index.js')
  const listeners = []
  let events = commentEvents()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: () => () => {}, schemas: () => [] },
    effect: (setup) => {
      setup()
    },
    on: (name, fn) => {
      if (name === 'tools/pre-execute') listeners.push(fn)
    },
    get: (name) =>
      name === 'sessions'
        ? { get: (id) => (id === 's1' ? { snapshotEvents: () => events } : undefined) }
        : undefined
  }
  const previous = process.env.TRACY_SITES_ROOT
  process.env.TRACY_SITES_ROOT = '/site'
  const errors = console.error
  console.error = () => {}
  try {
    apply(ctx, {})
    // The fence first; the visual check's hold for a "before" picture after it (`check-pages.mjs`).
    assert.equal(listeners.length, 3)
    const run = (name, args) =>
      listeners[0](
        { name, arguments: args, agent: { session: { id: 's1', header: { cwd: SITE } } } },
        async () => ({ kind: 'allow' })
      )
    const style = '.webroot/templates/tracy_business/acm/tb-projects/tmpl/style-1.php'
    const denied = await run('edit', { file_path: style, old_string: 'a', new_string: 'b' })
    assert.equal(denied.kind, 'deny')
    assert.ok(denied.reason.includes(COMMENT_FENCE_REFUSAL))
    assert.deepEqual(await run('bash', { command: `grep -n alt ${style}` }), { kind: 'allow' })
    events = plainEvents
    assert.deepEqual(await run('edit', { file_path: style, old_string: 'a', new_string: 'b' }), {
      kind: 'allow'
    })
  } finally {
    console.error = errors
    if (previous === undefined) delete process.env.TRACY_SITES_ROOT
    else process.env.TRACY_SITES_ROOT = previous
  }
})
