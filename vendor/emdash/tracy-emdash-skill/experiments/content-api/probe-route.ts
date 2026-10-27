// Temporary local acceptance probe, NOT a distributable Content API route.
import { withNativeContentAuth } from '../../tools/content-api-native-auth.mjs'
import { GET as nativeGet } from 'emdash/routes/api/content/_collection_/_id_'
export const prerender = false
export const GET = (context) => withNativeContentAuth(context, async (authorized) => {
  const response = await nativeGet({ ...authorized, params: { collection: 'site', id: 'site' },
    url: new URL('/_emdash/api/content/site/site?locale=en', context.url) })
  if (!response.ok) return response
  const { data } = await response.json()
  return Response.json({ probe: true, schemaVersion: null, publication: data.item.status,
    social: data.item.data.social, liveSocial: data.item.liveData?.social ?? null,
    revision: data._rev, draft: data.item.draftRevisionId !== null })
})
