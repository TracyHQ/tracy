// Shared text helpers of the ingest scripts: one-pass entity decoding and tag stripping that cannot be defeated by
// nesting (`&amp;lt;` stays `&lt;`, `<scr<b>ipt>` leaves no tag behind).

/** Decodes the named entities of `map` (and nothing else) in ONE pass, so a decoded `&` never starts a second entity. */
export const decodeWith = (map) => {
  const re = new RegExp(Object.keys(map).join('|'), 'g')
  return (s) => s.replace(re, (m) => map[m])
}

/** Replaces every tag with `sep`, repeating until no `<...>` is left, so a tag cannot be rebuilt from what surrounds it. */
export const stripTags = (html, sep = '') => {
  let out = String(html)
  for (let prev = null; prev !== out; ) {
    prev = out
    out = out.replace(/<[^<>]+>/g, sep)
  }
  return out
}
