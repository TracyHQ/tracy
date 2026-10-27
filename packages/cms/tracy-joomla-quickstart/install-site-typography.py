#!/usr/bin/env python3
"""Install the shared typography contract into an existing T4 repair stylesheet."""
from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit('Usage: install-site-typography.py TEMPLATE_DIRECTORY BACKUP_FILE')
target = Path(sys.argv[1]) / 'css/site-repairs.css'
backup = Path(sys.argv[2])
original = target.read_text()
with backup.open('x') as handle:
    handle.write(original)
start = '/* BEGIN TRACY SITE TYPOGRAPHY */'
end = '/* END TRACY SITE TYPOGRAPHY */'
base = original
if start in base:
    before, rest = base.split(start, 1)
    if end not in rest:
        raise SystemExit('Incomplete typography marker; stylesheet unchanged.')
    base = before + rest.split(end, 1)[1]
contract = Path(__file__).with_name('site-typography.css').read_text()
target.write_text(base.rstrip() + '\n\n' + start + '\n' + contract + '\n' + end + '\n')
