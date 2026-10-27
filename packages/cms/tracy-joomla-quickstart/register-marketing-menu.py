"""Add the Joomla menu ID to T4's explicit Library column, preserving the other groups."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('navigation', type=Path)
parser.add_argument('menu_id', type=int)
parser.add_argument('--backup', required=True, type=Path)
args = parser.parse_args()
original = args.navigation.read_text()
config = json.loads(original)
mega = json.loads(config['mega_settings'])
groups = [column for menu in mega.values() for item in menu.values()
          for row in item.get('settings', []) for column in row.get('contents', [])
          if column.get('title') == 'Library' and column.get('type') == 'items']
if len(groups) != 1:
    raise ValueError('Expected exactly one Library column; navigation was not changed.')
ids = groups[0]['items'].split(',')
if str(args.menu_id) not in ids:
    if args.backup.exists():
        raise FileExistsError('Backup already exists; refusing to overwrite it.')
    args.backup.write_text(original)
    groups[0]['items'] = ','.join([str(args.menu_id), *ids])
    config['mega_settings'] = json.dumps(mega)
    args.navigation.write_text(json.dumps(config, indent=2) + '\n')
print(f'Marketing samples menu {args.menu_id} is in the Library column.')
