/**
 * `/ops/ui` › Desktop App — the shape of `GET /api/ops/desktop` and the decisions the screen makes
 * from it, kept apart from the drawing so `node --test` can pin them (`test/desktop-app.test.mjs`).
 */

export interface DesktopProvider {
  id: string
  /** The vendor's own name for its plan, verbatim. */
  name: string
}
export interface TracyModel {
  provider: string | null
  /** Always null today: the agent model is chosen inside the dsh image (`lib/desktop-setting.js`). */
  model: string | null
}
export interface DesktopDocument {
  llm: { connect: boolean; providers: string[] }
  tracyModel: TracyModel
  providers: DesktopProvider[]
  updatedBy: string | null
  updatedAt: string | null
  writable: boolean
}

export interface ProviderRow extends DesktopProvider {
  on: boolean
  /** Shown faded: connecting a plan is off, so no vendor is offered whatever its own switch says. */
  dimmed: boolean
  disabled: boolean
}

/** One row per offered vendor, in the door's order. */
export function providerRows(doc: DesktopDocument): ProviderRow[] {
  return doc.providers.map((p) => ({
    ...p,
    on: doc.llm.providers.includes(p.id),
    dimmed: !doc.llm.connect,
    disabled: !doc.writable || !doc.llm.connect
  }))
}

/** The whole vendor list after one vendor's switch is pressed, in the door's order. */
export function providersAfter(doc: DesktopDocument, id: string, on: boolean): string[] {
  return doc.providers.map((p) => p.id).filter((pid) => (pid === id ? on : doc.llm.providers.includes(pid)))
}

/** `provider/model` as far as it is known, or null when the agent door has no vendor assigned. */
export function tracyModelLine(model: TracyModel): string | null {
  if (!model.provider) return null
  return model.model ? `${model.provider}/${model.model}` : model.provider
}
