// The manifest of a contract folder, whatever the platform. A Joomla or WordPress contract carries `manifest.json`
// (found by `contractFor`). An EmDash theme has none: its folder `contracts/<version>/` holds the content map, the
// coverage file and the design system measurement, and the Road to live names it `<release tag>/<version>`
// (`apps/tracy-web/src/lib/slot-roles-of-release.js` `contractOfRelease`). The kit tool needs the same few facts from
// either, so the manifest of an EmDash folder is read from its content map and made up in the same shape.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** The release line of an EmDash theme (`<template>/emdash-0.x`), where the Road to live keeps its releases. */
export const EMDASH_RELEASE_LINE = 'emdash-0.x'

/** Whether a content map is an EmDash one (`tracy-quickstart-content-map/emdash/v1`). */
export const isEmdashMap = (map) => /\/emdash\//.test(String(map?.schemaVersion ?? ''))

/**
 * The manifest of a contract folder: its `manifest.json`, else, for an EmDash theme folder, the one its content map
 * implies. `release` overrides the release tag (`--release-tag`, for a theme released under another line).
 * @param {string} dir the contract folder
 * @param {{release?: string}} [o]
 * @returns {object} `{id, platform, template, quickstart: {product, version, release}}` for EmDash
 */
export function readManifest(dir, { release } = {}) {
  const file = join(dir, 'manifest.json')
  if (existsSync(file)) return readJson(file)
  const mapFile = join(dir, 'content-map.json')
  const map = existsSync(mapFile) ? readJson(mapFile) : null
  if (!isEmdashMap(map) || !map.template || !map.version)
    throw new Error(`${dir} holds no manifest.json and no EmDash content-map.json to make one from`)
  const tag = release ?? `${map.template}/${EMDASH_RELEASE_LINE}`
  return {
    id: `${tag}/${map.version}`,
    platform: 'emdash',
    template: map.template,
    quickstart: { product: map.template, version: map.version, release: tag }
  }
}

/** The platform of a contract folder, or undefined when it names none (nothing readable there). */
export function platformOf(dir) {
  try {
    return readManifest(dir).platform
  } catch {
    return undefined
  }
}
