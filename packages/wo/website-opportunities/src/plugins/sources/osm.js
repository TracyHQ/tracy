import { searchRestaurants } from '../../../domain/discovery-osm.mjs'

/**
 * OpenStreetMap through public Overpass instances: places within a radius, no key. The same search the
 * discovery chain falls back to (`discoverRestaurants` in `domain/discovery-gmaps.mjs`).
 */
export default {
  id: 'osm',
  label: 'OpenStreetMap',
  credential: null,
  groups: ['map-discovery'],
  /** deps: { fetch, resolve?, timeoutMs?, overpassEndpoints? } */
  discover: (area, deps) => searchRestaurants(area, deps)
}
