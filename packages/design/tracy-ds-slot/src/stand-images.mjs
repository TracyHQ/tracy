// A stand keeps its chosen CMS base and takes only its pinned fleet image from the shared policy.
const BASES = {
  wordpress: 'wordpress:php8.3-apache',
  joomla: 'joomla:6-apache'
}

export function standImagesFrom(text) {
  const images = { db: 'mariadb:11' }
  for (const [platform, key] of Object.entries(BASES)) {
    const rows = String(text)
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim()
        return !trimmed.startsWith('#') && trimmed.split('=')[0].trim() === key
      })
    if (rows.length !== 1) throw new Error(`IMAGE_TAGS must name exactly one ${key}; found ${rows.length}`)
    const [declared, image, extra] = rows[0].split('=')
    const base = key.slice(key.indexOf(':') + 1)
    const pinned = new RegExp(`^tracy/web-${platform}:${base.replaceAll('.', '\\.')}-[0-9]{8}-r[0-9]+$`)
    if (declared !== key || extra !== undefined || !pinned.test(image ?? ''))
      throw new Error(`IMAGE_TAGS has a malformed pinned image for ${key}`)
    images[platform] = image
  }
  return images
}
