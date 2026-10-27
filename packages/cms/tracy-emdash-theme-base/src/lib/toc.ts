/** Heading text -> id, stable across renders; Cyrillic kept as-is (browsers accept it). */
export function toId(text: string): string {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'section'
  )
}
/** Table of contents entries from a Portable Text value: every `h2` block. */
export function tocOf(blocks: any[]): Array<{ id: string; label: string }> {
  return (blocks ?? [])
    .filter((b) => b?._type === 'block' && b.style === 'h2')
    .map((b) => {
      const label = (b.children ?? []).map((c: any) => c.text ?? '').join('')
      return { id: toId(label), label }
    })
}

/**
 * Sidebar labels for the contents box. The source shows short labels ("Catalogue dynamic loads")
 * next to long numbered headings; `labels` (the post's `toc` repeater) overrides by position and the
 * heading text remains the fallback, so a post without short labels still gets a full contents box.
 */
export function tocLabels(
  toc: Array<{ id: string; label: string }>,
  labels: Array<{ label?: string }> | undefined
): Array<{ id: string; label: string }> {
  return toc.map((t, i) => ({ id: t.id, label: labels?.[i]?.label?.trim() || t.label }))
}

/**
 * Group runs of two or more adjacent `image` blocks into one `figures` node so the article body can
 * lay them out side by side (source: two illustrations in a two-column grid). Single images are
 * left alone. Returns a new array; the input is not mutated.
 */
export function groupFigures(blocks: any[]): any[] {
  const out: any[] = []
  for (const b of blocks ?? []) {
    const last = out[out.length - 1]
    if (b?._type === 'image' && last?._type === 'image') {
      out[out.length - 1] = {
        _type: 'figures',
        _key: `figures-${last._key ?? out.length}`,
        images: [last, b]
      }
    } else if (b?._type === 'image' && last?._type === 'figures') {
      last.images.push(b)
    } else out.push(b)
  }
  return out
}
