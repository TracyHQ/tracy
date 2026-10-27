/**
 * Unit tests for the client apply wiring (`src/client/index.ts`).
 *
 * The apply function registers each bundled language through DSH's native
 * API — `ctx.locale.addLanguage` + `ctx.locale.register(ns, locale, dict)`
 * — inside one `ctx.effect` per language. These tests drive `apply` with a
 * fake cordis context (effects run immediately, disposers collected) and a
 * fake LocaleRuntime that mirrors the upstream duplicate guards (duplicate
 * catalog id / duplicate (ns, locale) throw; disposers remove by
 * identity), proving:
 *
 *   - every curated language is registered once with fallback 'en',
 *   - every (namespace, language) dictionary pair is registered with the
 *     bundled dict object (identity preserved),
 *   - running the collected disposers removes the whole contribution
 *     (HMR safety), after which a re-apply succeeds from a clean state,
 *   - applying twice without disposal throws (the plugin relies on
 *     `ctx.effect` disposal rather than silent overwrite).
 *
 * The coexistence suite pins the scope contract from the other side:
 * unmigrated third-party plugins (zh/en only) coexist with zero errors and
 * resolve their namespaces through the fallback chain; migrated ones may
 * register their own namespace for any bundled language; registering a
 * built-in namespace for a third language throws (single-occupant slots —
 * the mechanism behind the "your namespace is yours" boundary).
 *
 * No module mock is needed: the client half imports DSH types only, so
 * the fake satisfies `apply` structurally at runtime.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.ts'
import { BUNDLED_LANGUAGES } from '../src/client/languages.ts'
import { dicts as deDicts } from '../src/client/dictionaries/de.ts'

/** Mirror of the upstream LocaleRuntime registration surface used by apply. */
class FakeLocaleRuntime {
  readonly catalog = new Map<string, { id: string, label: string, fallback?: string }>()
  readonly dicts = new Map<string, Map<string, Record<string, string>>>()

  constructor() {
    // Upstream seeds the two built-ins at construction; the fallback chain
    // walk below relies on them being present.
    this.catalog.set('zh', { id: 'zh', label: '中文', fallback: 'en' })
    this.catalog.set('en', { id: 'en', label: 'English' })
  }

  addLanguage(input: { id: string, label: string, fallback: string }): () => void {
    const key = input.id.toLowerCase()
    if (this.catalog.has(key)) throw new Error(`locale "${input.id}" is already registered`)
    if (!this.catalog.has(input.fallback.toLowerCase())) {
      throw new Error(`locale fallback "${input.fallback}" is not registered`)
    }
    const entry = { ...input }
    this.catalog.set(key, entry)
    return () => {
      if (this.catalog.get(key) !== entry) return
      this.catalog.delete(key)
    }
  }

  register(ns: string, locale: string, dict: Record<string, string>): () => void {
    let locales = this.dicts.get(ns)
    if (locales === undefined) {
      locales = new Map()
      this.dicts.set(ns, locales)
    }
    const key = locale.toLowerCase()
    if (locales.has(key)) {
      throw new Error(`locale namespace "${ns}" already has locale "${locale}"`)
    }
    locales.set(key, dict)
    return () => {
      if (locales.get(key) !== dict) return
      locales.delete(key)
    }
  }

  /**
   * Fallback-chain lookup mirroring upstream `LocaleRuntime.translate` for a
   * single namespace: walk active → declared fallbacks → English, first hit
   * wins (the shared-common consultation is omitted; test keys never collide
   * with the common vocabulary).
   */
  translate(ns: string, key: string, active: string): string {
    const chain: string[] = []
    const seen = new Set<string>()
    let current: { id: string, fallback?: string } | undefined = this.catalog.get(active.toLowerCase())
    while (current !== undefined && !seen.has(current.id.toLowerCase())) {
      seen.add(current.id.toLowerCase())
      chain.push(current.id)
      current = current.fallback === undefined
        ? undefined
        : this.catalog.get(current.fallback.toLowerCase())
    }
    if (!seen.has('en')) chain.push('en')
    const locales = this.dicts.get(ns)
    for (const locale of chain) {
      const value = locales?.get(locale.toLowerCase())?.[key]
      if (value !== undefined) return value
    }
    return key
  }
}

interface RecordedEffect {
  readonly label: string | undefined
  readonly dispose: () => void
}

/** Minimal cordis context stand-in: effects run immediately and record their disposers. */
class FakeCtx {
  readonly locale = new FakeLocaleRuntime()
  readonly effects: RecordedEffect[] = []

  effect(body: () => unknown, label?: string): () => void {
    const result = body()
    const dispose = typeof result === 'function' ? result : () => {}
    const effect = { label, dispose }
    this.effects.push(effect)
    return dispose
  }
}

/** Apply the plugin to a fresh context, returning the context. */
function applyToFreshCtx(): FakeCtx {
  const ctx = new FakeCtx()
  apply(ctx as unknown as Context)
  return ctx
}

describe('client apply wiring', () => {
  it('registers one effect per bundled language', () => {
    const ctx = applyToFreshCtx()
    expect(ctx.effects.length).toBe(BUNDLED_LANGUAGES.length)
    expect(ctx.effects.map(e => e.label)).toEqual(
      BUNDLED_LANGUAGES.map(l => `dsh-plugin-better-locale: language ${l.id}`),
    )
  })

  it('registers every language in the catalog with its declared fallback', () => {
    const ctx = applyToFreshCtx()
    // the fake seeds the two built-ins (zh/en) like upstream; compare the
    // plugin's own catalog entries only
    const added = [...ctx.locale.catalog.values()]
      .filter(l => l.id !== 'zh' && l.id !== 'en')
      .map(l => ({ id: l.id, label: l.label, fallback: l.fallback }))
    expect(added).toEqual(BUNDLED_LANGUAGES.map(l => ({ id: l.id, label: l.label, fallback: l.fallback })))
  })

  it('registers every (namespace, language) dictionary pair with the bundled dict', () => {
    const ctx = applyToFreshCtx()
    const expectedPairs = BUNDLED_LANGUAGES
      .flatMap(l => Object.keys(l.dicts).map(ns => ({ ns, id: l.id })))
    // The fake (like upstream) keys dictionaries by case-folded locale id,
    // so compare pairs case-insensitively.
    const fold = (p: { ns: string, id: string }): string => `${p.ns}\u0000${p.id.toLowerCase()}`
    const actualPairs: { ns: string, id: string }[] = []
    for (const [ns, locales] of ctx.locale.dicts) {
      for (const locale of locales.keys()) actualPairs.push({ ns, id: locale })
    }
    expect(new Set(actualPairs.map(fold))).toEqual(new Set(expectedPairs.map(fold)))

    // Identity: the registered dict object is the bundled module's dict.
    expect(ctx.locale.dicts.get('common')?.get('de')).toBe(deDicts['common'])
  })

  it('disposal removes the whole contribution (HMR safety)', () => {
    const ctx = applyToFreshCtx()
    for (const effect of [...ctx.effects].reverse()) effect.dispose()
    // the two built-ins stay; every plugin language is gone
    expect([...ctx.locale.catalog.keys()].sort()).toEqual(['en', 'zh'])
    expect([...ctx.locale.dicts.values()].every(locales => locales.size === 0)).toBe(true)
  })

  it('re-apply after disposal succeeds from the clean state', () => {
    const ctx = applyToFreshCtx()
    for (const effect of [...ctx.effects].reverse()) effect.dispose()
    expect(() => apply(ctx as unknown as Context)).not.toThrow()
    expect(ctx.locale.catalog.size).toBe(BUNDLED_LANGUAGES.length + 2)
  })

  it('applying twice without disposal throws (single occupant, disposal owns cleanup)', () => {
    const ctx = applyToFreshCtx()
    expect(() => apply(ctx as unknown as Context)).toThrowError(/already registered/)
  })
})

describe('coexistence with third-party plugins', () => {
  /**
   * The scope contract this plugin locks itself into: better-locale owns the
   * `(built-in ns, third language)` slots and nothing else. Third-party
   * plugins register their OWN namespaces; the three cases below prove the
   * resulting behavior against the fake runtime's upstream semantics.
   */
  const THIRD_PARTY_NS = 'third-party-demo'

  it('an unmigrated third-party plugin (only zh/en dictionaries) works with zero errors and falls back to English', () => {
    const ctx = applyToFreshCtx()
    expect(() => {
      ctx.locale.register(THIRD_PARTY_NS, 'zh', { greeting: '你好，演示插件' })
      ctx.locale.register(THIRD_PARTY_NS, 'en', { greeting: 'Hello from the demo plugin' })
    }).not.toThrow()
    // No slot intersection: the third-party ns is untouched by better-locale.
    expect(ctx.locale.dicts.get(THIRD_PARTY_NS)?.size).toBe(2)
    // Active de (covered by better-locale) still resolves the third-party ns
    // through the fallback chain to English.
    expect(ctx.locale.translate(THIRD_PARTY_NS, 'greeting', 'de')).toBe('Hello from the demo plugin')
    // Active zh hits the plugin's own Chinese dictionary directly.
    expect(ctx.locale.translate(THIRD_PARTY_NS, 'greeting', 'zh')).toBe('你好，演示插件')
  })

  it('a migrated third-party plugin can register its own namespace for any bundled language', () => {
    const ctx = applyToFreshCtx()
    expect(() => {
      ctx.locale.register(THIRD_PARTY_NS, 'de', { greeting: 'Grüße vom Demo-Plugin' })
    }).not.toThrow()
    expect(ctx.locale.translate(THIRD_PARTY_NS, 'greeting', 'de')).toBe('Grüße vom Demo-Plugin')
  })

  it('a third-party plugin registering a built-in namespace for a third language throws (slot occupied)', () => {
    const ctx = applyToFreshCtx()
    // better-locale already registered ('common', 'de'); upstream is
    // single-occupant per (ns, locale) — the later registration throws.
    expect(() => ctx.locale.register('common', 'de', { ok: 'Ja' })).toThrowError(/already has locale/)
  })
})
