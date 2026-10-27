// Types of site-label.mjs for the TypeScript client, which imports it by relative path.
export function siteLabelFor(name: unknown, options?: { cms?: string; suffix?: string; max?: number }): string
export function nextSiteLabel(base: string, taken: Set<string>): string
