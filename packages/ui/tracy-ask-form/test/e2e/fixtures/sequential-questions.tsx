// Bundled into a browser by sequential-questions.test.mjs.
import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  createWaterfallRequest,
  PendingQuestion
} from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-user-questions/src/client/contract/slots'
import { AskTab } from '../../../src/client/AskTab'
import { createAskController } from '../../../src/client/ask-state'
import { en } from '../../../src/client/strings'

const listeners = new Set<() => void>()
let snapshot = new Map()
const status = {
  getSnapshot: () => snapshot,
  subscribe: (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
}
let opened = 0
const sidebar = {
  getSnapshot: () => ({ sessionId: 's1' }),
  subscribeState: () => () => {},
  isTabEnabled: () => true,
  openTab: () => {
    opened++
  },
  closeTab: () => {},
  openTabsOf: () => []
}
const controller = createAskController({
  status,
  sidebar,
  switches: { ready: Promise.resolve(), isShown: () => true, subscribe: () => () => {} },
  tabId: 'questions',
  switchId: 'tab-questions'
})
controller.start()
const root = createRoot(document.getElementById('root')!)
root.render(<AskTab sessionId="s1" status={status} controller={controller} t={(key) => en[key] ?? key} />)
let last
let call = 0
const results = []
const set = (value) => {
  snapshot = new Map(value ? [['s1', { pendingInteraction: value }]] : [])
  for (const fn of listeners) fn()
}
window.probe = {
  ask(id) {
    const p = new PendingQuestion(
      's1',
      [
        {
          id,
          question: 'Change the shared header?',
          options: [{ label: 'Yes, go ahead' }, { label: 'No, keep it' }]
        }
      ],
      `call-${++call}`
    )
    const channel = createWaterfallRequest(undefined, undefined, (channel) => p.detachWaterfall(channel))
    p.attachWaterfall(channel.channel)
    last = p
    set(p)
    channel.result.then((answer) => results.push(answer))
  },
  redeliver() {
    const p = last
    const channel = createWaterfallRequest(undefined, undefined, (channel) => p.detachWaterfall(channel))
    p.attachWaterfall(channel.channel)
    channel.result.then((answer) => results.push(answer))
  },
  clear() {
    set(null)
  },
  get() {
    return { opened, results, key: last?.key, taken: [...controller.getSnapshot().taken] }
  }
}
