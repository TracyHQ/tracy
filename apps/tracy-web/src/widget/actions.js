/** Reversible widget actions. No URLs, credentials or site writes can be supplied by the model. */
export function loginIntent(message) {
  const text = String(message)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[’]/g, "'")
    .trim()
  if (/\b(dung|khong|don't|do not|never|not now)\b/.test(text)) return false
  const login = /\b(dang nhap|log\s?in|sign\s?in)\b/.test(text)
  const open = /\b(mo|bat|hien|open|show)\b/.test(text)
  const justLogin = /^(dang nhap|log\s?in|sign\s?in)[.!?]*$/.test(text)
  return login && (open || justLogin)
}

export function allowedAction(action) {
  return action?.type === 'open_login' ? { type: 'open_login' } : null
}

export function loginReply() {
  return 'Sign in here with email or Google. Your website choices are kept.'
}
