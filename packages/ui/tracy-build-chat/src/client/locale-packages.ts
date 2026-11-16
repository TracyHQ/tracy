/**
 * The locale packages the build chat reads its other languages from (`locale-tables.ts`), reached through the module
 * loader's `require`. `package.json` names both in `dsh.client.external`, so their factories arrive before this
 * bundle's, and `scripts/build-client.mjs` keeps both names external. Apart from `index.tsx` so a test that bundles
 * the cards needs neither package.
 */
import { localeTablesVia } from './locale-tables'

/** The module loader's `require` of this bundle's factory. */
declare const require: (id: string) => unknown

/** The tables as the browser reads them: Vietnamese first, then every other language. */
export const localeTables = localeTablesVia([
  () => require('@tracy/dsh-tracy-locale-vi'),
  () => require('@tracy/dsh-tracy-locales')
])
