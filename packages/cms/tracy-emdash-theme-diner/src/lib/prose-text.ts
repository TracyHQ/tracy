// The plain text of a Portable Text value, cut at a word: what a card prints as its short text.
export function plainText(value: unknown, max: number): string {
  if (!Array.isArray(value)) return ''
  const text = value
    .filter((b: any) => b?._type === 'block')
    .map((b: any) => (b.children ?? []).map((c: any) => c.text ?? '').join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : max).trim()} ...`
}

/** The first paragraph of a Portable Text value as plain text: the card's intro, which the source takes from the article's first paragraph. */
export function firstParagraph(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const block = value.find(
    (b: any) =>
      b?._type === 'block' &&
      (b.style ?? 'normal') === 'normal' &&
      (b.children ?? []).some((c: any) => c.text?.trim())
  )
  return block
    ? (block.children ?? [])
        .map((c: any) => c.text ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
}
