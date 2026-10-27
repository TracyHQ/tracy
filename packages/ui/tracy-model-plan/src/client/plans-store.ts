/**
 * One answer the page keeps a single shared copy of (the account status, `account-status.ts`): every
 * reader on the page sees the same copy, and whoever reads it again publishes the new answer to all.
 *
 * One read at a time. A read that started before a newer publish is dropped when it lands, so a slow
 * read can never put back the state a Disconnect just replaced. A read that fails keeps what was
 * known: undefined until the first good read, which keeps every chip blank rather than wrong.
 */

/**
 * @param read - one read of the shared answer.
 */
export function createPlansStore<T>(read: () => Promise<T>) {
  let known: T | undefined
  let generation = 0
  let reading: Promise<void> | undefined
  const listeners = new Set<() => void>()

  const publish = (next: T): void => {
    known = next
    generation += 1
    for (const listener of listeners) listener()
  }

  const refresh = (): Promise<void> => {
    if (reading !== undefined) return reading
    const startedAt = generation
    reading = read()
      .then(
        (next) => {
          if (generation === startedAt) publish(next)
        },
        () => {}
      )
      .finally(() => {
        reading = undefined
      })
    return reading
  }

  return {
    /** @param next - a read the page just made. */
    publish,
    /** Read again (joins a read already on its way). */
    refresh,
    /** The answer, or undefined while none was read. */
    current: (): T | undefined => known,
    /** Whether anything on the page subscribes. */
    watched: (): boolean => listeners.size > 0,
    /**
     * `useSyncExternalStore` subscription; the first listener starts the first read.
     * @param listener - called after every change.
     */
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      if (known === undefined) void refresh()
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
