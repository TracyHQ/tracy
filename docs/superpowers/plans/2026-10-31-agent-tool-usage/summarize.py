#!/usr/bin/env python3
"""Validate complete paired read experiments and retain all observations, including failures."""
import json, math, statistics, subprocess
from pathlib import Path
ROOT = Path(__file__).parent

def percentile(values, q):
    values = sorted(values)
    if not values:
        return None
    at = (len(values)-1)*q
    return values[math.floor(at)]*(1-at%1)+values[math.ceil(at)]*(at%1)

def union_ms(intervals):
    end, total = float('-inf'), 0
    for start, stop in sorted(intervals):
        total += max(0, stop-max(start,end))
        end = max(end,stop)
    return total

def describe(rows):
    succeeded = [r for r in rows if r['verified']]
    tokens = [p.get('usage',{}).get('prompt_tokens') for r in rows for p in r['provider'] if p.get('usage')]
    return {
        'attempts':len(rows), 'verified':len(succeeded),
        'failures':[{'repeat':r['repeat'],'failure':r['failure'],'evidenceValid':r['evidenceValid'],'finalValid':r['finalValid']} for r in rows if not r['verified']],
        'medianMs':statistics.median(r['elapsedMs'] for r in rows),
        'p90Ms':percentile([r['elapsedMs'] for r in rows], .9),
        'successfulMedianMs':statistics.median(r['elapsedMs'] for r in succeeded) if succeeded else None,
        'backendReads':[r['backendReads'] for r in rows],
        'relayRequests':[r['relayRequests'] for r in rows],
        'nativeSourceCalls':[r['nativeSourceCalls'] for r in rows],
        'modelRequests':[r['modelRequests'] for r in rows],
        'modelToolCalls':[len(r['calls']) for r in rows],
        'resultChars':[r.get('toolResultChars') for r in rows],
        'backendIntervalUnionMedianMs':statistics.median(union_ms([(q['startMs'], q['startMs']+q['ms']) for q in r['reads']]) for r in rows),
        'promptTokensKnown':sum(tokens),
        'completionTokensKnown':sum(p.get('usage',{}).get('completion_tokens',0) for r in rows for p in r['provider'] if p.get('usage')),
        'relayMedianMs':statistics.median(sum(q['ms'] for q in r['relays']) for r in rows),
        'unknownUsageRequests':sum(p.get('usage') is None for r in rows for p in r['provider']),
        'modelCost':None,
    }

result = {'scope':'same model/route, read discovery only; scripted transport comparison and natural-model four-arm experiment reported separately',
          'arms':{'A':'baseline executor/guidance','B':'candidate executor/baseline guidance','C':'baseline executor/candidate guidance','D':'candidate executor/guidance'},
          'platforms':{}}
bundles = set()
for cms in ['wordpress','joomla','emdash']:
    runs = {}
    for mode in ['native','model']:
        data = json.loads((ROOT/f'{cms}-{mode}.json').read_text())
        meta, rows = data['metadata'], data['rows']
        assert meta['platform'] == cms
        assert meta.get('onlyArm') is None
        bundles.add((meta['baselineBundle'],meta['candidateBundle']))
        assert meta['contentBefore'] == meta['contentAfter'], (cms,mode,'content integrity')
        tasks = ['four-independent','four-batch'] if mode == 'native' else ['four-titles','single-title','known-url']
        arms = ['A','D'] if mode == 'native' else ['A','B','C','D']
        assert len(rows) == meta['repeats']*len(tasks)*len(arms)
        assert len({(r['repeat'],r['task'],r['arm']) for r in rows}) == len(rows)
        runs[mode] = {task:{arm:describe([r for r in rows if r['task']==task and r['arm']==arm]) for arm in arms} for task in tasks}
    runs['modelAggregate'] = {arm:describe([r for r in json.loads((ROOT/f'{cms}-model.json').read_text())['rows'] if r['arm']==arm]) for arm in ['A','B','C','D']}
    result['platforms'][cms] = runs
assert len(bundles) == 1, 'Experiments must use one frozen baseline/candidate bundle pair'
result['bundlePair'] = list(bundles)[0]
(ROOT/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
subprocess.run(['pnpm','exec','biome','format','--write',str(ROOT/'summary.json')],check=True,cwd=ROOT.resolve().parents[3])
print(json.dumps(result,indent=2))
