from pathlib import Path
names=Path('/work/names.txt').read_bytes().splitlines(); POLY=0x82f63b78
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
 # The scanner also hashes an all-zero word when ';' starts a word.
 for i in range(0,len(s)+1,8):h=crcword(h,int.from_bytes(s[i:i+8].ljust(8,b'\0'),'little'))
 hs.append(h^len(s))
buckets=[[] for _ in range(256)]
for i,h in enumerate(hs):buckets[h&255].append((i,h))
used=[0]*1024; ds=[0]*256
for b in sorted(range(256),key=lambda x:-len(buckets[x])):
 if not buckets[b]:continue
 for d in range(10000):
  ps=[((h>>20)+d)&1023 for i,h in buckets[b]]
  if len(set(ps))==len(ps) and all(used[p]==0 for p in ps):break
 else:raise Exception('fail')
 ds[b]=d
 for (i,h),p in zip(buckets[b],ps):used[p]=i+1
assert all(used[((h>>20)+ds[h&255])&1023]==i+1 for i,h in enumerate(hs))
blob=b''.join(names); offs=[];x=0
for n in names:offs.append(x);x+=len(n)
def arr(typ,name,a,per=16):
 lines=[]
 for i in range(0,len(a),per):lines.append('  '+','.join(map(str,a[i:i+per]))+',')
 return f'static const {typ} {name}[{len(a)}] = {{\n'+"\n".join(lines)+'\n};\n'
out='#include <stdint.h>\n#define NSTATIONS 413\n'
out+=arr('uint8_t','mph_disp',ds)
out+=arr('uint16_t','mph_ids',used)
out+=arr('uint16_t','name_off',offs)
out+=arr('uint8_t','name_len',[len(x) for x in names])
out+=arr('unsigned char','name_blob',list(blob))
Path('/work/submission/stations.h').write_text(out)
print('header',len(out),max(ds),len(blob))
