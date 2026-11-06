// The template kit tool's version, in one place: the cli stamps it on every kit it builds (`tool`), and every settle
// command (samples, slot-roles, relabel, setting-slots) stamps it again with `settledAt`, so a reader of a kit knows
// which tool last shaped its slots. A consumer that needs a slot field added in a given version compares the kit's
// `tool` string with its own pinned minimum. Bump the minor when the kit's slot shape grows.
//   3.1.0: text slots carry the whole demo text in `sample` and its lengths in `demoChars`.
export const TOOL_VERSION = '3.1.0'
export const TOOL = `template-kit ${TOOL_VERSION}`

/** Stamp a kit settled again by a no-browser command: the tool that did it and when. */
export function stampSettled(kit, at = new Date().toISOString()) {
  kit.tool = TOOL
  kit.settledAt = at
  return kit
}
