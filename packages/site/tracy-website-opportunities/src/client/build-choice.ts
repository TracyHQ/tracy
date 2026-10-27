import type { BuildChoices } from './api.ts'

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
  template: { design: string; quickstart: string; label: string } | null
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
