// Category slug → lucide icon name, matched to the template's category SVGs (shape score 1.00,
// DECISIONS D34). Terms have no icon field, so the mapping lives here; an unmapped category gets the
// neutral compass rather than a guess.
const ICONS: Record<string, string> = {
  engineering: 'cpu',
  'incident-retros': 'siren',
  product: 'package',
  tutorials: 'graduation-cap',
  practice: 'compass',
  culture: 'users'
}

export function categoryIcon(slug: string): string {
  return ICONS[slug] ?? 'compass'
}
