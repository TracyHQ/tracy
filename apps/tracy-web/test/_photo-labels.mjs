// Test-only helper: the photo labelling as a brief now meets it (item 27). The labeller runs beside the research
// (`photo-labelling.js`), then the brief reads what it wrote (`brief-picture-labels.js`) and asks no model.
import { mergedLabel } from '../src/lib/picture-link-text.js'
import { createBriefPictureLabels } from '../src/opportunities-build/brief-picture-labels.js'
import { createPhotoLabelling } from '../src/opportunities-build/photo-labelling.js'

/** A text linker that keeps the links the content label already names: no network. */
export const keepLinks = async ({ items, closedList }) => ({
  labels: new Map(items.map((i) => [i.id, mergedLabel(i.content, i.content, closedList)])),
  usage: { calls: 1, promptTokens: 1, completionTokens: 1, requests: [] },
  failed: 0
})

/**
 * The old `createBriefPictureLabels(deps)(input)` shape, run through the background labeller first.
 * @param {{pool: any, objects: any, visionFor: () => Promise<any>, label?: Function, link?: Function,
 *   chargeable?: Function, maxPictures?: number, log?: any}} deps
 */
export function labelThenRead({
  pool,
  objects,
  visionFor,
  label,
  link = keepLinks,
  chargeable,
  maxPictures,
  log
}) {
  return async (input) => {
    const service = createPhotoLabelling({
      pool,
      objects,
      visionFor,
      readPhotos: async () => input,
      ...(label ? { label } : {}),
      link,
      ...(chargeable ? { chargeable } : {}),
      ...(maxPictures ? { ceiling: maxPictures } : {}),
      log: log ?? { warn() {} }
    })
    await service.run({ accountId: input.accountId, opportunityId: input.opportunityId ?? null })
    return createBriefPictureLabels({ pool, visionFor, ...(maxPictures ? { maxPictures } : {}), log })(input)
  }
}
