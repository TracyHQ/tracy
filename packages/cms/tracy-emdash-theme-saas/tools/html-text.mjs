// String helpers for the contract generator (`build-qa-contract-kinetic.mjs`), kept apart so they can
// be tested without a crawl.

// Script elements carry no page text. Removed until none is left, so a tag split by a removal
// cannot reassemble, and matched in any case. Only a real script tag counts: `<script` followed by
// whitespace, `/` or `>`, so `<scripted>` and `<script-widget>` keep their text.
export const withoutScripts = (html) => {
  let out = html
  for (let prev; prev !== out; ) {
    prev = out
    out = out.replace(/<script(?=[\s/>])[\s\S]*?<\/script\s*>/gi, '')
  }
  return out
}

// A literal string as a RegExp source.
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
