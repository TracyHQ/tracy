/// <reference types="vite/client" />
/**
 * The English of every namespace, merged: `ns/*.ts` found by Vite's eager glob, so adding a
 * namespace is adding its files. A bundle without Vite's glob (a test's esbuild bundle) gets it from
 * `test/support/ops-i18n-esbuild.mjs`; without that plugin there is no English and keys show.
 */
type NamespaceModule = { readonly en?: Readonly<Record<string, string>> }

function discover(): Record<string, NamespaceModule> {
  try {
    return import.meta.glob<NamespaceModule>('./ns/*.ts', { eager: true })
  } catch {
    return {}
  }
}

export const ENGLISH: Readonly<Record<string, string>> = Object.freeze(
  Object.assign({}, ...Object.values(discover()).map((mod) => mod.en ?? {}))
)
