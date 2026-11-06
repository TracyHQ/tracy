// Fixtures for step 9 with its repair pass (step 9b, #448): a site agent fake that receives each comment turn, records it
// and answers closed turns with the changes it claims, a scripted site check, and a fake clock. The write runs for real on
// the invented frozen files and fake site of _write-step-run.mjs. Nothing here is a real business or a real site.
import { runStepNine } from '../src/write-step-nine.js'
import { fakeSite, frozenFiles, KIT, SITE } from './_write-step-run.mjs'

/** A clock that only moves when the code under test sleeps or a fake spends time. */
export function fakeClock(start = 1_000_000) {
  const clock = {
    t: start,
    now: () => clock.t,
    sleep: async (ms) => {
      clock.t += ms
    }
  }
  return clock
}

/** One failure of a site check group, as runSiteCheck names it. */
export const failure = (group, page, slot, measured, extra = {}) => ({
  group,
  page,
  slot,
  width: null,
  measured,
  level: 'block',
  causingStep: 9,
  reason: `${group} measured ${measured}`,
  ...extra
})

/** A site check whose groups hold the failures given (red when any blocks). */
export function checkOf(failures, name = 'check') {
  const groups = new Map()
  for (const f of failures) groups.set(f.group, [...(groups.get(f.group) ?? []), f])
  return {
    version: 'site-check/1',
    name,
    status: failures.some((f) => f.level === 'block') ? 'red' : 'green',
    counts: { block: failures.length, warn: 0, unmeasured: 0, notApplicable: 0 },
    groups: [...groups].map(([group, list]) => ({
      name: group,
      status: 'red',
      checked: list.length,
      failures: list
    }))
  }
}

/**
 * The site agent, faked. `behave({ page, text, attempt, clock })` says what the agent does with a prompt: `{ silent: true }`
 * opens no turn, `{ ms }` spends that long before the turn closes, `{ changes }` the changes the turn claims (one apply by
 * default). Every comment request, prompt and undo is recorded in `sent`.
 */
export function fakeAgent({ behave = () => ({}), clock = null, undo = () => ({ ok: true }) } = {}) {
  const sent = { opened: 0, requests: [], prompts: [], undone: [] }
  const turns = new Map()
  let n = 0
  let turnNo = 0
  let lastPage = null
  return {
    sent,
    async open() {
      sent.opened += 1
      return { sessionId: 'sess-1' }
    },
    async request({ sessionId, requestId, items }) {
      sent.requests.push({ sessionId, requestId, items })
      lastPage = items[0]?.page ?? null
      return { numbers: items.map(() => ++n) }
    },
    async prompt({ requestId, text }) {
      const attempt = sent.prompts.filter((p) => p.page === lastPage).length + 1
      sent.prompts.push({ requestId, text, page: lastPage })
      const said = behave({ page: lastPage, text, attempt, clock }) ?? {}
      if (said.silent) return true
      if (said.ms && clock) clock.t += said.ms
      turnNo += 1
      turns.set(requestId, {
        turnId: `sess-1:${turnNo}`,
        rpcId: requestId,
        state: 'closed',
        changes: said.changes ?? [{ applyId: `apply-${turnNo}`, page: lastPage }],
        costUsd: 0.02
      })
      return true
    },
    async turns({ requestIds }) {
      return requestIds.map((id) => turns.get(id)).filter(Boolean)
    },
    async undo({ turnId }) {
      sent.undone.push(turnId)
      return undo(turnId)
    },
    pageUrl: (page) => `https://site.example${page}`
  }
}

/**
 * Step 9 whole on the fake site: `checks` are the site checks in the order they run (the last one repeats), `agent` the
 * site agent fake, `found` what the finder reports.
 */
export async function stepNine({ checks, agent, found = null, clock = fakeClock(), input = {} }) {
  const site = fakeSite()
  const frozen = frozenFiles()
  const ran = []
  const saved = new Map()
  const logged = []
  try {
    const result = await runStepNine({
      write: { door: site.door, siteKey: SITE, kit: KIT(), contentMap: null, files: frozen.files },
      checkSite: async (report) => {
        ran.push(report)
        return checks[Math.min(ran.length, checks.length) - 1]
      },
      baselines: { read: async () => null },
      ...(found ? { finder: { find: async () => ({ faults: found }) } } : {}),
      agent,
      saveFile: async (name, data) => {
        saved.set(name, JSON.parse(String(data)))
      },
      log: { warn: (line) => logged.push(line) },
      now: clock.now,
      sleep: clock.sleep,
      ...input
    })
    return { result, checksRun: ran.length, saved, logged, clock }
  } finally {
    frozen.done()
  }
}
