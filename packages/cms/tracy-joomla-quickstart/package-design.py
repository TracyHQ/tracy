#!/usr/bin/env python3
"""Package the active T4 template and portable style metadata; never export source credentials."""
import argparse, json, pathlib, shutil, zipfile, hashlib
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--inventory',required=True);p.add_argument('--out',required=True)
# Version and provenance were literals; the default reproduces the published 1.0.0 package.
p.add_argument('--version',default='1.0.0');p.add_argument('--site',default='http://127.0.0.1:8213');a=p.parse_args()
source=pathlib.Path(a.source);out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
stage=out/'tracy_airbnb'
if stage.exists():shutil.rmtree(stage)
shutil.copytree(source,stage)
# Freeze local GUI overrides into the distributable profiles that Joomla's installer copies.
if (stage/'local').exists():
 for child in (stage/'local').iterdir():
  if child.is_dir():shutil.copytree(child,stage/child.name,dirs_exist_ok=True)
 shutil.rmtree(stage/'local')
for f in stage.rglob('*'):
 if f.is_file() and f.suffix in ['.php','.xml','.json','.css','.scss','.js','.ini','.html']:
  text=f.read_text();text=text.replace('templates/tracy/', 'templates/tracy_airbnb/').replace("$telem = 'tracy'", "$telem = 'tracy_airbnb'")
  if f.name=='templateDetails.xml':text=text.replace('<name>tracy</name>','<name>tracy_airbnb</name>').replace('en-GB.tpl_tracy.', 'en-GB.tpl_tracy_airbnb.').replace('<description>TPL_TRACY_APPLE_XML_DESCRIPTION</description>','<description>Tracy Airbnb for Joomla 6 and T4. Independent template with light and dark modes.</description>')
  f.write_text(text)
for f in (stage/'language/en-GB').glob('en-GB.tpl_tracy.*'):
 f.rename(f.with_name(f.name.replace('tpl_tracy.', 'tpl_tracy_airbnb.')))
d=json.load(open(a.inventory));styles=[]
for r in d['template_styles']:
 if r['template']=='tracy' and int(r['id'])>=110:
  params=json.loads(r['params']);styles.append({'layout':params['typelist-layout'],'title':r['title'],'home':r['home']=='1','params':params})
manifest={'schemaVersion':'tracy-design-pack/v1','id':'tracy-airbnb/j6','version':a.version,'template':'tracy_airbnb','base':'tracy-apple/j6','styles':styles,'assignments':{'strategy':'preserve-existing-style-ids','acmNamespace':'tracy_airbnb'},'source':{'activeTemplate':'tracy','site':a.site}}
(stage/'design-pack.json').write_text(json.dumps(manifest,indent=2)+'\n')
f=stage/'templateDetails.xml'
# The package declares its own version, and the activator refuses one that disagrees with the
# registry ("installed template reports a different version"). Measured 13/09/2026 on the first
# rebuild: the source tree still said 1.0.0 while the package was 1.1.0.
import re as _re
f.write_text(_re.sub(r'<version>[^<]*</version>', '<version>'+a.version+'</version>', f.read_text(), count=1).replace('<files>','<files>\n    <filename>design-pack.json</filename>'))
zipname=f'tpl_tracy_airbnb-j6-{a.version}.zip'
with zipfile.ZipFile(out/zipname,'w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(stage.rglob('*')):
  if f.is_file() and '.DS_Store' not in f.parts:
   info=zipfile.ZipInfo(f.relative_to(stage).as_posix(),date_time=(2026,9,11,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,f.read_bytes())
manifest['artifact']={'file':zipname,'sha256':hashlib.sha256((out/zipname).read_bytes()).hexdigest(),'bytes':(out/zipname).stat().st_size}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest['artifact']))
