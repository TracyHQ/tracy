/** Types for `index.mjs`: the interface languages Tracy supports (spec #730). */

/** One supported interface language. */
export interface InterfaceLanguage {
  readonly id: string
  readonly label: string
  /** False while its translation is still in progress: not registered, not selectable. */
  readonly shown: boolean
}

export declare const INTERFACE_LANGUAGES: readonly InterfaceLanguage[]

/** Ids of the languages a customer can pick today. */
export declare const SHOWN_LANGUAGE_IDS: readonly string[]

/** The interface language as a BCP 47 tag for `Intl`, or undefined outside a browser. */
export declare function interfaceLocale(): string | undefined
