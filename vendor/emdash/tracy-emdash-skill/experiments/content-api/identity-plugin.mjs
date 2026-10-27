// Fixture-only experiment. No production reader depends on these IDs yet.
import { randomUUID } from 'node:crypto'
import { definePlugin } from 'emdash'
import { withEmDashRuntime } from 'emdash/middleware'
export function createPlugin() {
  return definePlugin({id:'tracy-row-identity-probe',version:'0.0.1',capabilities:['content:read','content:write'],hooks:{
    'content:beforeSave': async event => {
      if(event.collection!=='site' || !Array.isArray(event.content.social)) return
      let old=[]
      if(!event.isNew && event.id) await withEmDashRuntime(async runtime=>{
        const r=await runtime.handleContentGet(event.collection,event.id)
        if(!r.success) throw Error('Identity source unavailable')
        old=r.data.item.data.social??[]
      })
      const allowed=new Set(old.map(row=>row.tracyRowId).filter(Boolean))
      const seen=new Set()
      return {...event.content,social:event.content.social.map(row=>{
        const id=allowed.has(row.tracyRowId)?row.tracyRowId:randomUUID()
        if(seen.has(id)) throw Error('Duplicate repeater identity is ambiguous')
        seen.add(id)
        return {...row,tracyRowId:id}
      })}
    }
  }})
}
