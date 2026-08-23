from pathlib import Path
names=Path('/work/names.txt').read_bytes().splitlines(); M=(1<<64)-1
def mph(hs,ss):
 buckets=[[] for _ in range(256)]
 for i,h in enumerate(hs): buckets[h&255].append((i,h))
 used=[-1]*1024; md=0
 for b in sorted(range(256),key=lambda x:-len(buckets[x])):
  if not buckets[b]:continue
  for d in range(10000):
   ps=[((h>>ss)+d)&1023 for i,h in buckets[b]]
   if len(set(ps))==len(ps) and all(used[p]<0 for p in ps):break
  else:return None
  md=max(md,d)
  for (i,h),p in zip(buckets[b],ps):used[p]=i
 return max(map(len,buckets)),md
for r in range(5,64):
 for mul in [0x9e3779b185ebca87,0xd6e8feb86659fd93,0xbf58476d1ce4e5b9,0x27d4eb2f165667c5]:
  hs=[]
  for s in names:
   h=0x9e3779b97f4a7c15
   for i in range(0,len(s),8):
    w=int.from_bytes(s[i:i+8].ljust(8,b'\0'),'little')
    h=(((h<<r)|(h>>(64-r)))&M)^w
   h ^= h>>33; h=h*mul&M; h^=h>>29
   hs.append(h)
  if len(set(hs))<413:continue
  for sh in [8,12,16,20,24,32,40]:
   z=mph(hs,sh)
   if z and z[0]<=7 and z[1]<=10: print(r,hex(mul),sh,z)
