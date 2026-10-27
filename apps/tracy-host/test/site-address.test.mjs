import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const script = new URL(
  '../../../packages/fleet/tracy-fleet-operation/scripts/webroot/site-address.py',
  import.meta.url
).pathname

test('address config writes preserve unrelated edits and refuse conflicting rollback', () => {
  const output = execFileSync(
    'python3',
    [
      '-c',
      `
import importlib.util,tempfile,pathlib
spec=importlib.util.spec_from_file_location('address',${JSON.stringify(script)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp)
 (p/'compose.yml').write_text('services:\\n  web:\\n    environment:\\n      EMDASH_SITE_URL: https://old.test\\n')
 slot=m.env_slot(p,'https://old.test/')
 after=slot['prefix']+'"https://new.test"\\n'
 m.patch_slot(p,slot,slot['line'],after)
 with (p/'compose.yml').open('a') as f:f.write('# unrelated edit\\n')
 m.patch_slot(p,slot,after,slot['line'])
 assert '# unrelated edit' in (p/'compose.yml').read_text()
 m.patch_slot(p,slot,after,slot['line'])
 (p/'compose.yml').write_text((p/'compose.yml').read_text().replace('old.test','third.test'))
 try:m.patch_slot(p,slot,after,slot['line']);raise AssertionError('accepted conflict')
 except m.Refused as error:assert str(error)=='ADDRESS_CONFLICT'
print('ok')
`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(output.trim(), 'ok')
})

test('a rollback of a change the host never started undoes nothing, answers ok, and fences off a late apply (bug 03/10/2026)', () => {
  // scv2wp, 03/10: the apply was refused before its journal was written (WP_ADDRESS_CONSTANT), the
  // rollback answered CHANGE_UNKNOWN, and tracy-web left the name `applying` for good. No journal
  // under the site lock proves nothing was written; the rollback records that, so an apply of the
  // same change arriving late (queued behind it) is refused instead of changing the site.
  const output = execFileSync(
    'python3',
    [
      '-c',
      `
import importlib.util,tempfile,pathlib,os,argparse,types,json
spec=importlib.util.spec_from_file_location('address',${JSON.stringify(script)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 os.environ['TRACY_PRIVATE_ROOT']=tmp
 (pathlib.Path(tmp)/'a').mkdir()
 calls=[]
 def php(container,payload):
  calls.append(payload)
  return {'platform':'wordpress','values':{'home':'https://old.test','siteurl':'https://old.test'},'ok':True}
 m.php=php
 m.run=lambda *args,**kwargs:'container-a'
 m.subprocess.run=lambda *args,**kwargs:types.SimpleNamespace(returncode=0)
 args=argparse.Namespace(label='a',operation='rollback',change_id='b'*32,old_url='https://old.test',new_url='https://new.test')
 answer=m.execute(args)
 assert answer['ok'] is True and answer['siteUrl']=='https://old.test' and answer['undone'] is False, answer
 assert m.execute(args)['undone'] is False
 assert calls==[], calls
 args.operation='apply'
 try:m.execute(args);raise AssertionError('applied a change already rolled back')
 except m.Refused as error:assert str(error)=='CHANGE_ALREADY_ROLLED_BACK'
 assert calls==[], calls
print('ok')
`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(output.trim(), 'ok')
})

// What Tracy's own provisioning writes into every WordPress copy (render_wp_config.py: WP_HOME and
// WP_SITEURL pinned to the site's address, just above "That's all, stop editing!").
const WP_CONFIG = [
  '<?php',
  "define( 'DB_NAME', 'wp' );",
  "define('WP_HOME', 'http://old.test:8080');",
  "define('WP_SITEURL', 'http://old.test:8080');",
  "/* That's all, stop editing! Happy publishing. */",
  "require_once ABSPATH . 'wp-settings.php';",
  ''
].join('\n')

test('a WordPress copy whose address Tracy pinned in wp-config.php is renamed there too, and rolled back (bug 03/10/2026)', () => {
  // scv2wp, 03/10: the host refused every rename with WP_ADDRESS_CONSTANT, because the constants
  // provisioning itself wrote win over the options the change rewrote.
  const output = execFileSync(
    'python3',
    [
      '-c',
      `
import importlib.util,tempfile,pathlib,os,argparse,types,json
spec=importlib.util.spec_from_file_location('address',${JSON.stringify(script)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 root=pathlib.Path(tmp)
 os.environ['TRACY_PRIVATE_ROOT']=str(root/'private');os.environ['TRACY_SITES_ROOT']=str(root/'sites')
 (root/'private'/'a').mkdir(parents=True);web=root/'sites'/'a'/'.webroot';web.mkdir(parents=True)
 config=web/'wp-config.php';config.write_text(${JSON.stringify(WP_CONFIG)})
 state={'home':'http://old.test:8080','siteurl':'http://old.test:8080'}
 def php(container,payload):
  if 'expected' in payload:
   assert set(payload['expected'])=={'home','siteurl'},payload
   for k,v in payload['expected'].items():
    if state[k] not in [v,payload['desired'][k]]:raise m.Refused('ADDRESS_CONFLICT')
   state.update(payload['desired'])
  return {'platform':'wordpress','values':dict(state),'constants':{'WP_HOME':'http://old.test:8080','WP_SITEURL':'http://old.test:8080'},'ok':True}
 m.php=php
 m.run=lambda *args,**kwargs:'container-a'
 m.subprocess.run=lambda *args,**kwargs:types.SimpleNamespace(returncode=0)
 args=argparse.Namespace(label='a',operation='apply',change_id='c'*32,old_url='http://old.test:8080/',new_url='http://new.test:8080/')
 assert m.execute(args)['siteUrl']=='http://new.test:8080/'
 text=config.read_text()
 assert "define('WP_HOME', 'http://new.test:8080');" in text and "define('WP_SITEURL', 'http://new.test:8080');" in text, text
 assert "define( 'DB_NAME', 'wp' );" in text and 'old.test' not in text
 assert state=={'home':'http://new.test:8080','siteurl':'http://new.test:8080'}, state
 args.operation='rollback'
 assert m.execute(args)['undone'] is True
 assert config.read_text()==${JSON.stringify(WP_CONFIG)}
 assert state['home']=='http://old.test:8080'
print('ok')
`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(output.trim(), 'ok')
})

test('a WordPress address constant Tracy cannot rewrite in place is refused with WP_ADDRESS_CONSTANT, before anything is written', () => {
  const output = execFileSync(
    'python3',
    [
      '-c',
      `
import importlib.util,tempfile,pathlib,os,argparse,types
spec=importlib.util.spec_from_file_location('address',${JSON.stringify(script)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
cases={
 'computed':"<?php\\ndefine('WP_HOME', 'http://' . $_SERVER['HTTP_HOST']);\\ndefine('WP_SITEURL', 'http://old.test');\\n",
 'twice':"<?php\\ndefine('WP_HOME', 'http://old.test');\\ndefine('WP_HOME', 'http://old.test');\\ndefine('WP_SITEURL', 'http://old.test');\\n",
 'elsewhere':"<?php\\nrequire __DIR__ . '/address.php';\\n",
}
for name,text in cases.items():
 with tempfile.TemporaryDirectory() as tmp:
  root=pathlib.Path(tmp)
  os.environ['TRACY_PRIVATE_ROOT']=str(root/'private');os.environ['TRACY_SITES_ROOT']=str(root/'sites')
  (root/'private'/'a').mkdir(parents=True);web=root/'sites'/'a'/'.webroot';web.mkdir(parents=True)
  (web/'wp-config.php').write_text(text)
  writes=[]
  def php(container,payload):
   if 'expected' in payload: writes.append(payload)
   return {'platform':'wordpress','values':{'home':'http://old.test','siteurl':'http://old.test'},'constants':{'WP_HOME':'http://old.test','WP_SITEURL':'http://old.test'},'ok':True}
  m.php=php
  m.run=lambda *args,**kwargs:'container-a'
  m.subprocess.run=lambda *args,**kwargs:types.SimpleNamespace(returncode=0)
  args=argparse.Namespace(label='a',operation='apply',change_id='d'*32,old_url='http://old.test/',new_url='http://new.test/')
  try:m.execute(args);raise AssertionError(name+': accepted')
  except m.Refused as error:assert str(error)=='WP_ADDRESS_CONSTANT',(name,str(error))
  assert writes==[] and (web/'wp-config.php').read_text()==text, name
  assert not (root/'private'/'a'/'address-changes'/(args.change_id+'.json')).exists(), name
print('ok')
`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(output.trim(), 'ok')
})

test('address journal binds changeId to payload and restores only matching current values', () => {
  const output = execFileSync(
    'python3',
    [
      '-c',
      `
import importlib.util,tempfile,pathlib,os,argparse,types,json
spec=importlib.util.spec_from_file_location('address',${JSON.stringify(script)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 os.environ['TRACY_PRIVATE_ROOT']=tmp
 (pathlib.Path(tmp)/'a').mkdir()
 state={'home':'https://old.test','siteurl':'https://old.test'}
 def php(container,payload):
  if 'expected' in payload:
   for k,v in payload['expected'].items():
    if state[k] not in [v,payload['desired'][k]]:raise m.Refused('ADDRESS_CONFLICT')
   state.update(payload['desired'])
  return {'platform':'wordpress','values':dict(state),'ok':True}
 m.php=php
 m.run=lambda *args,**kwargs:'container-a'
 m.subprocess.run=lambda *args,**kwargs:types.SimpleNamespace(returncode=0)
 args=argparse.Namespace(label='a',operation='apply',change_id='a'*32,old_url='https://old.test',new_url='https://new.test')
 assert m.execute(args)['siteUrl']=='https://new.test'
 assert m.execute(args)['siteUrl']=='https://new.test'
 args.new_url='https://other.test'
 try:m.execute(args);raise AssertionError('accepted mismatched id')
 except m.Refused as error:assert str(error)=='CHANGE_ID_CONFLICT'
 args.new_url='https://new.test';args.operation='rollback'
 assert m.execute(args)['siteUrl']=='https://old.test'
 assert state['home']=='https://old.test'
 assert m.execute(args)['siteUrl']=='https://old.test'
 args.operation='apply'
 try:m.execute(args);raise AssertionError('reapplied rolled-back change')
 except m.Refused as error:assert str(error)=='CHANGE_ALREADY_ROLLED_BACK'
print('ok')
`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(output.trim(), 'ok')
})
