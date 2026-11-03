// The drawing prompt of make_icon. The tool owns it: the agent gives only a subject and the colours. Ported from the
// approved lab (decisions 18 to 20: one subject, no scene, bold shapes, readable at 128 px, no text, plain ground).
import { pickGround } from './icon-ground.js'

const NAMES = ['first', 'second']

/** @returns {{ prompt: string, ground: { name: string, hex: string } }} */
export function iconPrompt(subject, colours) {
  const ground = pickGround(colours)
  const colourText =
    colours.length === 1
      ? `Use exactly one colour for the whole symbol: ${colours[0]}. Nothing else is coloured.`
      : `Use exactly two colours: ${colours[0]} (${NAMES[0]} colour) and ${colours[1]} (${NAMES[1]} colour), each filling clearly separate parts of the symbol, both well visible. No other colours, no tints or shades of them.`
  const prompt = [
    `A flat vector brand icon, a logo symbol, for ${subject}.`,
    'Simple and bold: ONE subject only, the one named above. It may be a single object, or one simplified figure with ONE object or piece of equipment it uses. Not a full scene: no setting, no background objects, no ground or horizon lines, no extra props, no decoration.',
    'The subject may sit inside or be merged with one simple geometric form (a circle or a rounded square), so the whole is compact and roughly as tall as it is wide, never a wide strip.',
    'Large bold solid shapes with clear empty space (negative space) around and between them. No thin lines or hairlines, no small details, no rows or patterns of many small repeated items, no texture.',
    'It must read clearly at 128 x 128 pixels, the size of a logo in a website header: if a part would vanish at that size, leave it out.',
    colourText,
    'No text, no letters, no numbers, no words, no monogram, no signature, no watermark.',
    'No gradients, no shading, no shadows, no 3D, no outline in another colour, no extra frame or border around the icon. Parts may be cut out as plain background showing through.',
    `Plain uniform ${ground.name} background (${ground.hex}) filling the whole square image, nothing else on it. The icon takes about 70% of the width and of the height.`
  ].join(' ')
  return { prompt, ground }
}
