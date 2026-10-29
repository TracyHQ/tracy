import { channel } from 'node:diagnostics_channel'

const pictureCalls = channel('tracy.picture-model-call')

/**
 * Observe the provider request and body read without retaining prompts, credentials or answers.
 * @template T
 * @param {'drawing' | 'vision'} kind
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function observePictureCall(kind, work) {
  if (!pictureCalls.hasSubscribers) return work()
  const token = {}
  pictureCalls.publish({ phase: 'start', kind, token })
  try {
    return await work()
  } finally {
    pictureCalls.publish({ phase: 'end', kind, token })
  }
}

/**
 * Classify at the shared model gateway so direct imports and future callers are covered too.
 * @template T
 * @param {{images?: boolean, modalities?: string[], messages?: Array<{content: unknown}>}} req
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export function observeModelRequest(req, work) {
  if (req.images || req.modalities?.includes('image')) return observePictureCall('drawing', work)
  const seesPicture = req.messages?.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === 'image_url' || part?.type === 'input_image')
  )
  return seesPicture ? observePictureCall('vision', work) : work()
}
