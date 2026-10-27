/**
 * When the two pills lose their words. The hero row gives the picker whatever the workspace chip
 * leaves (the picker's box grows into it, never below two icons' width); the pills show their
 * labels only while that room holds them whole, and fall back to icons only otherwise — the
 * workspace chip then shortens its own label if even the icons do not fit.
 *
 * The labels' full width can only be read while they are shown, so it is remembered from the last
 * measurement taken in the labelled state and kept while compact. A change of labels (another
 * mode, another platform, another language) forgets it: the picker shows the words again for one
 * layout pass to learn their new width.
 *
 * @param {{ compact: boolean, room: number, content: number, full: number }} m
 *   `room` — the picker box's inner width; `content` — the pills' current width;
 *   `full` — the labelled width remembered so far (0 when unknown).
 * @returns {{ compact: boolean, full: number }}
 */
export function fitLabels({ compact, room, content, full }) {
  const known = compact ? full : content
  if (known <= 0) return { compact: false, full: 0 }
  return { compact: room < known, full: known }
}
