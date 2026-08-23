from pathlib import Path
MASK=(1<<64)-1
names=Path('/work/names.txt').read_bytes().splitlines()
def mix32(x):
 x ^= x>>33; x=x*0xff51afd7ed558ccd&MASK
 x ^= x>>33; x=x*0xc4ceb9fe1a85ec53&MASK
 x ^= x>>33; return x&0xffffffff
def hv(s):
 h=0x9e3779b97f4a7c15
 for i in range(0,len(s),8):
  w=int.from_bytes(s[i:i+8].ljust(8,b'\0'),'little')
  h=((h^w)*0x9e3779b185ebca87)&MASK
 return mix32(h^len(s))
hashes=[hv(x) for x in names]
print(len(set(hashes)))
for nb in [64,128,256,512]:
 for ns in [512,1024,2048]:
  buckets=[[] for _ in range(nb)]
  for i,h in enumerate(hashes): buckets[h&(nb-1)].append((i,h))
  used=[-1]*ns; ds=[0]*nb; ok=True; searches=0
  for b in sorted(range(nb),key=lambda x:-len(buckets[x])):
   if not buckets[b]:continue
   for d in range(65536):
    pos=[((h>>9)+d)&(ns-1) for i,h in buckets[b]]
    if len(set(pos))==len(pos) and all(used[x]<0 for x in pos):break
   else:ok=False;break
   searches+=d+1;ds[b]=d
   for (i,h),p in zip(buckets[b],pos):used[p]=i
  print(nb,ns,ok,max(map(len,buckets)),max(ds),searches)
