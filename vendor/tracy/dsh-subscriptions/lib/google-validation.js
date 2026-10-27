const CLOUDCODE_DOMAINS = [
  'cloudcode-pa.googleapis.com',
  'staging-cloudcode-pa.googleapis.com',
  'autopush-cloudcode-pa.googleapis.com',
]

export function isCloudCodeDomain(domain) {
  const sanitized = String(domain || '').replace(/[^a-zA-Z0-9.-]/g, '')
  return CLOUDCODE_DOMAINS.includes(sanitized)
}

export function parseGoogleApiError(bodyText) {
  try {
    const json = JSON.parse(String(bodyText || ''))
    const err = json.error || json
    if (!err || typeof err !== 'object') return null
    return {
      code: err.code,
      message: String(err.message || ''),
      status: String(err.status || ''),
      details: Array.isArray(err.details) ? err.details : [],
    }
  } catch {
    return null
  }
}

function metadataUrl(metadata) {
  if (!metadata || typeof metadata !== 'object') return ''
  return String(
    metadata.validation_url
    || metadata.validation_link
    || metadata.validationUrl
    || '',
  )
}

export function validationFromLoadCodeAssist(load) {
  if (!load) return null
  const tiers = load.ineligibleTiers
  if (Array.isArray(tiers) && tiers.length) {
    const tier = tiers.find((row) => row && (
      row.reasonCode === 'VALIDATION_REQUIRED'
      || row.reason === 'VALIDATION_REQUIRED'
    ) && (row.validationUrl || row.validation_url))
    if (tier) {
      return {
        message: String(tier.reasonMessage || 'Verify your account to continue.'),
        validationUrl: String(tier.validationUrl || tier.validation_url),
        learnMoreUrl: String(tier.learnMoreUrl || tier.learn_more_url || ''),
      }
    }
  }
  return null
}

export function noticeFromLoadCodeAssist(load) {
  if (!load || load.currentTier) return null
  const tiers = load.ineligibleTiers
  if (!Array.isArray(tiers) || !tiers.length) return null
  const tier = tiers[0]
  if (!tier) return null
  const code = String(tier.reasonCode || tier.reason || '')
  const message = String(tier.reasonMessage || '')
  if (!message) return null
  if (code === 'VALIDATION_REQUIRED') return null
  return { code, message }
}

export function validationFromHttpError(status, bodyText) {
  if (status !== 403) return null
  const api = parseGoogleApiError(bodyText)
  if (!api) return null
  const info = api.details.find((d) => d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo')
  if (!info || info.reason !== 'VALIDATION_REQUIRED' || !isCloudCodeDomain(info.domain)) return null

  const help = api.details.find((d) => d['@type'] === 'type.googleapis.com/google.rpc.Help')
  let validationUrl = metadataUrl(info.metadata)
  let message = String(info.metadata?.validation_error_message || api.message || 'Verify your account to continue.')
  if (help?.links?.length) {
    const verify = help.links.find((link) => {
      const desc = String(link.description || '').toLowerCase()
      return desc.includes('verify') || !desc.includes('learn more')
    }) || help.links[0]
    validationUrl = validationUrl || String(verify?.url || '')
    message = String(verify?.description || message)
  }
  if (!validationUrl) return null
  let learnMoreUrl = String(info.metadata?.validation_learn_more_url || '')
  if (!learnMoreUrl && help?.links?.length) {
    const more = help.links.find((link) => {
      if (String(link.description || '').toLowerCase().trim() === 'learn more') return true
      try { return new URL(link.url).hostname === 'support.google.com' } catch { return false }
    })
    if (more) learnMoreUrl = String(more.url || '')
  }
  return { message, validationUrl, learnMoreUrl }
}

export function validationRequiredError(details) {
  const err = /** @type {Error & { code?: string, validationUrl?: string, learnMoreUrl?: string }} */ (new Error(`${details.message} Verify at ${details.validationUrl}`))
  err.code = 'VALIDATION_REQUIRED'
  err.validationUrl = details.validationUrl
  if (details.learnMoreUrl) err.learnMoreUrl = details.learnMoreUrl
  return err
}


export function googleRateLimitMessage(status, bodyText) {
  if (status !== 429) return ''
  const api = parseGoogleApiError(bodyText)
  const msg = String(api?.message || bodyText || '')
  if (/resource has been exhausted|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return 'Google Antigravity quota or rate limit reached. Wait a few minutes, check usage in antigravity.google, or upgrade Google AI Pro.'
  }
  return ''
}

export function googleLicenseMessage(status, bodyText) {
  if (status !== 403) return ''
  const api = parseGoogleApiError(bodyText)
  const msg = String(api?.message || bodyText || '')
  if (/do not have a valid license|#3501|PERMISSION_DENIED/i.test(msg)) {
    return 'Google account has no active Gemini Code Assist / Antigravity license (#3501), or no Google Cloud project is attached. Check the subscription at https://one.google.com or connect a different Google account.'
  }
  return ''
}
