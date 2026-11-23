import sys,json
keys=set(sys.argv[1].split(',')) if len(sys.argv)>1 else None
for l in sys.stdin:
    n,_,j=l.partition(' {')
    d=json.loads('{'+j) if j.strip() not in('null','') else {}
    print(n,{k:d[k] for k in d if (keys is None or k in keys)})
