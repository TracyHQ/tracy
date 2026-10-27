/**
 * Semantic group → physical slot, per release, and ONLY where the release itself says so.
 *
 * 🔒 A BINDING WITHOUT EVIDENCE IS NOT A WEAK BINDING, IT IS A WRONG WRITE. The tempting shortcut
 * here is name similarity: a group called `hero.headline` and a slot called `module-441.2` whose
 * label says "Hero heading" look like a pair to a person, and to a model they look like a pair
 * every time — including on the release where that module was repositioned. The write still
 * succeeds, the Claude Cowork plugin still returns `ok`, and the customer's headline lands in a footnote. So
 * this file only ever accepts a link the RELEASE declares: a slot that carries its own semantic
 * key, or a capability row that names the slots it covers. Everything else comes back `unresolved`.
 *
 * 🔒 UNRESOLVED BLOCKS. `assertResolved` exists so that "we could not bind three groups" cannot be
 * a warning somebody scrolls past. The whole reason the compiler is allowed to write to a customer
 * site is that it never guesses a destination; a silent skip would trade that away for a fuller
 * page. A caller that genuinely wants a partial seed drops those groups explicitly.
 *
 * ⚠ WHAT TODAY'S DATA CAN AND CANNOT ANSWER — measured 22/09/2026 against session A's committed
 * reader (`lib/quickstart-capabilities.js`, 17743927c) on real releases, not assumed:
 *
 *   • A group named by a BLOCK resolves. The snapshot emits one row per physical slot — 967 for
 *     `tracy-base/j6`, 1800 for `tracy-business/j6`, matching their content maps exactly — each
 *     carrying `kind: 'slot'`, `key: 'slot:<contract key>'` and a `block`. That is the release's
 *     own content map, read by the owner of that reader, so it is evidence and not a guess.
 *   • A group named by a MEANING — `hero.headline`, `services.title` — does not, and cannot from
 *     this data. `grep -c semanticKey` over all ten shipped `content-map.json` files returns 0 for
 *     every one, and the reader emits no `slotKeys` row (0 of 1204 on `tracy-base/j6`). Nothing
 *     declares that a block IS the hero. It comes back `NO_SLOT` and `assertResolved` throws,
 *     which is the CORRECT behaviour and is held by a test: the alternative — matching a group to
 *     a slot by how similar the labels look — is the write-into-a-footnote failure this file
 *     exists to prevent.
 *   • A block usually holds MANY writable slots, so a one-group-one-slot binding calls it
 *     `AMBIGUOUS`. Measured on `tracy-base/j6`: 20 block groups asked, 20 ambiguous, 0 missing.
 *     That refusal is honest — it names a real shortfall in this envelope (a group covering a
 *     block is one-to-many) rather than picking a slot and calling it resolved.
 *
 * Closing the meaning gap needs a re-captured contract that writes the semantic key alongside the
 * slot (`packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py:106`), and capturing a
 * contract needs a real installed site.
 */
import { hashOf } from './schema.mjs'

export const BINDINGS_SCHEMA = 'tracy-bindings/v1'

/** Why a binding could not be made. Each one is a different repair, so they are not one code. */
export const UNRESOLVED = Object.freeze({
  NO_SLOT: 'no-slot-declares-this-group',
  AMBIGUOUS: 'more-than-one-slot-declares-this-group',
  DERIVED: 'the-only-slot-is-a-translated-copy',
  NOT_WRITABLE: 'the-slot-is-not-writable-by-a-seed'
})

export class BindingsUnresolvedError extends Error {
  /** @param {{group: string, why: string}[]} unresolved */
  constructor(unresolved) {
    super(
      `No release evidence binds ${unresolved.length} semantic group(s): ${unresolved.map((u) => u.group).join(', ')}`
    )
    this.name = 'BindingsUnresolvedError'
    this.code = 'BINDINGS_UNRESOLVED'
    this.unresolved = unresolved
  }
}

/**
 * A slot that is a translated COPY of another slot. Same rule the seeder's planner keeps
 * (`packages/cms/tracy-seeder/src/plan-joomla-contract.mjs`, `isDerived`): a translation is written
 * by the language machinery from its source, never from a brief. Restated here rather than imported
 * because `apps/` does not depend on the seeder package — and it is restated as the SAME three
 * signs, so a slot the seeder would refuse is a slot this file never binds.
 */
export function isDerivedSlot(slot) {
  return (
    Boolean(slot?.translates) || typeof slot?.sourceKey === 'string' || String(slot?.key ?? '').includes('::')
  )
}

/**
 * Which slots a release declares for a semantic key, and what kind of evidence says so.
 * @param {string} semanticKey
 * @param {{slots: any[], capabilities?: any}} where
 * @returns {{slot: any, evidence: string}[]}
 */
function declaredFor(semanticKey, { slots, capabilities }) {
  /** @type {{slot: any, evidence: string}[]} */
  const found = []
  for (const slot of slots)
    if (slot?.semanticKey === semanticKey) found.push({ slot, evidence: 'slot-semantic-key' })
  for (const capability of capabilities?.capabilities ?? []) {
    if (capability?.key !== semanticKey) continue
    for (const key of capability.slotKeys ?? []) {
      const slot = slots.find((s) => s?.key === key)
      if (slot && !found.some((f) => f.slot === slot)) found.push({ slot, evidence: 'capability-slot-map' })
    }
  }
  // 🔒 THE SNAPSHOT SAYS IT THE OTHER WAY ROUND, AND IT IS THE SAME FACT. Measured against session
  // A's committed reader (`lib/quickstart-capabilities.js`, commit 17743927c) on `tracy-base/j6`:
  // NO capability row carries `slotKeys` — zero of 1204 — so the branch above finds nothing. What
  // the reader does emit is one row per physical slot (967 of them for that release, 1800 for
  // `tracy-business/j6`, matching its content map exactly), each carrying `kind: 'slot'`, a key of
  // `slot:<contract key>`, and a `block` naming the block it belongs to. So the block→slots map is
  // present; it is simply held on the slot, not on the block.
  //
  // This is evidence from the release's own content map, read by the owner of that reader — not a
  // name guessed to be similar, which this file refuses everywhere else. It resolves a group
  // addressed by a BLOCK. It does NOT invent a meaningful name: a group asking for something like
  // `hero.headline` still has nothing to bind to, because nothing in the release declares that a
  // block IS the hero. That half stays unresolved, and deliberately so.
  for (const capability of capabilities?.capabilities ?? []) {
    if (capability?.kind !== 'slot' || capability?.block !== semanticKey) continue
    const key = physicalKeyOf(capability.key)
    const slot = slots.find((s) => s?.key === key)
    if (slot && !found.some((f) => f.slot === slot)) found.push({ slot, evidence: 'capability-slot-block' })
  }
  return found
}

/** `slot:module-170.0` → `module-170.0`. The snapshot namespaces its keys by kind; the Claude Cowork plugin's
 * own inventory does not, and the contract key is what an apply must name. */
function physicalKeyOf(key) {
  const text = String(key ?? '')
  return text.startsWith('slot:') ? text.slice('slot:'.length) : text
}

/**
 * Bind every semantic group to the physical slot the release declares for it.
 *
 * @param {object} args
 * @param {{tag: string, contract?: string|null}} args.release the release the instance was pinned to
 * @param {any[]} args.slots the Claude Cowork plugin's own inspect inventory for THIS site
 * @param {any} [args.capabilities] session A's capability snapshot for the same release
 * @param {{id: string, semanticKey: string}[]} args.groups the semantic groups to place
 * @returns {{schema: string, release: string, bindings: any[], unresolved: {group: string, semanticKey: string, why: string}[], hash: string}}
 */
export function resolveBindings({ release, slots = [], capabilities = null, groups = [] }) {
  if (!release?.tag) throw new Error('Bindings are resolved against a pinned release')
  /** @type {any[]} */
  const bindings = []
  /** @type {{group: string, semanticKey: string, why: string}[]} */
  const unresolved = []

  for (const group of groups) {
    const declared = declaredFor(group.semanticKey, { slots, capabilities })
    if (declared.length === 0) {
      unresolved.push({ group: group.id, semanticKey: group.semanticKey, why: UNRESOLVED.NO_SLOT })
      continue
    }
    const writable = declared.filter(({ slot }) => !isDerivedSlot(slot))
    if (writable.length === 0) {
      unresolved.push({ group: group.id, semanticKey: group.semanticKey, why: UNRESOLVED.DERIVED })
      continue
    }
    // 🔒 A GROUP MAY COVER A BLOCK, AND A BLOCK HOLDS MANY SLOTS — that is not ambiguity.
    //
    // The refusal below was written when the only evidence was a per-slot `semanticKey`: two slots
    // claiming ONE name is a contradiction in the release's own data, and picking one would be
    // guessing with extra steps. Evidence read off a BLOCK is a different statement — "these are
    // the slots this block is made of" — and it is ordered, because the capture walks the entity's
    // columns in order. Measured on `tracy-base/j6`: 20 block groups asked, all 20 refused as
    // ambiguous, while the release declares exactly which slots each block holds.
    //
    // And this is the shape session A's questionnaire actually uses: its questions point at
    // `block:module-178`, `block:article-3` — never at a made-up meaning. So refusing every
    // block group refuses the real integration path.
    //
    // What does NOT change: a group named by a MEANING still resolves to nothing, because nothing
    // declares that a block is the hero. Only `slot-semantic-key` evidence can be ambiguous now,
    // and it still refuses.
    const bySemanticKey = writable.filter((w) => w.evidence === 'slot-semantic-key')
    if (bySemanticKey.length > 1) {
      unresolved.push({ group: group.id, semanticKey: group.semanticKey, why: UNRESOLVED.AMBIGUOUS })
      continue
    }
    if (bySemanticKey.length === 0 && writable.length > 1) {
      const parts = writable.filter(({ slot }) => slot.writable !== false)
      if (parts.length === 0) {
        unresolved.push({ group: group.id, semanticKey: group.semanticKey, why: UNRESOLVED.NOT_WRITABLE })
        continue
      }
      bindings.push({
        group: group.id,
        semanticKey: group.semanticKey,
        // 🔒 NO `slotKey` ON A GROUP BINDING, deliberately: a caller that reads one key off this
        // would write one slot and believe it had written the block. The plural field is the only
        // one there is, and its ORDER is the release's own.
        slots: parts.map(({ slot, evidence }) => ({
          slotKey: slot.key,
          // Per slot, because a block CAN gather its slots from two sources at once, and one
          // label for the whole binding would name only the first one's. A reader chasing where
          // a write came from needs the answer for THAT slot.
          evidence,
          entity: slot.entity ?? null,
          type: slot.type ?? 'text',
          maxCharacters: Number.isInteger(slot.maxCharacters) ? slot.maxCharacters : null,
          requiresEvidence: Boolean(slot.requiresEvidence),
          sample: typeof slot.sample === 'string' ? slot.sample : '',
          ...(typeof slot.current === 'string' ? { current: slot.current } : {})
        })),
        // The distinct sources behind this binding, so the group-level answer is true even when
        // its slots came from different ones.
        evidence: [...new Set(parts.map((p) => p.evidence))].sort().join('+')
      })
      continue
    }
    // 🔒 THE ONE-SLOT BRANCH TAKES THE SEMANTIC-KEY SLOT WHEN THERE IS ONE, and says so rather
    // than relying on `declaredFor` happening to push those first. That ordering is real today
    // (`declaredFor` runs the `semanticKey` loop before the capability loops) but it is an
    // invariant between two functions that nothing asserts: swap those loops and a group with a
    // genuine semantic key would silently bind to a block's first slot instead.
    const { slot, evidence } = bySemanticKey[0] ?? writable[0]
    if (slot.writable === false) {
      unresolved.push({ group: group.id, semanticKey: group.semanticKey, why: UNRESOLVED.NOT_WRITABLE })
      continue
    }
    bindings.push({
      group: group.id,
      semanticKey: group.semanticKey,
      slotKey: slot.key,
      entity: slot.entity ?? null,
      type: slot.type ?? 'text',
      maxCharacters: Number.isInteger(slot.maxCharacters) ? slot.maxCharacters : null,
      requiresEvidence: Boolean(slot.requiresEvidence),
      sample: typeof slot.sample === 'string' ? slot.sample : '',
      current: typeof slot.current === 'string' ? slot.current : undefined,
      evidence
    })
  }

  bindings.sort((a, b) => (a.group < b.group ? -1 : 1))
  unresolved.sort((a, b) => (a.group < b.group ? -1 : 1))
  const body = {
    schema: BINDINGS_SCHEMA,
    release: release.tag,
    contract: release.contract ?? null,
    bindings,
    unresolved
  }
  return { ...body, hash: hashOf(body) }
}

/** Refuse to continue while any group is unbound. See the header: unresolved blocks, by design. */
export function assertResolved(resolution) {
  if (resolution?.unresolved?.length) throw new BindingsUnresolvedError(resolution.unresolved)
  return resolution
}
