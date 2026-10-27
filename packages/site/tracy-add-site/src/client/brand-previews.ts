/**
 * What the browser knows of a logo or favicon the customer picked: the picture to preview, its size and its blend
 * (`brand-picture.mjs`). The answer itself is only the upload id the door gave back, so the preview is kept here by
 * that id, for the life of the page: closing the sheet, or a change of template that keeps the logo, draws the same
 * picture again without asking the server for it.
 */
import { blendOf, SAMPLE_EDGE } from './brand-picture.mjs'

/** One picked file, as read in the browser. */
export interface PictureRead {
  name: string
  type: string
  size: number
  width: number
  height: number
  /** The browser could not draw it: not an image it can read, whatever its name says. */
  unreadable?: boolean
  /** An object URL of the file, for the preview. */
  src: string
  blend: { lowOnLight: number; lowOnDark: number; box: boolean } | null
}

const previews = new Map<string, PictureRead>()

/** Keep the preview of an upload under the id the door answered. */
export function rememberPreview(id: string, read: PictureRead): void {
  previews.set(id, read)
}

/** The preview of an upload made on this page, or undefined (an id carried from elsewhere draws no picture). */
export function previewOf(id: string | undefined): PictureRead | undefined {
  return id ? previews.get(id) : undefined
}

/**
 * Read a picked file: its size in pixels and, for a PNG, how much of it blends into each preview tile (measured on a
 * `SAMPLE_EDGE` square copy). The blend is a nicety: when the canvas cannot be read it is null and the file is kept.
 */
export function readPicture(file: File): Promise<PictureRead> {
  const read: PictureRead = {
    name: file.name,
    type: file.type,
    size: file.size,
    width: 0,
    height: 0,
    src: '',
    blend: null
  }
  // Not a PNG, or too large: refused on its type or size alone, so it is never decoded.
  if (file.type !== 'image/png' || file.size > 8 * 1048576) return Promise.resolve(read)
  try {
    read.src = URL.createObjectURL(file)
  } catch {
    return Promise.resolve({ ...read, unreadable: true })
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      read.width = img.naturalWidth
      read.height = img.naturalHeight
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_EDGE
        canvas.height = SAMPLE_EDGE
        const context = canvas.getContext('2d')
        if (context) {
          context.drawImage(img, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE)
          read.blend = blendOf(context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data, SAMPLE_EDGE)
        }
      } catch {
        // The blend is a warning only: a file it cannot be measured on is still a good file.
      }
      resolve(read)
    }
    img.onerror = () => resolve({ ...read, unreadable: true })
    img.src = read.src
  })
}
