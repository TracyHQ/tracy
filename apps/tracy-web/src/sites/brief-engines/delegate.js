/** Forward present and future engine capabilities unless the adapter explicitly overrides them. */
export function delegateEngine(engine, overrides) {
  const methods = new WeakMap()
  const read = (key) => {
    const value = Reflect.get(engine, key, engine)
    if (typeof value !== 'function') return value
    if (!methods.has(value)) methods.set(value, value.bind(engine))
    return methods.get(value)
  }
  return new Proxy(overrides, {
    get(target, key, receiver) {
      return Object.hasOwn(target, key) ? Reflect.get(target, key, receiver) : read(key)
    },
    has(target, key) {
      return Reflect.has(target, key) || Reflect.has(engine, key)
    },
    ownKeys(target) {
      return [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(engine)])]
    },
    getOwnPropertyDescriptor(target, key) {
      const own = Reflect.getOwnPropertyDescriptor(target, key)
      if (own) return own
      const delegated = Reflect.getOwnPropertyDescriptor(engine, key)
      return delegated
        ? { configurable: true, enumerable: delegated.enumerable, writable: false, value: read(key) }
        : undefined
    }
  })
}
