import type { BuildChoices } from './api.ts'

type OfferedTemplate = BuildChoices[string]['templates'][number]

/**
 * What the Build form shows selected: the person's pick, else the revision's CMS and the template /ops/wo pins
 * for it (else that CMS's first). `null` template = this server offers no choices, so the shared picker opens.
 */
export function buildChoice(
  choices: BuildChoices | null,
  revisionCms: string,
  pickedCms: string | null,
  pickedDesign: string | null
): {
  cmsList: string[]
  cms: string
  template: OfferedTemplate | null
} {
  const cmsList = choices ? Object.keys(choices).filter((key) => choices[key].templates.length > 0) : []
  const cms = pickedCms ?? (cmsList.includes(revisionCms) ? revisionCms : (cmsList[0] ?? revisionCms))
  const offered = choices?.[cms]
  const template =
    offered?.templates.find((tpl) => tpl.design === pickedDesign) ??
    offered?.templates.find((tpl) => tpl.design === offered.pinned?.design) ??
    offered?.templates[0] ??
    null
  return { cmsList, cms, template }
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
