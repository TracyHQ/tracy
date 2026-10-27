/**
 * Executes a function safely, capturing any error and logging it at debug level
 * if a logger is provided, then returning the fallback value.
 *
 * Used across the plugin to eliminate empty catch blocks per dsh-plugin-preflight.
 */
export function bestEffort(label, fn, fallback = undefined, logger = null) {
  try {
    const res = fn()
    if (res && typeof res.then === 'function') {
      return res.catch((err) => {
        if (logger && typeof logger.debug === 'function') {
          logger.debug(`[bestEffort] ${label}: ${err && err.message || err}`)
        }
        return fallback
      })
    }
    return res
  } catch (err) {
    if (logger && typeof logger.debug === 'function') {
      logger.debug(`[bestEffort] ${label}: ${err && err.message || err}`)
    }
    return fallback
  }
}
