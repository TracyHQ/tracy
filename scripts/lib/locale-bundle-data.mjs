/** Emit localized data as escaped string literals; the reviewable source stays in JSON. */
export const dictionaryJson = (value, space) =>
  JSON.stringify(value, null, space).replace(/"(?:[^"\\]|\\.)*"/g, (token) =>
    token.replace(/[^\u0021-\u007e]/g, (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`)
  )
