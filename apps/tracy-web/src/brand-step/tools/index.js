// The code tools a words-only brand needs (ticket #320). Every tool is { name, description, inputSchema, run(input, ctx) };
// run returns a JSON-serialisable result (what the lab tool printed) or throws BrandToolError for a usage error the
// agent should see. ctx = { files, kit, brief, font, review, runId, spend, draw, kitImage } (see ../run-files.js, ../template-font.js).
// cut_mark and recolour_mark follow in ticket #321.
import { tool as buildDesignSystem } from './build-design-system.js'
import { tool as composeLogo } from './compose-logo.js'
import { tool as fitLogo } from './fit-logo.js'
import { tool as lookLogo } from './look-logo.js'
import { tool as makeFavicon } from './make-favicon.js'
import { tool as makeIcon } from './make-icon.js'
import { tool as makeLettermark } from './make-lettermark.js'
import { tool as measureLogo } from './measure-logo.js'
import { tool as nameSlots } from './name-slots.js'
import { tool as openImage } from './open-image.js'
import { tool as setName } from './set-name.js'

export { BrandToolError } from './common.js'

export const brandTools = Object.freeze([
  openImage,
  measureLogo,
  setName,
  composeLogo,
  fitLogo,
  makeIcon,
  makeLettermark,
  makeFavicon,
  nameSlots,
  buildDesignSystem,
  lookLogo
])

/** The tool with this name, or undefined. */
export const toolByName = (name) => brandTools.find((t) => t.name === name)
