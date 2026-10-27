export type TemplatePick = { cms: string; quickstart: string; design: string }
export type TemplateSuggestion = TemplatePick & { label?: string | null; reason?: string }
/** How the picker groups the cards for a business of `trade`: card ids made for it, then card ids for any business. */
export type TemplateRanking = { trade: string; recommended: string[]; generic: string[] }
export const TEMPLATE_PICK_EVENT: 'tracy:pick-template'
export function requestTemplatePick(
  target?: Window,
  options?: { ranking?: TemplateRanking | null }
): Promise<TemplatePick | null>
