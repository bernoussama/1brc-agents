from pathlib import Path
names=Path('/work/names.txt').read_bytes().splitlines()
POLY=0x82f63b78
def crcbyte(crc,b):
 crc^=b
 for _ in range(8):crc=(crc>>1)^(POLY if crc&1 else 0)
 return crc&0xffffffff
def crcword(crc,w):
 for i in range(8):crc=crcbyte(crc,(w>>(8*i))&255)
 return crc
hs=[]
for s in names:
 h=0
 for i in range(0,len(s),8):h=crcword(h,int.from_bytes(s[i:i+8].ljust(8,b'\0'),'little'))
 h=crcbyte(h,len(s))
 hs.append(h)
print(len(set(hs)))
for nb in [64,128,256,512]:
 for ns in [512,1024]:
  for shift in [6,7,8,9,10,12,16,20]:
   buckets=[[] for _ in range(nb)]
   for i,h in enumerate(hs): buckets[h&(nb-1)].append((i,h))
   used=[-1]*ns;ds=[0]*nb;ok=True
   for b in sorted(range(nb),key=lambda x:-len(buckets[x])):
    if not buckets[b]:continue
    for d in range(10000):
     ps=[((h>>shift)+d)&(ns-1) for i,h in buckets[b]]
     if len(set(ps))==len(ps) and all(used[p]<0 for p in ps):break
    else:ok=False;break
    ds[b]=d
    for (i,h),p in zip(buckets[b],ps):used[p]=i
   if ok:print(nb,ns,shift,max(map(len,buckets)),max(ds))
