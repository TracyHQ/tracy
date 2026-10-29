#!/usr/bin/env python3
"""Capture a reviewable contract from a disposable installation of a pinned quickstart."""
import argparse, collections, hashlib, json, pathlib, re, subprocess, sys, xml.etree.ElementTree as ET
p=argparse.ArgumentParser();p.add_argument('--webroot',required=True);p.add_argument('--inventory',required=True);p.add_argument('--manifest',required=True);p.add_argument('--slots-helper',required=True);p.add_argument('--out',required=True)
# One base archive now carries more than one design, so the template this capture belongs to is an
# argument rather than a literal. The defaults reproduce the published Apple contract byte for byte.
p.add_argument('--id',default='tracy-apple/j6/1.1.0');p.add_argument('--template',default='tracy')
# Which template's styles are part of the contract. A design activated on top of the base leaves the
# base template installed, and its unassigned styles are still presentation worth pinning.
p.add_argument('--styles',default='');p.add_argument('--file-roots',default='');p.add_argument('--cowork-version',default='0.14.0')
# T4 writes `media/t4/optimize/<md5>.css` the first time a route is viewed, so a capture picks up
# whichever routes the disposable site happened to serve — two runs over the same archive disagree.
# The Claude Cowork plugin already skips these when it verifies, so leaving them out makes a capture reproducible
# and changes nothing about what is protected. Off by default: the published Apple 1.1.0 lock lists
# two of them, and re-capturing it must still produce those bytes. `media/t4/css/<styleId>-sub.css` is the same kind
# of file: T4 compiles it when a style renders a page that is not its menu item's own target, so whether a capture holds
# it depends on which routes the crawl opened (JA Boxing 1.0.3 locked a `13-sub.css` its release never carried; the
# plugin treats it as compiled cache since 0.16.13 and readiness STAB-6 ignores it). `<styleId>.css` stays in the lock.
p.add_argument('--exclude-generated',action='store_true')
# A template that is not Tracy's names its menus and modules its own way. The defaults are Tracy's
# conventions, so every published profile re-captures byte for byte; JA Voyara, for one, keeps its
# pages in five menutypes and titles its ACM modules `[Voyara] ...`.
p.add_argument('--menutypes',default='tracy');p.add_argument('--module-prefix',default='[Tracy')
# Which module titles hold claims only the customer can make (prices, figures, quotes, clients).
p.add_argument('--evidence-pattern',default=r'Pricing|Statistics|Testimonials|Clients|Team')
# A fact is a fact by the FIELD's role too (TCH #1326): a `stat-value`, a `city`, an `addr`, a `quote`, a `client-name`,
# a `price` wants evidence whatever its module is called — "Home - Stats" is not "Statistics", "Home - Hero" holds four
# counters, "Contact - Branches" holds three cities. The roles are the ones the planner applies at run time
# (`apps/tracy-web/src/lib/fact-fields.json`, read here so the two never disagree); the title rule above stays, so
# gating only ever grows. Off by default so every published profile re-captures byte for byte; a profile captured
# without it is regated by `scripts/regate-contract.mjs`. The site identity module (`--identity-note`) is never gated:
# its slots take the customer's own contact answers and are emptied without them.
p.add_argument('--evidence-by-field',action='store_true')
# JoomlArt's `jalist` declares its row fields as <item> children, where Tracy's schemas nest <field>.
# Without this every stat, quote and card row of such a template stays locked. Off by default for the
# same byte-for-byte reason as above.
# The same flag also captures the row labels of a `jatable` field (a pricing table's feature rows, JA
# Smallbiz modules 107/111/119, JA Directory 88): they live in its `data` matrix as `data[row][0]`, the
# other cells are `b1`/`b0` ticks, and without a slot each label stays as the demo wrote it. A `jatable`
# declares its column fields as <item> children too, so a template that has one is captured with it.
p.add_argument('--list-items',action='store_true')
# An ACM link field is a url slot by its ROLE, its name: `btn-link-2`, `btn-link1`, `title-link-2` and
# `member-link3` are links as much as `btn-link` is, whatever their demo value (`#`, empty, a menu
# Itemid). Without this a numbered link field ends up a text slot, so a button label has no destination
# (PAGE-5) and its target is never checked (PAGE-4). Off by default so every published profile
# re-captures byte for byte.
p.add_argument('--link-fields-by-role',action='store_true')
# The one module a Tracy quickstart keeps its identity in (name, contact, social links), found by its
# note. Its entity and every slot of it are flagged `siteIdentity` (not `identity`: every entity already
# has an `identity` — the fields the Claude Cowork plugin finds it by): the Claude Cowork plugin (0.17.0+) lets those slots
# be emptied or filled, because a fact the customer lacks must not keep the demo's value. Their length
# limit is not derived from the demo's sample either — an empty demo phone would allow 40 characters.
# Off by default so every published profile re-captures byte for byte.
p.add_argument('--identity-note',default='')
# A module in the trash (published = -2) renders nowhere and is not customer content, yet a demo archive can
# keep one that uses a block the template does not ship. With this flag such rows are left out of the
# contract (entities, slots, assignments). Off by default so every published profile re-captures byte for byte.
p.add_argument('--skip-trashed-modules',action='store_true')
# A published mod_ja_acm module whose BLOCK the template does not ship (no `acm/<block>/` folder at all)
# renders nothing: mod_ja_acm has no layout to draw it with, so its words never reach a page (JA Vega j6:
# #121 "Our FAQ", block `accordion`, assigned to Home, absent from the rendered page). With this flag such
# rows are left out of the contract like trashed ones. A block folder that exists but lacks the layout's
# schema is still refused: that module does render. Off by default so every published profile re-captures
# byte for byte.
p.add_argument('--skip-unshipped-block-modules',action='store_true')
# A quickstart that ships more than one language (tracy-business/j6: 43) is sealed on its SOURCE
# editions only; the rest are derived copies the multilingual profile describes. `--languages` keeps
# the entities of those editions (and `*`), and `--counts-from` takes `inventoryCounts` from the whole
# archive's inventory, because the Claude Cowork plugin counts the rows of the site it is actually bound to.
# 1.1.0 did the same by trimming a full capture by hand (tasks/evidence/site-identity/multilingual-recipe.md #26).
p.add_argument('--languages',default='');p.add_argument('--counts-from',default='')
# Every piece of demo content a visitor reads, not only the ACM fields and HTML bodies (TCH, 24/10/2026: a
# coverage audit of JA Boxing 1.0.2 found 73% of its distinct demo text and 28% of its pictures declared).
# Adds slots for an article's `images` and its template extra fields (`attribs`), a module's shown title and
# its template/module fields outside `jatools-config`, an ACM picture whatever its field is named, a
# category's title and description, a menu item's page title and description, and three kinds the
# contract never held: contacts, tags and custom field definitions. A string field holding markup becomes
# one slot per text and attribute in it (`xpath` beside `jsonPath`). Every slot these rules add carries
# `customize: "keep"`: it is DECLARED, so the site agent finds and edits it on request, and the Customize
# engine leaves it as the demo wrote it. For a PICTURE that keep is provisional: without a render this script cannot tell
# a class photo from an icon, so the content coverage audit's Slot fit (`cli.mjs --fit`, ADR 0039) measures each one and
# sets the flag from its kind (a photo loses it; an icon, face, signature, cut-out, decoration or map keeps it). JA Boxing
# 1.0.5 kept 198 of its 257 pictures this way. The Claude Cowork plugin reads `jsonPath` without `nestedJson`, and
# `xpath` beside it, from 0.24.58. Off by default so every published profile re-captures byte for byte.
p.add_argument('--full-coverage',action='store_true')
# Slot roles (ADR 0038): every text and image slot of the content map carries a `role` and a `group`. A recapture
# passes the previous version's content map here; a slot whose key AND sample are unchanged keeps its role and group
# (the packaging agent reviewed them), the rule tables place the rest, and what they cannot place is listed on stdout
# (and in `--unplaced-report`, a file kept outside the contract) for the agent to bind from sample and position.
p.add_argument('--previous-map',default='');p.add_argument('--unplaced-report',default='')
# Whole units (spec #37 C1, C2): the HTML helper answers one slot per text node, so a heading cut by a `<br>` or a `<span>`
# ("NO1 <span>boxing</span> since 2008") came out as three slots no build can rewrite as one sentence. With this flag the
# text pieces of one heading, paragraph, list item, caption or cell become ONE text slot whose `xpath` is that element
# (the plugin's xpath grammar already resolves an element; a text range inside it belongs to the slot), and a fragment
# with no such element at all (an ACM field holding `THE <br> WORKOUT`) is one slot for the whole field. A list item
# keeps its own slot, and its link stays a url slot beside it; the rule tables group them. A unit with a word inside
# a link (or any element carrying href/src/alt/title) is NOT merged: the plugin keeps that element when it writes a
# whole unit, so the link would lose its words; its pieces stay separate text slots as without the flag. Off by default so every
# published profile re-captures byte for byte.
p.add_argument('--whole-units',action='store_true')
# The role vocabulary this capture WRITES (`roleVocabularyVersion`). 2 is what every released map carries. 3 (ADR 0040)
# adds the roles the whole-unit and list rules need to say what they found: article.title, editorial.navigation_url,
# editorial.illustration. Off by default: switching is a release decision, made with Road to live.
p.add_argument('--role-vocabulary',choices=['2','3'],default='2')
a=p.parse_args()
menutypes=[s for s in a.menutypes.split(',') if s]
template=a.template
styleTemplates=[s for s in (a.styles or template).split(',') if s]
file_roots=[s for s in (a.file_roots or 'templates/'+template+',plugins/system/t4,modules/mod_ja_acm,media').split(',') if s]
root=pathlib.Path(a.webroot);out=pathlib.Path(a.out)
inv=json.load(open(a.inventory));release=json.load(open(a.manifest));entities=[];slots=[]
full_inv=json.load(open(a.counts_from)) if a.counts_from else inv
# The Claude Cowork plugin finds each entity among EVERY row of the bound site's table — other
# languages, trashed and unpublished rows included — so duplicates are judged on the whole archive,
# taken before `--languages` trims `inv` in place. Counts and access keep reading `full_inv`.
match_inv=full_inv if a.counts_from else dict(inv)
# PHP's `(string)($row[$field]??'')`, the plugin's comparison: a missing or null value is ''.
php_str=lambda v:'' if v is None else str(v)
identity_fields={'category':['extension','path','language'],'module':['title','module','position','language','client_id'],'article':['alias','language'],'menuItem':['path','menutype','language','client_id'],'templateStyle':['title','template','client_id']}
identity_fields.update({'contact':['alias','catid','language'],'tag':['path','language'],'field':['name','context']})
module_key=lambda r:tuple(php_str(r.get(k)) for k in identity_fields['module'])
module_keys=collections.Counter(module_key(r) for r in match_inv['modules'])
if a.languages:
 keep=set(a.languages.split(','))
 for t in ['modules','content','menu','categories']:inv[t]=[r for r in inv[t] if r.get('language') in keep]
 kept_modules={r['id'] for r in inv['modules'] if r.get('client_id')=='0'}
 inv['modules_menu']=[r for r in inv['modules_menu'] if r['moduleid'] in kept_modules]
if a.skip_trashed_modules:
 trashed={r['id'] for r in inv['modules'] if str(r.get('published'))=='-2'}
 inv['modules_menu']=[r for r in inv['modules_menu'] if r['moduleid'] not in trashed]
# A TRASHED ACM module (published = -2) is never shown, so one whose layout schema the template does not
# ship is left out without any flag (JA Directory #118 `k2content`, JA Vega #112 `statistics`): before, it
# refused the whole capture, so no published contract held such a row and every one re-captures byte for
# byte. A trashed module that HAS its schema is still captured unless --skip-trashed-modules is passed.
def acm_schema(r):
 try:cfg=json.loads(json.loads(r['params'])['jatools-config']);block=cfg[':type'].split(':')[-1];layout=cfg[block].get('jatools-layout-'+block,'style-1')
 except (ValueError,KeyError,TypeError,AttributeError):return None
 return root/('templates/'+template+'/acm')/block/'tmpl'/f'{layout}.xml'
unshipped={r['id'] for r in inv['modules'] if r.get('client_id')=='0' and r.get('module')=='mod_ja_acm' and str(r.get('published'))=='-2' and r['title'].startswith(a.module_prefix) and (lambda x:x is not None and not x.exists())(acm_schema(r))}
inv['modules_menu']=[r for r in inv['modules_menu'] if r['moduleid'] not in unshipped]
if a.skip_unshipped_block_modules:
 for r in inv['modules']:
  if r.get('client_id')!='0' or r.get('module')!='mod_ja_acm':continue
  try:block=json.loads(json.loads(r['params'])['jatools-config'])[':type'].split(':')[-1]
  except (ValueError,KeyError,TypeError,AttributeError):continue
  if block and not (root/('templates/'+template+'/acm')/block).is_dir():unshipped.add(r['id'])
 inv['modules_menu']=[r for r in inv['modules_menu'] if r['moduleid'] not in unshipped]
# ── --full-coverage: the rules that declare the rest of what a visitor reads ──────────────────────
# The elements whose text a reader takes as one piece: a heading, a sentence, a list item, a caption, a cell, a button.
# `a` and `span` are not: they sit inside one of these.
UNIT_TAGS={'h1','h2','h3','h4','h5','h6','p','li','dt','dd','figcaption','summary','th','td','button','label'}
HTML_ROOT='/html/body/div'
def text_unit(xpath):
 """The xpath of the nearest unit element above a text node's xpath, or None."""
 segs=xpath.strip('/').split('/')
 if not segs or not re.fullmatch(r'text\(\)(\[\d+\])?',segs[-1]):return None
 for i in range(len(segs)-2,-1,-1):
  if re.fullmatch(r'[a-z0-9]+',re.sub(r'\[\d+\]$','',segs[i])) and re.sub(r'\[\d+\]$','',segs[i]) in UNIT_TAGS:return '/'+'/'.join(segs[:i+1])
 return None
# The attributes the helper answers as slots of their own. The plugin writes a whole-unit slot as one text node and
# KEEPS every element carrying one of these (ContentSlots::writeUnit), so a word inside such an element cannot be
# part of a merged unit: `<p>Call <a href="tel:...">us</a> today</p>` would be written `<p>New text<a href="tel:..."></a></p>`,
# a link with no words. A unit holding such a piece keeps its pieces as separate text slots, each written in place.
SLOT_ATTRS=('href','src','alt','title')
def slotted_elements(hs):
 """The xpaths of the elements that carry an attribute slot (`.../a` for `.../a/@href`)."""
 out=set()
 for h in hs:
  x=h.get('xpath')
  if isinstance(x,str) and '/@' in x and x.rsplit('/@',1)[1] in SLOT_ATTRS:out.add(x.rsplit('/@',1)[0])
 return out
def inside_slotted(xpath,unit,slotted):
 """Whether an element between the unit and the text node at `xpath` (both excluded) carries an attribute slot."""
 segs=xpath[len(unit):].strip('/').split('/')[:-1];at=unit
 for seg in segs:
  at=at+'/'+seg
  if at in slotted:return True
 return False
def whole_units(hs):
 """Merge the text slots the HTML helper cut out of one unit element into one slot on that element."""
 texts=[h for h in hs if h.get('type')=='text' and isinstance(h.get('xpath'),str) and '/@' not in h['xpath']]
 units={id(h):text_unit(h['xpath']) for h in texts}
 # No unit element anywhere in the fragment: the fragment is the unit (a heading field with `<br>`, a one-line note).
 if texts and not any(units.values()) and all(h['xpath'].startswith(HTML_ROOT+'/') for h in texts):units={id(h):HTML_ROOT for h in texts}
 members=collections.defaultdict(list)
 for h in texts:
  if units[id(h)]:members[units[id(h)]].append(h)
 slotted=slotted_elements(hs)
 apart={u for u,ms in members.items() if any(inside_slotted(m['xpath'],u,slotted) for m in ms)}
 # A unit that holds an element carrying an attribute slot anywhere inside it (an <img src> beside the words) also
 # keeps its pieces: one text node written over the unit would drop the words around that element.
 apart|={u for u in members if any(e.startswith(u+'/') for e in slotted)}
 out=[];done=set()
 for h in hs:
  unit=units.get(id(h))
  if not unit or len(members[unit])<2 or unit in apart:out.append(h);continue
  if unit in done:continue
  done.add(unit)
  sample=re.sub(r'\s+',' ',' '.join(m['sample'] for m in members[unit])).strip()
  out.append({**h,'sample':sample,'xpath':unit})
 return out
def html_slots(body):
 script='require $argv[1]; echo json_encode(ContentSlots::htmlSlots(stream_get_contents(STDIN)));'
 hs=json.loads(subprocess.check_output(['php','-r',script,a.slots_helper],input=body.encode())) if body.strip() else []
 return whole_units(hs) if a.whole_units else hs
def form_types(files):
 """Field name -> type from Joomla form XML (`<field>` and JoomlArt's `<item>`), first declaration wins."""
 types={}
 for f in files:
  try:tree=ET.parse(f)
  except (ET.ParseError,OSError):continue
  for node in [*tree.iter('field'),*tree.iter('item')]:
   if node.get('name') and node.get('type'):types.setdefault(node.get('name'),node.get('type').lower())
 return types
tpl_dir=root/'templates'/template
# T4 and T3 both read an article's extra fields from `etc/extrafields/*.xml` and add module fields from `etc/form/`.
article_types=form_types(sorted((tpl_dir/'etc'/'extrafields').glob('*.xml'))) if a.full_coverage else {}
module_form=sorted((tpl_dir/'etc'/'form').glob('com_modules*.xml')) if a.full_coverage else []
module_types_cache={}
def module_types(module):
 if module not in module_types_cache:module_types_cache[module]=form_types([root/'modules'/module/f'{module}.xml',*module_form])
 return module_types_cache[module]
CONTENT_TYPES={'text','textarea','editor','media','url','email'}
# Options, not words: a field whose NAME says it styles or places something. A picture is a picture
# whatever its name (`img-icon`), and a video's id is the demo's video, so neither is held to it.
# `class` only as a word of the name (`item_class`, `header-class`): JA Boxing's `classes-type` is the words of a
# fitness class, not a CSS class.
TECHNICAL=re.compile(r'color|(^|[-_])class(name)?($|[-_])|style|layout|icon|width|height|column|align|animation|sfx|format|^tag$|_tag$|^id$|[-_]id$|^id[-_]|cache|^count$|limit|ordering|target',re.I)
VISIBILITY_PARAMS={'moduleclass_sfx','module_tag','header_tag','header_class','style','bootstrap_size','cache','cache_time'}
LINK_ROLE=re.compile(r'(link|url|href)[-_]?\d*$|^(link|url|href)[-_]')
MARKUP=re.compile(r'<[a-zA-Z/!]')
def leaf_name(path):
 name=next((str(x) for x in reversed(path) if not isinstance(x,int)),'')
 return re.sub(r'.*\[([^]]+)\]$',r'\1',name)
def declare_json(add,column,value,types,label,skip=()):
 """One slot per content field in a JSON column, by the form that declares the field."""
 try:data=json.loads(value) if isinstance(value,str) and value.strip() else None
 except ValueError:return
 if not isinstance(data,dict):return
 def walk(node,path):
  if isinstance(node,dict):
   for k,v in node.items():
    if not path and k in skip:continue
    walk(v,path+[k])
  elif isinstance(node,list):
   for i,v in enumerate(node):walk(v,path+[i])
  elif isinstance(node,str) and node.strip():
   name=leaf_name(path);ft=types.get(name)
   if ft not in CONTENT_TYPES:return
   if ft!='media' and 'video' not in name.lower() and TECHNICAL.search(name):return
   typ='image' if ft=='media' else 'url' if ft=='url' or LINK_ROLE.search(name) else 'text'
   if typ=='text' and MARKUP.search(node):
    for h in html_slots(node):add(column,h['type'],h['sample'],jsonPath=path,xpath=h['xpath'],label=label+' / '+name,customize='keep')
   else:add(column,typ,node,jsonPath=path,label=label+' / '+name,customize='keep')
 walk(data,[])
def declare_html(add,column,body,label):
 for h in html_slots(body or ''):add(column,h['type'],h['sample'],xpath=h['xpath'],label=label,customize='keep')
def declare_text(add,column,value,label,typ='text',**extra):
 if isinstance(value,str) and value.strip():add(column,typ,value,label=label,customize='keep',**extra)
ARTICLE_IMAGES={'image_intro':'image','image_intro_alt':'text','image_intro_caption':'text','image_fulltext':'image','image_fulltext_alt':'text','image_fulltext_caption':'text'}
# A contact's facts are the customer's to state, as an address or phone number in any module is.
CONTACT_TEXT=['name','con_position','address','suburb','country','postcode','telephone','mobile','fax','email_to']
CONTACT_FACTS={'address','suburb','country','postcode','telephone','mobile','fax','email_to','webpage'}
def read_text(path):
 try:return path.read_text(errors='replace') if path.is_file() else ''
 except OSError:return ''
def module_layout(row):
 """The layout file Joomla renders a (non-ACM) module with: the template's override, T4's base override, the module's own."""
 try:layout=(json.loads(row.get('params') or '{}') or {}).get('layout') or '_:default'
 except (ValueError,AttributeError):layout='_:default'
 owner,_,name=layout.rpartition(':')
 module=row.get('module') or ''
 if not re.fullmatch(r'[A-Za-z0-9_-]+',module) or not re.fullmatch(r'[A-Za-z0-9_.-]+',name or 'default'):return None
 name=name or 'default'
 candidates=([tpl_dir/'html'/module/f'{name}.php'] if owner in ('','_',template) else [])+[root/'plugins/system/t4/themes/base/html'/module/f'{name}.php',root/'modules'/module/'tmpl'/f'{name}.php']
 return next((c for c in candidates if c.is_file()),None)
# An ACM container (JA Boxing's `container-tabs`) prints the title of every module in the position its config names, as a
# tab, whatever that module's `showtitle` says: such a layout reads `$mod->title`.
def container_positions():
 found=set()
 for r in inv['modules']:
  if r.get('client_id')!='0' or str(r.get('published'))!='1' or r.get('module')!='mod_ja_acm':continue
  schema=acm_schema(r)
  if schema is None or '$mod->title' not in read_text(schema.with_suffix('.php')):continue
  try:cfg=json.loads(json.loads(r['params'])['jatools-config']);block=cfg[':type'].split(':')[-1];fields=cfg[block]
  except (ValueError,KeyError,TypeError,AttributeError):continue
  for k,v in (fields.items() if isinstance(fields,dict) else []):
   if k.endswith('[position]'):found.update(x for x in (v if isinstance(v,list) else [v]) if isinstance(x,str) and x)
 return found
titled_positions=container_positions() if a.full_coverage else set()
def module_title_shown(row):
 if str(row.get('showtitle') or '0')!='0':return True
 if row.get('position') in titled_positions:return True
 if row.get('module')!='mod_ja_acm':
  # A layout that prints the title itself (mod_breadcrumbs: `aria-label="<?php echo $module->title ?>"`).
  layout=module_layout(row)
  return layout is not None and '$module->title' in read_text(layout)
 schema=acm_schema(row)
 if schema is None:return False
 layout=schema.with_suffix('.php')
 return layout.exists() and 'module->title' in layout.read_text(errors='replace')
def declare_everything(kind,row,add):
 title=row.get('title') or row.get('name') or ''
 if kind=='article':
  try:images=json.loads(row.get('images') or '{}')
  except ValueError:images={}
  for k,typ in ARTICLE_IMAGES.items():
   v=images.get(k) if isinstance(images,dict) else None
   if isinstance(v,str) and v.strip():add('images',typ,v,jsonPath=[k],label=title+' / '+k,customize='keep')
  declare_json(add,'attribs',row.get('attribs'),article_types,title)
 elif kind=='module':
  if module_title_shown(row):declare_text(add,'title',row.get('title'),title+' / title')
  # mod_custom bodies outside the module prefix were never slots.
  if row.get('module')=='mod_custom' and not row['title'].startswith(a.module_prefix):declare_html(add,'content',row.get('content'),title)
  declare_json(add,'params',row.get('params'),module_types(row.get('module','')),title,skip={'jatools-config',*VISIBILITY_PARAMS})
 elif kind=='category':
  declare_text(add,'title',row.get('title'),title+' / title')
  declare_html(add,'description',row.get('description'),title+' / description')
 elif kind=='menuItem':
  try:params=json.loads(row.get('params') or '{}')
  except ValueError:params={}
  for k in ['page_title','menu-meta_description','menu-anchor_title','page_heading']:
   v=params.get(k) if isinstance(params,dict) else None
   if isinstance(v,str) and v.strip():add('params','text',v,jsonPath=[k],label=title+' / '+k,customize='keep')
 elif kind=='contact':
  for col in CONTACT_TEXT:declare_text(add,col,row.get(col),title+' / '+col,requiresEvidence=col in CONTACT_FACTS)
  declare_text(add,'webpage',row.get('webpage'),title+' / webpage','url',requiresEvidence=True)
  declare_html(add,'misc',row.get('misc'),title+' / misc')
 elif kind=='tag':
  declare_text(add,'title',row.get('title'),title+' / title')
  declare_html(add,'description',row.get('description'),title+' / description')
 elif kind=='field':
  declare_text(add,'label',row.get('label'),title+' / label')
  try:params=json.loads(row.get('params') or '{}')
  except ValueError:params={}
  v=params.get('hint') if isinstance(params,dict) else None
  if isinstance(v,str) and v.strip():add('params','text',v,jsonPath=['hint'],label=title+' / hint',customize='keep')
volatile={'id','asset_id','checked_out','checked_out_time','created','created_by','created_by_alias','modified','modified_by','hits','version','lft','rgt'}
tables={'category':'categories','module':'modules','article':'content','menuItem':'menu','templateStyle':'template_styles'}
# The kinds --full-coverage adds, each read through the plugin's own writer for its kind (JoomlaSiteWriter::MAP).
extra_tables={'contact':'contact_details','tag':'tags','field':'fields'}
if a.full_coverage:
 tables={**tables,**extra_tables}
 for t in extra_tables.values():inv.setdefault(t,[]);full_inv.setdefault(t,[]);match_inv.setdefault(t,[])
for kind,table in tables.items():
 for row in inv[table]:
  if kind=='category' and row.get('extension')!='com_content':continue
  if kind=='module' and row.get('client_id')!='0':continue
  if kind=='module' and a.skip_trashed_modules and str(row.get('published'))=='-2':continue
  if kind=='module' and row['id'] in unshipped:continue
  if kind=='menuItem' and (row.get('client_id')!='0' or row.get('menutype') not in menutypes):continue
  if kind=='templateStyle' and row.get('template') not in styleTemplates:continue
  if kind=='article' and row.get('state')!='1':continue
  if kind=='contact' and str(row.get('published'))!='1':continue
  if kind=='tag' and (str(row.get('published'))!='1' or str(row.get('parent_id'))=='0'):continue
  if kind=='field' and str(row.get('state'))!='1':continue
  eid=f'{kind}-{row["id"]}'
  identity={k:row[k] for k in identity_fields[kind]}
  # Modules agreeing on all five fields (JA Space's two Hero, two Clients) make the plugin refuse the whole contract, so only they carry the release's id.
  if kind=='module' and module_keys[module_key(row)]>1:identity['id']=row['id']
  entity={'key':eid,'kind':kind,'identity':identity,'sourceId':int(row['id']),'initial':{k:v for k,v in row.items() if k not in volatile}}
  if kind=='article':entity['identityReferences']={'catid':'category-'+row['catid']}
  entities.append(entity)
  def add(column, typ, sample, **extra):
   slots.append({'key':f'{eid}.{len([s for s in slots if s["entity"]==eid])}','entity':eid,'column':column,'type':typ,'sample':sample,'maxCharacters':2048 if typ=='url' else 255 if typ=='image' else max(40,min(2000,len(sample)*2+20)),'requiresEvidence':bool(re.search(a.evidence_pattern,row.get('title',''))),**extra})
  if kind=='module' and row['module']=='mod_ja_acm' and row['title'].startswith(a.module_prefix):
   params=json.loads(row['params']);cfg=json.loads(params['jatools-config']);block=cfg[':type'].split(':')[-1];layout=cfg[block].get('jatools-layout-'+block,'style-1')
   xml=root/('templates/'+template+'/acm')/block/'tmpl'/f'{layout}.xml'
   if not xml.exists():raise ValueError(f'Missing ACM schema {xml}')
   schema=ET.parse(xml);fields={f.get('name'):f.get('type') for f in schema.iter('field')}
   if a.list_items:fields={**{i.get('name'):i.get('type') for i in schema.iter('item')},**fields}
   def walk(node,path):
    if isinstance(node,dict):
     for k,v in node.items():walk(v,path+[k])
    elif isinstance(node,list):
     for i,v in enumerate(node):walk(v,path+[i])
    elif isinstance(node,str):
     name=next((str(x) for x in reversed(path) if not isinstance(x,int)),'');name=re.sub(r'.*\[([^]]+)\]$',r'\1',name)
     ft=fields.get(name)
     # A jatable row label: `data[row][0]` of the table's matrix; tick cells (`b1`, `b0`) are not words.
     if ft=='jatable' and a.list_items and len(path)>=2 and path[-1]==0 and isinstance(path[-2],int) and node.strip():
      add('params','text',node,jsonPath=path,nestedJson='jatools-config',label=row['title']+' / '+name+' row '+str(path[-2]+1))
      return
     if ft not in ['text','textarea','media','url','email']:return
     if re.search(r'color|class|style|layout|icon|width|height|column|align|animation',name) and not (a.full_coverage and ft=='media'):return
     link=r'(link|url|href)[-_]?\d*$' if a.link_fields_by_role else r'link$|url$'
     typ='image' if ft=='media' else 'url' if re.search(link,name) or ft=='url' else 'text'
     # A picture field named like an option (`img-icon`) was dropped by the name rule above; it is
     # declared now, kept until Slot fit measures its kind (`cli.mjs --fit`, ADR 0039).
     # They come after the module's other slots, so the keys the old rules made stay what they were.
     if re.search(r'color|class|style|layout|icon|width|height|column|align|animation',name):
      later.append((typ,node,path,name));return
     add('params',typ,node,jsonPath=path,nestedJson='jatools-config',label=row['title']+' / '+name)
   later=[]
   walk(cfg,[])
   for typ,node,path,name in later:add('params',typ,node,jsonPath=path,nestedJson='jatools-config',label=row['title']+' / '+name,customize='keep')
  elif kind in ['module','article']:
   columns=['content'] if kind=='module' and row['module']=='mod_custom' and row['title'].startswith(a.module_prefix) else ['introtext','fulltext'] if kind=='article' else []
   for col in columns:
    body=row[col]
    for h in html_slots(body):add(col,h['type'],h['sample'],xpath=h['xpath'],label=row['title'])
  # Labels remain content; identities use stable aliases rather than mutable titles.
  if kind in ['article','menuItem']:add('title','text',row['title'],label=row['title'])
  if a.full_coverage:declare_everything(kind,row,add)
# Authors (--full-coverage): a visitor reads each post's author name, and on the author pages the picture, bio and job
# title. A `user` entity per author of a captured article (identity: username; only name and username are kept, never
# the account), and a `userProfile` entity per profile value the plugin lists (\UserProfileKey: user_id x 100 + the
# key's place in FIELDS), matched by its field and its author. Neither kind is counted: every provision adds people.
PROFILE_FIELDS=['profile.aboutme','profile.user_jobtitle','profile.user_tagline','profile.user_avatar']
people_rows={'user':[],'userProfile':[]}
if a.full_coverage:
 def words(v):
  try:d=json.loads(v)
  except (TypeError,ValueError):return v or ''
  return d if isinstance(d,str) else v
 # A Super User is the account a provision takes over (renamed, its username changed): not the demo's author.
 users={r['id']:r for r in inv.get('users',[]) if str(r.get('admin') or '0')!='1'}
 owners={r['id']:r for r in inv.get('users',[]) if str(r.get('admin') or '0')=='1'}
 people_rows['user']=list(users.values())
 for r in inv.get('user_profiles',[]):
  if r['profile_key'] in PROFILE_FIELDS and (r['user_id'] in users or r['user_id'] in owners) and words(r['profile_value']).strip():
   people_rows['userProfile'].append({'id':str(int(r['user_id'])*100+PROFILE_FIELDS.index(r['profile_key'])),'user_id':r['user_id'],'field':r['profile_key'][len('profile.'):],'value':words(r['profile_value'])})
 def declare_profiles(uid,label,identity_extra,references):
  for pr in sorted((p for p in people_rows['userProfile'] if p['user_id']==uid),key=lambda p:int(p['id'])):
   pid=f'userProfile-{pr["id"]}';plabel=label.strip()+' / '+pr['field']
   def add(column,typ,sample,**extra):
    slots.append({'key':f'{pid}.{len([s for s in slots if s["entity"]==pid])}','entity':pid,'column':column,'type':typ,'sample':sample,'maxCharacters':255 if typ=='image' else max(40,min(2000,len(sample)*2+20)),'requiresEvidence':False,**extra})
   if pr['field']=='user_avatar':declare_text(add,'value',pr['value'],plabel,'image')
   elif MARKUP.search(pr['value']):declare_html(add,'value',pr['value'],plabel)
   else:declare_text(add,'value',pr['value'],plabel)
   # An entity only when it has a slot (a bio of markup with no words has none).
   if any(sl['entity']==pid for sl in slots):entities.append({'key':pid,'kind':'userProfile','identity':{'field':pr['field'],**identity_extra},**({'identityReferences':references} if references else {}),'sourceId':int(pr['id']),'initial':{'value':pr['value']}})
 article_ids={str(e['sourceId']) for e in entities if e['kind']=='article'}
 for uid in sorted({r['created_by'] for r in inv['content'] if r['id'] in article_ids and r.get('created_by') in users},key=int):
  u=users[uid];eid=f'user-{uid}'
  entities.append({'key':eid,'kind':'user','identity':{'username':u['username']},'sourceId':int(uid),'initial':{'name':u['name'],'username':u['username']}})
  slots.append({'key':f'{eid}.0','entity':eid,'column':'name','type':'text','sample':u['name'],'maxCharacters':max(40,min(2000,len(u['name'])*2+20)),'requiresEvidence':False,'label':u['name'].strip()+' / name','customize':'keep'})
  declare_profiles(uid,u['name'],{},{'user_id':eid})
 # The Super User's picture, bio and job title are the demo's too (the demo admin is the byline of its first posts and has an
 # author page), but the account itself is not: its username changes. So no `user` entity; the profile is matched by the
 # account's id, which a provision keeps (it only resets the password).
 for uid in sorted(owners,key=int):declare_profiles(uid,owners[uid]['name'],{'user_id':str(uid)},None)
# Template language strings (--full-coverage): words a template keeps in its language file and prints itself (JA Boxing's
# "Try a class" is `Text::_('TPL_TRY_CLASS')`). One `languageString` entity per key the template's front-end PHP names as a
# literal, identity {extension, key, language}: `tpl_<template>` (or its `.sys` file) for a key that file defines, or a
# `TPL_` key no file defines (Joomla prints the key itself). A key another extension's file also defines is that
# extension's to print, and is left out. Its value is what a visitor reads, as the Claude Cowork plugin reads it
# (lib/LanguageStrings.php): the override file, else the site's `language/<tag>/` copy, else the template's own, else the
# key. The row id is the plugin's LanguageStrings::id(). Never counted: a language file is not inventory.
NOT_VISITOR_PHP={'templateInfo.php','error-t4.php'}
NOT_VISITOR_DIRS={'admin','fields','elements','params'}
LANG_CALL=re.compile(r'\b(?:J?Text)::(?:_|sprintf|plural|script)\(\s*([\'"])([A-Za-z0-9_][A-Za-z0-9_.-]*)\1',re.I)
# Joomla's own reading of a language file (LanguageOverrides::parse in the plugin), so a value is read exactly as the plugin reads it.
INI_PHP=r'''$o=[];foreach(json_decode(stream_get_contents(STDIN),true) as $f=>$b){$r=[];$s=trim($b)===''?[]:@parse_ini_string(str_replace('_QQ_','"\""',$b),false,INI_SCANNER_RAW);if(is_array($s))foreach($s as $k=>$v)if(is_string($k)&&is_scalar($v))$r[strtoupper($k)]=str_replace('\"','"',(string)$v);$o[$f]=(object)$r;}echo json_encode((object)$o);'''
def string_id(extension,language,key):return int(hashlib.sha1(f'{extension}|{language}|{key}'.encode()).hexdigest()[:7],16)+1
if a.full_coverage:
 named=set()
 for f in sorted(tpl_dir.rglob('*.php')):
  rel=f.relative_to(tpl_dir).parts
  if rel[-1] in NOT_VISITOR_PHP or rel[0] in NOT_VISITOR_DIRS:continue
  named.update(m.group(2).upper() for m in LANG_CALL.finditer(read_text(f)))
 tags=sorted({d.name for base in [root/'language',tpl_dir/'language'] if base.is_dir() for d in base.iterdir() if d.is_dir() and re.fullmatch(r'[a-z]{2,3}-[A-Z]{2,4}',d.name) and any((d/n).is_file() for n in [f'{d.name}.tpl_{template}.ini',f'tpl_{template}.ini'])})
 if a.languages:tags=[t for t in tags if t in set(a.languages.split(','))]
 ini_files={}
 for tag in tags:
  for ext in [f'tpl_{template}',f'tpl_{template}.sys']:
   for folder in [root/'language'/tag,tpl_dir/'language'/tag]:
    found=next((folder/n for n in [f'{ext}.ini',f'{tag}.{ext}.ini'] if (folder/n).is_file()),None)
    if found:ini_files[(tag,ext)]=found;break
  over=root/'language'/'overrides'/f'{tag}.override.ini'
  if over.is_file():ini_files[(tag,'override')]=over
  # Every other front-end language file of the tag: a key one of them defines is not the template's.
  for f in sorted((root/'language'/tag).glob('*.ini')):
   if not re.search(rf'(^|\.)tpl_{re.escape(template)}(\.sys)?\.ini$',f.name):ini_files[(tag,'other:'+f.name)]=f
 keys=list(ini_files)
 parsed=json.loads(subprocess.check_output(['php','-r',INI_PHP],input=json.dumps({str(i):ini_files[k].read_bytes().decode('utf-8','replace') for i,k in enumerate(keys)}).encode())) if keys else {}
 strings={k:parsed[str(i)] for i,k in enumerate(keys)}
 people_rows['languageString']=[]
 for tag in tags:
  own,sys_own,override=strings.get((tag,f'tpl_{template}'),{}),strings.get((tag,f'tpl_{template}.sys'),{}),strings.get((tag,'override'),{})
  others=set().union(*[set(v) for k,v in strings.items() if k[0]==tag and k[1].startswith('other:')])
  declared=[]
  for key in sorted(named):
   if key in others:continue
   ext=f'tpl_{template}' if key in own else f'tpl_{template}.sys' if key in sys_own else f'tpl_{template}' if key.startswith('TPL_') else None
   if ext is None:continue
   declared.append((ext,key,override.get(key,(own if ext==f'tpl_{template}' else sys_own).get(key,key))))
  for ext,key,value in sorted(declared):
   sid=string_id(ext,tag,key);eid=f'languageString-{sid}';label=f'{key} (template string, {tag})'
   def add(column,typ,sample,**extra):
    slots.append({'key':f'{eid}.{len([s for s in slots if s["entity"]==eid])}','entity':eid,'column':column,'type':typ,'sample':sample,'maxCharacters':max(40,min(2000,len(sample)*2+20)),'requiresEvidence':False,**extra})
   if MARKUP.search(value):declare_html(add,'value',value,label)
   else:declare_text(add,'value',value,label)
   if not any(sl['entity']==eid for sl in slots):continue
   identity={'extension':ext,'key':key,'language':tag}
   entities.append({'key':eid,'kind':'languageString','identity':identity,'sourceId':sid,'initial':{**identity,'value':value}})
   people_rows['languageString'].append({'id':str(sid),**identity})
# T4 site settings (--full-coverage): a T4 template keeps its logos in a FILE, `etc/site/<profile>.json` (read from
# `local/etc/site/` first), each template style naming its profile in `typelist-site` (none: `default`). A logo a header or a
# footer prints is demo content (JA Boxing's light logo `item-2.png` sat on 59 pages with no slot). One `siteSetting` entity per
# picture key a profile sets, identity {template, profile, key}, one `value` slot kept from Customize; the plugin writes it
# through the template's `local/` copy, never the template's own file. The keys are the plugin's TemplateSiteSettings::T4_KEYS
# that hold a picture. The row id is the plugin's SiteSettingRows::id(). Never counted: a settings file is not inventory.
SITE_IMAGE_KEYS=['site_logo','site_logo_small','site_logo_dark','site_logo_dark_small','site_logo_2']
def site_setting_id(tpl,profile,key):return int(hashlib.sha1(f'{tpl}|{profile}|{key}'.encode()).hexdigest()[:7],16)+1
if a.full_coverage:
 profiles=set();people_rows['siteSetting']=[]
 for r in inv.get('template_styles',[]):
  if r.get('client_id')!='0' or r.get('template') not in styleTemplates:continue
  try:name=(json.loads(r.get('params') or '{}') or {}).get('typelist-site')
  except (ValueError,AttributeError):name=None
  profiles.add((r['template'],name if isinstance(name,str) and re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9 _.-]{0,99}',name) else 'default'))
 for tpl,profile in sorted(profiles):
  # Where T4 reads the profile: the site's `local/` copy, else the template's own file.
  src=next((f for f in [root/'templates'/tpl/'local'/'etc'/'site'/f'{profile}.json',root/'templates'/tpl/'etc'/'site'/f'{profile}.json'] if f.is_file()),None)
  if src is None:continue
  try:settings=json.loads(read_text(src))
  except ValueError:continue
  if not isinstance(settings,dict):continue
  for key in SITE_IMAGE_KEYS:
   value=settings.get(key)
   if not isinstance(value,str) or not value.strip():continue
   sid=site_setting_id(tpl,profile,key);eid=f'siteSetting-{sid}'
   slots.append({'key':f'{eid}.0','entity':eid,'column':'value','type':'image','sample':value,'maxCharacters':255,'requiresEvidence':False,'label':f'{key} (site settings, profile {profile})','customize':'keep'})
   identity={'template':tpl,'profile':profile,'key':key}
   entities.append({'key':eid,'kind':'siteSetting','identity':identity,'sourceId':sid,'initial':{**identity,'value':value}})
   people_rows['siteSetting'].append({'id':str(sid),**identity})
if a.evidence_by_field:
 rules=json.load(open(pathlib.Path(__file__).resolve().parents[4]/'apps/tracy-web/src/lib/fact-fields.json'))
 roles=[re.compile(src,re.I) for src in rules['roles'].values()]
 companions={k.lower():set(v) for k,v in rules.get('companions',{}).items()}
 # The field a slot writes, as `fact-fields.js` reads it back: the last string of the JSON path, unwrapped.
 def field_of(sl):
  jp=sl.get('jsonPath')
  if not isinstance(jp,list):
   # `fact-fields.js` falls back to the last ` / ` segment of the label. Only the full-coverage slots read it
   # here, so a profile captured before them re-captures byte for byte.
   if sl.get('customize')!='keep':return ''
   label=str(sl.get('label') or '')
   return re.sub(r' row \d+$','',label[label.rfind(' / ')+3:]).lower() if ' / ' in label else ''
  name=next((str(x) for x in reversed(jp) if not isinstance(x,int)),'')
  return re.sub(r'.*\[([^]]+)\]$',r'\1',name).lower()
 siblings=collections.defaultdict(set)
 for sl in slots:
  if field_of(sl):siblings[sl['entity']].add(field_of(sl))
 for sl in slots:
  f=field_of(sl)
  if f and (any(r.search(f) for r in roles) or companions.get(f,set())&siblings[sl['entity']]):sl['requiresEvidence']=True
if a.identity_note:
 for e in entities:
  if e['kind']=='module' and e['initial'].get('note')==a.identity_note:
   e['siteIdentity']=True
   for sl in slots:
    if sl['entity']==e['key']:
     sl['siteIdentity']=True
     if sl['type']=='text':sl['maxCharacters']=255
access_script='require $argv[1]; echo json_encode(ContractAccess::snapshot(json_decode(stream_get_contents(STDIN),true)));'
access=json.loads(subprocess.check_output(['php','-r',access_script,str(pathlib.Path(a.slots_helper).parent/'ContractAccess.php')],input=json.dumps(full_inv).encode()))
counts={kind:len([r for r in full_inv[table] if kind!='menuItem' or r['client_id']=='0']) for kind,table in tables.items()}
# Assignment is a routing condition, not proof that a position renders in a layout.
# Keep that distinction explicit so agents cannot select a module by its title alone.
pages=[]
styles={int(r['id']):r for r in inv['template_styles']}
for e in entities:
 if e['kind']!='menuItem':continue
 row=e['initial'];mid=e['sourceId'];sid=int(row['template_style_id'])
 style=styles.get(sid) if sid else next((s for s in styles.values() if s['home']=='1' and s['client_id']=='0'),None)
 modules=[]
 for m in (v for v in entities if v['kind']=='module'):
  assigned=sorted(int(a['menuid']) for a in inv['modules_menu'] if int(a['moduleid'])==m['sourceId'])
  mode='all' if 0 in assigned else 'none' if not assigned else 'exclude' if all(n<0 for n in assigned) else 'include'
  if any(n<0 for n in assigned) and any(n>0 for n in assigned):raise ValueError('Mixed module assignment modes')
  if mode=='all' or mode=='include' and mid in assigned or mode=='exclude' and -mid not in assigned:
   modules.append({'entity':m['key'],'assignmentMode':mode,'menuIds':assigned,'position':m['initial']['position'],'published':m['initial']['published'],'access':m['initial']['access'],'language':m['initial']['language'],'publishUp':m['initial']['publish_up'],'publishDown':m['initial']['publish_down']})
 pages.append({'entity':e['key'],'route':e['identity']['path'],'link':row['link'],'style':'templateStyle-'+style['id'] if style else None,'layout':json.loads(style['params']).get('typelist-layout') if style else None,'assignedModules':modules,'visibilityRequires':['position rendered by resolved template/block/component','module and menu publication schedule','viewer access groups','language','responsive layout conditions']})
# Refuse a contract the plugin could never bind, or one that captured nothing, before writing a byte.
problems=[]
source_ids={e['key']:e['sourceId'] for e in entities}
for e in entities:
 refs=e.get('identityReferences',{})
 hits=[r for r in (people_rows[e['kind']] if e['kind'] in people_rows else match_inv[tables[e['kind']]]) if (e['kind']!='menuItem' or php_str(r.get('client_id'))=='0') and all(int(r.get(f) or 0)==source_ids.get(ref,-1) for f,ref in refs.items()) and all(php_str(r.get(k))==php_str(v) for k,v in e['identity'].items())]
 if len(hits)==1:continue
 status='state' if e['kind']=='article' else 'published'
 problems.append(f'{e["key"]} ({e["kind"]}) {json.dumps(e["identity"],ensure_ascii=False)}{" references "+json.dumps(refs) if refs else ""} matches {len(hits)} rows; the Claude Cowork plugin binds only when exactly one matches'+''.join(f'\n    row {r["id"]}: '+json.dumps({k:r.get(k) for k in [*e['identity'],*refs]},ensure_ascii=False)+(f' {status}={r[status]}' if status in r else '') for r in hits))
empty=[name for name,found in [('entities',entities),('slots',slots),('pages',pages)] if not found]
if empty:problems.append('captured '+', '.join('0 '+name for name in empty))
if problems:sys.exit('Contract not written:\n'+'\n'.join('- '+x for x in problems))
files={}
generated=re.compile(r'^media/t4/(optimize/(css/[a-f0-9]{32}\.css|js/[a-f0-9]{32}\.js)|css/\d+-sub\.css)$')
for prefix in [*file_roots,'images']:
 for f in sorted((root/prefix).rglob('*')):
  if not f.is_file():continue
  name=f.relative_to(root).as_posix()
  if a.exclude_generated and generated.match(name):continue
  files[name]=hashlib.sha256(f.read_bytes()).hexdigest()
manifest={'schemaVersion':'tracy-quickstart-contract/v1','id':a.id,'platform':'joomla','template':template,'quickstart':release,'coworkContractVersion':a.cowork_version,'mode':'content-recommendation'}
content_map={'entities':entities,'slots':slots,'pages':pages}
repo_root=pathlib.Path(__file__).resolve().parents[4]
if a.previous_map:
 previous={s['key']:s for s in json.load(open(a.previous_map)).get('slots',[])}
 for sl in slots:
  before=previous.get(sl['key'])
  if before and 'role' in before and before.get('sample')==sl.get('sample'):
   sl['role']=before['role']
   if 'group' in before:sl['group']=before['group']
   if 'action' in before:sl['action']=before['action']
# The rule tables fill in every slot still without a role; slots that kept one are left as they are.
proposed=subprocess.run(['node',str(repo_root/'scripts/slot-roles/rule-tables.mjs'),'joomla','--vocabulary',a.role_vocabulary,'--webroot',str(root),'--template',template],input=json.dumps(content_map).encode(),capture_output=True,cwd=repo_root)
if proposed.returncode:sys.exit('Contract not written:\n- slot role rule tables failed: '+proposed.stderr.decode().strip())
proposal=json.loads(proposed.stdout)
content_map=proposal['contentMap'];unplaced=proposal['unplaced']
content_map['entities']=[{k:v for k,v in e.items() if k!='initial'} for e in content_map['entities']]
if a.unplaced_report:pathlib.Path(a.unplaced_report).write_text(json.dumps({'unplaced':unplaced},indent=2)+'\n')
out.mkdir(parents=True,exist_ok=True)
for name,data in [('manifest',manifest),('content-map',content_map),('presentation-lock',{'entities':{e['key']:e['initial'] for e in entities},'assignments':inv['modules_menu'],'inventoryCounts':counts,'access':access,'visibility':{'moduleFields':['published','publish_up','publish_down','module','position','ordering','showtitle','access','language','client_id'],'moduleParams':['moduleclass_sfx','module_tag','header_tag','header_class','style','bootstrap_size','cache','cache_time'],'assignmentModes':['all','none','include','exclude'],'menuFields':['published','access','language','parent_id','type','link','template_style_id','home','params']},'fileRoots':file_roots,'files':files})]:
 (out/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['pnpm','exec','biome','format','--write','--files-max-size=2000000',*[str((out/(name+'.json')).resolve()) for name in ['manifest','content-map','presentation-lock']]],cwd=pathlib.Path(__file__).resolve().parents[4],check=True)
print(f'Slots without a role ({len(unplaced)}), for the packaging agent to bind: '+(', '.join(unplaced) or 'none'))
print(json.dumps({'entities':len(entities),'slots':len(slots),'files':len(files)}))
