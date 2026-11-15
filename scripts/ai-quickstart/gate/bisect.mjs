// Bisection for write safety (ticket #586): which value of a failed pass made the site answer an error or refuse.
// Two stages. Blocks first, on the same site: take half the blocks of a failing page off the page (a module on no page),
// read the page again, put them back; no new site is needed. Then values, with a trial per step (a fresh site and a
// write where only some values carry a probe): the values left at the end are each one a site refuses on its own.
// Every step counts against one shared budget: an exhausted budget leaves the unnamed values `exhausted`. Pure but for
// the injected trials.

/** A shared step budget: `take()` answers false once it is spent. */
export function stepBudget(steps) {
  let left = steps
  return {
    take() {
      if (left <= 0) return false
      left -= 1
      return true
    },
    get left() {
      return left
    },
    get spent() {
      return steps - left
    }
  }
}

const halves = (list) => {
  const mid = Math.ceil(list.length / 2)
  return [list.slice(0, mid), list.slice(mid)]
}

/**
 * The units of a failing set that fail on their own.
 * @param {object[]} units the units of a set that failed together
 * @param {(subset: object[]) => Promise<object | null>} fails a trial: what failed (any value) when the subset fails
 *   on its own, else null
 * @param {ReturnType<typeof stepBudget>} budget
 * @param {object} [failure] what the whole set failed with
 * @returns {Promise<{culprits: Array<{unit: object, failure: object}>, together: object[][], exhausted: object[],
 *   steps: number}>} `culprits`: each with the failure of the trial that isolated it; `together`: sets that fail only
 *   together (each half passed alone); `exhausted`: units the budget left unnamed
 */
export async function bisect(units, fails, budget, failure = true) {
  const out = { culprits: [], together: [], exhausted: [], steps: 0 }
  const trial = async (subset) => {
    out.steps += 1
    return (await fails(subset)) ?? null
  }
  const walk = async (group, seen) => {
    if (group.length === 1) return void out.culprits.push({ unit: group[0], failure: seen })
    const [a, b] = halves(group)
    if (!budget.take()) return void out.exhausted.push(...group)
    const aFails = await trial(a)
    if (aFails) await walk(a, aFails)
    // The second half is tried too: both halves may hold a unit that fails on its own.
    if (!budget.take()) return void out.exhausted.push(...b)
    const bFails = await trial(b)
    if (bFails) await walk(b, bFails)
    else if (!aFails) out.together.push(group)
  }
  if (units.length) await walk(units, failure)
  return out
}

/**
 * The blocks of a page whose values make it fail, on the same site: each step takes every block outside the half it
 * tries off the page, reads the page, and puts them back.
 * @param {{blocks: object[], off: (blocks: object[]) => Promise<void>, back: (blocks: object[]) => Promise<void>,
 *   pageFails: () => Promise<boolean>, budget: ReturnType<typeof stepBudget>}} input
 */
export async function bisectBlocks({ blocks, off, back, pageFails, budget }) {
  return bisect(
    blocks,
    async (subset) => {
      const away = blocks.filter((b) => !subset.includes(b))
      await off(away)
      try {
        return (await pageFails()) || null
      } finally {
        await back(away)
      }
    },
    budget
  )
}
