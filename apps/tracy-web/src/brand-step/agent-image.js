// Images handed back to the agent are downscaled to 512 px on the long edge (brand bench harness setting): the agent
// reads shapes and colours, not pixels, and every image is sent again with each request. Never enlarged.
import sharp from 'sharp'

export const AGENT_IMAGE_SIDE = 512

/** PNG bytes of the image fitted inside 512 x 512 (alpha kept). */
export function toAgentImage(buffer) {
  return sharp(buffer)
    .resize(AGENT_IMAGE_SIDE, AGENT_IMAGE_SIDE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
}
