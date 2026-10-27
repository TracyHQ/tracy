import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { diffSnapshots } from '../verify-render.mjs';
import { checkpoint } from '../checkpoint.mjs';
import { reconcile } from '../reconcile-content.mjs';
import { resultStatus, validateConfig } from '../review/runtime.mjs';
const dir=mkdtempSync(join(tmpdir(),'t4-reliability-'));
test.after(()=>rmSync(dir,{recursive:true,force:true}));
const scripts=new URL('../',import.meta.url).pathname;
test('render gate rejects empty, malformed and missing required measurements',()=>{
  for(const v of [{},null,[],{body:{}},{body:null},{body:{color:undefined}}]) assert.throws(()=>diffSnapshots(v,v));
  assert.throws(()=>diffSnapshots({body:{color:'#fff'}},{body:{color:'#fff'}},{required:{body:['fontSize']}}));
  assert.equal(diffSnapshots({body:{color:'rgba(0, 0, 0, 0)'}},{body:{color:'rgba(0, 0, 0, 1)'}}).mismatches.length,1);
  assert.throws(()=>diffSnapshots({body:{color:'#fff'}},{body:{color:'#fff'}},{hexTolerance:NaN}));
});
test('cache rejects wrong site and symlink escape but accepts absent cache in a real root',()=>{
  const root=join(dir,'site'); mkdirSync(join(root,'includes'),{recursive:true});
  const run=()=>spawnSync('bash',[scripts+'clear-cache.sh','--root',root],{encoding:'utf8'});
  assert.notEqual(run().status,0);
  writeFileSync(join(root,'configuration.php'),'<?php'); writeFileSync(join(root,'includes/defines.php'),'<?php');
  assert.equal(run().status,0);
  const other=join(dir,'other');mkdirSync(other);writeFileSync(join(other,'keep'),'safe');
  mkdirSync(join(root,'media/t4'),{recursive:true});symlinkSync(other,join(root,'media/t4/optimize'));
  assert.notEqual(run().status,0);assert.equal(readFileSync(join(other,'keep'),'utf8'),'safe');
  unlinkSync(join(root,'media/t4/optimize'));mkdirSync(join(root,'media/t4/optimize'));
  writeFileSync(join(root,'media/t4/optimize','old.css'),'old');assert.equal(run().status,0);
  assert.equal(existsSync(join(root,'media/t4/optimize','old.css')),false);
});
test('Sass compiles main, dark and both local outputs',()=>{
  const root=join(dir,'template');
  for(const prefix of ['','local/']) {
    mkdirSync(join(root,prefix+'scss'),{recursive:true});
    for(const e of ['template','darkmode']) writeFileSync(join(root,prefix+'scss',e+'.scss'),'body { color: red; }');
  }
  const r=spawnSync('bash',[scripts+'compile-scss.sh','--template',root],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  for(const prefix of ['','local/']) for(const e of ['template','darkmode']) assert.match(readFileSync(join(root,prefix+'css',e+'.css'),'utf8'),/color: red/);
});
test('checkpoint detects changed evidence and invalidates downstream completion',()=>{
  const file=join(dir,'state.json'), evidence=join(dir,'input.txt');writeFileSync(evidence,'first');
  checkpoint(file,'init',['edit','brief','test-only-target']);
  assert.throws(()=>checkpoint(file,'complete',['6',evidence]),/earlier/);
  checkpoint(file,'complete',['intake',evidence]);
  assert.equal(checkpoint(file,'status',[]).next,'1');
  writeFileSync(evidence,'changed');assert.equal(checkpoint(file,'status',[]).next,'intake');
  assert.throws(()=>checkpoint(file,'init',['edit','brief','target']),/exists/);
});
const empty=()=>({categories:[],articles:[],menus:[],menuItems:[],modules:[]});
test('reconciliation maps real IDs, preserves unspecified fields and converges on rerun',()=>{
  const inventory=empty();inventory.menus=[{id:57,menutype:'mainmenu',title:'Old',description:'preserve'}];
  const desired={menus:[{menutype:'mainmenu',title:'New'}]};
  const plan=reconcile(desired,inventory);assert.equal(plan.operations[0].id,57);
  assert.deepEqual(plan.operations[0].values,{title:'New'});
  inventory.menus[0]={...inventory.menus[0],...plan.operations[0].values};
  assert.equal(reconcile(desired,inventory).counts.keep,1);assert.equal(inventory.menus[0].description,'preserve');
  const create=reconcile({menus:[{menutype:'secondary',title:'Secondary'}]},inventory);
  assert.equal(create.operations[0].id,null);
  assert.throws(()=>reconcile(desired,{}),/Inventory missing/);
  inventory.menus.push({...inventory.menus[0],id:99});assert.throws(()=>reconcile(desired,inventory),/Ambiguous/);
});
test('review distinguishes failure, unresolved findings and verified pass',()=>{
  assert.equal(resultStatus({examined:0}),'fail');
  assert.equal(resultStatus({examined:20,findings:['border']}),'needs-review');
  assert.equal(resultStatus({examined:20,verified:false}),'needs-review');
  assert.equal(resultStatus({examined:20}),'pass');
  for (const name of ['data-theme','data-bs-theme']) validateConfig({hook:{type:'attribute',name},toggle:'.toggle',persistence:{type:'cookie',key:'theme'},expectedSelectors:['main']});
});

test('preflight reports capabilities without treating absent DDEV as a global blocker',()=>{
  const r=spawnSync('bash',[scripts+'preflight.sh'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
  assert.equal(out.phases.analysis.status,'ready');assert.equal(out.phases.compile.status,'ready');
  assert.equal(out.target.enabledInDatabase,'not checked');
});
test('planner CLI executes through a symlink and retires fixed-ID SQL',()=>{
  const input=join(dir,'page-map.json'), link=join(dir,'seed-link.mjs');
  writeFileSync(input,JSON.stringify({template:{name:'ja_test'},pages:[{file:'home.html',view:'com_content.featured'},{file:'home-two.html',view:'com_content.featured'}]}));
  symlinkSync(scripts+'setup-demo-content.mjs',link);
  const run=mode=>spawnSync(process.execPath,[link,'--emit',mode,input],{encoding:'utf8'});
  const plan=run('plan');assert.equal(plan.status,0,plan.stderr);
  const data=JSON.parse(plan.stdout);assert.equal(new Set(data.menuItems.map(i=>i.alias)).size,2);
  assert.equal(data.menuItems.filter(i=>i.default).length,1);
  const sql=run('sql');assert.notEqual(sql.status,0);assert.match(sql.stderr,/retired/);
});
