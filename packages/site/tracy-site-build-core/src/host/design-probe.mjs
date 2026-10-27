/**
 * The style probe at the build's `shot` stage: chromium driven over `--remote-debugging-pipe` from a
 * node script, no dependency — the shape `tracy-site-tools`' `BROWSER_SCRIPT` set (why CDP and not
 * `--dump-dom`: a flag renders whatever the browser ends on and cannot run a script; the check needs
 * `getComputedStyle` in the page). Run as `run(process.execPath, ['-e', PROBE_SCRIPT, chrome, url])`
 * so a stage keeps the one `run(cmd, args)` shape it already has for the screenshot.
 *
 * No off-site guard here: `job.targetUrl` is the fleet's own address for the site, already probed
 * with a GET by `shotStage` before either browser run. The script writes exactly one result:
 *   `TRACY_STYLES OK <finalUrl>\n<json>` · `TRACY_STYLES ERR <why>` · `TRACY_STYLES NOCHROME <why>`
 * bounds itself, and kills chromium's whole process group on the way out.
 */
import { STYLE_PROBE } from './design-check.mjs'

export const PROBE_SETTLE_MS = 2500
export const PROBE_DEADLINE_MS = 30000

export const PROBE_SCRIPT =
  "const {spawn}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');" +
  'const chrome=process.argv[1],url=process.argv[2];' +
  `const SETTLE_MS=Number(process.argv[3])||${PROBE_SETTLE_MS},DEADLINE_MS=Number(process.argv[4])||${PROBE_DEADLINE_MS};` +
  `const PROBE=${JSON.stringify(STYLE_PROBE)};` +
  "let profile='';try{profile=fs.mkdtempSync(path.join(os.tmpdir(),'tracy-styles-'))}catch{}" +
  'let child=null,hard=null,finished=false,sid=null;' +
  'const clean=()=>{try{if(profile)fs.rmSync(profile,{recursive:true,force:true})}catch{}};' +
  "if(process.on)process.on('exit',clean);" +
  "const stop=()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}try{child.kill('SIGKILL')}catch{}};" +
  'const done=(line)=>{if(finished)return;finished=true;if(hard)clearTimeout(hard);if(child)stop();clean();' +
  'const bail=setTimeout(()=>process.exit(1),2000);' +
  'try{process.stdout.write(line,()=>{clearTimeout(bail);process.exit(0)})}catch{clearTimeout(bail);process.exit(1)}};' +
  "if(!profile){done('TRACY_STYLES ERR could not create a private browser profile')}else{" +
  "const flags=['--headless=new','--disable-features=MacAppCodeSignClone','--disable-gpu','--no-crash-upload','--disable-breakpad','--no-first-run','--no-default-browser-check','--hide-scrollbars','--window-size=1280,800','--remote-debugging-pipe','--user-data-dir='+profile];" +
  "child=spawn(chrome,[...flags,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],detached:true});" +
  "child.on('error',(e)=>done('TRACY_STYLES NOCHROME '+((e&&e.message)||String(e))));" +
  'const pending=new Map();' +
  "child.on('exit',(code,sig)=>{if(finished)return;const why='chromium exited'+(code!=null?' ('+code+')':sig?' ('+sig+')':'');for(const f of pending.values())f({error:{message:why}});pending.clear();done('TRACY_STYLES NOCHROME '+why)});" +
  "hard=setTimeout(()=>done('TRACY_STYLES ERR timed out'),DEADLINE_MS);" +
  'const wr=child.stdio[3],rd=child.stdio[4];let buf=Buffer.alloc(0),id=0;' +
  "wr.on('error',()=>{});rd.on('error',()=>{});" +
  'const send=(method,params,session)=>new Promise((res,rej)=>{const n=++id;' +
  "pending.set(n,(m)=>{if(m&&m.error)rej(new Error(method+': '+((m.error&&m.error.message)||JSON.stringify(m.error))));else res(m)});" +
  'const o={id:n,method,params:params||{}};if(session)o.sessionId=session;' +
  "try{wr.write(JSON.stringify(o)+'\\0')}catch(e){pending.delete(n);rej(e instanceof Error?e:new Error(String(e)))}});" +
  "rd.on('data',(d)=>{if(finished)return;buf=Buffer.concat([buf,d]);let i;while((i=buf.indexOf(0))!==-1){let m=null;try{m=JSON.parse(buf.slice(0,i))}catch{}buf=buf.slice(i+1);if(!m)continue;if(m.id&&pending.has(m.id)){const f=pending.get(m.id);pending.delete(m.id);f(m)}}});" +
  '(async()=>{' +
  "const t=await send('Target.createTarget',{url:'about:blank'});" +
  "const a=await send('Target.attachToTarget',{targetId:t.result&&t.result.targetId,flatten:true});" +
  'sid=a.result&&a.result.sessionId;' +
  "await send('Page.enable',{},sid);" +
  "const nav=await send('Page.navigate',{url},sid);if(nav.result&&nav.result.errorText)return done('TRACY_STYLES ERR '+nav.result.errorText);" +
  'await new Promise((r)=>setTimeout(r,SETTLE_MS));if(finished)return;' +
  "const R=await send('Runtime.evaluate',{expression:PROBE,returnByValue:true},sid);" +
  'const v=R.result&&R.result.result&&R.result.result.value;' +
  "if(!v||typeof v!=='object')return done('TRACY_STYLES ERR the probe returned nothing');" +
  "return done('TRACY_STYLES OK '+(v.href||url)+'\\n'+JSON.stringify(v))" +
  "})().catch((e)=>done('TRACY_STYLES ERR '+((e&&e.message)||String(e))));" +
  '}'

/**
 * What the probe wrote, read back.
 * @param {string} stdout
 * @returns {{ ok: true, finalUrl: string, probe: { href: string, seen: number, samples: any[] } } | { ok: false, kind: 'no-browser' | 'error', error: string }}
 */
export function parseStyles(stdout) {
  const s = String(stdout ?? '')
  if (s.startsWith('TRACY_STYLES OK ')) {
    const rest = s.slice('TRACY_STYLES OK '.length)
    const nl = rest.indexOf('\n')
    const finalUrl = (nl === -1 ? rest : rest.slice(0, nl)).trim()
    try {
      const probe = JSON.parse(nl === -1 ? '' : rest.slice(nl + 1))
      if (!probe || typeof probe !== 'object' || !Array.isArray(probe.samples))
        return { ok: false, kind: 'error', error: 'the probe returned no samples' }
      return { ok: true, finalUrl, probe }
    } catch {
      return { ok: false, kind: 'error', error: 'the probe returned no JSON' }
    }
  }
  if (s.startsWith('TRACY_STYLES NOCHROME '))
    return { ok: false, kind: 'no-browser', error: s.slice('TRACY_STYLES NOCHROME '.length).trim() }
  if (s.startsWith('TRACY_STYLES ERR '))
    return { ok: false, kind: 'error', error: s.slice('TRACY_STYLES ERR '.length).trim() }
  return { ok: false, kind: 'error', error: s.trim().slice(0, 200) || 'the probe wrote nothing' }
}
