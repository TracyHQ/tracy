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
 * opens no turn, `{ ms }` spends that long before the turn closes, `{ appearAfterMs }` opens the turn only that long after
 * the prompt (a prompt the session queue runs late), `{ openForMs }` keeps the turn open that long, `{ changes }` the
 * changes the turn claims (one apply by default). `locate(params)` answers content.locate (none: the agent has no locate);
 * `cancel` is offered when `canCancel`. Every comment request, prompt, locate, cancel and undo is recorded in `sent`.
 */
export function fakeAgent({
  behave = () => ({}),
  clock = null,
  undo = () => ({ ok: true }),
  locate = null,
  canCancel = false
} = {}) {
  const sent = { opened: 0, requests: [], prompts: [], undone: [], located: [], cancelled: 0 }
  const made = []
  let n = 0
  let turnNo = 0
  let lastPage = null
  const now = () => clock?.t ?? 0
  const agent = {
    sent,
    async open() {
      sent.opened += 1
      return { sessionId: 'sess-1' }
    },
    async request({ sessionId, requestId, items, timeLeftMs }) {
      sent.requests.push({ sessionId, requestId, items, timeLeftMs })
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
      made.push({
        appearAt: now() + (said.appearAfterMs ?? 0),
        closeAt: now() + (said.appearAfterMs ?? 0) + (said.openForMs ?? 0),
        cancelled: false,
        turn: {
          turnId: `sess-1:${turnNo}`,
          rpcId: requestId,
          changes: said.changes ?? [{ applyId: `apply-${turnNo}`, page: lastPage }],
          costUsd: 0.02
        }
      })
      return true
    },
    async turns({ requestIds }) {
      return made
        .filter((m) => requestIds.includes(m.turn.rpcId) && m.appearAt <= now())
        .map((m) => ({ ...m.turn, state: m.cancelled ? 'stale' : m.closeAt <= now() ? 'closed' : 'open' }))
    },
    async undo({ turnId }) {
      sent.undone.push(turnId)
      return undo(turnId)
    },
    pageUrl: (page) => `https://site.example${page === '/' ? '/' : `/index.php${page}`}`
  }
  if (locate)
    agent.locate = async (params) => {
      sent.located.push(params)
      return locate(params)
    }
  if (canCancel)
    agent.cancel = async () => {
      sent.cancelled += 1
      for (const m of made) if (m.closeAt > now()) m.cancelled = true
      return { ok: true }
    }
  return agent
}

/**
 * Step 9 whole on the fake site: `checks` are the site checks in the order they run (the last one repeats), `agent` the
 * site agent fake, `found` what the finder reports on its first look (a
 * second look sees nothing), or `(call, { pages }) => faults`, `files` frozen files beside the
 * plan and copy (a brief).
 */
export async function stepNine({ checks, agent, found = null, clock = fakeClock(), input = {}, files = {} }) {
  const site = fakeSite()
  const frozen = frozenFiles(files)
  const ran = []
  const saved = new Map()
  const logged = []
  const finds = []
  try {
    const result = await runStepNine({
      write: { door: site.door, siteKey: SITE, kit: KIT(), contentMap: null, files: frozen.files },
      checkSite: async (report) => {
        ran.push(report)
        return checks[Math.min(ran.length, checks.length) - 1]
      },
      baselines: { read: async () => null },
      ...(found
        ? {
            finder: {
              find: async (report, options = {}) => {
                finds.push(options.pages ?? null)
                return {
                  faults:
                    typeof found === 'function'
                      ? found(finds.length, options)
                      : finds.length === 1
                        ? found
                        : []
                }
              }
            }
          }
        : {}),
      agent,
      saveFile: async (name, data) => {
        saved.set(name, JSON.parse(String(data)))
      },
      log: { warn: (line) => logged.push(line) },
      now: clock.now,
      sleep: clock.sleep,
      ...input
    })
    return { result, checksRun: ran.length, saved, logged, clock, finds }
  } finally {
    frozen.done()
  }
}
