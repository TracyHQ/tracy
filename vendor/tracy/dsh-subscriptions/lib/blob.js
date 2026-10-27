function asString(value) {
  return value == null ? "" : String(value)
}

export function normalizeExpiresAt(raw) {
  if (raw == null || raw === "") return 0
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return 0
    return raw < 1e11 ? Math.floor(raw * 1000) : Math.floor(raw)
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) return 0
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed)
      if (!Number.isFinite(num) || num <= 0) return 0
      return num < 1e11 ? Math.floor(num * 1000) : Math.floor(num)
    }
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
    return 0
  }
  if (raw instanceof Date) {
    const t = raw.getTime()
    return Number.isFinite(t) && t > 0 ? t : 0
  }
  return 0
}

export function serializeBlob(obj) {
  if (!obj || typeof obj !== "object") throw new Error("invalid oauth blob")
  const accessToken = asString(obj.accessToken)
  const refreshToken = asString(obj.refreshToken)
  if (!accessToken && !refreshToken && !obj.apiKey) {
    throw new Error("oauth blob needs accessToken or refreshToken")
  }
  return JSON.stringify({
    ...obj,
    accessToken,
    refreshToken,
    expiresAt: normalizeExpiresAt(obj.expiresAt),
    label: asString(obj.label),
    email: asString(obj.email),
    accountId: asString(obj.accountId),
    projectId: asString(obj.projectId),
    ...(obj.clientId ? { clientId: asString(obj.clientId) } : {}),
    ...(obj.clientSecret ? { clientSecret: asString(obj.clientSecret) } : {}),
    ...(obj.idToken ? { idToken: asString(obj.idToken) } : {}),
    ...(Array.isArray(obj.usage) ? { usage: obj.usage } : {}),
    ...(obj.usageAt ? { usageAt: Number(obj.usageAt) } : {}),
  })
}

export function parseBlob(text) {
  const obj = typeof text === "string" ? JSON.parse(text) : text
  if (!obj || typeof obj !== "object") throw new Error("invalid oauth blob")
  return {
    ...obj,
    accessToken: asString(obj.accessToken),
    refreshToken: asString(obj.refreshToken),
    expiresAt: normalizeExpiresAt(obj.expiresAt),
    label: asString(obj.label),
    email: asString(obj.email),
    accountId: asString(obj.accountId),
    projectId: asString(obj.projectId),
    ...(obj.clientId ? { clientId: asString(obj.clientId) } : {}),
    ...(obj.clientSecret ? { clientSecret: asString(obj.clientSecret) } : {}),
    ...(obj.idToken ? { idToken: asString(obj.idToken) } : {}),
    ...(Array.isArray(obj.usage) ? { usage: obj.usage } : {}),
    ...(obj.usageAt ? { usageAt: Number(obj.usageAt) } : {}),
  }
}
