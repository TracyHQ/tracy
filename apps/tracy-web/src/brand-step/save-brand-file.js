// The brand step's hard gate (prompt v10 Output, decisions 1 to 21): `checkBrandFile` validates a brand file
// (version 10) against the business brief and the template kit, recomputing every number the agent was told to copy
// from a tool, and either accepts it or lists every rejected field.
//
//   const result = await checkBrandFile({ brandFile, brief, kit, files })
//   result.ok === true  -> { ok: true, brandFile }                      the file to save, unchanged
//   result.ok === false -> { ok: false, rejected: [{ field, why }] }    every field the agent has to fix
//
// - brandFile: the parsed brand file. Every path inside it is relative to the run's file folder.
// - brief: the business brief (only brief.brand and brief.missing are read).
// - kit: the template kit (quickstart, template, site.logoSpots, site.nameSlots, site.brandColours).
// - files: the run's file folder as { has(relativePath), read(relativePath) -> Promise<Buffer> } (see memoryFiles).
// The module reads no file, key or environment variable itself and never changes its inputs.
// Recomputed here: the accent lift (accent-lift rule), the favicon code check
// on both browser tabs, the plate contrast, the name slots (name_slots rule), transparency of every image and the
// exact colours of an icon. The order of the checks, and so the order of the rejected list, is the approved lab gate's.
import { checkFaviconSet } from './gate-favicon.js'
import { checkImages, checkOwnerTasks } from './gate-finish.js'
import { createContext } from './gate-context.js'
import { checkLooks, checkNameLogos, checkSpotsAndShown } from './gate-logo.js'
import { checkMaterialAndMark } from './gate-mark.js'
import { checkColours, checkHeaderAndName } from './gate-name-colours.js'
import { kitProblem } from './kit-grounds.js'

const reject = (field, why) => ({ ok: false, rejected: [{ field, why }] })
const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x)

export async function checkBrandFile({ brandFile, brief, kit, files }) {
  if (!isObject(brandFile)) return reject('(file)', 'the brand file must be a JSON object')
  if (!isObject(brief)) return reject('(brief)', 'the brief is needed to check the name and colours')
  const problem = kitProblem(kit)
  if (problem) return reject('(kit)', problem)
  if (!files || typeof files.has !== 'function' || typeof files.read !== 'function')
    return reject('(files)', 'a file folder with has() and read() is needed')
  const ctx = createContext({ brandFile, brief, kit, files })
  try {
    checkHeaderAndName(ctx)
    checkColours(ctx)
    checkMaterialAndMark(ctx)
    checkNameLogos(ctx)
    checkLooks(ctx)
    checkSpotsAndShown(ctx)
    await checkFaviconSet(ctx)
    checkOwnerTasks(ctx)
    await checkImages(ctx)
  } catch (error) {
    ctx.bad('(brand file)', `cannot be checked: ${error instanceof Error ? error.message : String(error)}`)
  }
  return ctx.errors.length ? { ok: false, rejected: ctx.errors } : { ok: true, brandFile }
}
