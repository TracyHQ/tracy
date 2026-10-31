"""Reproduce this experiment's summary. Failed transport usage remains unknown."""
import hashlib
import json
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent


def read(name):
    return json.loads((ROOT / name).read_text())


def quantile(values, q):
    values = sorted(values)
    index = (len(values) - 1) * q
    lo = int(index)
    hi = min(lo + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (index - lo)


def cost(row):
    total = 0
    for request in row.get('requests', []):
        usage = request['usage']
        assert usage is not None
        assert usage['prompt_tokens'] == usage['prompt_cache_hit_tokens'] + usage['prompt_cache_miss_tokens']
        hour = int(request['requestedAt'][11:13])
        assert hour not in [1, 2, 3, 6, 7, 8, 9], 'Frozen off-peak prices only'
        total += (usage['prompt_cache_hit_tokens'] * .003 + usage['prompt_cache_miss_tokens'] * .15 + usage['completion_tokens'] * .6) / 1e6
    return total


def stats(rows):
    good = [r for r in rows if r['verified']]
    unknown = [r for r in rows if r.get('failure') or any(q.get('usage') is None for q in r.get('requests', []))]
    return {
        'attempts': len(rows),
        'verified': len(good),
        'undoPassed': sum(r.get('undoVerified') is True for r in rows),
        'elapsedP50MsAllAttempts': median(r['elapsedMs'] for r in rows),
        'elapsedP90MsAllAttempts': quantile([r['elapsedMs'] for r in rows], .9),
        'elapsedP50MsVerifiedOnly': median(r['elapsedMs'] for r in good) if good else None,
        'backendReadsP50VerifiedOnly': median(r['backendReads'] for r in good) if good else None,
        'toolCallsP50VerifiedOnly': median(r.get('toolCalls', len(r.get('calls', []))) for r in good) if good else None,
        'modelRequestsP50VerifiedOnly': median(r.get('modelRequests', r.get('steps', 0)) for r in good) if good else None,
        'knownUsageSubtotalEstimatedUsd': sum(cost(r) for r in rows),
        'verifiedOnlyUsageEstimatedUsdPerTask': sum(cost(r) for r in good) / len(good) if good and 'requests' in good[0] else None,
        'unpricedAttempts': len(unknown),
        'totalEstimatedUsd': None if unknown or 'requests' not in rows[0] else sum(cost(r) for r in rows),
        'settledCostUsd': None,
        'failures': [{'repeat': r['repeat'], 'failure': r.get('failure'), 'reason': r.get('verificationFailure')} for r in rows if not r['verified']],
    }


summary = {
    'percentileMethod': 'Linear interpolation; all attempts retained. Verified-only metrics are explicitly conditional, not overall latency or cost per success.',
    'costBasis': 'Known provider usage at off-peak USD per million tokens: hit .003, miss .15, output .60. Transport failures have unknown usage/charge, never assumed zero. Scripted harness has no model billing.',
}
for name in ['harness', 'model', 'native']:
    data = read(name + '.json')
    expected = data['metadata']['repeats']
    groups = {}
    tasks = sorted(set(r.get('task', 'page-group') for r in data['rows']))
    for task in tasks:
        arms = {}
        for arm in sorted(set(r['arm'] for r in data['rows'])):
            rows = [r for r in data['rows'] if r.get('task', 'page-group') == task and r['arm'] == arm]
            assert len(rows) == expected and sorted(r['repeat'] for r in rows) == list(range(expected))
            arms[arm] = stats(rows)
        groups[task] = arms
    summary[name] = groups
    if name != 'harness':
        assert data['metadata']['hashes']['baseline'] == read('baseline-snapshot.json')['hashes']
        for filename, expected_hash in data['metadata']['hashes']['candidate'].items():
            source = ROOT.parents[3] / 'packages/tools/tracy-site-tools/src/host' / filename
            assert hashlib.sha256(source.read_bytes()).hexdigest() == expected_hash
assert read('model.json')['metadata']['hashes'] == read('native.json')['metadata']['hashes']
assert all(r['verified'] and r['undoVerified'] for r in read('native.json')['rows'])
assert all(r['verified'] for r in read('harness.json')['rows'])
(ROOT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(ROOT / 'summary.json')
