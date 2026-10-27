/** Separate transcript segments when a live recognizer changes between chat and sign-in. */
export function speechCursor(initialRoute) {
  let route = initialRoute,
    seen = 0,
    offset = 0
  return (nextRoute, words) => {
    if (nextRoute !== route) {
      offset = seen
      route = nextRoute
    }
    seen = words.length
    return words.slice(offset)
  }
}
