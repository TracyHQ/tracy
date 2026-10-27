// Run only against the isolated P4 site with probe-route.ts installed as content.json.ts.
// Never prints credentials. Native writes are limited to one test site's social repeater.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const [origin, tokenFile, out] = process.argv.slice(2)
if (!origin || !tokenFile || !out || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Explicit local test origin, token file and evidence directory required')
const admin = fs.readFileSync(tokenFile, 'utf8').trim()
const evidence = { origin, runtime: 'emdash@0.38.0', startedAt: new Date().toISOString(), assertions: [], measurements: [], captures: {} }
const check = (name, value) => { assert.ok(value, name); evidence.assertions.push(name) }
async function call(route, {token = admin, method = 'GET', body} = {}) {
  const start = performance.now()
  const r = await fetch(origin + route, {method, headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), 'content-type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {})})
  const text = await r.text()
  evidence.measurements.push({route: route.split('?')[0], method, status: r.status, bytes: Buffer.byteLength(text), ioMs: +(performance.now()-start).toFixed(3)})
  return {status:r.status, cache:r.headers.get('cache-control'), data:JSON.parse(text)}
}
const nativePath = '/_emdash/api/content/site/site?locale=en'
const before = await call(nativePath)
const item = before.data.data.item
const clean = (r) => ({status:r.status, cache:r.cache, body:r.data})
try {
  for (const [name, token, suffix] of [['missing',null,''],['invalid','ec_pat_invalid',''],['query',null,'?token=redacted-probe']]) {
    const r=await call('/content.json'+suffix,{token}); check(`auth ${name} denied`, r.status===401); evidence.captures[name]=clean(r)
  }
  async function mint(name, scopes) { const r=await call('/_emdash/api/admin/api-tokens',{method:'POST',body:{name,scopes}});assert.equal(r.status,201);return r.data.data }
  const read = await mint('p4-content-read', ['content:read'])
  const media = await mint('p4-media-read', ['media:read'])
  const scoped = await call('/content.json',{token:read.token})
  check('native content read scope accepted', scoped.status===200)
  check('private no-store', scoped.cache==='private, no-store')
  evidence.captures.authorized=clean(scoped)
  const denied = await call('/content.json',{token:media.token})
  check('native insufficient scope rejected',denied.status===403)
  evidence.captures.scopeDenied=clean(denied)
  const afterRead = await call(nativePath)
  check('GET does not change content/revision', JSON.stringify(before.data)===JSON.stringify(afterRead.data))
  const originalRows=item.data.social
  check('live repeater lacks native row identity', originalRows.every(row=> !('id' in row) && !('_key' in row) && !('_id' in row)))
  const rows = structuredClone(originalRows).reverse()
  rows[0].text = 'P4 live draft canary'
  let r=await call(nativePath,{method:'PUT',body:{data:{social:rows},_rev:before.data.data._rev}})
  check('native draft edit accepted',r.status===200)
  r=await call(nativePath)
  evidence.captures.draft={status:r.status,body:{status:r.data.data.item.status,data:r.data.data.item.data.social,liveData:r.data.data.item.liveData?.social,hasDraft:!!r.data.data.item.draftRevisionId}}
  check('native data overlays draft',r.data.data.item.data.social[0].text==='P4 live draft canary')
  check('published baseline kept separate',JSON.stringify(r.data.data.item.liveData.social)===JSON.stringify(originalRows))
  check('reorder/edit do not create row identity',r.data.data.item.data.social.every(row=>!('id' in row)&&!('_key' in row)&&!('_id' in row)))
  const publishPath=`/_emdash/api/content/site/${encodeURIComponent(item.id)}/publish?locale=en`
  r=await call(publishPath,{method:'POST',body:{}})
  check('native publish accepted',r.status===200)
  r=await call(nativePath)
  evidence.captures.published={status:r.status,body:{status:r.data.data.item.status,rows:r.data.data.item.data.social,hasDraft:!!r.data.data.item.draftRevisionId}}
  check('published values updated',r.data.data.item.data.social[0].text==='P4 live draft canary' && !r.data.data.item.draftRevisionId)
  check('entry identity stable through edit/reorder/publish',r.data.data.item.id===item.id)
  await call(`/_emdash/api/admin/api-tokens/${read.info.id}`,{method:'DELETE'})
  r=await call('/content.json',{token:read.token})
  check('revoked PAT rejected on alias',r.status===401)
  evidence.captures.revoked=clean(r)
  await call(`/_emdash/api/admin/api-tokens/${media.info.id}`,{method:'DELETE'})
} finally {
  const now=await call(nativePath)
  assert.equal((await call(nativePath,{method:'PUT',body:{data:{social:item.data.social},_rev:now.data.data._rev}})).status,200)
  assert.equal((await call(`/_emdash/api/content/site/${encodeURIComponent(item.id)}/publish?locale=en`,{method:'POST',body:{}})).status,200)
  const restored=await call(nativePath)
  check('test values restored through native write/publish',JSON.stringify(restored.data.data.item.data.social)===JSON.stringify(item.data.social))
  fs.mkdirSync(out,{recursive:true})
  fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify(evidence,null,2)+'\n')
}
console.log(`${evidence.assertions.length} native runtime assertions passed; credentials omitted`)
