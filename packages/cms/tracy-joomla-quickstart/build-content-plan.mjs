/** Write `content/tracy-editorial/content-plan.json` from the field sets, then compile it as a gate. */
import { writeFile } from 'node:fs/promises'
import { compileContentPlan } from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/content-contract.mjs'
import { studioContract, studioContentHash } from './studio-content.mjs'
import { marketingPlan } from './marketing-plan.mjs'
import { sitePlanSurfaces } from './site-plan.mjs'

// One plan for the whole contract: the marketing artifacts this repo renders, and the 128 site
// surfaces it captured. Compiling at full scope is the gate — a surface left out fails here.
const plan = marketingPlan(studioContract, studioContentHash)
plan.surfaces = [...plan.surfaces, ...sitePlanSurfaces()]
const resolved = compileContentPlan(studioContract, plan)
const target = new URL('./content/tracy-editorial/content-plan.json', import.meta.url)
await writeFile(target, JSON.stringify(plan, null, 2) + '\n')
console.log(
  `Wrote ${plan.surfaces.length} surfaces (${resolved.surfaces.reduce(
    (total, surface) => total + Object.keys(surface.fields).length,
    0
  )} resolved fields) for contract ${plan.contractHash.slice(0, 12)}.`
)
