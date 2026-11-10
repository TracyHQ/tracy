/** Retained research media bytes are bounded across jobs and executor instances in this process. */
const IMAGE_SLOTS = 5
let available = IMAGE_SLOTS
const waiting = []

function drain() {
  // FIFO prevents a stream of images from starving an exclusive video download.
  while (waiting.length && waiting[0].slots <= available) {
    const next = waiting.shift()
    available -= next.slots
    next.resolve()
  }
}

/**
 * Admit before fetching and keep the permit until measurement and object storage have finished.
 * Images share five slots; a declared video holds all slots, retaining the existing video byte limit.
 * @template T
 * @param {'image' | 'video'} kind
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function withMediaAdmission(kind, run) {
  const slots = kind === 'video' ? IMAGE_SLOTS : 1
  await new Promise((resolve) => {
    waiting.push({ slots, resolve })
    drain()
  })
  try {
    return await run()
  } finally {
    available += slots
    drain()
  }
}
