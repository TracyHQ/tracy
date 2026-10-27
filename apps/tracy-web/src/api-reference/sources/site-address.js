/**
 * THE ADDRESSES A CUSTOMER SITE'S OWN HOSTNAME ANSWERS, as their own OpenAPI document — a separate
 * source because they live on `https://<site address>/…`, not on Tracy's address, and `/{path}` there
 * would collide with Tracy's own catch-all. Internal reference only (staff, fleet and machine doors).
 */
import { SITE_ADDRESS_NOTE, SITE_ADDRESS_ROUTES } from '../routes/site-address.js'
import { operation } from '../spec.js'

/** @returns {object} an OpenAPI 3.1 document */
export function buildSiteAddressOpenApi() {
  const tag = 'Customer site address'
  const paths = {}
  for (const route of SITE_ADDRESS_ROUTES) {
    paths[route.path] ??= {}
    paths[route.path][route.method.toLowerCase()] = operation({ ...route, tag })
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Customer site address', version: 'v1', description: SITE_ADDRESS_NOTE },
    servers: [
      {
        url: 'https://{siteAddress}',
        variables: {
          siteAddress: { default: 'example.com', description: 'The address the customer site answers on.' }
        }
      }
    ],
    tags: [
      { name: tag, description: "What Tracy answers on a customer site's own hostname before the site does." }
    ],
    // Most of these answer without Tracy's sign-in; each operation names its own when it has one.
    security: [],
    paths,
    components: {
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'tracy_sess',
          description: 'The session of a person signed in to Tracy.'
        },
        actor: {
          type: 'apiKey',
          in: 'header',
          name: 'x-tracy-actor',
          description: "A signed assertion from the host's dsh."
        }
      }
    }
  }
}
