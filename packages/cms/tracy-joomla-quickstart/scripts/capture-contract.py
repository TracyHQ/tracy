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
# An ACM icon field inside a repeatable row (a social block's `social-intro[font-icon]`: one icon class per network)
# is part of the row a visitor reads: a fourth network the customer adds needs its icon. The name rule below drops
# every field named like an option (`icon`), so without this flag the row is declared without its icon. With it a
# text field whose name holds `icon` and whose value sits in a list (a row of a repeatable fieldset) is declared as a
# text slot kept from Customize, after the module's other slots so the keys the old rules made stay what they were.
# A single option named like an icon (`heading-icon`) stays out. Off by default so every published profile
# re-captures byte for byte.
p.add_argument('--repeat-icons',action='store_true')
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
# A menu item in the trash (published = -2) is no page a visitor can open, yet a demo archive keeps some (JA Cagox 1.0.2:
# trashed copies of its shop pages), and each one became a page of the contract that no crawl ever reaches. With this
# flag such rows are left out of the contract (entities, slots, pages). Off by default so every published profile
# re-captures byte for byte.
p.add_argument('--skip-trashed-menu-items',action='store_true')
# An unpublished menu item (published = 0) opens no page: its route answers 404, so no crawl reaches it and every
# measure that walks the map's pages counts it as a dead page (JA Voyara 1.0.12: four Experiences items kept for
# later). With this flag it stays an entity of the contract (the lock still pins it, a customer may publish it) but is
# no page of the map. Off by default so every published profile re-captures byte for byte.
p.add_argument('--skip-unpublished-menu-pages',action='store_true')
# A T3 template keeps its logos in the params of each template style (`logoimage`, `logoimage_sm`, `logofooterimage`,
# `logoimage_dark`), not in a module or a settings file, so a T3 contract declared no slot for the logo every page prints
# (JA Cagox 1.0.2: three logo pictures, no slot). With this flag each such param a captured style sets is an image slot
# of that style's `templateStyle` entity (column `params`, `jsonPath` [key]), role `business.logo`, kept from Customize;
# the Claude Cowork plugin writes it as it writes any style param (`content.update` kind `templateStyle`). Off by
# default so every published profile re-captures byte for byte.
p.add_argument('--template-style-logos',action='store_true')
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
# Inline markup (whole units): a unit merged from several text pieces kept only their words ("More<br><span>Blogs</span>"
# became "More Blogs"), so the kit could not tell that the template draws "Blogs" on a second line in the accent colour.
# With this flag (it needs --whole-units) such a slot's sample is the unit's inner markup in the content map's notation,
# `More((br/)) ((span))Blogs((/span))` (`unit-markup.php`, which loads the HTML as the plugin's helper does), and every
# slot's `maxCharacters` is counted on its plain text, markup left out. `--previous-map` keeps a role whose sample only
# gained markup. Off by default so every published profile re-captures byte for byte.
p.add_argument('--inline-markup',action='store_true')
# The role vocabulary this capture WRITES (`roleVocabularyVersion`). 2 is what every released map carries. 3 (ADR 0040)
# adds the roles the whole-unit and list rules need to say what they found: article.title, editorial.navigation_url,
# editorial.illustration. Off by default: switching is a release decision, made with Road to live.
p.add_argument('--role-vocabulary',choices=['2','3'],default='2')
a=p.parse_args()
if a.inline_markup and not a.whole_units:p.error('--inline-markup needs --whole-units: only a merged unit keeps its markup')
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
def whole_units(hs,body=''):
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
 if a.inline_markup:
  merged=[h for h in out if h.get('xpath') in done]
  for h,markup in zip(merged,unit_markup(body,[h['xpath'] for h in merged])):
   # The markup must read as the words it replaces; anything else keeps the plain sample.
   if markup and plain_text(markup)==h['sample']:h['sample']=markup
 return out
UNIT_MARKUP=pathlib.Path(__file__).resolve().parent/'unit-markup.php'
def unit_markup(body,xpaths):
 """The inner markup of each element `xpaths` names in `body`, in the content map's notation (None when none)."""
 if not xpaths:return []
 return json.loads(subprocess.check_output(['php',str(UNIT_MARKUP)],input=json.dumps([{'html':body,'xpath':x} for x in xpaths]).encode()))
# The content map's notation `((tag attrs))`, `((/tag))`, `((br/))`, read as the kit reads it (text-format.mjs partsOf).
NOTATION=re.compile(r'\(\((/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^()]*)?/?)\)\)')
def plain_text(sample):
 """A sample's words: markup (notation or HTML) read as a space, white space collapsed."""
 return re.sub(r'\s+',' ',re.sub(r'<[^>]*>',' ',NOTATION.sub(' ',str(sample)))).strip()
# The length a slot's limit is counted on: its plain text under --inline-markup (markup is not what a reader counts).
text_len=lambda sample:len(plain_text(sample)) if a.inline_markup else len(sample)
def html_slots(body):
 script='require $argv[1]; echo json_encode(ContentSlots::htmlSlots(stream_get_contents(STDIN)));'
 hs=json.loads(subprocess.check_output(['php','-r',script,a.slots_helper],input=body.encode())) if body.strip() else []
 return whole_units(hs,body) if a.whole_units else hs
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
# T4 and T3 both read an article's extra fields from `etc/extrafields/*.xml` and add module fields from `etc/form/`:
# `com_modules*.xml` for every module, `<module>.xml` for that one (JA Kids Corner's "view all" link of mod_articles_category).
# A JA content type (`contenttype/types/<type>.xml`) adds its fields to `attribs` too: JA Symphony's audio article keeps its
# tracks in `ctm_audio`, a video its poster in `ctm_thumbnail`. Last come Joomla's own `attribs` fields, read from the
# `<fields name="attribs">` group of the core article form only: an event's button prints `alternative_readmore` (JA Impact).
article_types=form_types(sorted((tpl_dir/'etc'/'extrafields').glob('*.xml'))+sorted((tpl_dir/'contenttype'/'types').glob('*.xml'))) if a.full_coverage else {}
if a.full_coverage:
 try:core_form=ET.parse(root/'administrator/components/com_content/forms/article.xml')
 except (ET.ParseError,OSError):core_form=None
 for group in (core_form.iter('fields') if core_form is not None else []):
  if group.get('name')!='attribs':continue
  for node in group.iter('field'):
   if node.get('name') and node.get('type'):article_types.setdefault(node.get('name'),node.get('type').lower())
module_form=sorted((tpl_dir/'etc'/'form').glob('com_modules*.xml')) if a.full_coverage else []
module_types_cache={}
def module_types(module):
 own=[tpl_dir/'etc'/'form'/f'{module}.xml'] if a.full_coverage and module else []
 if module not in module_types_cache:module_types_cache[module]=form_types([root/'modules'/module/f'{module}.xml',*module_form,*own])
 return module_types_cache[module]
CONTENT_TYPES={'text','textarea','editor','media','url','email'}
# Options, not words: a field whose NAME says it styles or places something. A picture is a picture
# whatever its name (`img-icon`), and a video's id is the demo's video, so neither is held to it.
# `class` only as a word of the name (`item_class`, `header-class`): JA Boxing's `classes-type` is the words of a
# fitness class, not a CSS class.
# A count or a ratio typed as a text field (VirtueMart's product module: `max_items`, `products_per_row`; JA's clients
# block: `img-opacity`) is an option too.
TECHNICAL=re.compile(r'color|(^|[-_])class(name)?($|[-_])|style|layout|icon|width|height|column|align|animation|sfx|format|^tag$|_tag$|^id$|[-_]id$|^id[-_]|cache|^count$|limit|ordering|target|^(max|min)[-_]|per[-_]row|opacity',re.I)
VISIBILITY_PARAMS={'moduleclass_sfx','module_tag','header_tag','header_class','style','bootstrap_size','cache','cache_time'}
LINK_ROLE=re.compile(r'(link|url|href)[-_]?\d*$|^(link|url|href)[-_]')
MARKUP=re.compile(r'<[a-zA-Z/!]')
# An HTML character reference: named (`&amp;`), decimal (`&#8211;`) or hex (`&#x2019;`). A bare "&" is none.
HTML_ENTITY=re.compile(r'&(?:[A-Za-z][A-Za-z0-9]{1,31}|#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6});')
# A `jaitems` field stores its rows under the keys "0", "1"… (an object, not a list: JA Masthead's `menuitem_config`
# skips a deleted row's number), so a numeric key is a row, not a field name.
row_key=lambda x:isinstance(x,int) or isinstance(x,str) and x.isdigit()
# Legacy captures classify src fields as pictures; v3 audio sources are URL facts, separate from covers.
MEDIA_SRC=re.compile(r'(^|[-_])src$')
def leaf_name(path):
 name=next((str(x) for x in reversed(path) if not row_key(x)),'')
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
   audio=a.role_vocabulary=='3' and column=='attribs' and len(path)==3 and row_key(path[2]) and path[:2]==['ctm_audio','audio-src']
   typ='url' if audio else 'image' if ft=='media' or MEDIA_SRC.search(name) else 'url' if ft=='url' or LINK_ROLE.search(name) else 'text'
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
  # Words for search engines and the byline printed in place of the author's name (JA Kinetic's blog), after the
  # images and attribs so their keys stay.
  declare_text(add,'metadesc',row.get('metadesc'),title+' / metadesc')
  declare_text(add,'created_by_alias',row.get('created_by_alias'),title+' / created_by_alias')
  # The administrator's note, which a card can print as its label (JA Voyara's featured view: the label chip), last.
  declare_text(add,'note',row.get('note'),title+' / note')
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
  # A login page's words above and below the form (JA Kinetic's sign-in page), after the others so their keys stay.
  for k in ['page_title','menu-meta_description','menu-anchor_title','page_heading','login_description','logout_description']:
   v=params.get(k) if isinstance(params,dict) else None
   if isinstance(v,str) and v.strip():add('params','text',v,jsonPath=[k],label=title+' / '+k,customize='keep')
 elif kind=='contact':
  for col in CONTACT_TEXT:declare_text(add,col,row.get(col),title+' / '+col,requiresEvidence=col in CONTACT_FACTS)
  declare_text(add,'webpage',row.get('webpage'),title+' / webpage','url',requiresEvidence=True)
  declare_html(add,'misc',row.get('misc'),title+' / misc')
  # Joomla's five contact links (`linka` … `linke`) and the words shown for each; an unused one holds `false`.
  try:params=json.loads(row.get('params') or '{}')
  except ValueError:params={}
  for n in 'abcde':
   for k,typ in ((f'link{n}_name','text'),(f'link{n}','url')):
    v=params.get(k) if isinstance(params,dict) else None
    if isinstance(v,str) and v.strip():add('params',typ,v,jsonPath=[k],label=title+' / '+k,customize='keep',**({'requiresEvidence':True} if typ=='url' else {}))
  # The contact's picture (JA Symphony, Nova, Vega: the Contact page), after the links so their keys stay.
  declare_text(add,'image',row.get('image'),title+' / image','image',requiresEvidence=False)
 elif kind=='tag':
  declare_text(add,'title',row.get('title'),title+' / title')
  declare_html(add,'description',row.get('description'),title+' / description')
 elif kind=='field':
  declare_text(add,'label',row.get('label'),title+' / label')
  try:params=json.loads(row.get('params') or '{}')
  except ValueError:params={}
  v=params.get('hint') if isinstance(params,dict) else None
  if isinstance(v,str) and v.strip():add('params','text',v,jsonPath=['hint'],label=title+' / hint',customize='keep')
# One page masthead per `menuitem_config` entry of mod_jamasthead: `item_id`, `title`, `description` and `background`
# are objects keyed by the entry number. The background is the page's banner picture (a video file stays as it is),
# grouped per page; the title and description are the words printed over it. An entry for a menu item that does not
# exist is left out. When the module's form already declares `title` / `description`, the generic params rule has a
# slot (or fragment slots) writing that same entry, so the masthead rule skips it: one writer per `menuitem_config`
# field, deduped by write target (the params column and jsonPath ['menuitem_config', field, entry], entry as text).
MASTHEAD_VIDEO=re.compile(r'\.(mp4|ogg|webm)$',re.I)
def declare_masthead(row,add,declared=()):
 written={(s['jsonPath'][1],str(s['jsonPath'][2])) for s in declared if s.get('column')=='params' and isinstance(s.get('jsonPath'),list) and len(s['jsonPath'])>=3 and s['jsonPath'][0]=='menuitem_config'}
 menu_ids={str(r.get('id')) for r in inv.get('menu',[])}
 try:params=json.loads(row.get('params') or '{}')
 except ValueError:return
 cfg=params.get('menuitem_config') if isinstance(params,dict) else None
 if not isinstance(cfg,dict):return
 # A template whose module form types the `menuitem_config` fields (T4) has them declared by the JSON walk already:
 # a second slot for one field would be two writers of one value (`written` covers the background too).
 def column(name):
  v=cfg.get(name)
  return v if isinstance(v,dict) else dict(enumerate(v)) if isinstance(v,list) else {}
 items,titles,descriptions,backgrounds=(column(n) for n in ('item_id','title','description','background'))
 for k in sorted({*titles,*descriptions,*backgrounds},key=lambda x:(not str(x).isdigit(),int(x) if str(x).isdigit() else 0,str(x))):
  ids=items.get(k);ids=[str(i) for i in ids] if isinstance(ids,list) else [str(ids)] if ids not in (None,'') else []
  # An entry whose menu items are all gone never shows (the helper matches the active item): no slot.
  if not any(i in menu_ids for i in ids):continue
  page=f'{row["title"]} / menu item {",".join(ids) or k}'
  bg=backgrounds.get(k)
  if isinstance(bg,str) and bg.strip() and not MASTHEAD_VIDEO.search(bg.split('#')[0]) and ('background',str(k)) not in written:
   add('params','image',bg,jsonPath=['menuitem_config','background',k],label=page+' / background',role='business.hero_image',group={'id':f'module-{row["id"]}.masthead-{k}','item':0,'kind':'business'})
  for name,role in (('title','editorial.heading'),('description','editorial.paragraph')):
   v=(titles if name=='title' else descriptions).get(k)
   if isinstance(v,str) and v.strip() and (name,str(k)) not in written:add('params','text',v,jsonPath=['menuitem_config',name,k],label=page+' / '+name,role=role)
# A T3 style param naming a logo picture (the kit's `joomla-t3.mjs` T3_LOGO_KEY reads the same names).
T3_LOGO_KEY=re.compile(r'logo[a-z]*image(?:_[a-z]+)?')
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
  if kind=='menuItem' and a.skip_trashed_menu_items and str(row.get('published'))=='-2':continue
  if kind=='templateStyle' and row.get('template') not in styleTemplates:continue
  if kind=='article' and row.get('state')!='1':continue
  if kind=='contact' and str(row.get('published'))!='1':continue
  if kind=='tag' and (str(row.get('published'))!='1' or str(row.get('parent_id'))=='0'):continue
  if kind=='field' and str(row.get('state'))!='1':continue
  eid=f'{kind}-{row["id"]}'
  identity={k:row[k] for k in identity_fields[kind]}
  # Modules agreeing on all five fields (JA Space's two Hero, two Clients) make the plugin refuse the whole contract, so only they carry the release's id.
  if kind=='module' and module_keys[module_key(row)]>1:identity['id']=row['id']
  icons=[]
  entity={'key':eid,'kind':kind,'identity':identity,'sourceId':int(row['id']),'initial':{k:v for k,v in row.items() if k not in volatile}}
  if kind=='article':entity['identityReferences']={'catid':'category-'+row['catid']}
  entities.append(entity)
  def add(column, typ, sample, **extra):
   slots.append({'key':f'{eid}.{len([s for s in slots if s["entity"]==eid])}','entity':eid,'column':column,'type':typ,'sample':sample,'maxCharacters':2048 if typ=='url' else 255 if typ=='image' else max(40,min(2000,text_len(sample)*2+20)),'requiresEvidence':bool(re.search(a.evidence_pattern,row.get('title',''))),**extra})
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
     if a.repeat_icons and ft=='text' and 'icon' in name and path and isinstance(path[-1],int):
      icons.append((node,path,name));return
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
  # A menu entry that opens an address of its own (type `url`: JA Impact's "Follow us" Twitter, Facebook…) prints that
  # address as its link; it is the business's to write, after the title so the keys before it stay.
  if kind=='menuItem' and row.get('type')=='url' and isinstance(row.get('link'),str) and row['link'].strip():
   add('link','url',row['link'],label=row['title']+' / link',requiresEvidence=True)
  if a.full_coverage:declare_everything(kind,row,add)
  if kind=='templateStyle' and a.template_style_logos:
   try:style_params=json.loads(row.get('params') or '{}')
   except ValueError:style_params={}
   if not isinstance(style_params,dict):style_params={}
   # An empty logo param is not "no logo": with logotype image the T3 header prints the template's default picture
   # (tpls/blocks/header.php: params->get('logoimage', T3Path::getUrl('images/logo.png'))), so the slot is declared
   # with the path the page really prints; logoimage_sm only when enable_logoimage_sm is on.
   t3_defaults={}
   if style_params.get('logotype')=='image':
    t3_defaults['logoimage']='images/logo.png'
    if str(style_params.get('enable_logoimage_sm',''))=='1':t3_defaults['logoimage_sm']='images/logo-sm.png'
   def t3_default_logo(rel):
    own=f'templates/{a.template}/{rel}'
    return own if (root/own).is_file() else f'plugins/system/t3/base/{rel}'
   seen=set()
   for k,v in list(style_params.items())+[(k,None) for k in t3_defaults if k not in style_params]:
    if not T3_LOGO_KEY.fullmatch(k) or k in seen:continue
    seen.add(k)
    if isinstance(v,str) and v.strip():sample=v
    elif k in t3_defaults:sample=t3_default_logo(t3_defaults[k])
    else:continue
    add('params','image',sample,jsonPath=[k],label=f'{k} (template style {row["title"]})',customize='keep',requiresEvidence=False,role='business.logo',group={'id':'site-logo.business','item':0,'kind':'business'})
  # Row icons (--repeat-icons) come after every other slot of the entity, so no key an older rule made moves.
  for node,path,name in icons:add('params','text',node,jsonPath=path,nestedJson='jatools-config',label=row['title']+' / '+name+' '+str(path[-1]+1),customize='keep')
  # The JA masthead (--full-coverage): mod_jamasthead shows, per menu item, the background, title and description of
  # its `menuitem_config` entry (helper.php matches `item_id` to the active item), else default-title/description.
  # They come last, so no key an older rule made moves.
  if a.full_coverage and kind=='module' and row.get('module')=='mod_jamasthead':declare_masthead(row,add,[s for s in slots if s['entity']==eid])
# Authors (--full-coverage): a visitor reads each post's author name, and on the author pages the picture, bio and job
# title. A `user` entity per author of a captured article (identity: username; only name and username are kept, never
# the account), and a `userProfile` entity per profile value the plugin lists (\UserProfileKey: user_id x 100 + the
# key's place in FIELDS), matched by its field and its author. Neither kind is counted: every provision adds people.
PROFILE_FIELDS=['profile.aboutme','profile.user_jobtitle','profile.user_tagline','profile.user_avatar','profile.address1']
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
    slots.append({'key':f'{pid}.{len([s for s in slots if s["entity"]==pid])}','entity':pid,'column':column,'type':typ,'sample':sample,'maxCharacters':255 if typ=='image' else max(40,min(2000,text_len(sample)*2+20)),'requiresEvidence':False,**extra})
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
# Custom field values (--full-coverage): words an author page prints from a user's custom field (JA Vega's `info` field holds
# each team member's skill bars, `#__fields_values`, field 1 x users 42-50). A `fieldValue` entity per value that is the one
# row of its (field, item) pair, identity {field (its name), context}, matched to its item: the item's `user` entity when the
# contract has one, else the item's id, which a provision keeps (as for the Super User's profile). The row id is the plugin's
# FieldValueKey (field_id x 1e9 + item_id). An article's field is matched the same way to the item's `article` entity (JA
# Kinetic's `author_role` prints "Platform Engineer · <date>" under each post; the plugin's ContentProjection owns it to the
# article). Never counted.
FIELD_SPAN=1000000000
people_rows['fieldValue']=[]
if a.full_coverage:
 field_defs={r['id']:r for r in inv.get('fields',[]) if r.get('context') in ('com_users.user','com_content.article') and str(r.get('state'))=='1'}
 pairs=collections.Counter((r['field_id'],r['item_id']) for r in inv.get('fields_values',[]))
 people={**users,**owners}
 article_keys={e['key'] for e in entities if e['kind']=='article'}
 titles={str(r['id']):r.get('title') or '' for r in inv['content'] if f'article-{r["id"]}' in article_keys}
 for r in sorted(inv.get('fields_values',[]),key=lambda r:(int(r['field_id']),int(r['item_id']) if str(r['item_id']).isdigit() else 0)):
  f=field_defs.get(r['field_id'])
  if f is None or pairs[(r['field_id'],r['item_id'])]!=1 or not str(r['item_id']).isdigit():continue
  article=f['context']=='com_content.article'
  if r['item_id'] not in (titles if article else people):continue
  fid=int(r['field_id'])*FIELD_SPAN+int(r['item_id']);eid=f'fieldValue-{fid}'
  label=(titles[r['item_id']] if article else people[r['item_id']]['name']).strip()+' / '+f['name']
  def add(column,typ,sample,**extra):
   slots.append({'key':f'{eid}.{len([s for s in slots if s["entity"]==eid])}','entity':eid,'column':column,'type':typ,'sample':sample,'maxCharacters':255 if typ=='image' else max(40,min(2000,len(sample)*2+20)),'requiresEvidence':False,**extra})
  value=r.get('value') or ''
  if MARKUP.search(value):declare_html(add,'value',value,label)
  else:declare_text(add,'value',value,label,'image' if f.get('type')=='media' else 'text')
  if not any(sl['entity']==eid for sl in slots):continue
  owner=f'{"article" if article else "user"}-{r["item_id"]}'
  identity={'field':f['name'],'context':f['context'],**({} if any(e['key']==owner for e in entities) else {'item_id':str(r['item_id'])})}
  entities.append({'key':eid,'kind':'fieldValue','identity':identity,**({'identityReferences':{'item_id':owner}} if 'item_id' not in identity else {}),'sourceId':fid,'initial':{'value':value}})
  people_rows['fieldValue'].append({'id':str(fid),'field':f['name'],'context':f['context'],'item_id':str(r['item_id'])})
# Template language strings (--full-coverage): words a template keeps in its language file and prints itself (JA Boxing's
# "Try a class" is `Text::_('TPL_TRY_CLASS')`; JA Kids Corner's map hands `'TPL_MAP_STATIC_OPEN'` to a helper of its own that
# calls `Text::_`). One `languageString` entity per key the template's front-end PHP names as a literal (in a `Text` call,
# or any quoted `TPL_…` string; a quoted prefix joined to a variable names no key), identity {extension, key, language}:
# `tpl_<template>` (or its `.sys` file) for a key that file defines, or a
# `TPL_` key no file defines (Joomla prints the key itself). A key another extension's file also defines is that
# extension's to print, and is left out. Its value is what a visitor reads, as the Claude Cowork plugin reads it
# (lib/LanguageStrings.php): the override file, else the site's `language/<tag>/` copy, else the template's own, else the
# key. The row id is the plugin's LanguageStrings::id(). Never counted: a language file is not inventory.
NOT_VISITOR_PHP={'templateInfo.php','error-t4.php'}
NOT_VISITOR_DIRS={'admin','fields','elements','params'}
LANG_CALL=re.compile(r'\b(?:J?Text)::(?:_|sprintf|plural|script)\(\s*([\'"])([A-Za-z0-9_][A-Za-z0-9_.-]*)\1(?!\s*\.)',re.I)
TPL_LITERAL=re.compile(r'([\'"])(TPL_[A-Za-z0-9_.-]+)\1(?!\s*\.)')
# Joomla's own reading of a language file (LanguageOverrides::parse in the plugin), so a value is read exactly as the plugin reads it.
INI_PHP=r'''$o=[];foreach(json_decode(stream_get_contents(STDIN),true) as $f=>$b){$r=[];$s=trim($b)===''?[]:@parse_ini_string(str_replace('_QQ_','"\""',$b),false,INI_SCANNER_RAW);if(is_array($s))foreach($s as $k=>$v)if(is_string($k)&&is_scalar($v))$r[strtoupper($k)]=str_replace('\"','"',(string)$v);$o[$f]=(object)$r;}echo json_encode((object)$o);'''
def string_id(extension,language,key):return int(hashlib.sha1(f'{extension}|{language}|{key}'.encode()).hexdigest()[:7],16)+1
if a.full_coverage:
 named=set()
 for f in sorted(tpl_dir.rglob('*.php')):
  rel=f.relative_to(tpl_dir).parts
  if rel[-1] in NOT_VISITOR_PHP or rel[0] in NOT_VISITOR_DIRS:continue
  named.update(m.group(2).upper() for rx in (LANG_CALL,TPL_LITERAL) for m in rx.finditer(read_text(f)))
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
    slots.append({'key':f'{eid}.{len([s for s in slots if s["entity"]==eid])}','entity':eid,'column':column,'type':typ,'sample':sample,'maxCharacters':max(40,min(2000,text_len(sample)*2+20)),'requiresEvidence':False,**extra})
   # A language string is HTML (Joomla prints it as it stands), so one written with an entity (`&amp;`, `&rsquo;`) is
   # read as HTML too: its slot holds the words a visitor reads, the entity decoded, and the plugin writes it through
   # its node. Kept as text, the sample would teach a model to write "&amp;" into a business name (rule NAME-4).
   if MARKUP.search(value) or HTML_ENTITY.search(value):declare_html(add,'value',value,label)
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
# T4 layout and navigation profiles (--full-coverage): a T4 template keeps a page's sections and its mega menu in FILES,
# `etc/{layout,navigation}/<profile>.json` (read from `local/etc/` first, `default` when the profile has no file), each template
# style naming its profiles in `typelist-layout`, `sub-layout` and `typelist-navigation`. Visitors read two things there: a mega
# menu column's title (`mega_settings`, itself a JSON string: [menutype][item id].settings[i].contents[j].title, printed by T4's
# mod_menu/mega_sub.php; JA Vega's "Our Portfolio", JA Kinetic's "Company") and a section's `background_image`. One
# `templateConfig` entity per profile file holding one, identity {template, group, profile}, whose one column `value` is the
# file's whole text; its slots point into it. The plugin writes the new text to the profile's `local/` copy. The row id is the
# plugin's TemplateConfigRows::id(). Never counted: a profile file is not inventory.
def template_config_id(tpl,group,profile):return int(hashlib.sha1(f'{tpl}|{group}|{profile}'.encode()).hexdigest()[:7],16)+1
PROFILE_NAME=re.compile(r'[A-Za-z0-9_-][A-Za-z0-9 _.-]{0,99}')
if a.full_coverage:
 people_rows['templateConfig']=[];wanted=set()
 for r in inv.get('template_styles',[]):
  if r.get('client_id')!='0' or r.get('template') not in styleTemplates:continue
  try:params=json.loads(r.get('params') or '{}') or {}
  except ValueError:params={}
  if not isinstance(params,dict):params={}
  for group,names in [('layout',['typelist-layout','sub-layout']),('navigation',['typelist-navigation'])]:
   for name in names:
    profile=params.get(name)
    if name=='sub-layout' and not profile:continue
    wanted.add((r['template'],group,profile if isinstance(profile,str) and PROFILE_NAME.fullmatch(profile) else 'default'))
 for tpl,group,profile in sorted(wanted):
  src=next((f for f in [root/'templates'/tpl/'local'/'etc'/group/f'{profile}.json',root/'templates'/tpl/'etc'/group/f'{profile}.json'] if f.is_file()),None)
  if src is None and profile!='default':profile='default';src=next((f for f in [root/'templates'/tpl/'local'/'etc'/group/'default.json',root/'templates'/tpl/'etc'/group/'default.json'] if f.is_file()),None)
  if src is None:continue
  text=read_text(src)
  try:data=json.loads(text)
  except ValueError:continue
  if not isinstance(data,dict):continue
  cid=template_config_id(tpl,group,profile);eid=f'templateConfig-{cid}'
  if any(e['key']==eid for e in entities):continue
  def add(typ,sample,label,**extra):
   slots.append({'key':f'{eid}.{len([s for s in slots if s["entity"]==eid])}','entity':eid,'column':'value','type':typ,'sample':sample,'maxCharacters':255 if typ=='image' else max(40,min(2000,len(sample)*2+20)),'requiresEvidence':False,'label':label,'customize':'keep',**extra})
  if group=='navigation':
   try:mega=json.loads(data.get('mega_settings') or '{}')
   except (TypeError,ValueError):mega={}
   for menutype,items in (mega.items() if isinstance(mega,dict) else []):
    for item,setting in (items.items() if isinstance(items,dict) else []):
     for i,row in enumerate(setting.get('settings') or [] if isinstance(setting,dict) else []):
      for j,col in enumerate(row.get('contents') or [] if isinstance(row,dict) else []):
       title=col.get('title') if isinstance(col,dict) else None
       if isinstance(title,str) and title.strip():add('text',title,f'{title.strip()} (mega menu column, {menutype} item {item})',nestedJson='mega_settings',jsonPath=[menutype,item,'settings',i,'contents',j,'title'])
  else:
   def walk(node,path):
    if isinstance(node,dict):
     for k,v in node.items():
      if k=='background_image' and isinstance(v,str) and v.strip():add('image',v,f'background_image (layout {profile}, '+'/'.join(map(str,path))+')',jsonPath=[*path,k])
      else:walk(v,[*path,k])
    elif isinstance(node,list):
     for n,v in enumerate(node):walk(v,[*path,n])
   walk(data,[])
  if not any(sl['entity']==eid for sl in slots):continue
  identity={'template':tpl,'group':group,'profile':profile}
  entities.append({'key':eid,'kind':'templateConfig','identity':identity,'sourceId':cid,'initial':{**identity,'value':text}})
  people_rows['templateConfig'].append({'id':str(cid),**identity})
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
 if a.skip_unpublished_menu_pages and str(row.get('published'))!='1':continue
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
content_map={'entities':[{k:v for k,v in e.items() if k!='initial'} for e in entities],'slots':slots,'pages':pages}
repo_root=pathlib.Path(__file__).resolve().parents[4]
if a.previous_map:
 previous={s['key']:s for s in json.load(open(a.previous_map)).get('slots',[])}
 for sl in slots:
  before=previous.get(sl['key'])
  # Under --inline-markup a sample that only gained or lost markup is the same words: its role stays.
  same=before and (plain_text(before.get('sample'))==plain_text(sl.get('sample')) if a.inline_markup else before.get('sample')==sl.get('sample'))
  if same and 'role' in before and not (a.role_vocabulary=='3' and sl.get('jsonPath',[])[:2]==['ctm_audio','audio-src'] ):
   sl['role']=before['role']
   if 'group' in before:sl['group']=before['group']
# The rule tables fill in every slot still without a role; slots that kept one are left as they are.
proposed=subprocess.run(['node',str(repo_root/'scripts/slot-roles/rule-tables.mjs'),'joomla','--vocabulary',a.role_vocabulary],input=json.dumps(content_map).encode(),capture_output=True,cwd=repo_root)
if proposed.returncode:sys.exit('Contract not written:\n- slot role rule tables failed: '+proposed.stderr.decode().strip())
proposal=json.loads(proposed.stdout)
content_map=proposal['contentMap'];unplaced=proposal['unplaced']
if a.unplaced_report:pathlib.Path(a.unplaced_report).write_text(json.dumps({'unplaced':unplaced},indent=2)+'\n')
out.mkdir(parents=True,exist_ok=True)
for name,data in [('manifest',manifest),('content-map',content_map),('presentation-lock',{'entities':{e['key']:e['initial'] for e in entities},'assignments':inv['modules_menu'],'inventoryCounts':counts,'access':access,'visibility':{'moduleFields':['published','publish_up','publish_down','module','position','ordering','showtitle','access','language','client_id'],'moduleParams':['moduleclass_sfx','module_tag','header_tag','header_class','style','bootstrap_size','cache','cache_time'],'assignmentModes':['all','none','include','exclude'],'menuFields':['published','access','language','parent_id','type','link','template_style_id','home','params']},'fileRoots':file_roots,'files':files})]:
 (out/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['pnpm','exec','biome','format','--write','--files-max-size=2000000',*[str((out/(name+'.json')).resolve()) for name in ['manifest','content-map','presentation-lock']]],cwd=pathlib.Path(__file__).resolve().parents[4],check=True)
print(f'Slots without a role ({len(unplaced)}), for the packaging agent to bind: '+(', '.join(unplaced) or 'none'))
print(json.dumps({'entities':len(entities),'slots':len(slots),'files':len(files)}))
