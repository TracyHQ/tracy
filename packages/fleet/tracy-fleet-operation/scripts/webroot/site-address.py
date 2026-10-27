"""Apply/rollback one site's URL with a private snapshot and a site-wide lock."""
import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlsplit

class Refused(Exception):
    pass

def atomic(path, value):
    if path.is_symlink():
        raise Refused('UNSAFE_CONFIG_PATH')
    kept = path.stat() if path.exists() else None
    mode = kept.st_mode & 0o777 if kept else 0o600
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.address-')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, mode)
        # The owner too: a wp-config.php the web server reads as its own user must stay readable.
        if kept is not None:
            try: os.chown(name, kept.st_uid, kept.st_gid)
            except PermissionError: pass
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

# WordPress lets wp-config.php pin the address (WP_HOME / WP_SITEURL), and the constant wins over
# the options. Tracy's own provisioning pins it in every copy (provision/render_wp_config.py writes
# both, as plain string literals, above "That's all, stop editing!"), so a rename rewrites those
# two literals with the options and a rollback puts them back. A constant in any other shape (a
# computed value, a second definition, one defined outside wp-config.php) was not written by Tracy
# and cannot be rewritten safely: the change is refused with WP_ADDRESS_CONSTANT before anything is
# written. Keys in the journal: `define:WP_HOME`, `define:WP_SITEURL` beside the `home`/`siteurl`
# options.
ADDRESS_DEFINES = ('WP_HOME', 'WP_SITEURL')
DEFINE_KEY = 'define:'

def _define_pattern(name):
    return re.compile(r"define\s*\(\s*(['\"])" + name + r"\1\s*,\s*(.*?)\s*\)\s*;", re.DOTALL)

def _literal(source):
    """The value of a plain PHP string literal (no interpolation, no concatenation), or None."""
    single = re.fullmatch(r"'((?:[^'\\]|\\.)*)'", source)
    if single: return re.sub(r"\\(['\\])", r'\1', single[1])
    double = re.fullmatch(r'"([^"\\$]*)"', source)
    return double[1] if double else None

def php_string(value):
    """A single-quoted PHP literal, as render_wp_config.py writes it."""
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"

def read_address_defines(text):
    """{name: value} of the WP_HOME / WP_SITEURL defines in wp-config.php; each one there must be
    defined once, as a plain string — anything else is refused with WP_ADDRESS_CONSTANT."""
    found = {}
    for name in ADDRESS_DEFINES:
        matches = list(_define_pattern(name).finditer(text))
        if not matches: continue
        if len(matches) > 1: raise Refused('WP_ADDRESS_CONSTANT')
        value = _literal(matches[0][2].strip())
        if value is None: raise Refused('WP_ADDRESS_CONSTANT')
        found[name] = value
    return found

def rewrite_address_defines(text, expected, desired):
    """wp-config.php with each `define:` key of `desired` written in place; a define holding neither
    the expected nor the desired value is someone else's edit: ADDRESS_CONFLICT."""
    for key, value in desired.items():
        if not key.startswith(DEFINE_KEY): continue
        name = key[len(DEFINE_KEY):]
        matches = list(_define_pattern(name).finditer(text))
        if len(matches) != 1: raise Refused('WP_ADDRESS_CONSTANT')
        current = _literal(matches[0][2].strip())
        if current not in (expected[key], value): raise Refused('ADDRESS_CONFLICT')
        start, end = matches[0].span(2)
        text = text[:start] + php_string(value) + text[end:]
    return text

def wp_config(label):
    path = Path(os.environ.get('TRACY_SITES_ROOT', '/srv/tracy-sites')) / label / '.webroot' / 'wp-config.php'
    if path.is_symlink(): raise Refused('UNSAFE_CONFIG_PATH')
    return path

def options_of(values):
    return {key: value for key, value in values.items() if not key.startswith(DEFINE_KEY)}

def run(args, source=None):
    result = subprocess.run(args, input=source, text=True, capture_output=True)
    if result.returncode:
        # Only fixed protocol codes leave the host; stderr can contain CMS secrets.
        try: code = json.loads(result.stdout.splitlines()[-1]).get('code')
        except (ValueError, IndexError): code = None
        raise Refused(code if code in ['WP_ADDRESS_CONSTANT', 'ADDRESS_CONFLICT', 'JOOMLA_CONFIG_UNSUPPORTED', 'ADDRESS_WRITE_FAILED'] else 'ADDRESS_COMMAND_FAILED')
    return result.stdout.strip()

def php(container, payload):
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    result = run(['docker', 'exec', '-i', '-u', 'www-data', container, 'php', '/dev/stdin', encoded], Path(__file__).with_name('site-address-php.php').read_text())
    return json.loads(result.splitlines()[-1])

def compose_name(stack):
    """The site's compose file name, by lib/roots.sh's preference list: exported by site-address.sh,
    read from roots.sh itself when this module is loaded directly (tests), never restated here."""
    names = os.environ.get('TRACY_COMPOSE_NAMES')
    if not names:
        roots = (Path(__file__).resolve().parent.parent / 'lib' / 'roots.sh').read_text()
        names = re.search(r"^TRACY_COMPOSE_NAMES='([^']+)'$", roots, re.M)[1]
    names = names.split()
    return next((name for name in names if (stack / name).is_file()), names[0])

def env_slot(stack, old_url):
    """Support the fleet .env and a literal compose environment mapping/list."""
    name = compose_name(stack)
    text = (stack / name).read_text()
    lines = text.splitlines(keepends=True)
    found = [(i, line) for i, line in enumerate(lines) if re.match(r'^\s*(?:-\s*)?EMDASH_SITE_URL\s*[:=]', line)]
    if len(found) > 1: raise Refused('EMDASH_CONFIG_UNSUPPORTED')
    if found and '${EMDASH_SITE_URL' not in found[0][1]:
        line = found[0][1]
        match = re.match(r'^(\s*(?:-\s*)?EMDASH_SITE_URL\s*[:=]\s*)(.*?)(\r?\n)?$', line)
        value = match[2].strip().strip('\"\x27')
        if value.rstrip('/') != old_url.rstrip('/'): raise Refused('ADDRESS_CONFLICT')
        return {'file':name, 'line':line, 'prefix':match[1], 'value':value}
    path = stack / '.env'
    found = [line for line in path.read_text().splitlines(keepends=True) if re.match(r'^EMDASH_SITE_URL=', line)]
    if len(found) != 1: raise Refused('EMDASH_CONFIG_UNSUPPORTED')
    line = found[0]
    value = line.split('=',1)[1].strip().strip('\"\x27')
    if value.rstrip('/') != old_url.rstrip('/'): raise Refused('ADDRESS_CONFLICT')
    return {'file':'.env', 'line':line, 'prefix':'EMDASH_SITE_URL=', 'value':value}

def patch_slot(stack, slot, expected, desired):
    path = stack / slot['file']
    text = path.read_text()
    # Re-read every write, replacing only our line so unrelated config edits survive.
    lines = text.splitlines(keepends=True)
    matches = [i for i,line in enumerate(lines) if line.startswith(slot['prefix'])]
    if len(matches) != 1: raise Refused('EMDASH_CONFIG_UNSUPPORTED')
    i = matches[0]
    if lines[i] not in (expected, desired): raise Refused('ADDRESS_CONFLICT')
    lines[i] = desired
    atomic(path, ''.join(lines))

def execute(args):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}', args.label): raise Refused('BAD_LABEL')
    if not re.fullmatch(r'(?:[a-fA-F0-9]{16,64}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})', args.change_id): raise Refused('BAD_CHANGE_ID')
    for value in [args.old_url, args.new_url]:
        url = urlsplit(value)
        if len(value)>2048 or re.search(r'[\s\\]',value) or url.scheme not in ('http','https') or not url.hostname or url.username or url.password or url.query or url.fragment: raise Refused('BAD_URL')
    stack = Path(os.environ.get('TRACY_PRIVATE_ROOT','/srv/tracy')) / args.label
    if stack.is_symlink() or not stack.is_dir(): raise Refused('SITE_UNKNOWN')
    state_dir = stack / 'address-changes'
    if state_dir.is_symlink(): raise Refused('UNSAFE_CONFIG_PATH')
    state_dir.mkdir(mode=0o700, exist_ok=True)
    with open(state_dir / '.lock','a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        journal = state_dir / (args.change_id + '.json')
        if journal.is_symlink(): raise Refused('UNSAFE_CONFIG_PATH')
        identity = {'oldUrl':args.old_url,'newUrl':args.new_url,'changeId':args.change_id}
        compose = ['docker','compose','-f',str(stack/compose_name(stack))]
        container = run(compose+['ps','-a','-q','web'])
        if '\n' in container: raise Refused('SITE_DOWN')
        if journal.exists():
            state = json.loads(journal.read_text())
            if any(state.get(k)!=v for k,v in identity.items()): raise Refused('CHANGE_ID_CONFLICT')
            if state.get('platform') is None:
                # A tombstone: this change was rolled back before it ever started.
                if args.operation=='apply': raise Refused('CHANGE_ALREADY_ROLLED_BACK')
                return {'ok':True,'platform':None,'operation':args.operation,'changeId':args.change_id,'siteUrl':args.old_url,'undone':False}
        else:
            if args.operation=='rollback':
                # No journal, under the site lock: the apply never wrote anything (it writes the
                # journal before its first change), e.g. it was refused while reading the site.
                # Nothing to undo — answered as rolled back, and recorded, so an apply of this same
                # change still queued behind this rollback is refused rather than run (bug 03/10/2026:
                # CHANGE_UNKNOWN here left the name 'applying' in tracy-web for good).
                atomic(journal,json.dumps({**identity,'platform':None,'state':'rolledback'}))
                return {'ok':True,'platform':None,'operation':args.operation,'changeId':args.change_id,'siteUrl':args.old_url,'undone':False}
            if not container: raise Refused('SITE_DOWN')
            is_php = subprocess.run(['docker','exec',container,'test','-f','/var/www/html/configuration.php'],capture_output=True).returncode == 0 or subprocess.run(['docker','exec',container,'test','-f','/var/www/html/wp-load.php'],capture_output=True).returncode == 0
            if is_php:
                read = php(container,{})
                before = read['values']
                platform = read['platform']
                constants = {name: value for name, value in (read.get('constants') or {}).items() if value is not None}
                if platform=='wordpress' and constants:
                    try: defines = read_address_defines(wp_config(args.label).read_text())
                    except OSError: raise Refused('WP_ADDRESS_CONSTANT')
                    # Every constant WordPress runs with must be one of these literals; one set
                    # anywhere else (another file, the environment) would win over the rewrite.
                    if any(defines.get(name, '').rstrip('/')!=str(value).rstrip('/') for name, value in constants.items()): raise Refused('WP_ADDRESS_CONSTANT')
                    before = {**before, **{DEFINE_KEY+name: value for name, value in defines.items()}}
                if platform=='wordpress' and any(v.rstrip('/')!=args.old_url.rstrip('/') for v in before.values()): raise Refused('ADDRESS_CONFLICT')
                if platform=='joomla' and before['live_site'] and before['live_site'].rstrip('/')!=args.old_url.rstrip('/'): raise Refused('ADDRESS_CONFLICT')
                state = {**identity,'platform':platform,'before':before,'after':{key:args.new_url.rstrip('/') for key in before}}
            else:
                slot = env_slot(stack,args.old_url)
                effective = json.loads(run(compose+['config','--format','json']))['services']['web'].get('environment',{}).get('EMDASH_SITE_URL')
                if not isinstance(effective,str) or effective.rstrip('/')!=args.old_url.rstrip('/'): raise Refused('EMDASH_CONFIG_UNSUPPORTED')
                new_value = args.new_url.rstrip('/')
                # List-form compose environments keep quotes as literal value bytes.
                encoded = new_value if slot['file']!='.env' and '=' in slot['prefix'] else json.dumps(new_value)
                state = {**identity,'platform':'emdash','slot':slot,'before':slot['line'],'after':slot['prefix']+encoded+'\n'}
            state['state']='prepared'
            atomic(journal,json.dumps(state))
        target = 'applied' if args.operation=='apply' else 'rolledback'
        if state['state']=='rolledback' and target=='applied': raise Refused('CHANGE_ALREADY_ROLLED_BACK')
        expected, desired = (state['before'],state['after']) if target=='applied' else (state['after'],state['before'])
        if state['platform']=='emdash':
            patch_slot(stack,state['slot'],expected,desired)
            effective = json.loads(run(compose+['config','--format','json']))['services']['web'].get('environment',{}).get('EMDASH_SITE_URL')
            wanted = args.new_url if target=='applied' else args.old_url
            if not isinstance(effective,str) or effective.rstrip('/')!=wanted.rstrip('/'): raise Refused('EMDASH_CONFIG_UNSUPPORTED')
            run(compose+['up','-d','--no-deps','--force-recreate','web'])
        else:
            pinned = any(key.startswith(DEFINE_KEY) for key in desired)
            if pinned:
                path = wp_config(args.label)
                atomic(path, rewrite_address_defines(path.read_text(), expected, desired))
            result=php(container,{'expected':options_of(expected),'desired':options_of(desired)})
            if result['values']!=options_of(desired): raise Refused('ADDRESS_VERIFY_FAILED')
            if pinned and read_address_defines(wp_config(args.label).read_text())!={key[len(DEFINE_KEY):]: value for key, value in desired.items() if key.startswith(DEFINE_KEY)}: raise Refused('ADDRESS_VERIFY_FAILED')
        state['state']=target
        atomic(journal,json.dumps(state))
        return {'ok':True,'platform':state['platform'],'operation':args.operation,'changeId':args.change_id,'siteUrl':args.new_url if target=='applied' else args.old_url,'undone':target=='rolledback'}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--label',required=True)
    parser.add_argument('--op',choices=['change'],required=True)
    parser.add_argument('--operation',choices=['apply','rollback'],required=True)
    parser.add_argument('--change-id',required=True)
    parser.add_argument('--old-url',required=True)
    parser.add_argument('--new-url',required=True)
    try: print(json.dumps(execute(parser.parse_args())))
    except Exception as error:
        print(json.dumps({'ok':False,'code':str(error) if isinstance(error,Refused) else 'ADDRESS_FAILED'}))
        raise SystemExit(1)
