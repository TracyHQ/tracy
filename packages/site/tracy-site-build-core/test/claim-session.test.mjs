/**
 * The second half of a press, in the site it claimed: the folder becomes a workspace, ONE session
 * stands in it with the CMS's persona, and the Build tab opens there. A carry for another site is
 * not this page's business, and a session already standing is opened rather than doubled.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { claimHere, openClaimedSite } from '../src/client/claim-session.mjs'

const carry = {
  id: 'tracy-business',
  platform: 'emdash',
  answers: { name: 'Granite Works' },
  buildId: 'b-1',
  siteKey: 'granite-works.localhost',
  label: 'granite-works'
}

function services({
  sessions = {},
  current = undefined,
  workspaceId = 'w-1',
  phases = ['ready'],
  // What dsh knows and the list row does not yet: which blank session stands in which folder.
  blankOf = {}
} = {}) {
  let phaseAt = 0
  const log = []
  const byId = { ...sessions }
  let now = current
  return {
    log,
    byId,
    services: {
      workspaces: {
        create: async ({ path }) => {
          log.push(`workspace ${path}`)
          return { workspaceId }
        }
      },
      sessions: {
        create: async (input) => {
          log.push(`session ${JSON.stringify(input)}`)
          byId['s-new'] = { cwd: '/site/granite-works' }
          return 's-new'
        },
        refresh: async () => {
          log.push('refresh')
        },
        list: {
          // dsh 0.1.6-alpha.2 shape: the main view's session is the one `retainedBy.mainView` holds.
          getSnapshot: () => ({
            byId: Object.fromEntries(
              Object.entries(byId).map(([id, row]) => [
                id,
                { ...row, retainedBy: id === now ? { mainView: 1 } : {} }
              ])
            ),
            phase: phases[Math.min(phaseAt++, phases.length - 1)]
          })
        }
      },
      // `uiWorkspace` is a service, read through `get`, as on a real dsh context.
      get: (name) =>
        name === 'uiWorkspace'
          ? {
              // dsh 0.1.6: reuses a BLANK session already standing in the workspace's own folder
              // and only makes one when there is none (`ui-workspace/navigation.ts`).
              connectWorkspace: async (id) => {
                log.push(`connect ${id}`)
                const blank = Object.entries(blankOf).find(([, path]) => path === '/site/granite-works')?.[0]
                if (blank !== undefined) {
                  byId[blank] = { ...byId[blank], cwd: '/site/granite-works' }
                  return blank
                }
                byId['s-new'] = { cwd: '/site/granite-works' }
                log.push('session {"workspaceId":"w-1"}')
                return 's-new'
              },
              openSession: (id) => {
                log.push(`open ${id}`)
                // dsh switches a beat later; the opener must wait for it before it opens the tab.
                setTimeout(() => {
                  now = id
                }, 0)
              }
            }
          : undefined,
      remote: {
        agentPresets: {
          select: async (id, preset) => {
            log.push(`preset ${id} ${preset}`)
            return { ok: true }
          }
        }
      }
    }
  }
}

test('claimHere: only the site the carry names, and only when the claim went through', () => {
  assert.equal(claimHere(carry, 'granite-works.localhost'), carry)
  assert.equal(claimHere(carry, 'other.localhost'), null)
  assert.equal(claimHere(null, 'granite-works.localhost'), null)
  assert.equal(
    claimHere({ ...carry, siteKey: undefined }, 'granite-works.localhost'),
    null,
    'a carry before the claim'
  )
  assert.equal(claimHere({ ...carry, label: undefined }, 'granite-works.localhost'), null)
})

// 19/09, measured on the dev surface by counting every address change of one create: a site
// handed over from `/new/` ended up with TWO sessions — dsh opens the workspace and stands a blank
// session in it, and this module then made a second one of its own. The address bar showed it:
// `…/s/<first>` replaced, then `…/s/<second>` pushed, which is also a Back that leads to an
// abandoned conversation.
//
// dsh already solves this: `uiWorkspace.connectWorkspace` reuses a blank session whose `cwd` is
// the workspace's folder and creates one only when there is none. Asking for it is both fewer
// sessions and one address change less.
test('openClaimedSite: adopts the blank session dsh already stands in the folder', async () => {
  // 🔒 THE ROW dsh INSERTS FIRST CARRIES NO `cwd` — that is why this module's own scan cannot see
  // it and used to make a second session. dsh's `connectWorkspace` matches on the workspace's
  // sessionIds, not on the list row, so it finds what the scan cannot.
  const { services: s, log } = services({
    sessions: { 's-blank': { blank: true } },
    blankOf: { 's-blank': '/site/granite-works' },
    current: 's-other'
  })
  const opened = []
  const id = await openClaimedSite(carry, {
    services: s,
    openBuild: (sessionId, value) => opened.push({ sessionId, siteKey: value.siteKey }),
    wait: async () => {},
    tries: 3
  })
  assert.equal(id, 's-blank', 'the session dsh already made is the one used')
  assert.equal(
    log.some((line) => line.startsWith('session {')),
    false,
    'no second session is created for the same folder'
  )
  assert.deepEqual(opened, [{ sessionId: 's-blank', siteKey: 'granite-works.localhost' }])
})

test('openClaimedSite: registers the folder, starts one session in it, picks the CMS persona, opens the Build tab', async () => {
  const { services: s, log } = services()
  const opened = []
  const id = await openClaimedSite(carry, {
    services: s,
    openBuild: (sessionId, value) => opened.push({ sessionId, siteKey: value.siteKey }),
    wait: async () => {},
    tries: 3
  })
  assert.equal(id, 's-new')
  assert.deepEqual(log, [
    'workspace /site/granite-works',
    'connect w-1',
    'session {"workspaceId":"w-1"}',
    'preset s-new designer-emdash',
    'open s-new'
  ])
  assert.deepEqual(opened, [{ sessionId: 's-new', siteKey: 'granite-works.localhost' }])
})

test('openClaimedSite: a session already standing in the folder is opened, never doubled — and the list is awaited first', async () => {
  const { services: s, log } = services({
    sessions: { 's-old': { cwd: '/site/granite-works' } },
    current: 's-other',
    // The list is pending for the first reads, as it is on a fresh page: asked then, dsh answers
    // "no sessions" and a second conversation is made for a folder that already has one.
    phases: ['pending', 'pending', 'ready']
  })
  const opened = []
  const id = await openClaimedSite(carry, {
    services: s,
    openBuild: (sessionId) => opened.push(sessionId),
    wait: async () => {}
  })
  assert.equal(id, 's-old')
  assert.deepEqual(log, ['open s-old'])
  assert.deepEqual(opened, ['s-old'])
})

test('openClaimedSite: a shell without a workspace service answers null rather than making a session nowhere', async () => {
  const { services: s } = services()
  delete s.workspaces.create
  assert.equal(
    await openClaimedSite(carry, {
      services: s,
      openBuild: () => assert.fail('no tab without a session'),
      wait: async () => {}
    }),
    null
  )
})

test('openClaimedSite: a refused preset still leaves the customer a session and a form', async () => {
  const { services: s, log } = services()
  s.remote.agentPresets.select = async () => {
    throw new Error('refused')
  }
  const opened = []
  const id = await openClaimedSite(carry, {
    services: s,
    openBuild: (sessionId) => opened.push(sessionId),
    wait: async () => {},
    tries: 2
  })
  assert.equal(id, 's-new')
  assert.deepEqual(opened, ['s-new'])
  assert.ok(!log.some((line) => line.startsWith('preset')))
})

/**
 * Measured 17/09 on the local stack, Create with Joomla on JA Voyara: the tab was created and the
 * side card was still on the OLD session, so the open was targeted — and a targeted open does not
 * expand the panel. The customer got a chat with no side card; a reload rendered the form from the
 * state that had been written all along.
 */
test('openClaimedSite: the tab waits for the side card to arrive, so the open reveals the panel', async () => {
  const { services: s } = services()
  // dsh's list is already on the new session; the SIDE CARD adopts it two beats later.
  let listCurrent = 's-new'
  let cardOn = 's-old'
  let waits = 0
  s.sessions.list.getSnapshot = () => ({
    byId: {
      's-new': { cwd: '/site/granite-works', retainedBy: listCurrent === 's-new' ? { mainView: 1 } : {} }
    },
    phase: 'ready'
  })
  s.betterSidebar = { getSnapshot: () => ({ sessionId: cardOn }) }
  const seen = []
  const id = await openClaimedSite(carry, {
    services: s,
    openBuild: (sessionId) => seen.push({ sessionId, cardOn }),
    wait: async () => {
      waits += 1
      if (waits >= 2) cardOn = 's-new'
    }
  })
  assert.equal(id, 's-new')
  assert.deepEqual(
    seen,
    [{ sessionId: 's-new', cardOn: 's-new' }],
    'the tab opened only once the side card was on that session'
  )
  assert.ok(waits >= 2, 'it actually waited for the side card')
})

test('openClaimedSite: a shell whose side card never answers is not waited for', async () => {
  const { services: s } = services()
  s.betterSidebar = { getSnapshot: () => ({}) }
  const opened = []
  assert.equal(
    await openClaimedSite(carry, {
      services: s,
      openBuild: (sessionId) => opened.push(sessionId),
      wait: async () => {},
      tries: 3
    }),
    's-new'
  )
  assert.deepEqual(opened, ['s-new'])
})
