function decodeJwtPayload(token) {
  const raw = String(token || '')
  const parts = raw.split('.')
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function chatgptAccountId(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== 'object') return ''
  if (payload.chatgpt_account_id) return String(payload.chatgpt_account_id)
  const nested = payload['https://api.openai.com/auth']
  if (nested && nested.chatgpt_account_id) return String(nested.chatgpt_account_id)
  const orgs = payload.organizations
  if (Array.isArray(orgs) && orgs[0] && orgs[0].id) return String(orgs[0].id)
  return ''
}

export function emailFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload) return ''
  return String(payload.email || payload.preferred_username || '')
}

export function isGoogleClientId(str) {
  if (typeof str !== 'string') return false
  const trimmed = str.trim()
  return /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(trimmed)
}

export function extractGoogleClientIdFromJwt(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== 'object') return ''

  const azp = typeof payload.azp === 'string' ? payload.azp.trim() : ''
  const rawAud = payload.aud

  const audiences = Array.isArray(rawAud)
    ? rawAud.filter(a => typeof a === 'string').map(a => a.trim())
    : (typeof rawAud === 'string' && rawAud.trim() ? [rawAud.trim()] : [])

  if (azp) {
    if (!isGoogleClientId(azp)) return ''
    if (audiences.length > 0 && !audiences.includes(azp)) {
      return ''
    }
    return azp
  }

  const validAuds = audiences.filter(isGoogleClientId)
  if (validAuds.length === 1 && (audiences.length === 1 || audiences.every(a => a === validAuds[0]))) {
    return validAuds[0]
  }

  return ''
}
