/**
 * Which card and which platform the Add site wizard shows after a "Create with <CMS>" press.
 *
 * The wizard keeps two answers a press can move — the platform pill and the template the form
 * starts from — and one more fact: which press it has already applied. The rules were spread over
 * `useState` initialisers and an effect, so only a real browser could test them (#381, #386). They
 * live here as plain functions; `wizard.tsx` calls them and holds the results in React state.
 *
 * 🔒 A PRESS IS APPLIED ONCE. The opener re-lands the same press (pending → ready) and
 * better-sidebar hands the tab over on every render; re-applying on each would undo a pick made by
 * hand. A NEW press key is what moves the pill and the card.
 */

/**
 * What the wizard starts with.
 *
 * `kept` is what the person picked by hand before the wizard last left the screen (`wizard-draft.mjs`
 * `draftOf`, which hands it back only under the same press): their pill and origin card win over the
 * press that was already applied once, so a return from "Change design" lands where they were.
 * @param {{
 *   pressedPlatform?: string,
 *   pressedDesign?: string,
 *   pressedOrigin?: string,
 *   addressDesign?: string,
 *   defaultPlatform: string,
 *   kept?: { platform: string, origin: string, design?: string }
 * }} input - the tab's press, the template named on the address, the platform of a bare tab, and
 *   the picks the wizard kept.
 * @returns {{ platform: string, design: string | undefined, origin: string }} The starting pill,
 *   template and origin card (`create` unless the press named `import`, from the start screen).
 */
export function initialPress({
  pressedPlatform,
  pressedDesign,
  pressedOrigin,
  addressDesign,
  defaultPlatform,
  kept
}) {
  if (kept !== undefined)
    return {
      platform: kept.platform,
      design: kept.design ?? pressedDesign ?? addressDesign,
      origin: kept.origin
    }
  return {
    platform: pressedPlatform ?? defaultPlatform,
    design: pressedDesign ?? addressDesign,
    origin: pressedOrigin ?? 'create'
  }
}

/**
 * What a press arriving on a mounted wizard changes.
 * @param {string | undefined} appliedKey - the key of the last press the wizard applied.
 * @param {{
 *   pressKey?: string,
 *   pressedPlatform?: string,
 *   pressedDesign?: string,
 *   pressedOrigin?: string,
 *   addressDesign?: string
 * }} incoming - what the tab carries now.
 * @returns {{ key: string, platform?: string, origin?: string, design: string | undefined } | null} Null when
 *   nothing changes (no press, or one already applied). Otherwise the key to remember, the pill
 *   to move to — absent when the press named no platform, so the pill stays where it is — and the
 *   template, falling back to the address when the press named none.
 */
export function applyPress(
  appliedKey,
  { pressKey, pressedPlatform, pressedDesign, pressedOrigin, addressDesign }
) {
  if (pressKey === undefined || pressKey === appliedKey) return null
  return {
    key: pressKey,
    ...(pressedPlatform === undefined ? {} : { platform: pressedPlatform }),
    ...(pressedOrigin === undefined ? {} : { origin: pressedOrigin }),
    design: pressedDesign ?? addressDesign
  }
}

/**
 * The platform actually selected. The person's pick is kept in state, but the operator may switch
 * exactly that platform off while the wizard is open; the first enabled one shows instead, and the
 * pick itself is not reset, so switching it back on restores it.
 * @template {{ value: string }} T
 * @param {readonly T[]} enabled - the platforms the operator left on, in display order.
 * @param {string} platform - the platform in state.
 * @returns {T | undefined} The entry to show, or undefined when none is enabled.
 */
export function chosenPlatform(enabled, platform) {
  return enabled.find((entry) => entry.value === platform) ?? enabled[0]
}
