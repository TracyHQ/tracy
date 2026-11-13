// The declared frame of a picture or icon field (ticket #595), read exactly as Contract A declares it
// (`ai-quickstart-contract.mjs`): `frame: {width, height}`, both whole numbers of pixels from 1. A field without a
// `frame` key has no frame (the template sizes it). Any other shape (`{w, h}`, a number written as text, one side only,
// zero) is reported as a problem, never read as "no frame" and never guessed. Pure.

const isWhole = (value) => Number.isInteger(value) && value >= 1

/**
 * The frame of a field.
 * @param {{frame?: unknown}} field
 * @returns {{frame: {width: number, height: number} | null, problem: string | null}}
 */
export function frameOfField(field) {
  if (field?.frame === undefined || field.frame === null) return { frame: null, problem: null }
  const { frame } = field
  if (typeof frame !== 'object' || Array.isArray(frame))
    return { frame: null, problem: 'a frame is an object {width, height}' }
  const keys = Object.keys(frame).sort().join(',')
  if (keys !== 'height,width')
    return {
      frame: null,
      problem: `a frame is {width, height} as Contract A declares it, not {${Object.keys(frame).join(', ')}}`
    }
  if (!isWhole(frame.width) || !isWhole(frame.height))
    return {
      frame: null,
      problem: `width and height are whole numbers of pixels from 1, not ${JSON.stringify(frame)}`
    }
  return { frame: { width: frame.width, height: frame.height }, problem: null }
}
