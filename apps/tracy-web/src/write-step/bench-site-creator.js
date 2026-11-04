// BENCH ONLY. The write step bench's site creator (ADR 0044, decision 5): it creates a trial site from a quickstart by
// the customer's path, waits for it, proves the site answers the contract the template kit names, and keeps exactly
// one bench site by deleting the previous run's. It creates and deletes trial sites and never runs in a customer's
// flow; nothing under src/ imports it except the bench command.
//
// No quickstart and no contract version is written here: both come in as `spec`, read from the template kit the
// bench is given (the kit's `quickstart` tag and `contract` id). A newer contract needs a newer kit and nothing
// else. The write step itself takes a site door as input and does not depend on how its site was made.
//
// The module talks to two collaborators, both injected:
//   door:  create({label, quickstart}) -> {ok, siteKey, jobId} | {ok:false, code, reason}
//          job(siteKey, jobId)         -> {state: 'running'|'done'|'failed', step?, reason?}
//          inspect(siteKey)            -> {ok, contract} | {ok:false, code, message}   (content.contract inspect)
//          remove(siteKey)             -> {ok} | {ok:false, reason}
//   store: begin / attach / settle / others (bench-site-store.js), the record of every site this bench made.

/** The label every bench site gets. Together with the store's record it is what makes a site deletable. */
export const BENCH_LABEL = /^write-bench-[a-z0-9]{3,12}$/

/** Whether a stored record names a site this bench made: its label has the bench shape and its address starts with it. */
export function isBenchSite(record) {
  return (
    typeof record?.label === 'string' &&
    BENCH_LABEL.test(record.label) &&
    typeof record.siteKey === 'string' &&
    record.siteKey.startsWith(`${record.label}.`)
  )
}

/** The kit's side of the bargain: which quickstart to create and which contract it must answer. */
export function specOfKit(opened) {
  const quickstart = opened?.release
  const contract = opened?.doc?.contract ?? opened?.ref
  if (typeof quickstart !== 'string' || !quickstart || typeof contract !== 'string' || !contract) return null
  return { quickstart, contract }
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param {{ spec: {quickstart: string, contract: string}, door: object, store: object, label?: string,
 *   now?: () => number, sleep?: (ms: number) => Promise<void>, pollMs?: number, timeoutMs?: number,
 *   startedBy?: string }} input
 * @returns {Promise<
 *   | { ok: true, siteKey: string, contract: string, createMs: number, totalMs: number, removed: string[],
 *       notRemoved: {siteKey: string, reason: string}[] }
 *   | { ok: false, code: string, reason: string, siteKey?: string, createMs?: number }>}
 */
export async function createBenchSite(input) {
  const {
    spec,
    door,
    store,
    now = Date.now,
    sleep = sleepFor,
    pollMs = 5000,
    timeoutMs = 15 * 60_000
  } = input
  const label = input.label ?? `write-bench-${Math.floor(now() / 1000).toString(36)}`
  const began = now()
  const record = await store.begin({
    label,
    quickstart: spec.quickstart,
    contract: spec.contract,
    startedBy: input.startedBy ?? 'cli'
  })
  const fail = async (code, reason, extra = {}) => {
    const settled = { code, reason, totalMs: now() - began, ...extra }
    // A failed bench site is the bench's own: delete it, so at most one bench site stays. Its reason stays on the record.
    const gone = extra.siteKey ? await removeOwn(door, { ...record, siteKey: extra.siteKey }) : { ok: true }
    await store.settle(record.id, { ...settled, status: gone.ok && extra.siteKey ? 'removed' : 'failed' })
    return { ok: false, code, reason, ...extra }
  }

  const made = await door.create({ label, quickstart: spec.quickstart })
  if (!made?.ok) return fail(made?.code ?? 'SITE_CREATE_REFUSED', made?.reason ?? 'the site was not created')
  const { siteKey, jobId } = made
  await store.attach(record.id, { siteKey, jobId })

  let job = { state: 'running' }
  while (now() - began < timeoutMs) {
    job = await door.job(siteKey, jobId)
    if (job.state === 'done' || job.state === 'failed') break
    await sleep(pollMs)
  }
  const createMs = now() - began
  if (job.state === 'failed')
    return fail(
      'SITE_JOB_FAILED',
      `the site job failed at ${job.step ?? 'an unknown step'}: ${job.reason ?? 'no reason given'}`,
      {
        siteKey,
        createMs
      }
    )
  if (job.state !== 'done')
    return fail(
      'SITE_JOB_TIMEOUT',
      `the site job was still at ${job.step ?? 'its first step'} after ${Math.round(createMs / 1000)} s`,
      {
        siteKey,
        createMs
      }
    )

  // The creator holds the new site's owner seat; reading through the Apply door proves it, and proves the contract.
  const read = await door.inspect(siteKey)
  if (!read?.ok)
    return fail(
      read?.code ?? 'INSPECT_FAILED',
      `content.contract inspect failed: ${read?.message ?? read?.code ?? 'no answer'}`,
      {
        siteKey,
        createMs
      }
    )
  if (read.contract !== spec.contract)
    return fail(
      'CONTRACT_MISMATCH',
      `the kit expects contract ${spec.contract} but the new site answers ${read.contract ?? 'no contract'}`,
      { siteKey, createMs }
    )

  await store.settle(record.id, {
    status: 'ready',
    createMs,
    totalMs: now() - began,
    siteKey,
    answeredContract: read.contract
  })
  const { removed, notRemoved } = await removePrevious(door, store, record.id)
  return { ok: true, siteKey, contract: read.contract, createMs, totalMs: now() - began, removed, notRemoved }
}

// Delete a site only when the record proves it is the bench's own.
async function removeOwn(door, record) {
  if (!isBenchSite(record))
    return { ok: false, reason: `${record.siteKey ?? record.label} is not a bench site` }
  return (await door.remove(record.siteKey)) ?? { ok: false, reason: 'no answer from the host' }
}

async function removePrevious(door, store, currentId) {
  const removed = []
  const notRemoved = []
  for (const old of await store.others(currentId)) {
    if (!old.siteKey) continue // a create that was refused: there is no site
    const gone = await removeOwn(door, old)
    if (gone.ok) {
      await store.settle(old.id, { status: 'removed' })
      removed.push(old.siteKey)
    } else notRemoved.push({ siteKey: old.siteKey, reason: gone.reason ?? 'the host refused' })
  }
  return { removed, notRemoved }
}
