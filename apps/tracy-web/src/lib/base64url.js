export function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}
export function fromBase64Url(text) {
  return new Uint8Array(Buffer.from(text, 'base64url'))
}
