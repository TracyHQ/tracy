/**
 * `writeLanguageCookie` — the language cookie's `Domain=` comes from the caller now (Task 11),
 * not a hardcoded `.tracy.ai` that was wrong on every local checkout.
 *
 *   node --import tsx --test scripts/test/i18n-preference.test.ts
 *
 * WHY HERE, NOT `packages/locale/tracy-i18n/test/`. `preference.ts` imports `./languages` with no
 * extension — see `import-address.test.ts`'s header for why that means plain `node --test`
 * cannot load it (Node's resolver wants the exact file; TypeScript's `Bundler` resolution refuses
 * the explicit `.ts` extension that would satisfy Node). `--import tsx` resolves it correctly.
 * `tsconfig.scripts.json`'s `lib` gained `DOM`/`DOM.Iterable` for this file and
 * `import-address.test.ts`, since both reach into browser client code.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LANGUAGE_COOKIE, writeLanguageCookie } from '../../packages/locale/tracy-i18n/src/preference.ts'

/** Runs `fn` with a fake `document` whose `cookie` writes are captured, then restores the real one. */
function withFakeDocument(fn: (doc: { cookie: string }) => void): void {
  const original = (globalThis as { document?: unknown }).document
  const fake = { cookie: '' }
  ;(globalThis as { document?: unknown }).document = fake
  try {
    fn(fake)
  } finally {
    if (original === undefined) delete (globalThis as { document?: unknown }).document
    else (globalThis as { document?: unknown }).document = original
  }
}

test('empty cookieDomain (the default) writes a host-only cookie: no Domain, no Secure', () => {
  withFakeDocument((doc) => {
    writeLanguageCookie('vi-VN')
    assert.match(doc.cookie, new RegExp(`^${LANGUAGE_COOKIE}=vi-VN`))
    assert.doesNotMatch(doc.cookie, /Domain=/)
    assert.doesNotMatch(doc.cookie, /Secure/)
  })
})

test('a non-empty cookieDomain sets Domain= to exactly that value, plus Secure', () => {
  withFakeDocument((doc) => {
    writeLanguageCookie('vi-VN', '.tracy.ai')
    assert.match(doc.cookie, /Domain=\.tracy\.ai/)
    assert.match(doc.cookie, /Secure/)
  })
})

test('no domain is invented from location — the caller decides, this file no longer guesses', () => {
  // Before Task 11 this read `location.hostname.endsWith('.tracy.ai')`. There is no such read
  // left: calling with no second argument on any host — including a real *.tracy.ai one — must
  // still come out host-only, because the function no longer looks at `location` at all.
  withFakeDocument((doc) => {
    writeLanguageCookie('en-US')
    assert.doesNotMatch(doc.cookie, /Domain=/)
  })
})
