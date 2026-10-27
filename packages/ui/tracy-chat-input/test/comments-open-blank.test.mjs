/**
 * Comments open a blank conversation (plan "comment review", stand E2E M2). The 29/09 decision that
 * comments merely existing made a session not blank was reversed 01/10 (start screen Case 2): the
 * predicate index.tsx hands the definition is now the person's ask (`comments-wanted.test.mjs`). The
 * tests below drive the mechanics with a stand-in predicate, which they still hold.
 *
 * Driven through dsh's REAL code, bundled with esbuild: the conversation assembler
 * (`ConversationNodeAssembler`, whose `activityTargets()` feeds the snapshot's `activeTargets`),
 * `conversationPhase` (untouched), and the three components that decide what a blank session shows —
 * `ConversationHeader` (hides the session chrome while blank), `ConversationSessionHeader` (the tab
 * strip) and `DefaultConversationViews` (renders the selected view, or nothing while blank). Tracy's
 * part is `commentsViewDefinition` from `comment-view.mjs`, which `index.tsx` registers.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { commentsViewDefinition } from '../src/client/comment-view.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const conv = path.resolve(
  pkgRoot,
  '../../../vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client'
)
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let dsh

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-blank-'))
  const outfile = path.join(outDir, 'dsh.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement as h } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        export { ConversationNodeAssembler } from ${JSON.stringify(path.join(conv, 'conversation/assembler.ts'))}
        export { conversationPhase } from ${JSON.stringify(path.join(conv, 'contract/snapshot.ts'))}
        import { ConversationHeader } from ${JSON.stringify(path.join(conv, 'skeleton/ConversationHeader.tsx'))}
        import { ConversationSessionHeader } from ${JSON.stringify(path.join(conv, 'skeleton/ConversationSession.tsx'))}
        import { DefaultConversationViews } from ${JSON.stringify(path.join(conv, 'skeleton/DefaultConversationViews.tsx'))}

        const read = (value) => (select) => select(value)
        /** What a blank session with this conversation snapshot shows, the selected view being view. */
        export function shows({ session, conversation, tabs, view }) {
          const slots = []
          const renderSlot = (name, props, opts) => (slots.push({ name, props, opts }), null)
          renderToStaticMarkup(h(ConversationHeader, { sessionId: 's-1', useSession: read(session), useConversation: read(conversation), renderSlot }))
          const hideChrome = slots.find((s) => s.name === 'conversation.session.header').props.hideChrome
          const header = renderToStaticMarkup(h(ConversationSessionHeader, {
            sessionId: 's-1', hideChrome, useSessions: read({ byId: {} }), useConversationViews: read(tabs),
            useStore: read({ view, draft: '', viewRequest: null }), renderSlot, open: () => {}, selectView: () => {}, t: (k) => k
          }))
          renderToStaticMarkup(h(DefaultConversationViews, {
            view: undefined, useSession: read(session), useConversation: read(conversation), useConversationViews: read(tabs),
            useInput: read({ draft: '' }), inputActions: { setDraft: () => {} }, useStore: read({ view, draft: '', viewRequest: null }),
            actions: { setDraft: () => {}, completeViewRequest: () => {} }, renderSlot, bindDraftMirror: () => () => {},
            openView: () => {}, useInspectCall: read(undefined)
          }))
          const rendered = slots.find((s) => s.name === 'conversation.view')
          return {
            hideChrome,
            tabs: [...header.matchAll(/role="tab"[^>]*>([^<]*)</g)].map((m) => m[1]),
            view: rendered ? rendered.opts.only : null
          }
        }`,
      resolveDir: conv,
      loader: 'tsx'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'local-css' },
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'error'
  })
  dsh = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** A blank session as dsh keeps it before the first message. */
const BLANK = { blank: true, awaitingFirstTurn: true, running: false, promptAttempted: false }
const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'tracy-comments', label: 'Comments' }
]

/** The real assembler of one session, with only the Comments definition registered. */
function assembly(count) {
  const state = { count }
  const definitions = [commentsViewDefinition('tracy-comments', () => state.count > 0)]
  const assembler = new dsh.ConversationNodeAssembler(
    { entries: () => [], fallbackEntry: () => undefined, subscribe: () => () => {} },
    { entries: () => definitions, subscribe: () => () => {} },
    { forTarget: () => undefined, subscribe: () => () => {} }
  )
  assembler.replaceWindow([], false)
  assembler.flush()
  // What index.tsx does for a session whose Browser tab lists comments; dsh's own restoreView
  // activates the selected view the same way.
  assembler.activateTarget('tracy-comments')
  const conversation = () => ({ views: new Map(), activeTargets: assembler.activityTargets() })
  return { state, assembler, conversation }
}

test('a blank session with 2 comments is active: tab strip Chat + Comments, and openView renders the view', () => {
  const { conversation } = assembly(2)
  assert.deepEqual([...conversation().activeTargets], ['tracy-comments'])
  assert.equal(dsh.conversationPhase(BLANK, conversation()), 'active')
  assert.deepEqual(dsh.shows({ session: BLANK, conversation: conversation(), tabs: TABS, view: null }), {
    hideChrome: false,
    tabs: ['Chat', 'Comments'],
    view: 'chat'
  })
  // openView('tracy-comments') writes the store's view; the same blank session now renders it.
  assert.equal(
    dsh.shows({ session: BLANK, conversation: conversation(), tabs: TABS, view: 'tracy-comments' }).view,
    'tracy-comments'
  )
})

test('a blank session with 0 comments stays blank: no tab strip, no view — the hero shows', () => {
  const { conversation } = assembly(0)
  assert.deepEqual([...conversation().activeTargets], [])
  assert.equal(dsh.conversationPhase(BLANK, conversation()), 'blank')
  assert.deepEqual(
    dsh.shows({ session: BLANK, conversation: conversation(), tabs: TABS, view: 'tracy-comments' }),
    {
      hideChrome: true,
      tabs: [],
      view: null
    }
  )
})

test('the answer follows the comment lists: cleared to 0 the session is blank again at the next read', () => {
  const { state, conversation } = assembly(2)
  assert.equal(dsh.conversationPhase(BLANK, conversation()), 'active')
  state.count = 0
  assert.equal(dsh.conversationPhase(BLANK, conversation()), 'blank')
})

test('the definition builds nothing from events: an empty builder, the target named tracy-comments', () => {
  const definition = commentsViewDefinition('tracy-comments', () => true)
  assert.equal(definition.target, 'tracy-comments')
  const builder = definition.create()
  assert.equal(builder.empty, null)
  assert.equal(builder.replace({ nodes: [], timeline: {} }), null)
  assert.equal(builder.apply({ upserts: [], timeline: {} }), null)
})
