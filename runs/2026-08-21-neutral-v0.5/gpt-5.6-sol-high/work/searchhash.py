from pathlib import Path
names=Path('/work/names.txt').read_bytes().splitlines(); M=(1<<64)-1
for mode in range(8):
 hs=[]
 for s in names:
  h=0x9e3779b97f4a7c15
  for i in range(0,len(s),8):
   w=int.from_bytes(s[i:i+8].ljust(8,b'\0'),'little')
   h=((h^w)*0x9e3779b185ebca87)&M
  if mode==0: x=h^len(s)
  elif mode==1:x=h^(h>>32)^len(s)
  elif mode==2:x=(h^(h>>29)^(len(s)*0x9e37))&M
  elif mode==3:x=(h*0xd6e8feb86659fd93)&M;x^=x>>32
  elif mode==4:x=h^(h>>27)
  elif mode==5:x=h^(h>>33)
  elif mode==6:x=h^(h>>21)^(h>>42)
  else:x=h
  hs.append(x&M)
 for shift in [8,12,16,24,32,40]:
  nb=256;ns=1024;buckets=[[] for _ in range(nb)]
  for i,h in enumerate(hs): buckets[h&255].append((i,h))
  used=[-1]*ns; ds=[];ok=True
  for b in sorted(range(nb),key=lambda x:-len(buckets[x])):
   if not buckets[b]:continue
   for d in range(10000):
    ps=[((h>>shift)+d)&1023 for i,h in buckets[b]]
    if len(set(ps))==len(ps) and all(used[p]<0 for p in ps):break
   else:ok=False;break
   ds.append(d)
   for (i,h),p in zip(buckets[b],ps): used[p]=i
  if ok: print(mode,shift,'maxbucket',max(map(len,buckets)),'d',max(ds),sum(x+1 for x in ds))
