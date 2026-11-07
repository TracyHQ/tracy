// Fixtures for step 9 with its repair pass (step 9b, #448): a site agent fake that receives each comment turn, records it
// and answers closed turns with the changes it claims, a scripted site check, and a fake clock. The write runs for real on
// the invented frozen files and fake site of _write-step-run.mjs. Nothing here is a real business or a real site.
import { pagePath } from '../src/lib/hidden-page-links.js'
import { runStepNine } from '../src/write-step-nine.js'
import { fakeSite, frozenFiles, KIT, SITE } from './_write-step-run.mjs'

/**
 * A clock that only moves when the code under test sleeps or a fake spends time. Sleeps run as timers: once every task is
 * waiting (nothing else left to run), time jumps to the earliest wake, so tasks that sleep side by side share the time.
 */
export function fakeClock(start = 1_000_000) {
  const sleepers = []
  let ticking = false
  const tick = () => {
    ticking = false
    if (!sleepers.length) return
    sleepers.sort((a, b) => a.at - b.at)
    clock.t = Math.max(clock.t, sleepers[0].at)
    while (sleepers.length && sleepers[0].at <= clock.t) sleepers.shift().resolve()
    if (sleepers.length) later()
  }
  // Two turns of the event loop: every promise chain the fakes start settles before time moves.
  const later = () => {
    if (ticking) return
    ticking = true
    setImmediate(() => setImmediate(tick))
  }
  const clock = {
    t: start,
    now: () => clock.t,
    sleep: (ms) =>
      new Promise((resolve) => {
        sleepers.push({ at: clock.t + Math.max(0, ms), resolve })
        later()
      })
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
 * The site agent, faked. Each `open` makes a session of its own (`sess-<n>`), and a session's prompts are on the page its
 * comment requests named. `behave({ page, text, attempt, clock })` says what the agent does with a prompt:
 * `{ silent: true }` opens no turn, `{ ms }` spends that long before the turn closes, `{ appearAfterMs }` opens the turn only
 * that long after the prompt (a prompt the session queue runs late), `{ openForMs }` keeps the turn open that long,
 * `{ changes }` the changes the turn claims (one apply by default), `{ changesAfterCancel }` writes that show only once
 * the session's work was cancelled (a turn cut short that still wrote). `locate(params)` answers content.locate (none:
 * the agent has no locate); `cancel` is offered when `canCancel`. Every comment request (with the time it was made),
 * prompt, locate, cancel and undo is recorded in `sent`; `sent.mostOpen` is the most turns open at once.
 */
export function fakeAgent({
  behave = () => ({}),
  clock = null,
  undo = () => ({ ok: true }),
  locate = null,
  canCancel = false
} = {}) {
  const sent = { opened: 0, requests: [], prompts: [], undone: [], located: [], cancelled: 0, mostOpen: 0 }
  const made = []
  const pageOfSession = new Map()
  const turnsOfSession = new Map()
  let n = 0
  const now = () => clock?.t ?? 0
  const isOpen = (m) => !m.cancelled && m.appearAt <= now() && m.closeAt > now()
  const agent = {
    sent,
    async open() {
      sent.opened += 1
      return { sessionId: `sess-${sent.opened}` }
    },
    async request({ sessionId, requestId, items, timeLeftMs }) {
      sent.requests.push({ sessionId, requestId, items, timeLeftMs, at: now() })
      pageOfSession.set(sessionId, items[0]?.page ?? null)
      return { numbers: items.map(() => ++n) }
    },
    async prompt({ sessionId, requestId, text }) {
      const page = pageOfSession.get(sessionId) ?? null
      const attempt = sent.prompts.filter((p) => p.page === page).length + 1
      sent.prompts.push({ sessionId, requestId, text, page, at: now() })
      const said = behave({ page, text, attempt, clock }) ?? {}
      if (said.silent) return true
      if (said.ms && clock) clock.t += said.ms
      const k = (turnsOfSession.get(sessionId) ?? 0) + 1
      turnsOfSession.set(sessionId, k)
      const m = {
        sessionId,
        appearAt: now() + (said.appearAfterMs ?? 0),
        closeAt: now() + (said.appearAfterMs ?? 0) + (said.openForMs ?? 0),
        cancelled: false,
        afterCancel: said.changesAfterCancel ?? null,
        turn: {
          turnId: `${sessionId}:${k}`,
          rpcId: requestId,
          changes:
            said.changes ?? (said.changesAfterCancel ? [] : [{ applyId: `apply-${sessionId}-${k}`, page }]),
          costUsd: 0.02
        }
      }
      made.push(m)
      sent.mostOpen = Math.max(sent.mostOpen, made.filter((x) => x.appearAt <= now() && isOpen(x)).length)
      return true
    },
    async turns({ sessionId, requestIds }) {
      return made
        .filter((m) => m.sessionId === sessionId && requestIds.includes(m.turn.rpcId) && m.appearAt <= now())
        .map((m) => ({
          ...m.turn,
          changes: m.cancelled && m.afterCancel ? m.afterCancel : m.turn.changes,
          state: m.cancelled ? 'stale' : m.closeAt <= now() ? 'closed' : 'open'
        }))
    },
    async undo({ sessionId, turnId }) {
      sent.undone.push(turnId)
      return undo(turnId, sessionId)
    },
    pageUrl: (page) => `https://site.example${page === '/' ? '/' : `/index.php${page}`}`
  }
  if (locate)
    agent.locate = async (params) => {
      sent.located.push(params)
      return locate(params)
    }
  if (canCancel)
    agent.cancel = async ({ sessionId }) => {
      sent.cancelled += 1
      for (const m of made) if (m.sessionId === sessionId && m.closeAt > now()) m.cancelled = true
      return { ok: true }
    }
  return agent
}

/** A site check scoped to `pages` as the real one is: only those pages' failures, and every failure with no page. */
export function scopedTo(check, pages) {
  if (!pages) return check
  const on = new Set(pages.map((p) => pagePath(p)))
  const groups = check.groups.map((g) => ({
    ...g,
    failures: g.failures.filter((f) => !f.page || on.has(pagePath(f.page)))
  }))
  return { ...check, groups, scope: [...on] }
}

/**
 * Step 9 whole on the fake site: `checks` are the site checks in the order they run (the last one repeats), `agent` the
 * site agent fake, `files` frozen files beside the plan and copy (a brief). A check asked for some `pages` holds only
 * their failures (`scopedTo`).
 */
export async function stepNine({ checks, agent, clock = fakeClock(), input = {}, files = {} }) {
  const site = fakeSite()
  const frozen = frozenFiles(files)
  const ran = []
  const checkOptions = []
  const saved = new Map()
  const logged = []
  try {
    const result = await runStepNine({
      write: { door: site.door, siteKey: SITE, kit: KIT(), contentMap: null, files: frozen.files },
      checkSite: async (report, options) => {
        ran.push(report)
        checkOptions.push(options)
        return scopedTo(checks[Math.min(ran.length, checks.length) - 1], options?.pages ?? null)
      },
      baselines: { read: async () => null },
      agent,
      saveFile: async (name, data) => {
        saved.set(name, JSON.parse(String(data)))
      },
      log: { warn: (line) => logged.push(line) },
      now: clock.now,
      sleep: clock.sleep,
      ...input
    })
    return { result, checksRun: ran.length, checkOptions, saved, logged, clock }
  } finally {
    frozen.done()
  }
}
