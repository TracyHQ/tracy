"""Summarize the final paired CMS runs without dropping any timed observation."""
import json
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent


def quantile(values, probability):
    values = sorted(values)
    index = (len(values) - 1) * probability
    low = int(index)
    return values[low] + (values[min(low + 1, len(values) - 1)] - values[low]) * (index - low)


summary = {}
for cms in ['joomla', 'emdash']:
    data = json.loads((ROOT / (cms + '.json')).read_text())
    metadata = data['metadata']
    assert len(data['rows']) == 24
    assert metadata['contentBeforeHash'] == metadata['contentAfterHash']
    arms = {}
    for arm in ['independent', 'batch']:
        rows = [row for row in data['rows'] if row['arm'] == arm]
        assert len(rows) == 12
        assert sorted(row['repeat'] for row in rows) == list(range(12))
        assert all(row['verified'] for row in rows)
        arms[arm] = {
            'attempts': 12,
            'verified': 12,
            'backendReads': sorted(set(row['backendReads'] for row in rows)),
            'nativeSourceCalls': sorted(set(row['nativeSourceCalls'] for row in rows), key=str),
            'toolCalls': sorted(set(row['toolCalls'] for row in rows)),
            'modelRequests': sorted(set(row['modelRequests'] for row in rows)),
            'elapsedP50Ms': median(row['elapsedMs'] for row in rows),
            'elapsedP90Ms': quantile([row['elapsedMs'] for row in rows], .9),
        }
    summary[cms] = {
        'inventoryPages': metadata['inventoryPages'],
        'contentUnchanged': True,
        'changedTables': metadata.get('changedTables'),
        'arms': arms,
        'elapsedMedianChangePercent': (arms['batch']['elapsedP50Ms'] / arms['independent']['elapsedP50Ms'] - 1) * 100,
    }
summary['method'] = 'Twelve pairs per CMS; independent versus OR strategy on the same candidate bundle; real HTTP CMS reader, real library AgentLoop, scripted model; injected relay; balanced order; every timed observation retained; linearly interpolated p90. Concurrent full-gate audit competed for CPU. No model-billing, production-latency or statistical-significance claim.'
summary['initialEmdashIntegrityFailure'] = 'Retained separately. All 24 initial lookups returned IDs, but the aggregate database hash changed. Per-table integrity instrumentation and a full repeat are reported separately; the first run is not counted as passing integrity.'
(ROOT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
