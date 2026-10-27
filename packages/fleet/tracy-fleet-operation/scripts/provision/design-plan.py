#!/usr/bin/env python3
"""Resolve which design a provision actually builds, from the registry this host ships.

The web process resolved the same question when it showed the customer a plan, and it passes down
the design that was PICKED plus the revision of the registry it answered from. It deliberately does
not pass the effective design, the template or the profile: if it did, the one place that decides
what gets installed would be a request body. Instead both halves resolve from the same file, and
the revision is what makes a disagreement loud — an image built from a different commit than the
one that answered the form stops here rather than building a site nobody was shown.
"""
import argparse
import hashlib
import json
import pathlib
import re

ID = re.compile(r'^[a-z0-9][a-z0-9-]{0,60}$')


def resolve(registry, requested, base_id=None):
    if not ID.match(requested) or requested not in registry['library']['ids']:
        raise ValueError('unknown design')
    wanted = registry['designs'].get(requested)
    served = bool(wanted) and wanted.get('state') == 'served'
    if not served and registry.get('bases'):
        base_id = base_id or registry['defaultBase']
        base = registry['bases'].get(base_id)
        if not base or base.get('workflow') != 'template-build':
            raise ValueError('unsupported construction base')
        return {
            'requestedDesign': requested, 'effectiveDesign': requested,
            'effectiveDesignName': requested, 'baseQuickstart': base_id,
            'baseVersion': base['version'], 'template': base['template'],
            'contractProfile': base['baselineProfile'], 'coworkMinVersion': base['coworkMinVersion'],
            'fallback': True, 'fallbackReason': 'template_build_required', 'workflow': 'template-build',
        }
    effective = requested if served else registry['defaultDesign']
    design = registry['designs'][effective]
    plan = {
        'requestedDesign': requested,
        'effectiveDesign': effective,
        'effectiveDesignName': design['name'],
        'baseQuickstart': design['base']['quickstart'],
        'baseVersion': design['base']['version'],
        'template': design['template'],
        'contractProfile': design['contractProfile'],
        'coworkMinVersion': design['coworkMinVersion'],
        'fallback': not served,
    }
    if not served:
        plan['fallbackReason'] = (wanted or {}).get('reason', 'template_unavailable')
    if design['template']['source'] == 'artifact':
        plan['artifact'] = design['artifact']
        plan['activation'] = design['activation']
    return plan


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--design', required=True)
    parser.add_argument('--revision', default='')
    parser.add_argument('--out', required=True)
    parser.add_argument('--base', default='')
    args = parser.parse_args()
    file = pathlib.Path(__file__).with_name('design-templates.json')
    raw = file.read_bytes()
    revision = hashlib.sha256(raw).hexdigest()
    if args.revision and args.revision != revision:
        raise ValueError(
            'the design registry changed between the plan the customer was shown and this '
            'provision; create the site again from the form'
        )
    registry = json.loads(raw)
    if registry.get('schemaVersion') != 'tracy-design-templates/v1':
        raise ValueError('unsupported design template registry')
    plan = resolve(registry, args.design, args.base or None)
    plan['registryRevision'] = revision
    pathlib.Path(args.out).write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
    # One line the shell reads with `read`. Everything else stays in the file, because a value that
    # has to survive `eval` is a value that eventually contains something that should not be run.
    print(plan['effectiveDesign'], plan['contractProfile'], plan['template']['element'], plan['template']['source'], plan['baseQuickstart'], plan.get('workflow', 'contract'))


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        raise SystemExit(str(error)) from None
