/**
 * The build chat's tables in the languages other than English, read in the browser from the locale packages dsh
 * already ships (#609): `@tracy/dsh-tracy-locale-vi` (Vietnamese) and `@tracy/dsh-tracy-locales` (German, Spanish,
 * French, Italian, Dutch, Chinese). dsh's locale service translates in its active language only, and the cards speak
 * the language of the conversation, so the cards read their namespace in any language from those packages' own
 * exports (`dictionaryOf`), through the module loader's `require` (`locale-packages.ts`). This bundle therefore holds
 * English only, and the translations stay data in the locale packages. A composition without one of them answers no
 * table for its languages, and the cards keep the interface language.
 */
import type { TableSource } from './chat-language'
import { NS } from './strings'

/** One way to reach a locale package's exports; it throws when the package is not in the composition. */
export type LocaleModuleLoad = () => unknown

interface LocaleModule {
  dictionaryOf?: (namespace: string, language: string) => unknown
}

/** A table source over locale packages: the first one with this plugin's namespace in `language` answers. */
export function localeTablesVia(loads: readonly LocaleModuleLoad[]): TableSource {
  return (language) => {
    for (const load of loads) {
      let table: unknown
      try {
        table = (load() as LocaleModule | undefined)?.dictionaryOf?.(NS, language)
      } catch {
        continue
      }
      if (table !== null && typeof table === 'object') return table as Readonly<Record<string, string>>
    }
    return null
  }
}
