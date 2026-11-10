import assert from 'node:assert/strict'
import test from 'node:test'
import { dismissWelcome, prepareViewer, viewerWorkspaceUrl } from '../e2e/import-contract-viewer.mjs'

test('supported preview deep link preserves session and requests the copy root in edit mode', () => {
  const url = new URL(viewerWorkspaceUrl('/site/s/session-abc?tab=files', 'http://tracy.test:51710'))
  assert.equal(url.pathname, '/site/s/session-abc')
  assert.equal(url.searchParams.get('tab'), 'files')
  assert.equal(url.searchParams.get('open'), 'browser')
  assert.equal(url.searchParams.get('page'), '/')
  assert.equal(url.searchParams.get('mode'), 'edit')
})

test('closed pane opens and asynchronous copy navigation is awaited without accepting the source frame', async () => {
  const main = { url: () => 'http://tracy.test/site/' }
  const source = { url: () => 'https://original.example/' }
  const copy = { url: () => 'http://copy.tracy.test:51710/' }
  let opened = false
  let polls = 0
  const page = {
    getByRole: (_, { name }) => ({
      isVisible: async () => name === 'Open right sidebar' && !opened,
      click: async () => {
        opened = true
      }
    }),
    locator: () => ({
      isVisible: async () => false,
      waitFor: async () => {},
      first: () => ({ isVisible: async () => false }),
      last: () => ({ waitFor: async () => {} })
    }),
    frames: () => (polls ? [main, source, copy] : [main, source]),
    mainFrame: () => main,
    waitForTimeout: async () => {
      polls++
    }
  }
  assert.equal(await prepareViewer(page, 'http://copy.tracy.test:51710/index.php'), copy)
  assert.equal(opened, true)
  assert.equal(polls, 1)
})

test('a missing viewer fails within the caller budget before any model submission', async () => {
  const page = {
    getByRole: () => ({ isVisible: async () => false }),
    locator: () => ({
      isVisible: async () => false,
      waitFor: async () => {},
      first: () => ({ isVisible: async () => false }),
      last: () => ({ waitFor: async () => {} })
    })
  }
  await assert.rejects(
    prepareViewer(page, 'http://copy.test/', { timeoutMs: 0 }),
    /No live imported-copy viewer/
  )
})

test('hydration removing the open button is retried while waiting for copy navigation', async () => {
  const main = { url: () => 'http://tracy.test/' }
  const copy = { url: () => 'http://copy.test/' }
  let hydrated = false
  const page = {
    getByRole: (_, { name }) => ({
      isVisible: async () => name === 'Open right sidebar' && !hydrated,
      click: async () => {
        hydrated = true
        throw new Error('button detached')
      }
    }),
    locator: () => ({
      isVisible: async () => false,
      waitFor: async () => {},
      first: () => ({ isVisible: async () => false }),
      last: () => ({ waitFor: async () => {} })
    }),
    frames: () => (hydrated ? [main, copy] : [main]),
    mainFrame: () => main,
    waitForTimeout: async () => {}
  }
  assert.equal(await prepareViewer(page, 'http://copy.test/'), copy)
})

test('visible Welcome dialog is closed before the measured send', async () => {
  const actions = []
  const page = {
    locator: (selector) => ({
      isVisible: async () => selector === '.tv-welcome .tv-wl-close',
      click: async () => actions.push('close'),
      waitFor: async ({ state }) => actions.push(`wait-${state}`),
      first: () => ({ isVisible: async () => false })
    })
  }
  await dismissWelcome(page)
  assert.deepEqual(actions, ['close', 'wait-hidden', 'wait-visible', 'wait-hidden'])
})

test('guided tour is dismissed before a measured send', async () => {
  const actions = []
  const page = {
    locator: (selector) => ({
      isVisible: async () => selector === '.tv-tour',
      waitFor: async ({ state }) => actions.push(`${selector}:${state}`),
      first: () => ({
        isVisible: async () => selector === '.tv-tour .tv-tour-link',
        click: async () => actions.push('tour-later')
      })
    })
  }
  await dismissWelcome(page)
  assert.deepEqual(actions, ['tour-later', '.tv-tour:hidden', '.tracy-boot-cover:hidden'])
})
