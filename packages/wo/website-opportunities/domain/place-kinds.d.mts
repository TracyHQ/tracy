// Types of place-kinds.mjs for the TypeScript client, which imports it by relative path.
export type Kind = 'restaurants' | 'cafes' | 'fast-food' | 'bakeries' | 'bars' | 'nightlife'

export const KINDS: readonly Kind[]
export const SEARCH_PRIMARY_TYPES: readonly string[]
export const CUISINES: readonly string[]
export function kindOfPrimaryType(type: unknown): Kind | null
export function primaryTypesOfKinds(kinds: unknown): string[]
export function cuisineOfPrimaryType(type: unknown): string | null
export function primaryTypeOfCuisine(cuisine: string): string | null
