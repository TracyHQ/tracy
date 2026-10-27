/**
 * The colours a card shows beside its name, read off `tokens.css`. Accent-like names first: the file
 * opens with surfaces, so "the first seven colours" would be seven whites.
 */
export function swatchesOf(tokensCss: string, max = 5): string[] {
  const want = ['--accent', '--primary', '--brand', '--bg', '--fg', '--surface', '--success', '--warn']
  const found = new Map<string, string>()
  const re = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tokensCss))) {
    const name = m[1]!
    if (!found.has(name)) found.set(name, m[2]!.toLowerCase())
  }
  const out: string[] = []
  for (const name of want) {
    const hex = found.get(name)
    if (hex && !out.includes(hex)) out.push(hex)
    if (out.length >= max) break
  }
  if (out.length < max) {
    for (const hex of found.values()) {
      if (!out.includes(hex)) out.push(hex)
      if (out.length >= max) break
    }
  }
  return out
}
