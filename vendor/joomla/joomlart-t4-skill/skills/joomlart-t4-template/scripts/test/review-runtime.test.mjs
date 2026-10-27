import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const scratch=mkdtempSync(join(tmpdir(),'t4-browser-fixture-'));
const server=createServer((req,res)=>{
  const noToggle=req.url.includes('missing');
  // `/vanishing`: every control removes itself on the first pointer move — the shape of a
  // dismiss-on-interaction bar. Nothing about its hover state can be read, and a scanner that
  // calls that page clean is the failure the interactive-state gates exist to prevent.
  const vanishing=req.url.includes('vanishing');
  // `/partial`: one control behaves, one removes itself on the first pointer move. The all-or-
  // nothing coverage branch cannot see this case — something WAS measured — so it is the case a
  // scanner slips through by printing the reason and exiting 0 anyway.
  const partial=req.url.includes('partial');
  res.writeHead(req.url.includes('error') ? 404 : 200, {'content-type':'text/html'});
  res.end(`<!doctype html><html data-bs-theme="light"><head><style>
  body {background:rgb(255,255,255);color:rgb(0,0,0)}
  html[data-bs-theme=dark] body {background:rgb(20,20,20);color:rgb(240,240,240)}
  nav a {color:rgb(0,0,0);padding:8px;display:inline-block}
  html[data-bs-theme=dark] nav a {color:rgb(240,240,240)}
  </style></head><body><header>Fixture</header>
  <!-- The interactive-state scanners exist to measure hover. A fixture with nothing hoverable let
       hover-scan report a page it had examined nothing on, and the assertion below could not tell
       that apart from a clean page -- which is the very confusion the scanners were written to end. -->
  <!-- Distinct class signatures on purpose: collect() keys on selector|className, so links that
       look alike collapse into one sample and a fixture of identical links tests one element. -->
  <nav><a class="one" href="/a">One</a><a class="two" href="/b">Two</a><a class="three" href="/c">Three</a></nav>
  ${vanishing?'<script>document.querySelectorAll("nav a").forEach(a=>a.addEventListener("mouseover",()=>a.remove(),{once:true}))<\/script>':''}
  ${partial?'<script>document.querySelector("nav a.two").addEventListener("mouseover",e=>e.target.remove(),{once:true})<\/script>':''}
  <main>${'<p>Visible content</p>'.repeat(25)}</main>
  ${noToggle?'':'<button class="toggle">Theme</button>'}
  <script>
  const key='fixture-theme',root=document.documentElement;
  const get=()=>document.cookie.split('; ').find(c=>c.startsWith(key+'='))?.split('=')[1];
  root.setAttribute('data-bs-theme',get()||'light');
  document.querySelector('.toggle')?.addEventListener('click',()=>{
    const value=root.getAttribute('data-bs-theme')==='dark'?'light':'dark';
    root.setAttribute('data-bs-theme',value);document.cookie=key+'='+value+';path=/';
  });
  </script></body></html>`);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}`;
const config=join(scratch,'config.json');
writeFileSync(config,JSON.stringify({hook:{type:'attribute',name:'data-bs-theme'},toggle:'.toggle',persistence:{type:'cookie',key:'fixture-theme'},expectedSelectors:['header','main']}));
test.after(async()=>{server.close(); await once(server,'close');rmSync(scratch,{recursive:true,force:true});});
async function run(script,path='/',...args){
  const child=spawn(process.execPath,[new URL('../review/'+script+'.mjs',import.meta.url).pathname,url+path,...args,'--config',config]);
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const [code]=await once(child,'close');return {code,output};
}
test('real toggle supports attribute hook and cookie persistence',async()=>{
  const r=await run('toggle-test');assert.equal(r.code,0,r.output);assert.match(r.output,/"status":"pass"/);
});
test('missing toggle and unexpected HTTP status are failures',async()=>{
  for(const path of ['/missing','/error']) {const r=await run('toggle-test',path);assert.equal(r.code,1,r.output);}
});
test('all shared scanners execute against the configured fixture',async()=>{
  for(const script of ['leak-scan','contrast-audit','border-scan','seam-scan','hover-scan']) {
    const r=await run(script);assert.ok([0,3].includes(r.code),script+': '+r.output);
    assert.match(r.output,/"url":"http:/);assert.match(r.output,/"examined":/);
    // `examined` counts what the scanner MEASURED, not how many nodes the page has. A zero here is
    // a scanner that examined nothing and must not be read as a clean page.
    assert.ok(JSON.parse(r.output.split('\n').filter(Boolean).pop()).examined>0,script+' examined nothing: '+r.output);
  }
});
test('a page whose interactive states cannot be read does not pass',async()=>{
  // Measured 2026-09-17 before this: on exactly this page the scanner printed
  // `OK — interactive states clean [24 elements examined]` with no findings, having measured ZERO
  // interactive states. The number it printed was `document.body.querySelectorAll('*').length` —
  // how many nodes the PAGE has, which says nothing about what the SCAN examined.
  for(const script of ['hover-scan','interaction-states']) {
    const r=await run(script,'/vanishing');
    assert.notEqual(r.code,0,script+' passed a page it measured nothing on: '+r.output);
    assert.match(r.output,/NOT-MEASURED/,script+' dropped elements without saying so: '+r.output);
  }
});
test('one element that could not be measured fails the run even when others were',async()=>{
  for(const script of ['hover-scan','interaction-states']) {
    const r=await run(script,'/partial');
    assert.match(r.output,/NOT-MEASURED/,script+': '+r.output);
    assert.notEqual(r.code,0,script+' reported a reason and exited 0 anyway: '+r.output);
  }
});
test('probe rejects missing selectors and measures the configured dark theme',async()=>{
  const good=await run('probe','/','dark','body');assert.equal(good.code,0,good.output);assert.match(good.output,/rgb\(20, 20, 20\)/);
  const bad=await run('probe','/','dark','.does-not-exist');assert.equal(bad.code,1,bad.output);
});
