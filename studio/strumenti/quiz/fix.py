import sys,json
f=sys.argv[1]; s=open(f).read()
for a,b in json.loads(sys.stdin.read()):
    assert s.count(a)>=1,a; s=s.replace(a,b)
open(f,'w').write(s)
