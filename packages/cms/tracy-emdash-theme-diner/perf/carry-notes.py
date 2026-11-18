# Carry the lens notes of an accepted run onto a new run whose shots differ only by an immaterial amount
# (P8: styles read --ds-* with fallbacks; see DECISIONS D-P8-5). Rewrites tile paths and Seen hashes per page--variant.
#   python3 -I perf/carry-notes.py <old-run> <new-run>
import json,re,glob,os,sys
old,new=[os.path.abspath(p) for p in sys.argv[1:3]]
b=json.load(open(new+'/index.json'))
H={os.path.basename(s['file'])[:-4]:s['hash'] for s in b['shots']}
# a reused shot keeps the tile paths of the run that captured it: the index says where every tile is
T={t.rsplit('/shots/',1)[1]:t for s in b['shots'] for t in s.get('tiles',[])}
pat=re.compile(r'(/[^\s|]*)/evidence/[^/\s|]+/shots/([^/\s|]+)/(\d+\.png)')
miss=set();n=0
for f in glob.glob(new+'/notes/*.md'):
    st=os.stat(f); out=[]
    for line in open(f).read().split('\n'):
        m=pat.search(line)
        if m:
            key=m.group(2); p=T.get(key+'/'+m.group(3))
            if key not in H or not p or not os.path.exists(p): miss.add(key); out.append(line); continue
            line=line.replace(m.group(0),p)
            if line.startswith('|') and 'sha256:' in line: line=re.sub(r'sha256:[0-9a-f]{64}',H[key],line)
            n+=1
        out.append(line)
    open(f,'w').write('\n'.join(out)); os.utime(f,ns=(st.st_atime_ns,st.st_mtime_ns))  # the merge applies fix/close rows in mtime order
print('rewritten',n,'missing',sorted(miss)[:10])
