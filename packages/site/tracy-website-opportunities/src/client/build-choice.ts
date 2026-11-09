import type { BuildChoices } from './api.ts'

type OfferedTemplate = BuildChoices[string]['templates'][number]

/**
 * What the Build card shows as its template: the person's pick, else the first template the template picker
 * recommends for this business (`recommended`, the server's ranking, so the card and the picker agree), else the
 * revision's CMS and the template /ops/wo pins for it (else that CMS's first). `null` template = this server offers
 * no choices.
 */
export function buildChoice(
  choices: BuildChoices | null,
  revisionCms: string,
  pickedCms: string | null,
  pickedDesign: string | null,
  recommended: readonly string[] = []
): {
  cmsList: string[]
  cms: string
  template: OfferedTemplate | null
} {
  const cmsList = choices ? Object.keys(choices).filter((key) => choices[key].templates.length > 0) : []
  const advised =
    pickedCms === null && pickedDesign === null
      ? recommendedChoice(choices, cmsList, revisionCms, recommended)
      : null
  if (advised !== null) return { cmsList, ...advised }
  const cms = pickedCms ?? (cmsList.includes(revisionCms) ? revisionCms : (cmsList[0] ?? revisionCms))
  const offered = choices?.[cms]
  const template =
    offered?.templates.find((tpl) => tpl.design === pickedDesign) ??
    offered?.templates.find((tpl) => tpl.design === offered.pinned?.design) ??
    offered?.templates[0] ??
    null
  return { cmsList, cms, template }
}

/** The first recommended design some CMS offers, on the revision's CMS when that one offers it too. */
function recommendedChoice(
  choices: BuildChoices | null,
  cmsList: string[],
  revisionCms: string,
  recommended: readonly string[]
): { cms: string; template: OfferedTemplate } | null {
  if (choices === null) return null
  const order = cmsList.includes(revisionCms)
    ? [revisionCms, ...cmsList.filter((c) => c !== revisionCms)]
    : cmsList
  for (const design of recommended) {
    for (const cms of order) {
      const template = choices[cms].templates.find((tpl) => tpl.design === design)
      if (template) return { cms, template }
    }
  }
  return null
}

/**
 * The site label a build from the Build form sends: what the person typed there, else the Site name on Tracy saved on
 * the opportunity (#519), else the name the server suggests. An emptied field sends no label, and the server then names
 * the site itself (the saved name first).
 */
export function buildLabel(typed: string | null, saved: string | null, suggested: string): string {
  if (typed !== null) return typed.trim()
  return saved || suggested
}
