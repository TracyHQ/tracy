/**
 * Compile a brief + a content plan + release bindings into the seed map a Claude Cowork plugin can apply.
 *
 * 🔒 THE COMPILER IS THE ONLY THING THAT DECIDES WHERE A WRITE LANDS. The model wrote words against
 * semantic keys; this file turns those into slot keys, batches and apply ids using the bindings the
 * RELEASE declared and the identity the SERVER holds. Nothing in the plan can reach `siteKey`, a
 * permission, an entity or an apply id — `validateContentPlan` refuses those key names outright,
 * and every identity below is read from `build`/`cowork`, never from `plan`.
 *
 * 🔒 IDEMPOTENT ON PURPOSE. Two compiles of the same brief, plan, bindings and Claude Cowork plugin revision
 * produce the same map hash and the same apply ids. That is what lets a retry after a timeout be
 * safe: the Claude Cowork plugin de-duplicates on `apply_id`, so a second attempt at a batch that already
 * landed is a no-op instead of a second set of entities. The clock is therefore NOT an input —
 * `envelopeHash` drops `createdAt`, and no id is derived from it.
 *
 * 🔒 A REFUSAL COSTS ONE SLOT; AN APPLY COSTS THE STAGE. The Claude Cowork plugin validates a whole batch and
 * refuses it on the first value it will not take, so a bad value discovered there loses everything
 * planned before it. Every rule this file can check — unknown group, site mismatch, hash drift,
 * wrong type, over length, a bad asset — is therefore checked HERE, before a request is built.
 */
import { createHash } from 'node:crypto'

import { assertResolved } from './bindings.js'
import { envelopeHash, hashOf, SEED_MAP_SCHEMA, validateContentPlan, validateSeedMap } from './schema.mjs'

/**
 * The most scalar changes one apply may carry.
 *
 * MEASURED IN THE CLAUDE COWORK PLUGIN'S OWN CALLER, not copied from a spec:
 * `packages/cms/tracy-seeder/src/apply-joomla-contract.mjs:38` —
 *   `if (changes.length > 1500) throw new Error('Review at most 1500 scalar slots in one content revision')`
 * A map that exceeds it does not fail late on the site; it fails before the first request, split
 * into checkpointed batches. Several batches are several transactions: a seed is NOT atomic across
 * a whole site, and this file never claims it is (`atomic: false` on the map).
 *
 * ⚠ DO NOT CONFUSE IT WITH THE OTHER NUMBER ONE LAYER UP. `plan-joomla-contract.mjs:193` slices the
 * planner's work into batches of **35** — that is how many slots one MODEL call is asked about, and
 * it has nothing to do with how many changes one APPLY may carry. Reading 35 as the apply limit
 * would cut a 1500-slot revision into 43 transactions for no reason; reading 1500 as the model
 * batch would blow every prompt budget there is.
 *
 * ⚠ AND THE SPLIT IS NOT HYPOTHETICAL: tracy-business j6/1.1.0 carries 1800 slots, so a plan over
 * the whole surface exceeds one apply by design.
 */
export const COWORK_SCALAR_BATCH_LIMIT = 1500

/** The apply id shape the Claude Cowork plugin's caller mints (`apply-joomla-contract.mjs:49`). */
const APPLY_ID_DIGEST_LENGTH = 48

/**
 * Things a plan might ask for that the `content.contract` door cannot express today.
 *
 * ⚠ MEASURED 22/09/2026. That door has `inspect` / `apply` / `bind`, and `apply` carries exactly
 * `changes: Record<slotKey, string>` — scalar text, nothing else. Publication state, home flag,
 * access level, module position and ordering are all sealed by `presentation-lock.json`
 * (`packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py:106`) for both modules and
 * menu items, and the refusal is proven rather than assumed:
 * `packages/cms/tracy-seeder/test/apply-joomla-contract.test.mjs:30-33` pushes
 * `{changes: {published: '0'}}` and it is rejected BEFORE anything is written.
 *
 * So a leftover page or block cannot be dropped through this compiler, and it is refused here
 * loudly rather than dropped quietly. The door that CAN retire demo content today is a different
 * one — `content.update`, used by `retireBaseDemo`
 * (`packages/site/tracy-site-build-joomla/src/host/stages.mjs:57-76`). Routing to it is a separate
 * piece of work. What must never happen instead: lifting the lock, or writing the database to get
 * around it (`tasks/todo-inventory-va-seed-theo-brief.md` §6 forbids both by name).
 */
export const PRESENTATION_ACTIONS = Object.freeze([
  'omit',
  'unpublish',
  'publish',
  'hide',
  'show',
  'reorder',
  'move',
  'delete'
])

export class SeedCompileError extends Error {
  constructor(code, message, detail = {}) {
    super(message)
    this.name = 'SeedCompileError'
    this.code = code
    this.detail = detail
  }
}

const refuse = (code, message, detail) => {
  throw new SeedCompileError(code, message, detail)
}

/** A scheme or authority in a reference means "go and fetch something", and nothing here fetches. */
const LOOKS_REMOTE = /^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\//

/**
 * Turn an asset reference into a media path the site already holds — or refuse.
 *
 * 🔒 THIS IS THE SSRF DOOR, AND IT IS SHUT RATHER THAN FILTERED. The safe design is not "reject bad
 * URLs": it is to accept no URL at all. The only reference shape this takes is `asset:<id>` into an
 * inventory the SERVER built for THIS tenant, so there is no attacker-chosen string that ever
 * becomes a request — no `http://169.254.169.254`, no `file:///etc/passwd`, no redirect chain, no
 * DNS rebind, because no fetch exists to aim at them.
 *
 * 🔒 AND IT IS THE TENANT DOOR. An asset id is guessable; ownership is checked against the id's own
 * row, so one workspace's photograph can never be mapped into another workspace's site.
 *
 * 🔒 AND THE MEDIA-LIBRARY DOOR. An image slot's only legal value is a path the site ALREADY holds
 * (`QuickstartContract::checkValue`); the measured failure is a plausible invented path —
 * `Image must already exist in the site media library: module-441.8` after 19 minutes of seeding,
 * 22/09/2026. So a resolved asset must also appear in the site's media inventory, or it waits.
 *
 * @param {unknown} ref
 * @param {{tenantId: string, inventory: any[], siteMedia?: string[] | null}} where
 */
export function resolveAssetRef(ref, { tenantId, inventory = [], siteMedia = null }) {
  if (typeof ref !== 'string' || ref === '')
    refuse('ASSET_BAD_REF', 'An asset reference is a string', { ref })
  if (!ref.startsWith('asset:'))
    refuse('ASSET_BAD_REF', `An asset is referenced as asset:<id>, never as a path or URL: ${ref}`, { ref })
  const id = ref.slice('asset:'.length)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) refuse('ASSET_BAD_REF', `Not an asset id: ${id}`, { ref })
  const row = inventory.find((a) => a?.assetId === id)
  if (!row) refuse('ASSET_NOT_FOUND', `No asset ${id} in this build's inventory`, { ref })
  if (row.tenantId !== tenantId)
    refuse('ASSET_FOREIGN_TENANT', `Asset ${id} belongs to another tenant`, { ref })
  if (!row.uploadReceipt || !row.sha256)
    refuse('ASSET_NO_RECEIPT', `Asset ${id} has no upload receipt; it is not on the site yet`, { ref })
  const mediaPath = row.mediaPath
  if (typeof mediaPath !== 'string' || mediaPath === '' || LOOKS_REMOTE.test(mediaPath))
    refuse('ASSET_BAD_PATH', `Asset ${id} does not name a site media path`, { ref, mediaPath })
  if (mediaPath.startsWith('/') || mediaPath.includes('\\') || mediaPath.split('/').includes('..'))
    refuse('ASSET_BAD_PATH', `Asset ${id} names a path outside the site media tree`, { ref, mediaPath })
  if (siteMedia && !siteMedia.includes(mediaPath))
    refuse('ASSET_NOT_IN_LIBRARY', `Asset ${id} is not in the site media library yet`, { ref, mediaPath })
  return { assetId: id, mediaPath, sha256: row.sha256, alt: row.alt ?? null, receipt: row.uploadReceipt }
}

/**
 * Control characters and angle brackets the Claude Cowork plugin refuses outright — U+0000..U+001F except tab,
 * newline and carriage return, which `QuickstartContract::checkValue` allows. Built from character
 * codes rather than written as a literal class so the source file itself stays free of the bytes it
 * is describing: a control character pasted into a regex literal is invisible in every diff and
 * review tool that would have to check it.
 */
const CONTROL_BYTES = Array.from({ length: 32 }, (_, code) => code)
  .filter((code) => code !== 9 && code !== 10 && code !== 13)
  .map((code) => String.fromCharCode(code))
  .join('')
const MARKUP_OR_CONTROL = new RegExp(`[<>${CONTROL_BYTES}]`, 'u')

/**
 * The Claude Cowork plugin's own rules on a scalar value, restated so a refusal costs one slot rather than a
 * batch. Same three checks as `plan-joomla-contract.mjs:coworkWouldRefuse`, and kept to exactly
 * those: the rules that need the site (aspect ratio, a media file that must exist) stay there.
 * @returns {'markup' | 'directive' | 'unsupported-url' | null}
 */
export function coworkWouldRefuse(binding, value) {
  if (MARKUP_OR_CONTROL.test(value)) return 'markup'
  if (/\{\/?[a-z][^{}]*\}/i.test(value)) return 'directive'
  if (binding.type !== 'url' || value === '') return null
  if (value.startsWith('//') || value.includes('\\')) return 'unsupported-url'
  return /^(https:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9 ()-]+|index\.php\?Itemid=[0-9]+|\/[a-zA-Z0-9/_?&=.%#-]*|#[a-zA-Z0-9_-]+)$/.test(
    value
  )
    ? null
    : 'unsupported-url'
}

/** Every string the customer supplied, flattened — what an evidence-required value must excerpt. */
function briefFacts(brief) {
  const out = []
  const walk = (v) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  for (const fact of brief.facts ?? []) walk(fact.value)
  return out
}

/**
 * Compile the seed map.
 *
 * @param {object} args
 * @param {any} args.brief a validated site brief
 * @param {any} args.plan the content plan the model produced for THAT brief revision
 * @param {any} args.bindings the result of `resolveBindings`
 * @param {{siteKey: string, buildId: string, tenantId: string}} args.build server-held identity
 * @param {{contract: string, revision: string, media?: string[], slots?: any[]}} args.cowork a fresh `inspect`
 * @param {any[]} [args.assetInventory] this tenant's assets, with upload receipts
 * @param {Record<string, string>} [args.applied] what a PREVIOUS seed wrote, for reconciliation
 * @param {((args: {plan: any, slots: any[], applied: Record<string, string>}) => any) | null} [args.reconcile]
 *   the three-way reconciler, INJECTED. See the note on the seam below.
 */
export function compileSeedMap({
  brief,
  plan,
  bindings,
  build,
  cowork,
  assetInventory = [],
  applied = {},
  reconcile = null,
  createdAt = new Date().toISOString()
}) {
  if (!build?.siteKey || !build?.buildId || !build?.tenantId)
    refuse('NO_BUILD_CONTEXT', 'A seed map is compiled against a server-held build context')
  if (!cowork?.contract || !cowork?.revision)
    refuse('NO_COWORK_STATE', 'Inspect the site before compiling a seed map')

  // Identity first: nothing below is worth checking if this map is for a different site.
  if (brief?.site?.siteKey !== build.siteKey)
    refuse('SITE_MISMATCH', `This brief belongs to ${String(brief?.site?.siteKey)}, not ${build.siteKey}`)
  if (brief.site.tenantId !== build.tenantId) refuse('SITE_MISMATCH', 'This brief belongs to another tenant')

  const planCheck = validateContentPlan(plan)
  if (!planCheck.ok)
    refuse(
      'PLAN_INVALID',
      `The content plan is not valid: ${planCheck.errors.map((e) => e.code).join(', ')}`,
      {
        errors: planCheck.errors
      }
    )
  // 🔒 HASH DRIFT IS NOT A WARNING. A plan written against an older brief is an artifact of that
  // revision; applying it writes answers the customer has since corrected.
  if (plan.briefHash !== brief.hash)
    refuse('BRIEF_HASH_DRIFT', 'This content plan was written for a different revision of the brief', {
      planBriefHash: plan.briefHash,
      briefHash: brief.hash
    })
  if (plan.briefRevision !== brief.revision)
    refuse('BRIEF_REVISION_DRIFT', 'This content plan names a different brief revision')
  if (bindings?.contract && bindings.contract !== cowork.contract)
    refuse('CONTRACT_MISMATCH', 'The bindings were resolved against a different contract')
  assertResolved(bindings)

  const byGroup = new Map((bindings.bindings ?? []).map((b) => [b.group, b]))
  const facts = briefFacts(brief)

  /** @type {Record<string, string>} */
  const changes = {}
  /** @type {Record<string, string>} */
  const evidence = {}
  /** @type {{group: string, why: string}[]} */
  const pending = []
  /** @type {any[]} */
  const assets = []

  // A brief that still has gaps does not get compiled into content. It gets compiled into the list
  // of things to ask — the layout is not a reason to write something.
  if (brief.status !== 'ready')
    for (const gap of brief.missing ?? []) pending.push({ group: `brief:${gap.key}`, why: gap.why })
  for (const conflict of brief.conflicts ?? [])
    pending.push({ group: `brief:${conflict.key}`, why: 'conflicting-answers' })

  for (const group of plan.groups ?? []) {
    const binding = byGroup.get(group.id)
    if (!binding)
      refuse('UNKNOWN_GROUP', `The plan writes a group no binding places: ${group.id}`, { group: group.id })
    if (group.locale !== brief.locales.primary && !brief.locales.secondary.includes(group.locale))
      refuse('UNKNOWN_LOCALE', `The plan writes a locale this site does not carry: ${group.locale}`)
    if (group.action !== undefined && PRESENTATION_ACTIONS.includes(group.action))
      refuse(
        'PRESENTATION_NOT_EXPRESSIBLE',
        `The content contract cannot ${group.action} anything; it writes scalar text only`,
        { group: group.id, action: group.action }
      )

    if (group.assetRef !== undefined) {
      const resolved = resolveAssetRef(group.assetRef, {
        tenantId: build.tenantId,
        inventory: assetInventory,
        siteMedia: cowork.media ?? null
      })
      assets.push({ slotKey: binding.slotKey, ...resolved })
      changes[binding.slotKey] = resolved.mediaPath
      continue
    }
    if (group.assetIntent !== undefined && group.text === undefined) {
      // An intent is not a picture. The group waits rather than shipping the demo's photograph as
      // if it were the customer's.
      pending.push({ group: group.id, slotKey: binding.slotKey, why: 'asset-not-supplied' })
      continue
    }

    const value = group.text
    if (typeof value !== 'string')
      refuse('BAD_VALUE_TYPE', `Group ${group.id} carries no text for a text slot`, { group: group.id })
    if (binding.maxCharacters !== null && [...value].length > binding.maxCharacters)
      refuse('VALUE_TOO_LONG', `Group ${group.id} is longer than slot ${binding.slotKey} accepts`, {
        group: group.id,
        limit: binding.maxCharacters,
        length: [...value].length
      })
    const complaint = coworkWouldRefuse(binding, value)
    if (complaint !== null)
      refuse(
        'COWORK_WOULD_REFUSE',
        `Group ${group.id} would be refused by the Claude Cowork plugin (${complaint})`,
        {
          group: group.id,
          complaint
        }
      )
    if (binding.requiresEvidence) {
      if (!facts.some((fact) => fact.includes(value))) {
        pending.push({ group: group.id, slotKey: binding.slotKey, why: 'evidence-missing' })
        continue
      }
      evidence[binding.slotKey] = value
    }
    if (value !== (binding.current ?? binding.sample)) changes[binding.slotKey] = value
  }

  // 🔒 THE CUSTOMER'S OWN EDITS OUTRANK THIS PLAN, AND THE RULE FOR THAT ALREADY EXISTS.
  // `reconcileWithSite` (`packages/cms/tracy-seeder/src/reconcile-site.mjs:36`) is the three-way
  // rule — archive / pipeline / person — that decides which slots a re-seed may overwrite: a value
  // this pipeline wrote last time may be updated, a value a PERSON wrote never may, and
  // `slot.current` alone cannot tell those two apart. Measured 12/09/2026: without it a re-seed
  // either froze an updated price or silently erased a hand edit.
  //
  // It is INJECTED rather than imported because `apps/tracy-web` does not depend on
  // `@tracy/seeder` (checked: its package.json declares no such dependency), and copying the rule
  // here would be a second copy of it — which is exactly how the two copies drift and one of them
  // starts erasing customer edits. A caller that can reach the seeder passes it in; a caller that
  // cannot compiles without reconciliation and says so on the map (`reconciled: false`).
  let reconciliation = null
  if (reconcile) {
    reconciliation = reconcile({
      plan: { changes, evidence, pending: pending.filter((p) => p.slotKey).map((p) => p.slotKey) },
      slots: cowork.slots ?? [],
      applied
    })
    for (const key of Object.keys(changes)) if (!(key in reconciliation.plan.changes)) delete changes[key]
    for (const key of Object.keys(evidence)) if (!(key in reconciliation.plan.evidence)) delete evidence[key]
    const stillPending = new Set(reconciliation.plan.pending)
    for (let i = pending.length - 1; i >= 0; i -= 1)
      if (pending[i].slotKey && !stillPending.has(pending[i].slotKey)) pending.splice(i, 1)
  }

  const keys = Object.keys(changes).sort()
  /** @type {any[]} */
  const batches = []
  const blocked = pending.length > 0
  if (!blocked)
    for (let offset = 0; offset < keys.length; offset += COWORK_SCALAR_BATCH_LIMIT) {
      const batchKeys = keys.slice(offset, offset + COWORK_SCALAR_BATCH_LIMIT)
      const batchChanges = Object.fromEntries(batchKeys.map((k) => [k, changes[k]]))
      const batchEvidence = Object.fromEntries(
        batchKeys.filter((k) => k in evidence).map((k) => [k, evidence[k]])
      )
      // The same digest the Claude Cowork plugin's caller mints, over the same fields, so an id computed here
      // and an id computed there for the same batch are the same id.
      const requestId = createHash('sha256')
        .update(
          JSON.stringify({
            siteKey: build.siteKey,
            contract: cowork.contract,
            revision: cowork.revision,
            changes: batchKeys.map((k) => [k, batchChanges[k]]),
            evidence: batchEvidence
          })
        )
        .digest('hex')
      batches.push({
        index: batches.length,
        applyId: `contract-${requestId.slice(0, APPLY_ID_DIGEST_LENGTH)}`,
        requestId,
        expectedRevision: cowork.revision,
        keys: batchKeys,
        changes: batchChanges,
        evidence: batchEvidence,
        // Checkpointed, not atomic: batch N may only run once batch N-1 has a receipt.
        dependsOn: batches.length === 0 ? [] : [batches.length - 1]
      })
    }

  const body = {
    schema: SEED_MAP_SCHEMA,
    siteKey: build.siteKey,
    buildId: build.buildId,
    tenantId: build.tenantId,
    contract: cowork.contract,
    revision: cowork.revision,
    hashes: { brief: brief.hash, plan: hashOf(plan), bindings: bindings.hash },
    limits: { scalarChangesPerBatch: COWORK_SCALAR_BATCH_LIMIT },
    atomic: false,
    reconciled: Boolean(reconcile),
    refusedOverwrite: reconciliation?.refusedOverwrite ?? [],
    filledBySite: reconciliation?.filledBySite ?? [],
    changes,
    evidence,
    assets,
    batches,
    dependencies: batches.map((b) => ({ batch: b.index, dependsOn: b.dependsOn })),
    pending: pending.sort((a, b) => (a.group < b.group ? -1 : 1)),
    status: blocked ? 'needs_input' : 'ready'
  }
  const map = { ...body, createdAt, hash: envelopeHash(body) }
  const check = validateSeedMap(map)
  if (!check.ok)
    refuse(
      'MAP_INVALID',
      `The compiled map is not a valid seed map: ${check.errors.map((e) => e.code).join(', ')}`,
      {
        errors: check.errors
      }
    )
  return map
}
