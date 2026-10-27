/**
 * The line under the Language row on "Appearance & language" (Lee, 11/10/2026): while the language
 * follows the device, and the device's language is not one Tracy offers, say so and which language
 * is used instead; when the device's language could not be read, say that. A saved pick says
 * nothing: it wins over the device.
 *
 * The device's languages come from where dsh read them: the desktop app's `__DSH_LOCALE__` bridge
 * (`read().languages`, plan contract 6), else the browser's `navigator.languages`. Matching repeats
 * dsh's own rule (`dsh-client-locale` `detectBrowserLocale`): an exact id first, then the primary
 * subtag, and a Traditional Chinese tag never lands on the Simplified pack.
 */

/** The slice of dsh's locale snapshot this reads. */
export interface LocaleView {
  readonly active: string
  /** Absent while the language follows the device. */
  readonly preference?: string
  readonly locales: readonly { readonly id: string; readonly label: string }[]
}

export type LanguageNote =
  /** `system`: the device's language in its own name; `fallback`: the language used instead. */
  | { readonly kind: 'unsupported'; readonly system: string; readonly fallback: string }
  | { readonly kind: 'failed'; readonly fallback: string }

const TRADITIONAL_CHINESE = /^zh-(?:hant|tw|hk|mo)(?:-|$)/

const key = (tag: string) => tag.trim().toLowerCase().replace(/_/g, '-')

/** Whether `tag` lands on one of `locales`, as dsh decides. */
function offered(locales: LocaleView['locales'], tag: string): boolean {
  const requested = key(tag)
  if (locales.some((l) => key(l.id) === requested)) return true
  const primary = requested.split('-')[0]
  const traditional = primary === 'zh' && TRADITIONAL_CHINESE.test(requested)
  return locales.some((l) => {
    const id = key(l.id)
    return id.split('-')[0] === primary && (!traditional || TRADITIONAL_CHINESE.test(id))
  })
}

/** A language tag's name in that language (`ja-JP` → `日本語`), or the tag itself. */
function ownName(tag: string): string {
  const primary = key(tag).split('-')[0]
  try {
    const name = new Intl.DisplayNames([primary], { type: 'language' }).of(primary)
    return name && name !== primary ? name : tag
  } catch {
    return tag
  }
}

/**
 * The line, or null when none is due.
 * @param snapshot - dsh's locale snapshot.
 * @param languages - the device's languages in order; null when they could not be read.
 */
export function languageNote(snapshot: LocaleView, languages: readonly string[] | null): LanguageNote | null {
  if (snapshot.preference !== undefined) return null
  const fallback = snapshot.locales.find((l) => l.id === snapshot.active)?.label ?? snapshot.active
  const tags = (languages ?? []).filter((tag) => typeof tag === 'string' && tag.trim() !== '')
  if (tags.length === 0) return { kind: 'failed', fallback }
  if (tags.some((tag) => offered(snapshot.locales, tag))) return null
  return { kind: 'unsupported', system: ownName(tags[0]), fallback }
}

/**
 * The device's languages as dsh read them: the desktop app's `__DSH_LOCALE__` bridge, else the
 * browser's list. Resolves null when neither answers.
 */
export async function deviceLanguages(scope: unknown = globalThis): Promise<readonly string[] | null> {
  const bridge = (scope as { __DSH_LOCALE__?: { read?: () => Promise<unknown> } }).__DSH_LOCALE__
  if (typeof bridge?.read === 'function') {
    try {
      const value = (await bridge.read()) as { languages?: unknown } | null
      const list = value?.languages
      return Array.isArray(list) && list.every((tag) => typeof tag === 'string') ? list : null
    } catch {
      return null
    }
  }
  const nav = (scope as { navigator?: { languages?: readonly string[]; language?: string } }).navigator
  if (nav === undefined) return null
  const list = [...(nav.languages ?? []), ...(nav.language ? [nav.language] : [])]
  return list.length > 0 ? list : null
}
